// El envío al grupo de Telegram de los administradores (el mismo de los avisos de
// prensa de news-rastreator). Lo usan el aviso de los formularios y el resumen semanal.

export const escapaHtml = (texto) =>
  String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Los botones van debajo del mensaje: una fila [{ text, url }, ...] o varias
// [[...], [...]]. Un botón con callback_data en vez de url lo atiende comandos.js.
export const filas = (botones) => (Array.isArray(botones[0]) ? botones : [botones]).filter((f) => f.length);

export const aTelegram = async (env, texto, botones = []) => {
  const respuesta = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(botones.length ? { reply_markup: { inline_keyboard: filas(botones) } } : {}),
    }),
  });
  return respuesta.ok;
};
