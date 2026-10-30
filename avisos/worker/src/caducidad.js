// Lo que va a desaparecer de la web: los anuncios del tablón y los avisos tienen fecha de
// caducidad, y pasada se quitan solos (haCaducado en web-static/src/datos.ts). /caducan
// lista lo que se va en los próximos DIAS_LISTA días, y cada día a las 10:00 se avisa en
// el grupo de lo que está en su último día de mañana, para que dé tiempo a renovarlo.
//
// Los datos salen de la web publicada (data/anuncios.json y data/avisos.json), que ya
// lleva la fecha calculada: también la de los anuncios de vecinos sin fecha, que caducan
// a los 30 días (caducidadDe en build-content.mjs). Sin token: son públicos.
//
// La fecha es el último día que se ve: haCaducado lo deja hasta las 23:59 de ese día.
//
// Los anuncios de vecinos llevan además «⏳ +30 días» (idea 29 de IDEAS.md): lanza el
// workflow alargar.yml (avisos/alargar.mjs), que cambia la fecha en la ficha y al
// terminar llama a POST /alargado para contarlo (contarAlargado). El botón lleva la
// huella de la ruta, como los de /repaso, y la ficha se busca otra vez en la web al
// pulsarlo; la Action solo alarga si la fecha sigue siendo la del aviso, así que dos
// toques no suman 60 días. Los avisos de portada y las casas vendidas no se alargan:
// su fecha es la de lo que anuncian.

import { lanzarWorkflow } from "./github.js";
import { huella } from "./repaso.js";
import { aTelegram, elemento, escapaHtml, LISTA, llamarTelegram } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const DIAS_LISTA = 7;
const DIAS_ALARGAR = 30;
const WORKFLOW = "alargar.yml";
const MAX_BOTONES = 4;
const DIA = 24 * 60 * 60 * 1000;

const RECURSOS = [
  { recurso: "anuncios", tipo: "Anuncio", ruta: "/tablon/" },
  { recurso: "avisos", tipo: "Aviso", ruta: null },
];

const hoyMadrid = (ahora) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / DIA);

const formatoDia = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const diaCorto = (fecha) => formatoDia.format(new Date(`${fecha}T12:00:00Z`));

const cuando = (dias) => (dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`);

// [{ tipo, recurso, id, titulo, ultimoDia, dias }] de lo que aún se ve, del que antes se va
export const caducables = async (ahora = new Date()) => {
  const hoy = hoyMadrid(ahora);
  const listas = await Promise.all(
    RECURSOS.map(async ({ recurso, tipo }) => {
      const respuesta = await fetch(`${WEB}/data/${recurso}.json`, { cache: "no-store" });
      if (!respuesta.ok) throw new Error(`La web: HTTP ${respuesta.status} en data/${recurso}.json`);
      return (await respuesta.json())
        .filter((f) => typeof f.fecha_caducidad === "string" && f.fecha_caducidad)
        .map((f) => {
          const ultimoDia = f.fecha_caducidad.slice(0, 10);
          return { tipo: f.casa ? "Casa vendida" : tipo, recurso, id: f.id, casa: Boolean(f.casa), titulo: String(f.titulo ?? f.id).trim(), ultimoDia, dias: diasEntre(hoy, ultimoDia) };
        });
    }),
  );
  return listas
    .flat()
    .filter((f) => f.dias >= 0)
    .sort((a, b) => a.dias - b.dias);
};

// La pantalla de edición en Pages CMS, para cambiar la fecha y que siga. El fichero se
// llama como el id. Las casas salen en data/anuncios.json, pero en el CMS tienen su
// colección (solo caducan las vendidas, a los 7 días)
const enlaceCms = ({ recurso, id, casa }) => {
  const coleccion = casa ? "casas" : recurso;
  return `${CMS}/${coleccion}/edit/${encodeURIComponent(`web-static/content/${coleccion}/${id}.json`)}`;
};

const lineas = (fichas) =>
  fichas.map(
    (f) => elemento(f.titulo, `${f.tipo} · último día ${cuando(f.dias)}${f.dias > 1 ? ` (${diaCorto(f.ultimoDia)})` : ""}`),
  );

const alargable = (f) => f.recurso === "anuncios" && !f.casa;
const rutaDe = (f) => `web-static/content/anuncios/${f.id}.json`;
const corto = (titulo, max) => (titulo.length > max ? `${titulo.slice(0, max - 1)}…` : titulo);

// Una fila por ficha: los títulos no caben juntos. Con «⏳», el título se acorta más
const botones = async (fichas) =>
  Promise.all(
    fichas.slice(0, MAX_BOTONES).map(async (f) =>
      alargable(f)
        ? [
            { text: `📝 ${corto(f.titulo, 20)}`, url: enlaceCms(f) },
            { text: `⏳ +${DIAS_ALARGAR} días`, callback_data: `alargar:${await huella(rutaDe(f))}` },
          ]
        : [{ text: `📝 ${corto(f.titulo, 28)}`, url: enlaceCms(f) }],
    ),
  );

const COMO_RENOVAR = `<i>Para que siga, «⏳ +${DIAS_ALARGAR} días» en los anuncios, o cambia su fecha de caducidad en el CMS.</i>`;

// Para /caducan
export const listaCaducan = async (ahora = new Date()) => {
  const pronto = (await caducables(ahora)).filter((f) => f.dias <= DIAS_LISTA);
  if (!pronto.length) return { texto: `✅ Nada desaparece de la web en los próximos ${DIAS_LISTA} días.` };
  return {
    texto: [`⏳ <b>Se van de la web en ${DIAS_LISTA} días: ${pronto.length}</b>`, lineas(pronto).join(LISTA), COMO_RENOVAR].join(
      "\n\n",
    ),
    botones: await botones(pronto),
  };
};

// Lo que hace el cron a las 10:00: solo escribe si mañana es el último día de algo
export const recordarCaducan = async (env, { ahora = new Date(), enviar = true } = {}) => {
  const manana = (await caducables(ahora)).filter((f) => f.dias === 1);
  if (!manana.length) return null;
  const texto = [
    `⏳ <b>Mañana ${manana.length === 1 ? "se ve" : "se ven"} por última vez en la web</b>`,
    lineas(manana).join(LISTA),
    COMO_RENOVAR,
  ].join("\n\n");
  if (enviar && !(await aTelegram(env, texto, await botones(manana)))) throw new Error("Telegram no aceptó el aviso");
  return texto;
};

// ── «⏳ +30 días» ───────────────────────────────────────────────────────────

export const esBotonAlargar = (accion) => accion === "alargar";

// Devuelve el texto para answerCallbackQuery y si va como alerta
export const pulsacionAlargar = async (env, consulta, codigo, quien) => {
  if (!/^[0-9a-f]{12}$/.test(codigo ?? "")) return ["No sé qué hacer con este botón.", true];
  let ficha = null;
  for (const f of (await caducables()).filter(alargable)) if ((await huella(rutaDe(f))) === codigo) ficha = f;
  if (!ficha) return ["Ese anuncio ya no está en la web, o ya no caduca. Míralo en el CMS.", true];

  const mensaje = consulta.message;
  const inputs = { ruta: rutaDe(ficha), desde: ficha.ultimoDia, mensaje: String(mensaje.message_id) };
  if (!(await lanzarWorkflow(env, WORKFLOW, inputs).catch(() => false)))
    return ["GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker, o cambia la fecha en el CMS.", true];

  // Se quita el botón, para que nadie lo pulse otra vez mientras tanto
  const filas = (mensaje.reply_markup?.inline_keyboard ?? []).map((fila) => fila.filter((b) => b.callback_data !== consulta.data));
  await llamarTelegram(env, "editMessageReplyMarkup", {
    chat_id: mensaje.chat.id,
    message_id: mensaje.message_id,
    reply_markup: { inline_keyboard: filas.filter((fila) => fila.length) },
  });
  await llamarTelegram(env, "sendMessage", {
    chat_id: mensaje.chat.id,
    text: `⏳ ${quien} alarga «${escapaHtml(ficha.titulo)}» ${DIAS_ALARGAR} días. Os aviso cuando esté.`,
    parse_mode: "HTML",
    reply_parameters: { message_id: mensaje.message_id, allow_sending_without_reply: true },
  });
  return ["⏳ En marcha."];
};

// ── POST /alargado: lo que cuenta la Action al terminar ─────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const valido = (r) =>
  r &&
  ["hecho", "cambiada", "error"].includes(r.estado) &&
  typeof r.ruta === "string" &&
  /^web-static\/content\/anuncios\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(r.ruta) &&
  (r.hasta === undefined || FECHA.test(r.hasta)) &&
  (r.titulo === undefined || (typeof r.titulo === "string" && r.titulo.length <= 300)) &&
  (r.mensaje === undefined || (typeof r.mensaje === "string" && r.mensaje.length <= 500)) &&
  (r.mensaje_id === undefined || (Number.isInteger(r.mensaje_id) && r.mensaje_id > 0));

export const contarAlargado = async (r, env) => {
  if (!valido(r)) return { error: "resultado no válido" };
  const titulo = `«${escapaHtml(r.titulo || r.ruta.split("/").pop().replace(/\.json$/, ""))}»`;
  const hasta = r.hasta ? diaCorto(r.hasta) : null;
  let texto;
  if (r.estado === "hecho") texto = `⏳ ${titulo} se ve hasta el ${hasta}. En la web, en un par de minutos.`;
  else if (r.estado === "cambiada")
    texto = `ℹ️ ${titulo} no se ha alargado: alguien ya le había cambiado la fecha${hasta ? ` (ahora, hasta el ${hasta})` : ""}.`;
  else texto = `⚠️ No se ha podido alargar ${titulo}${r.mensaje ? `: ${escapaHtml(r.mensaje)}` : ""}. Cambia la fecha en el CMS.`;

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
