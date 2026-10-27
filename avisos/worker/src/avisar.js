// /avisar: mandar un aviso push a todo el pueblo desde el grupo de Telegram, para lo
// urgente (un corte de agua, una calle cortada). Hasta ahora solo se podía con
// avisos/aviso-a-mano.mjs desde el ordenador.
//
//   /avisar Corte de agua | Mañana de 9 a 14 no habrá agua en la calle Mayor
//   /avisar Corte de agua | Mañana… | /tablon/2026-10-28-corte-de-agua
//
// (o el título en la primera línea y el texto en la siguiente). La tercera parte es la
// página que se abre al tocarlo; sin ella, la portada.
//
// Primero enseña cómo llegará, con «✅ Enviar a N dispositivos» y «❌ Cancelar»; el
// borrador se guarda una hora en el KV ESTADO ("aviso:<id>") y el botón lleva su id.
// «Enviar» lanza el workflow aviso.yml, que lo manda con aviso-a-mano.mjs (el Worker no
// tiene la clave privada de las push) y al terminar llama a POST /aviso-enviado para
// decir en el grupo a cuántos ha llegado. Va siempre con prioridad alta: es para urgencias.

import { lanzarWorkflow } from "./github.js";
import { escapaHtml, llamarTelegram } from "./telegram.js";
import { suscriptores } from "./resumen.js";

const WORKFLOW = "aviso.yml";
const WEB = "https://venialboconecta.es";
const MAX_TITULO = 60;
const MAX_CUERPO = 200;
const HORA = 60 * 60;

const USO = [
  "📣 <b>Para mandar un aviso a todos los móviles:</b>",
  "<code>/avisar Título | Texto</code>",
  "Y si al tocarlo tiene que abrir una página de la web, al final: <code>| /tablon/…</code>",
  "Por ejemplo:",
  "<code>/avisar Corte de agua | Mañana de 9 a 14 no habrá agua en la calle Mayor</code>",
].join("\n");

// "/tablon/x" o "https://venialboconecta.es/tablon/x" → "/tablon/x"; null si es de fuera
const rutaDe = (texto) => {
  const t = texto.trim();
  if (!t) return "/";
  const ruta = t.startsWith(WEB) ? t.slice(WEB.length) || "/" : t;
  return /^\/[\w\-/]*$/.test(ruta) ? ruta : null;
};

export const prepararAviso = async (env, mensaje, argumentos) => {
  const partes = argumentos.includes("|") ? argumentos.split("|") : argumentos.split("\n");
  const [titulo = "", cuerpo = "", destino = ""] = partes.map((p) => p.trim());
  if (!titulo || !cuerpo) return { texto: USO };
  if (titulo.length > MAX_TITULO || cuerpo.length > MAX_CUERPO)
    return { texto: `⚠️ Demasiado largo: el título, hasta ${MAX_TITULO} caracteres, y el texto, hasta ${MAX_CUERPO} (en el móvil no se ve más).` };
  const url = rutaDe(destino);
  if (!url) return { texto: "⚠️ La página tiene que ser de la web: <code>/tablon/…</code> o una dirección de venialboconecta.es." };

  const id = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.ESTADO.put(`aviso:${id}`, JSON.stringify({ titulo, cuerpo, url }), { expirationTtl: HORA });
  const total = await suscriptores(env);
  return {
    texto: [
      "📣 <b>Así llegará a los móviles</b>",
      `<b>${escapaHtml(titulo)}</b>\n${escapaHtml(cuerpo)}`,
      `<i>Al tocarlo abre ${url === "/" ? "la portada" : escapaHtml(`${WEB}${url}`)}. Va como urgente.</i>`,
      `Le llegará a ${total} ${total === 1 ? "dispositivo" : "dispositivos"}. El borrador vale una hora.`,
    ].join("\n\n"),
    botones: [
      { text: `✅ Enviar a ${total}`, callback_data: `avisar:${id}` },
      { text: "❌ Cancelar", callback_data: `noavisar:${id}` },
    ],
  };
};

export const esBotonAviso = (accion) => accion === "avisar" || accion === "noavisar";

// Devuelve el texto para answerCallbackQuery y si va como alerta
export const pulsacionAviso = async (env, consulta, accion, id, quien) => {
  if (!/^[0-9a-f]{10}$/.test(id ?? "")) return ["No sé qué hacer con este botón.", true];
  const mensaje = consulta.message;
  const borrador = await env.ESTADO.get(`aviso:${id}`, "json");
  // Se borra antes de lanzar nada: dos toques seguidos no mandan dos avisos
  await env.ESTADO.delete(`aviso:${id}`);
  const editar = (texto) =>
    llamarTelegram(env, "editMessageText", { chat_id: mensaje.chat.id, message_id: mensaje.message_id, text: texto, parse_mode: "HTML" });

  // Sin tocar el mensaje: si ya se mandó, dice quién y qué, y eso tiene que quedar
  if (!borrador) return ["Este borrador ya no vale: ha pasado la hora, o ya se mandó o canceló. Escribe /avisar otra vez.", true];
  const resumen = `<b>${escapaHtml(borrador.titulo)}</b>\n${escapaHtml(borrador.cuerpo)}`;
  if (accion === "noavisar") {
    await editar(`❌ ${quien} lo ha cancelado. No se ha mandado:\n\n${resumen}`);
    return ["Cancelado."];
  }
  if (!(await lanzarWorkflow(env, WORKFLOW, borrador).catch(() => false))) {
    // Que se pueda volver a intentar con el mismo botón
    await env.ESTADO.put(`aviso:${id}`, JSON.stringify(borrador), { expirationTtl: HORA });
    return ["GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker.", true];
  }
  await editar(`⏳ ${quien} lo manda. En un par de minutos estará en los móviles; os digo a cuántos.\n\n${resumen}`);
  return ["📣 En marcha."];
};

// POST /aviso-enviado: lo que cuenta la Action al terminar
export const contarAviso = async (cuerpo, env) => {
  const { titulo, enviados, total, fallos } = cuerpo ?? {};
  const numero = (n) => Number.isInteger(n) && n >= 0 && n < 1e6;
  if (typeof titulo !== "string" || titulo.length > 200 || !numero(enviados) || !numero(total) || !numero(fallos ?? 0))
    return { error: "cuerpo no válido" };
  const texto =
    enviados || !total
      ? `📣 Aviso «${escapaHtml(titulo)}» mandado: ha llegado a ${enviados} de ${total} ${total === 1 ? "dispositivo" : "dispositivos"}.${fallos ? ` ${fallos} han fallado.` : ""}`
      : `⚠️ El aviso «${escapaHtml(titulo)}» no ha llegado a ningún móvil (${fallos} fallos). Mira la Action «Aviso desde Telegram».`;
  return (await llamarTelegram(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: texto, parse_mode: "HTML" }))
    ? { ok: true }
    : { error: "Telegram no lo ha aceptado" };
};
