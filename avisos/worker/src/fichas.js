// De Tally a la web desde Telegram (idea 17 de IDEAS.md). Lo que llega por los
// formularios de alta de negocio, tablón y casas se puede publicar, descartar y subir
// sus fotos con botones en el grupo, sin abrir el CMS:
//
// - Al llegar una respuesta con fotos, tally.js avisa como siempre y mandarFotos manda
//   las fotos al grupo como álbum, con «📷 Subir estas fotos» y «🚫 No subirlas». Las
//   fotos no pasan por GitHub hasta que alguien pulsa «Subir»: lo que entra en git se
//   queda en el historial para siempre.
// - El aviso y el recordatorio de lo oculto (revision.js) llevan «✅ Publicar» y
//   «🗑 Descartar» (este, con confirmación).
// - Cada botón lanza el workflow ficha-tally.yml (tally/ficha-tally.mjs), que lo hace y
//   al terminar llama a POST /fichas para contarlo en el grupo (contarResultado).
//   El GITHUB_TOKEN del Worker sigue sin poder escribir en el repositorio.
// - «No subirlas» borra el álbum del grupo. De Tally no se borra nunca nada.
//
// Los callback_data son "<acción>:<letra del formulario>:<id de la respuesta>". Lo que
// hace falta para borrar el álbum va en el KV ESTADO, clave "fotos:<id>".

import { lanzarWorkflow } from "./github.js";
import { escapaHtml, llamarTelegram } from "./telegram.js";

const WORKFLOW = "ficha-tally.yml";
const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const MAX_FOTOS = 4;
// Lo bastante para que dé tiempo a decidir; después el álbum ya no se borra desde aquí
const DIAS_KV = 90;

// La letra de cada formulario en los botones (callback_data solo admite 64 bytes)
const LETRAS = { n: "negocios", t: "tablon", c: "casas" };
const LETRA = Object.fromEntries(Object.entries(LETRAS).map(([l, f]) => [f, l]));

// Dónde se ve cada colección en la web
const EN_LA_WEB = { negocios: "/negocios/", anuncios: "/tablon/", casas: "/tablon/" };

export const botonesFicha = (formulario, respuesta) => {
  const l = LETRA[formulario];
  return [
    { text: "✅ Publicar", callback_data: `pub:${l}:${respuesta}` },
    { text: "🗑 Descartar", callback_data: `des:${l}:${respuesta}` },
  ];
};

const botonesConfirmar = (l, respuesta) => [
  { text: "🗑 Sí, descartarla", callback_data: `desok:${l}:${respuesta}` },
  { text: "↩️ No", callback_data: `desno:${l}:${respuesta}` },
];

const botonesFotos = (l, respuesta) => [
  { text: "📷 Subir estas fotos", callback_data: `fot:${l}:${respuesta}` },
  { text: "🚫 No subirlas", callback_data: `nofot:${l}:${respuesta}` },
];

// ── Las fotos al grupo ──────────────────────────────────────────────────────

// Las baja de Tally (la dirección firmada no sale de aquí: Telegram recibe el archivo)
// y las manda como álbum en respuesta al aviso, con los botones debajo
export const mandarFotos = async (env, { formulario, respuesta, archivos, responderA }) => {
  const l = LETRA[formulario];
  const fotos = archivos.filter((a) => a?.url && String(a.mimeType ?? "image/").startsWith("image/")).slice(0, MAX_FOTOS);
  if (!fotos.length) return;

  const album = new FormData();
  album.append("chat_id", env.TELEGRAM_CHAT_ID);
  album.append("media", JSON.stringify(fotos.map((_, i) => ({ type: "photo", media: `attach://foto${i}` }))));
  if (responderA) album.append("reply_parameters", JSON.stringify({ message_id: responderA, allow_sending_without_reply: true }));
  let enviados = null;
  try {
    for (const [i, foto] of fotos.entries()) {
      const r = await fetch(foto.url);
      if (!r.ok) throw new Error(`Tally: HTTP ${r.status}`);
      album.append(`foto${i}`, await r.blob(), `foto${i}.jpg`);
    }
    enviados = await llamarTelegram(env, "sendMediaGroup", album);
  } catch {
    enviados = null;
  }

  const cuantas = fotos.length === 1 ? "esta foto" : `estas ${fotos.length} fotos`;
  const texto = enviados
    ? `📷 ¿Se suben ${cuantas} a la ficha?\n<i>Hasta que no se pulse «Subir», no entran en la web ni en GitHub.</i>`
    : `📷 Trae ${fotos.length === 1 ? "una foto" : `${fotos.length} fotos`}, pero no he podido mandarlas aquí: míralas en Tally.\n<i>Hasta que no se pulse «Subir», no entran en la web ni en GitHub.</i>`;
  const aviso = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: texto,
    parse_mode: "HTML",
    reply_parameters: { message_id: enviados?.[0]?.message_id ?? responderA, allow_sending_without_reply: true },
    reply_markup: { inline_keyboard: [botonesFotos(l, respuesta)] },
  });
  await env.ESTADO.put(
    `fotos:${respuesta}`,
    JSON.stringify({ album: (enviados ?? []).map((m) => m.message_id), aviso: aviso?.message_id ?? null }),
    { expirationTtl: DIAS_KV * 24 * 60 * 60 },
  );
};

// ── Los botones ─────────────────────────────────────────────────────────────

const ACCIONES = new Set(["pub", "des", "desok", "desno", "fot", "nofot"]);
export const esBotonFicha = (accion) => ACCIONES.has(accion);

// Cambia la fila del botón pulsado por otra (o la quita, con null)
const cambiarFila = (env, mensaje, pulsado, nueva) => {
  const filas = (mensaje.reply_markup?.inline_keyboard ?? [])
    .map((fila) => (fila.some((b) => b.callback_data === pulsado) ? nueva : fila))
    .filter(Boolean);
  return llamarTelegram(env, "editMessageReplyMarkup", {
    chat_id: mensaje.chat.id,
    message_id: mensaje.message_id,
    reply_markup: { inline_keyboard: filas },
  });
};

const contar = (env, mensaje, texto) =>
  llamarTelegram(env, "sendMessage", {
    chat_id: mensaje.chat.id,
    text: texto,
    parse_mode: "HTML",
    reply_parameters: { message_id: mensaje.message_id, allow_sending_without_reply: true },
  });

const lanzar = (env, accion, formulario, respuesta) =>
  lanzarWorkflow(env, WORKFLOW, { accion, formulario, respuesta }).catch(() => false);

const NO_LANZA = "GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker, o hazlo desde el CMS.";

// Devuelve el texto para answerCallbackQuery y si va como alerta
export const pulsacionFicha = async (env, consulta, accion, l, respuesta, quien) => {
  const formulario = LETRAS[l];
  if (!formulario || !/^[A-Za-z0-9]{3,20}$/.test(respuesta ?? "")) return ["No sé qué hacer con este botón.", true];
  const mensaje = consulta.message;
  const pulsado = consulta.data;

  if (accion === "des") {
    await cambiarFila(env, mensaje, pulsado, botonesConfirmar(l, respuesta));
    return ["¿Seguro? Se quita del CMS (la respuesta sigue en Tally)."];
  }
  if (accion === "desno") {
    await cambiarFila(env, mensaje, pulsado, botonesFicha(formulario, respuesta));
    return ["Vale, no se descarta."];
  }

  if (accion === "nofot") {
    const guardado = (await env.ESTADO.get(`fotos:${respuesta}`, "json")) ?? { album: [] };
    for (const id of guardado.album) await llamarTelegram(env, "deleteMessage", { chat_id: mensaje.chat.id, message_id: id });
    await llamarTelegram(env, "editMessageText", {
      chat_id: mensaje.chat.id,
      message_id: mensaje.message_id,
      text: `🚫 ${quien} ha decidido no subir las fotos. Se han quitado de aquí; en Tally siguen.`,
      parse_mode: "HTML",
    });
    await env.ESTADO.delete(`fotos:${respuesta}`);
    return ["🚫 Hecho: no se suben."];
  }

  const que = { pub: "publicar", desok: "descartar", fot: "fotos" }[accion];
  if (!(await lanzar(env, que, formulario, respuesta))) return [NO_LANZA, true];
  await cambiarFila(env, mensaje, pulsado, null);
  const textos = {
    publicar: `✅ ${quien} la publica. En un par de minutos estará en la web; os aviso.`,
    descartar: `🗑 ${quien} la descarta: se quita del CMS. La respuesta sigue en Tally.`,
    fotos: `📷 ${quien} sube las fotos a la ficha. Os aviso cuando estén.`,
  };
  await contar(env, mensaje, textos[que]);
  return ["Hecho: en marcha."];
};

// ── POST /fichas: lo que cuenta la Action al terminar ───────────────────────

const texto = (v, max) => typeof v === "string" && v.length <= max;

const valido = (r) =>
  r &&
  ["fotos", "publicar", "descartar"].includes(r.accion) &&
  LETRA[r.formulario] &&
  ["hecho", "ya", "nada", "error"].includes(r.estado) &&
  texto(r.mensaje, 500) &&
  (r.fotos === undefined || (Number.isInteger(r.fotos) && r.fotos >= 0 && r.fotos <= 10)) &&
  (r.titulo === undefined || texto(r.titulo, 300)) &&
  (r.ruta === null || r.ruta === undefined || (texto(r.ruta, 300) && /^web-static\/content\/(negocios|anuncios|casas)\/[a-z0-9-]+\.json$/.test(r.ruta)));

export const contarResultado = async (r, env) => {
  if (!valido(r)) return { error: "resultado no válido" };
  const titulo = r.titulo ? `«${escapaHtml(r.titulo)}»` : "La ficha";
  let linea;
  if (r.estado === "hecho" && r.accion === "publicar") linea = `✅ ${titulo} ya está publicada. Sale en la web en un par de minutos.`;
  else if (r.estado === "hecho" && r.accion === "fotos")
    linea = `📷 ${r.fotos === 1 ? "Subida 1 foto" : `Subidas ${r.fotos} fotos`} a ${titulo}. ${r.activo ? "Se verán en la web en un par de minutos." : "Sigue oculta: «✅ Publicar» cuando esté lista."}`;
  else if (r.estado === "hecho") linea = `🗑 ${titulo} se ha quitado del CMS. La respuesta sigue en Tally.`;
  else linea = `${r.estado === "error" ? "⚠️" : "ℹ️"} ${titulo}: ${escapaHtml(r.mensaje)}`;

  const botones = [];
  if (r.ruta && r.accion !== "descartar") {
    const [, , coleccion, fichero] = r.ruta.split("/");
    botones.push({ text: "📝 Ver en el CMS", url: `${CMS}/${coleccion}/edit/${encodeURIComponent(r.ruta)}` });
    if (r.activo) botones.push({ text: "🌐 Ver en la web", url: `${WEB}${EN_LA_WEB[coleccion]}${fichero.replace(/\.json$/, "")}` });
  }
  const enviado = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: linea,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(botones.length ? { reply_markup: { inline_keyboard: [botones] } } : {}),
  });
  return enviado ? { ok: true } : { error: "Telegram no lo ha aceptado" };
};
