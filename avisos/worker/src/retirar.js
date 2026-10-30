// Retirar desde Telegram lo que piden quitar del Tablón (idea 30 de IDEAS.md). Cada
// anuncio de vecinos lleva en la web «¿Ya no hace falta este anuncio? Pide que lo
// quitemos», y cada casa «¿Ya está vendida? Avísanos»: los dos van al formulario de
// contacto con el campo oculto `anuncio` = "<título> (<id>)" (AnunciosShow.tsx).
//
// Cuando llega uno así (tally.js), el aviso dice qué anuncio es y lleva un botón:
// «🙈 Ocultar el anuncio», o «🏷️ Marcar como vendida/alquilada» si es una casa. Lanza el
// workflow retirar.yml (avisos/retirar.mjs), que oculta el anuncio o pone a la casa la
// fecha de venta (sale con el sello una semana y luego se va sola), y al terminar llama a
// POST /retirado para contarlo (contarRetirado).
//
// El campo oculto lo puede escribir cualquiera en la dirección del formulario: el id solo
// vale si es de algo publicado (data/anuncios.json, que trae también las casas), y el
// botón no hace nada sin que alguien del grupo lo pulse después de leer el mensaje. Sin
// más confirmación: ocultar no borra, y /deshacer lo devuelve.
//
// El botón lleva la huella de la ruta, como los de /repaso, y al pulsarlo se busca otra
// vez el anuncio en la web: nada en el KV.

import { lanzarWorkflow } from "./github.js";
import { huella } from "./repaso.js";
import { escapaHtml, llamarTelegram } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const WORKFLOW = "retirar.yml";
const ID = /\(([A-Za-z0-9][A-Za-z0-9._-]*)\)\s*$/;
const RUTA = /^web-static\/content\/(anuncios|casas)\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

const rutaDe = (a) => `web-static/content/${a.casa ? "casas" : "anuncios"}/${a.id}.json`;
const sello = (a) => (a.tipo === "casa_alquiler" ? "alquilada" : "vendida");
const corto = (titulo, max) => (titulo.length > max ? `${titulo.slice(0, max - 1)}…` : titulo);

const publicados = async () => {
  const respuesta = await fetch(`${WEB}/data/anuncios.json`, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`La web: HTTP ${respuesta.status} en data/anuncios.json`);
  return respuesta.json();
};

const botonDe = async (a) => ({
  text: a.casa ? `🏷️ Marcar como ${sello(a)}` : `🙈 Ocultar «${corto(String(a.titulo ?? a.id).trim(), 24)}»`,
  callback_data: `retirar:${await huella(rutaDe(a))}`,
});

// Para el aviso del formulario de contacto: { linea, boton } si viene de «Pide que lo
// quitemos» o «Avísanos», o null. La línea va arriba, con las alertas.
export const pedidoRetirar = async (campos) => {
  // El de contacto solo tiene ese campo oculto: no se depende de cómo llegue la etiqueta
  const id = campos
    .filter((c) => c.type === "HIDDEN_FIELDS" && typeof c.value === "string")
    .map((c) => c.value.match(ID)?.[1])
    .find(Boolean);
  if (!id) return null;
  const anuncio = (await publicados().catch(() => [])).find((a) => a.id === id);
  if (!anuncio) return { linea: "🙋 Piden quitar un anuncio que ya no se ve en la web: no hay nada que hacer." };
  const titulo = `<b>${escapaHtml(String(anuncio.titulo ?? id).trim())}</b>`;
  const enlace = `<a href="${WEB}/tablon/${encodeURIComponent(id)}">ver</a>`;
  if (anuncio.casa?.vendida)
    return { linea: `🙋 Sobre la casa ${titulo} (${enlace}). Ya está marcada como ${sello(anuncio)}: se quita sola.` };
  if (anuncio.casa)
    return { linea: `🙋 Avisan de que la casa ${titulo} (${enlace}) ya está ${sello(anuncio)}.`, boton: await botonDe(anuncio) };
  return { linea: `🙋 Piden quitar del Tablón ${titulo} (${enlace}).`, boton: await botonDe(anuncio) };
};

// ── El botón ────────────────────────────────────────────────────────────────

export const esBotonRetirar = (accion) => accion === "retirar";

// Devuelve el texto para answerCallbackQuery y si va como alerta
export const pulsacionRetirar = async (env, consulta, codigo, quien) => {
  if (!/^[0-9a-f]{12}$/.test(codigo ?? "")) return ["No sé qué hacer con este botón.", true];
  let anuncio = null;
  for (const a of await publicados()) if ((await huella(rutaDe(a))) === codigo) anuncio = a;
  if (!anuncio) return ["Ese anuncio ya no se ve en la web: no hay nada que quitar.", true];

  const mensaje = consulta.message;
  if (!(await lanzarWorkflow(env, WORKFLOW, { ruta: rutaDe(anuncio), mensaje: String(mensaje.message_id) }).catch(() => false)))
    return ["GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker, o hazlo en el CMS.", true];

  // Se quita el botón, para que nadie lo pulse otra vez mientras tanto
  const filas = (mensaje.reply_markup?.inline_keyboard ?? []).map((fila) => fila.filter((b) => b.callback_data !== consulta.data));
  await llamarTelegram(env, "editMessageReplyMarkup", {
    chat_id: mensaje.chat.id,
    message_id: mensaje.message_id,
    reply_markup: { inline_keyboard: filas.filter((fila) => fila.length) },
  });
  const titulo = escapaHtml(String(anuncio.titulo ?? anuncio.id).trim());
  await llamarTelegram(env, "sendMessage", {
    chat_id: mensaje.chat.id,
    text: anuncio.casa
      ? `🏷️ ${quien} marca «${titulo}» como ${sello(anuncio)}. Os aviso cuando esté.`
      : `🙈 ${quien} quita «${titulo}» del Tablón. Os aviso cuando esté.`,
    parse_mode: "HTML",
    reply_parameters: { message_id: mensaje.message_id, allow_sending_without_reply: true },
  });
  return ["En marcha."];
};

// ── POST /retirado: lo que cuenta la Action al terminar ─────────────────────

const valido = (r) =>
  r &&
  ["hecho", "ya", "error"].includes(r.estado) &&
  typeof r.ruta === "string" &&
  RUTA.test(r.ruta) &&
  (r.efecto === undefined || ["oculta", "vendida"].includes(r.efecto)) &&
  (r.vendida === undefined || /^\d{4}-\d{2}-\d{2}$/.test(r.vendida)) &&
  (r.titulo === undefined || (typeof r.titulo === "string" && r.titulo.length <= 300)) &&
  (r.mensaje === undefined || (typeof r.mensaje === "string" && r.mensaje.length <= 500)) &&
  (r.mensaje_id === undefined || (Number.isInteger(r.mensaje_id) && r.mensaje_id > 0));

export const contarRetirado = async (r, env) => {
  if (!valido(r)) return { error: "resultado no válido" };
  const titulo = `«${escapaHtml(r.titulo || r.ruta.split("/").pop().replace(/\.json$/, ""))}»`;
  let texto;
  if (r.estado === "hecho" && r.efecto === "vendida")
    texto = `🏷️ ${titulo} ya sale como vendida o alquilada. Se quita sola dentro de una semana.\n<i>Si no era eso, /deshacer.</i>`;
  else if (r.estado === "hecho") texto = `🙈 ${titulo} ya no está en el Tablón: está oculto en el CMS. En la web, en un par de minutos.\n<i>Si no era eso, /deshacer.</i>`;
  else if (r.estado === "ya") texto = `ℹ️ ${titulo} ya estaba ${r.efecto === "vendida" ? "marcada como vendida o alquilada" : "oculto"}: no he tocado nada.`;
  else texto = `⚠️ No se ha podido quitar ${titulo}${r.mensaje ? `: ${escapaHtml(r.mensaje)}` : ""}. Hazlo en el CMS.`;

  const [, , coleccion] = r.ruta.split("/");
  const enviado = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: texto,
    parse_mode: "HTML",
    ...(r.mensaje_id ? { reply_parameters: { message_id: r.mensaje_id, allow_sending_without_reply: true } } : {}),
    reply_markup: { inline_keyboard: [[{ text: "📝 Ver en el CMS", url: `${CMS}/${coleccion}/edit/${encodeURIComponent(r.ruta)}` }]] },
  });
  return enviado ? { ok: true } : { error: "Telegram no lo ha aceptado" };
};
