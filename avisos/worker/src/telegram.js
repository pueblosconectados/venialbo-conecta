// El envío al grupo de Telegram de los administradores (el mismo de los avisos de
// prensa de news-rastreator). Lo usan el aviso de los formularios y el resumen semanal.

export const escapaHtml = (texto) =>
  String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Un elemento de una lista: el título en negrita en su línea y el detalle debajo. Las
// listas se separan con una línea en blanco (LISTA) para distinguir un elemento de otro.
export const elemento = (titulo, detalle) => `• <b>${escapaHtml(titulo)}</b>\n   ${detalle}`;
export const LISTA = "\n\n";

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

// Cualquier otro método de la API (editar o borrar un mensaje, mandar fotos…). El
// cuerpo va en JSON, o como FormData si lleva archivos. Devuelve `result`, o null si
// Telegram no lo acepta.
export const llamarTelegram = async (env, metodo, cuerpo) => {
  const multipart = cuerpo instanceof FormData;
  const respuesta = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${metodo}`, {
    method: "POST",
    ...(multipart ? {} : { headers: { "content-type": "application/json" } }),
    body: multipart ? cuerpo : JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) return null;
  return (await respuesta.json()).result ?? null;
};
