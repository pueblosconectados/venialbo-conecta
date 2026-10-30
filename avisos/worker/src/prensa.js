// «📰 Crear noticia» en los avisos de prensa de news-rastreator (el repo hermano, que
// manda al mismo grupo con el mismo bot): la pulsación llega aquí, al webhook, como
// cualquier otro botón.
//
// El botón solo lleva "prensa:<segundos>", la fecha de la noticia: callback_data admite
// 64 bytes y el enlace de Google News no cabe. El título, la fuente y el enlace se leen
// del propio aviso, que es del bot:
//
//   📰 <título>
//   <fuente> · <fecha>        (sin fuente, solo la fecha)
//   <enlace de Google News>
//
// Lanza el workflow prensa-noticia.yml (avisos/prensa-noticia.mjs), que saca el enlace
// del periódico, crea la noticia oculta y al terminar llama a POST /prensa-noticia para
// contarlo en el grupo (contarPrensa). Hasta que no se pulsa, no entra nada en GitHub.

import { lanzarWorkflow } from "./github.js";
import { botonVistaPrevia, enlaceBorrador } from "./fichas.js";
import { escapaHtml, llamarTelegram } from "./telegram.js";

const WORKFLOW = "prensa-noticia.yml";
const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const GOOGLE_NEWS = /^https:\/\/news\.google\.com\/\S+$/;
const MAX_TITULO = 300;
const MAX_FUENTE = 100;
const MAX_ENLACE = 1000;

export const esBotonPrensa = (accion) => accion === "prensa";

// El mismo que pone news-rastreator
const botonCrear = (segundos) => ({ text: "📰 Crear noticia", callback_data: `prensa:${segundos ?? ""}` });

// { titulo, fuente, enlace } del aviso, o null si no tiene esa forma
export const leerAviso = (texto) => {
  const lineas = String(texto ?? "").split("\n").map((l) => l.trim());
  if (lineas.length !== 3 || !lineas[0].startsWith("📰")) return null;
  const titulo = lineas[0].replace(/^📰\s*/, "");
  // La fecha va siempre al final; lo de antes, si lo hay, es la fuente
  const partes = lineas[1].split(" · ");
  const fuente = partes.length > 1 ? partes.slice(0, -1).join(" · ") : "";
  const enlace = lineas[2];
  if (!titulo || titulo.length > MAX_TITULO || fuente.length > MAX_FUENTE) return null;
  if (enlace.length > MAX_ENLACE || !GOOGLE_NEWS.test(enlace)) return null;
  return { titulo, fuente, enlace };
};

// Devuelve el texto para answerCallbackQuery y si va como alerta
export const pulsacionPrensa = async (env, consulta, segundos, quien) => {
  const mensaje = consulta.message;
  // Telegram no da el texto de los mensajes de hace más de 48 horas
  const aviso = leerAviso(mensaje?.text);
  if (!aviso) return ["No puedo leer este aviso: créala a mano en el CMS.", true];
  const fecha = /^\d{9,11}$/.test(segundos ?? "") ? new Date(Number(segundos) * 1000).toISOString() : "";

  const lanzado = await lanzarWorkflow(env, WORKFLOW, {
    ...aviso,
    fecha,
    mensaje: String(mensaje.message_id),
  }).catch(() => false);
  if (!lanzado) return ["GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker, o créala a mano.", true];

  // Se quita el botón, para que nadie lo pulse otra vez mientras tanto
  await llamarTelegram(env, "editMessageReplyMarkup", {
    chat_id: mensaje.chat.id,
    message_id: mensaje.message_id,
    reply_markup: { inline_keyboard: [] },
  });
  await llamarTelegram(env, "sendMessage", {
    chat_id: mensaje.chat.id,
    text: `📰 ${quien} la pasa a Noticias. En un par de minutos estará en el CMS, oculta; os aviso.`,
    parse_mode: "HTML",
    reply_parameters: { message_id: mensaje.message_id, allow_sending_without_reply: true },
  });
  return ["Hecho: en marcha."];
};

// ── POST /prensa-noticia: lo que cuenta la Action al terminar ───────────────

const cadena = (v, max) => typeof v === "string" && v.length <= max;

const valido = (r) =>
  r &&
  ["hecho", "ya", "error"].includes(r.estado) &&
  cadena(r.mensaje, 500) &&
  (r.mensaje_id === undefined || (Number.isInteger(r.mensaje_id) && r.mensaje_id > 0)) &&
  (r.titulo === undefined || cadena(r.titulo, MAX_TITULO)) &&
  (r.activa === undefined || typeof r.activa === "boolean") &&
  (r.google === undefined || typeof r.google === "boolean") &&
  (r.segundos === undefined || (Number.isInteger(r.segundos) && r.segundos > 0)) &&
  (r.ruta === undefined || (cadena(r.ruta, 300) && /^web-static\/content\/noticias\/[a-z0-9-]+\.json$/.test(r.ruta)));

export const contarPrensa = async (r, env) => {
  if (!valido(r)) return { error: "resultado no válido" };
  const titulo = r.titulo ? `«${escapaHtml(r.titulo)}»` : "La noticia";
  let texto;
  if (r.estado === "hecho")
    texto = `📰 ${titulo} está en Noticias del CMS, <b>oculta</b> y con el enlace ${r.google ? "de Google News (no he podido sacar el del periódico: cambiadlo si lo encontráis)" : "al periódico"}. Falta la foto, la categoría si no es «Otras» y contarla con vuestras palabras; luego, publicadla.`;
  else if (r.estado === "ya") texto = `ℹ️ ${titulo} ya estaba en Noticias${r.activa ? " y está publicada" : ", y sigue oculta"}.`;
  else texto = `⚠️ No se ha podido crear la noticia: ${escapaHtml(r.mensaje)}.`;

  const botones = [];
  if (r.ruta) {
    const [, , coleccion, fichero] = r.ruta.split("/");
    botones.push({ text: "📝 Ver en el CMS", url: `${CMS}/${coleccion}/edit/${encodeURIComponent(r.ruta)}` });
    if (r.activa) botones.push({ text: "🌐 Ver en la web", url: `${WEB}/noticias/${fichero.replace(/\.json$/, "")}` });
    else {
      // Estará al día cuando acabe la publicación que lanza la Action
      const previa = await enlaceBorrador(env, { ruta: r.ruta });
      if (previa) botones.push(botonVistaPrevia(previa));
    }
  }
  // Sin «🔁 Reintentar» aquí: los datos se leen del aviso, y este mensaje no los tiene.
  // Se le devuelve al aviso su botón, y se reintenta desde allí.
  if (r.estado === "error" && r.mensaje_id)
    await llamarTelegram(env, "editMessageReplyMarkup", {
      chat_id: env.TELEGRAM_CHAT_ID,
      message_id: r.mensaje_id,
      reply_markup: { inline_keyboard: [[botonCrear(r.segundos)]] },
    });

  const enviado = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: texto,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(r.mensaje_id ? { reply_parameters: { message_id: r.mensaje_id, allow_sending_without_reply: true } } : {}),
    ...(botones.length ? { reply_markup: { inline_keyboard: [botones] } } : {}),
  });
  return enviado ? { ok: true } : { error: "Telegram no lo ha aceptado" };
};
