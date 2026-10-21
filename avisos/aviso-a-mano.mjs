// Manda un aviso push a mano a todos los suscritos, fuera de lo automático (enviar.mjs).
//
//   node avisos/aviso-a-mano.mjs "Título" "Texto" [/ruta] [--urgente]
//
// La ruta es la página que se abre al tocarlo (por defecto, la portada). Con --urgente
// va con prioridad alta (Urgency: high), como los avisos de portada.
//
// Le llega a todo el pueblo: antes de mandar dice a cuántos y pide confirmación. Pide la
// lista al Worker y firma con la clave de .secretos/vapid.json.

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { apuntarAceptados, apuntarEnvio, nuevoId } from "./entregas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";

const URGENTE = process.argv.includes("--urgente");
const [titulo, cuerpo, url = "/"] = process.argv.slice(2).filter((a) => a !== "--urgente");
if (!titulo || !cuerpo) {
  console.error('Uso: node avisos/aviso-a-mano.mjs "Título" "Texto" [/ruta] [--urgente]');
  process.exit(1);
}

const vapid = JSON.parse(await readFile(join(RAIZ, ".secretos", "vapid.json"), "utf8"));
const token = (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8")).trim();
webpush.setVapidDetails("mailto:info@venialboconecta.es", vapid.publicKey, vapid.privateKey);

const r = await fetch(`${WORKER}/suscripciones`, { headers: { authorization: `Bearer ${token}` } });
if (!r.ok) throw new Error(`El Worker ha respondido ${r.status} al pedir la lista`);
const suscripciones = await r.json();

console.log(`«${titulo}» — ${cuerpo} → ${url}${URGENTE ? " (urgente)" : ""}`);
const pregunta = createInterface({ input: process.stdin, output: process.stdout });
const respuesta = await pregunta.question(`¿Mandar a ${suscripciones.length} suscritos? (s/n) `);
pregunta.close();
if (respuesta.trim().toLowerCase() !== "s") {
  console.log("No se ha mandado nada");
  process.exit(0);
}

const id = nuevoId();
await apuntarEnvio(token, id, `${titulo}: ${cuerpo}`, URGENTE);
const mensaje = JSON.stringify({ titulo, cuerpo, url, id });
const aceptados = [];
const muertas = [];
const fallos = [];
for (const sub of suscripciones) {
  try {
    await webpush.sendNotification(sub, mensaje, { TTL: 12 * 3600, urgency: URGENTE ? "high" : "normal" });
    aceptados.push(sub.endpoint);
  } catch (e) {
    // 404 o 410: la suscripción ya no existe (permiso retirado, datos borrados…)
    if (e.statusCode === 404 || e.statusCode === 410) muertas.push(sub.endpoint);
    else fallos.push(e.statusCode ?? e.code ?? "sin respuesta");
  }
}

await apuntarAceptados(token, id, aceptados);
const bien = aceptados.length;

if (muertas.length) {
  await fetch(`${WORKER}/borrar`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ endpoints: muertas }),
  });
}

console.log(
  `Enviado a ${bien} de ${suscripciones.length}` +
    (muertas.length ? `; ${muertas.length} ya no existían y se han borrado` : "") +
    (fallos.length ? `; ${fallos.length} han fallado (${[...new Set(fallos)].join(", ")})` : ""),
);
