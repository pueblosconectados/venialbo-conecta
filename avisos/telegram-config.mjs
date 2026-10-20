// Configura el bot de Telegram para que atienda comandos: le dice a Telegram que mande
// lo que se escribe al Worker (setWebhook, con una clave que el Worker comprueba) y le
// pone el menú de comandos, solo en el grupo (setMyCommands con scope de chat). La lista
// de comandos sale de worker/src/comandos.js, la misma que contesta el Worker.
//
//   node avisos/telegram-config.mjs --dry     # enseña lo que haría
//   node avisos/telegram-config.mjs           # lo configura
//   node avisos/telegram-config.mjs --quitar  # quita el webhook (vuelve getUpdates)
//
// Necesita el token del bot y el chat del grupo, que no se guardan en el repo. Desde una
// terminal propia, para que el token no quede en ningún historial:
//
//   read -rsp "Token: " TELEGRAM_TOKEN; echo; export TELEGRAM_TOKEN
//   read -rp "Chat: " TELEGRAM_CHAT_ID; export TELEGRAM_CHAT_ID
//
// La clave del webhook está en .secretos/telegram-webhook-secret, y la misma como
// TELEGRAM_WEBHOOK_SECRET en el Worker.

import { readFile } from "node:fs/promises";
import { COMANDOS } from "./worker/src/comandos.js";

const URL_WEBHOOK = "https://venialbo-avisos.venialboconecta.workers.dev/telegram";
const SECRETO = new URL("../.secretos/telegram-webhook-secret", import.meta.url);

const DRY = process.argv.includes("--dry");
const QUITAR = process.argv.includes("--quitar");

const token = process.env.TELEGRAM_TOKEN?.trim();
const chat = process.env.TELEGRAM_CHAT_ID?.trim();
if (!token || !chat) {
  console.error("Faltan TELEGRAM_TOKEN y TELEGRAM_CHAT_ID en el entorno (ver la cabecera del script).");
  process.exit(1);
}

const telegram = async (metodo, cuerpo = {}) => {
  const respuesta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await respuesta.json();
  if (!datos.ok) throw new Error(`${metodo}: ${datos.description}`);
  return datos.result;
};

const alcance = { type: "chat", chat_id: chat };

if (QUITAR) {
  if (DRY) console.log("Quitaría el webhook y el menú del grupo");
  else {
    await telegram("deleteWebhook");
    await telegram("deleteMyCommands", { scope: alcance });
    console.log("Webhook y menú quitados: getUpdates vuelve a funcionar.");
  }
} else {
  const secreto = (await readFile(SECRETO, "utf8").catch(() => "")).trim();
  if (!secreto) throw new Error(`No hay clave del webhook en ${SECRETO.pathname}`);

  if (DRY) {
    console.log(`Webhook → ${URL_WEBHOOK} (message, callback_query)`);
    console.log(`Menú en el chat ${chat}:`);
    for (const { command, description } of COMANDOS) console.log(`  /${command} · ${description}`);
  } else {
    await telegram("setWebhook", {
      url: URL_WEBHOOK,
      secret_token: secreto,
      allowed_updates: ["message", "callback_query"],
      // Lo que se escribiera antes de poner el webhook no se contesta de golpe
      drop_pending_updates: true,
    });
    await telegram("setMyCommands", { commands: COMANDOS, scope: alcance });
    console.log("Webhook y menú puestos.");
  }
}

// Cómo ha quedado (sin la clave: Telegram no la devuelve)
const info = await telegram("getWebhookInfo");
console.log(`\nWebhook: ${info.url || "(ninguno)"}`);
if (info.last_error_message) {
  console.log(`Último error: ${info.last_error_message} (${new Date(info.last_error_date * 1000).toLocaleString("es-ES")})`);
}
console.log(`Pendientes de entregar: ${info.pending_update_count}`);
