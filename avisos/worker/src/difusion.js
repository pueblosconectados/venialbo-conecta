// POST /difundir: el texto listo para compartir lo nuevo, que prepara avisos/difusion.mjs
// cuando enviar.mjs avisa de algo publicado. Al grupo llega un mensaje por novedad con
// el texto para WhatsApp a la vista y dos botones: «📲 Enviar por WhatsApp», que abre
// WhatsApp con el texto ya escrito (wa.me) para elegir el grupo, y «📋 Copiar para
// Facebook», que copia al portapapeles la versión con etiquetas (copy_text, hasta 256
// caracteres). Los botones se montan aquí; de fuera solo llegan los textos.

import { escapaHtml, llamarTelegram } from "./telegram.js";

const SITIO = "https://venialboconecta.es/";
const MAX_MENSAJES = 10;
const MAX_WHATSAPP = 1000;
const MAX_FACEBOOK = 256;

const texto = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

const valido = (m) =>
  texto(m?.titulo, 300) && texto(m.whatsapp, MAX_WHATSAPP) && texto(m.facebook, MAX_FACEBOOK) && texto(m.url, 500) && m.url.startsWith(SITIO);

export const mandarDifusion = async (cuerpo, env) => {
  const mensajes = cuerpo?.mensajes;
  if (!Array.isArray(mensajes) || !mensajes.length || mensajes.length > MAX_MENSAJES || !mensajes.every(valido))
    return { error: "mensajes no válidos" };
  let enviados = 0;
  for (const m of mensajes) {
    const ok = await llamarTelegram(env, "sendMessage", {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: `📣 <b>Para difundir</b>\n\n${escapaHtml(m.whatsapp)}`,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: "📲 Enviar por WhatsApp", url: `https://wa.me/?text=${encodeURIComponent(m.whatsapp)}` }],
          [{ text: "📋 Copiar para Facebook", copy_text: { text: m.facebook } }],
        ],
      },
    });
    if (ok) enviados++;
  }
  return enviados ? { ok: true, enviados } : { error: "Telegram no lo ha aceptado" };
};
