// Manda un aviso push de prueba a mano: la fase 0 de NOTIFICACIONES.md.
//
//   node scripts/enviar-prueba-push.mjs <suscripciones.json> ["Título"] ["Texto"] [/ruta] [--urgente]
//
// Con --urgente va con prioridad alta (Urgency: high), como los avisos de portada: Android
// lo entrega al momento aunque el móvil esté ahorrando batería.
//
// El fichero lleva una suscripción (lo que enseña /prueba-avisos) o una lista de ellas.
// Lo cómodo es guardarlo en .secretos/, que no se sube. La clave privada VAPID se lee
// de .secretos/vapid.json.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const URGENTE = process.argv.includes("--urgente");
const [fichero, titulo = "Aviso de prueba", cuerpo = "Esto es una prueba de VenialboConecta.", url = "/"] =
  process.argv.slice(2).filter((a) => a !== "--urgente");
if (!fichero) {
  console.error('Uso: node scripts/enviar-prueba-push.mjs <suscripciones.json> ["Título"] ["Texto"] [/ruta]');
  process.exit(1);
}

const vapid = JSON.parse(await readFile(join(RAIZ, ".secretos", "vapid.json"), "utf8"));
webpush.setVapidDetails("mailto:info@venialboconecta.es", vapid.publicKey, vapid.privateKey);

const leido = JSON.parse(await readFile(fichero, "utf8"));
const suscripciones = Array.isArray(leido) ? leido : [leido];
const mensaje = JSON.stringify({ titulo, cuerpo, url });

for (const sub of suscripciones) {
  const servicio = new URL(sub.endpoint).host;
  try {
    const r = await webpush.sendNotification(sub, mensaje, { TTL: 3600, urgency: URGENTE ? "high" : "normal" });
    console.log(`✓ ${servicio}: ${r.statusCode}`);
  } catch (e) {
    // 404 o 410: la suscripción ya no existe (permiso retirado, datos borrados…)
    console.log(`✗ ${servicio}: ${e.statusCode ?? ""} ${e.body || e.message}`);
  }
}
