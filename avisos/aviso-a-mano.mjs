// Manda un aviso push a mano a todos los suscritos, fuera de lo automático (enviar.mjs).
//
//   node avisos/aviso-a-mano.mjs "Título" "Texto" [/ruta] [--urgente]
//
// La ruta es la página que se abre al tocarlo (por defecto, la portada). Con --urgente
// va con prioridad alta (Urgency: high), como los avisos de portada.
//
// Le llega a todo el pueblo: antes de mandar dice a cuántos y pide confirmación. Pide la
// lista al Worker y firma con la clave de .secretos/vapid.json.
//
// Desde Telegram (/avisar, avisos/worker/src/avisar.js) lo lanza la Action aviso.yml con
// --si (la confirmación ya se dio en el grupo) y --contar (al terminar, el Worker dice en
// el grupo a cuántos ha llegado). Allí las claves llegan por AVISOS_TOKEN y VAPID_PRIVADA,
// y la pública sale de la web, como en enviar.mjs.

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { apuntarAceptados, apuntarEnvio, nuevoId } from "./entregas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";

const URGENTE = process.argv.includes("--urgente");
const SI = process.argv.includes("--si");
const CONTAR = process.argv.includes("--contar");
const [titulo, cuerpo, url = "/"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!titulo || !cuerpo) {
  console.error('Uso: node avisos/aviso-a-mano.mjs "Título" "Texto" [/ruta] [--urgente]');
  process.exit(1);
}

const deFichero = async (nombre) => readFile(join(RAIZ, ".secretos", nombre), "utf8").catch(() => null);
const token = (process.env.AVISOS_TOKEN ?? (await deFichero("token-avisos")))?.trim();
const privada = (process.env.VAPID_PRIVADA ?? JSON.parse((await deFichero("vapid.json")) ?? "{}").privateKey)?.trim();
// La pública sale de la web, para no tenerla en dos sitios
const publica = (await readFile(join(RAIZ, "web-static", "src", "config.ts"), "utf8")).match(/VAPID_PUBLICA =\s*"([^"]+)"/)?.[1];
if (!token || !privada || !publica) throw new Error("Faltan AVISOS_TOKEN, VAPID_PRIVADA o la clave pública");
webpush.setVapidDetails("mailto:info@venialboconecta.es", publica, privada);

const r = await fetch(`${WORKER}/suscripciones`, { headers: { authorization: `Bearer ${token}` } });
if (!r.ok) throw new Error(`El Worker ha respondido ${r.status} al pedir la lista`);
const suscripciones = await r.json();

console.log(`«${titulo}» — ${cuerpo} → ${url}${URGENTE ? " (urgente)" : ""}`);
if (!SI) {
  const pregunta = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await pregunta.question(`¿Mandar a ${suscripciones.length} suscritos? (s/n) `);
  pregunta.close();
  if (respuesta.trim().toLowerCase() !== "s") {
    console.log("No se ha mandado nada");
    process.exit(0);
  }
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

if (CONTAR) {
  const c = await fetch(`${WORKER}/aviso-enviado`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ titulo, enviados: bien, total: suscripciones.length, fallos: fallos.length }),
  });
  if (!c.ok) console.warn(`  ⚠ El Worker ha respondido ${c.status} al contarlo en el grupo`);
}
// Si no ha llegado a nadie y no es porque no haya nadie, que la Action falle (y avise)
if (suscripciones.length && !bien && fallos.length) process.exitCode = 1;
