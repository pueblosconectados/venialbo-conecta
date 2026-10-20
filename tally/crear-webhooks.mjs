// Da de alta en Tally el webhook de cada formulario, que avisa por Telegram de cada
// respuesta nueva a través del Worker de avisos (avisos/worker/src/tally.js).
//
//   node tally/crear-webhooks.mjs --dry   # enseña lo que haría
//   node tally/crear-webhooks.mjs         # crea los que falten
//
// Si un formulario ya tiene un webhook a esa dirección no se toca, así que se puede pasar
// las veces que haga falta. El secreto con el que Tally firma va en
// .secretos/tally-webhook-secret, y el mismo como TALLY_SIGNING_SECRET en el Worker.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { API, RAIZ, AQUI, leerClave, pedirJson } from "./comun.mjs";

const URL_WEBHOOK = "https://venialbo-avisos.venialboconecta.workers.dev/tally";
const FICHERO_SECRETO = join(RAIZ, ".secretos/tally-webhook-secret");

const DRY = process.argv.includes("--dry");

const clave = await leerClave();
const secreto = (await readFile(FICHERO_SECRETO, "utf8").catch(() => "")).trim();
if (!secreto) throw new Error(`No hay secreto de firma en ${FICHERO_SECRETO}`);

const formularios = JSON.parse(await readFile(join(AQUI, "formularios-creados.json"), "utf8"));

// Todos los webhooks de la cuenta, de todas las páginas
const existentes = [];
for (let pagina = 1; ; pagina++) {
  const datos = await pedirJson(clave, `/webhooks?page=${pagina}&limit=100`);
  existentes.push(...datos.webhooks);
  if (!datos.hasMore) break;
}

for (const [slug, { id }] of Object.entries(formularios)) {
  const ya = existentes.find((w) => w.formId === id && w.url === URL_WEBHOOK);
  if (ya) {
    console.log(`${slug}: ya tiene el webhook (${ya.isEnabled ? "activo" : "DESACTIVADO"})`);
    continue;
  }
  if (DRY) {
    console.log(`${slug}: lo crearía → ${URL_WEBHOOK}`);
    continue;
  }
  const respuesta = await fetch(`${API}/webhooks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "content-type": "application/json" },
    body: JSON.stringify({
      formId: id,
      url: URL_WEBHOOK,
      eventTypes: ["FORM_RESPONSE"],
      signingSecret: secreto,
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`${slug}: HTTP ${respuesta.status}: ${await respuesta.text()}`);
  }
  console.log(`${slug}: creado`);
}
