// POST /tally: el webhook de los formularios. Tally llama aquí con cada respuesta nueva
// y esto la reenvía, entera, al grupo de Telegram de los administradores (el mismo de
// los avisos de prensa de news-rastreator). Los webhooks los da de alta
// tally/crear-webhooks.mjs.
//
// Tally firma el cuerpo con el secreto compartido (TALLY_SIGNING_SECRET): HMAC-SHA256
// en base64, en la cabecera Tally-Signature. Sin firma buena no se manda nada, para que
// nadie pueda escribir en el grupo a través del bot.
//
// Las altas de negocio y los anuncios se traen solos al CMS: antes de avisar se lanza la
// Action de traer (la del botón de Pages CMS), que los crea ocultos. Si GitHub no la
// acepta, el mensaje lleva un botón «📥 Traer al CMS» para reintentarlo desde Telegram
// (lo atiende comandos.js).
//
// Si Telegram falla se responde 500 y Tally reintenta por su cuenta (a los 5 min, 30 min,
// 1 h, 6 h y 1 día). Volver a lanzar la Action no duplica nada: trae solo lo pendiente.

import { lanzarTraer } from "./github.js";
import { aTelegram, escapaHtml } from "./telegram.js";

// La lista de una colección en Pages CMS. La ficha aún no existe cuando llega el aviso
// (se crea al pulsar el botón de traer), así que se enlaza la lista, no la ficha.
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";

// Los formularios, por su id de tally/formularios-creados.json. `traer` es la Action que
// lo pasa al CMS (ver TRAER en github.js); contacto no se importa a ningún sitio.
const FORMULARIOS = {
  obJXzX: { titulo: "✉️ Mensaje de contacto" },
  ZjxqQa: { titulo: "🏪 Alta de negocio", traer: "negocios", oculto: "oculta", cms: `${CMS}/negocios` },
  NpzGOW: { titulo: "📌 Anuncio para el tablón", traer: "tablon", oculto: "oculto", cms: `${CMS}/anuncios` },
};

// Lo que dice el pie según haya salido la Action de traer
const pieDe = ({ traer, oculto }, lanzado) => {
  if (!traer) return null;
  if (lanzado) return `📥 Ya va de camino al CMS: en un par de minutos estará en la lista, ${oculto}.`;
  return "⚠️ No se ha podido traer solo al CMS. Pulsa «📥 Traer al CMS» para reintentarlo.";
};

// Telegram corta en 4096 caracteres; se deja margen para la cabecera y el pie
const MAX_CAMPO = 1500;
const MAX_MENSAJE = 4000;
const MAX_CUERPO = 64 * 1024;

const recorta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

const firmaValida = async (cuerpo, firma, secreto) => {
  if (!firma || !secreto) return false;
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const esperada = async (texto) => {
    const bytes = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(texto));
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  };
  const igual = (a, b) => {
    const x = new TextEncoder().encode(a);
    const y = new TextEncoder().encode(b);
    return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
  };
  // La documentación de Tally firma JSON.stringify(cuerpo) en su ejemplo, no los bytes
  // tal cual llegan. Suelen coincidir; por si no, se prueban los dos.
  if (igual(firma, await esperada(cuerpo))) return true;
  return igual(firma, await esperada(JSON.stringify(JSON.parse(cuerpo))));
};

// Una línea por campo respondido. Lo vacío no sale.
const lineaDe = (campo) => {
  const { label, type, value, options } = campo;
  if (value === null || value === undefined || value === "") return null;
  // Las casillas: la de aceptar la privacidad (siempre marcada) y, en los campos de
  // varias casillas, una por opción que repite lo que ya dice el campo entero
  if (typeof value === "boolean") return null;

  let texto;
  if (type === "FILE_UPLOAD" || type === "SIGNATURE") {
    if (!Array.isArray(value) || !value.length) return null;
    // Las fotos no se descargan ni se enlazan (el enlace va firmado y abre la foto a
    // quien lo tenga): se miran en Tally
    texto = `📎 ${value.length} ${value.length === 1 ? "archivo" : "archivos"}, ver en Tally`;
  } else if (Array.isArray(value)) {
    if (!value.length) return null;
    const nombres = new Map((options ?? []).map((o) => [o.id, o.text]));
    texto = value.map((v) => nombres.get(v) ?? v).join(", ");
  } else if (typeof value === "object") {
    texto = JSON.stringify(value);
  } else {
    texto = String(value).trim();
    if (!texto) return null;
  }
  return `<b>${escapaHtml(label || "(sin título)")}</b>\n${escapaHtml(recorta(texto, MAX_CAMPO))}`;
};

const formularioDe = ({ formId, formName }) => FORMULARIOS[formId] ?? { titulo: `📝 ${formName}` };

// Los enlaces van como botones debajo del mensaje, no como URL sueltas en el texto. Si
// no se pudo traer, una fila más con el botón de reintentar.
const botonesDe = (datos, lanzado) => {
  const { cms, traer } = formularioDe(datos);
  const enlaces = [
    ...(cms ? [{ text: "📝 Abrir en el CMS", url: cms }] : []),
    { text: "Ver en Tally", url: `https://tally.so/forms/${datos.formId}/submissions` },
  ];
  return traer && !lanzado ? [enlaces, [{ text: "📥 Traer al CMS", callback_data: `traer:${traer}` }]] : [enlaces];
};

const mensajeDe = (datos, lanzado) => {
  const { fields } = datos;
  const formulario = formularioDe(datos);
  const pie = [pieDe(formulario, lanzado)].filter(Boolean);
  const campos = (fields ?? []).map(lineaDe).filter(Boolean);
  // Si aun así no cabe, se quitan campos enteros del final (cortar a ciegas podría
  // romper una etiqueta y Telegram rechazaría el mensaje)
  const montar = (cuantos) =>
    [
      `<b>${escapaHtml(formulario.titulo)}</b>`,
      ...campos.slice(0, cuantos),
      ...(cuantos < campos.length ? ["<i>…sigue en Tally</i>"] : []),
      ...pie,
    ].join("\n\n");
  let cuantos = campos.length;
  while (cuantos > 0 && montar(cuantos).length > MAX_MENSAJE) cuantos--;
  return montar(cuantos);
};

export const webhookTally = async (request, env, json) => {
  if (request.method !== "POST") return json({ error: "método no permitido" }, 405);
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return json({ error: "demasiado grande" }, 413);
  if (!(await firmaValida(cuerpo, request.headers.get("tally-signature"), env.TALLY_SIGNING_SECRET)))
    return json({ error: "firma no válida" }, 401);

  const evento = JSON.parse(cuerpo);
  // Por ahora Tally solo manda este tipo; lo demás se acepta y se ignora
  if (evento.eventType !== "FORM_RESPONSE" || !evento.data) return json({ ignorado: true });

  const { data } = evento;
  const { traer } = formularioDe(data);
  const lanzado = traer ? await lanzarTraer(env, traer).catch(() => false) : null;
  if (!(await aTelegram(env, mensajeDe(data, lanzado), botonesDe(data, lanzado))))
    return json({ error: "telegram" }, 500);
  return json({ ok: true });
};
