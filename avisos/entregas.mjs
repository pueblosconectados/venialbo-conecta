// Apunta cada envío en el Worker, para saber luego si llegó a los móviles y cuánto tardó
// (worker/src/entregas.js; se ve con /avisos en el grupo). Lo usan enviar.mjs y
// aviso-a-mano.mjs.
//
// Si el Worker falla, se avisa y se manda igual: medir no puede impedir avisar.

import { createHash, randomBytes } from "node:crypto";

const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";

// Va en el aviso: el service worker del móvil lo devuelve al recibirlo
export const nuevoId = () => randomBytes(12).toString("base64url");

// La misma clave que usa el Worker para la suscripción
const hash = (endpoint) => createHash("sha256").update(endpoint).digest("hex");

const apuntar = async (token, datos) => {
  try {
    const r = await fetch(`${WORKER}/envios`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(datos),
    });
    if (!r.ok) console.warn(`  ⚠ El Worker ha respondido ${r.status} al apuntar el envío`);
  } catch (e) {
    console.warn(`  ⚠ No se ha podido apuntar el envío: ${e.message}`);
  }
};

// Antes de mandar: así los que llegan al momento ya encuentran el envío
export const apuntarEnvio = (token, id, titulo, urgente) => apuntar(token, { id, titulo, urgente });

// Después: a qué dispositivos lo aceptó el servicio de push
export const apuntarAceptados = (token, id, endpoints) =>
  apuntar(token, { id, aceptados: endpoints.map(hash) });
