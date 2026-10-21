// Si los avisos push llegan de verdad a los móviles, y cuánto tardan. El servicio de
// push (Google, Apple…) solo dice que ha aceptado el aviso; lo que pasa después en el
// móvil (Android lo aplaza para ahorrar batería, el fabricante mata Chrome, las
// notificaciones están bloqueadas…) no se sabía. Ahora el service worker de la web
// avisa aquí al recibirlo y al tocarlo.
//
//   POST /envios    la Action, con el token: apunta el envío justo antes de mandarlo
//                   ({ id, titulo, urgente }) y, al terminar, a qué dispositivos lo
//                   aceptó el servicio de push ({ id, aceptados: [sha256, …] })
//   POST /recibido  el service worker del móvil ({ id, endpoint, tipo }), con tipo
//                   "recibido" o "abierto"
//
// Va en D1 (ENTREGAS; las tablas, en entregas.sql) y no en KV: KV da 1000 escrituras al
// día en el plan gratuito y no sirve para contar a la vez desde muchos móviles.
//
// No se guarda nada nuevo de nadie: el dispositivo es el sha256 de su suscripción, la
// misma clave que ya tiene en SUSCRIPCIONES, y las horas son las del Worker. Solo cuenta
// lo que la Action dio por aceptado, así que un /recibido inventado no suma nada.

import { escapaHtml, LISTA } from "./telegram.js";

const DIA = 24 * 3600 * 1000;
// El TTL del envío (enviar.mjs): pasado esto, lo que no ha llegado ya no llega
const TTL = 12 * 3600 * 1000;
// Lo que se guarda, y lo que mira /avisos
const GUARDAR_DIAS = 90;
const ULTIMOS = 5;
// Un dispositivo que no ha recibido ninguno de al menos estos envíos está «mudo»
const MUDO_DESDE = 3;

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const HASH = /^[0-9a-f]{64}$/;

export const apuntarEnvio = async (datos, env) => {
  const { id, titulo, urgente, aceptados } = datos ?? {};
  if (typeof id !== "string" || !ID.test(id)) return { error: "falta id" };
  if (typeof titulo === "string") {
    await env.ENTREGAS.prepare("INSERT OR IGNORE INTO envios (id, enviado, titulo, urgente) VALUES (?1, ?2, ?3, ?4)")
      .bind(id, Date.now(), titulo.slice(0, 200), urgente ? 1 : 0)
      .run();
  }
  if (Array.isArray(aceptados)) {
    const hashes = aceptados.filter((h) => typeof h === "string" && HASH.test(h));
    // Una sola consulta para todos: el plan gratuito da 50 por petición
    await env.ENTREGAS.prepare(
      `INSERT INTO destinos (envio, dispositivo, aceptado)
       SELECT ?1, value, 1 FROM json_each(?2) WHERE true
       ON CONFLICT (envio, dispositivo) DO UPDATE SET aceptado = 1`,
    )
      .bind(id, JSON.stringify(hashes))
      .run();
    return { aceptados: hashes.length };
  }
  return { ok: true };
};

export const apuntarRecibido = async (datos, env, sha256) => {
  const { id, endpoint, tipo } = datos ?? {};
  if (typeof id !== "string" || !ID.test(id) || typeof endpoint !== "string" || endpoint.length > 1024) return false;
  const abierto = tipo === "abierto";
  const ahora = Date.now();
  // Si se ha tocado, también ha llegado (aunque el aviso de «recibido» se perdiera).
  // Solo de envíos que existen y de los últimos días
  await env.ENTREGAS.prepare(
    `INSERT INTO destinos (envio, dispositivo, recibido, abierto)
     SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM envios WHERE id = ?1 AND enviado > ?5)
     ON CONFLICT (envio, dispositivo) DO UPDATE SET
       recibido = COALESCE(recibido, excluded.recibido),
       abierto = COALESCE(abierto, excluded.abierto)`,
  )
    .bind(id, await sha256(endpoint), ahora, abierto ? ahora : null, ahora - 7 * DIA)
    .run();
  return true;
};

// Cada día, con el resto de tareas de las 10:00
export const limpiarEntregas = async (env) => {
  const antes = Date.now() - GUARDAR_DIAS * DIA;
  await env.ENTREGAS.batch([
    env.ENTREGAS.prepare("DELETE FROM destinos WHERE envio IN (SELECT id FROM envios WHERE enviado < ?1)").bind(antes),
    env.ENTREGAS.prepare("DELETE FROM envios WHERE enviado < ?1").bind(antes),
  ]);
};

// ── /avisos ──────────────────────────────────────────────────────────────────

// 40 s, 12 min, 1 h 20 min, 2 días
export const duracion = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${Math.max(s, 1)} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.round(h / 24)} días`;
};

const cuantil = (ordenados, q) => ordenados[Math.min(ordenados.length - 1, Math.ceil(q * ordenados.length) - 1)];

const fechaHora = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

const corto = (texto) => escapaHtml(texto.length > 90 ? `${texto.slice(0, 90).replace(/\s+\S*$/, "")}…` : texto);

const porcentaje = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "—");

const lineaEnvio = (envio, tardanzas, abiertos, aceptados, ahora) => {
  const cabecera = `${fechaHora.format(new Date(envio.enviado))} · ${envio.urgente ? "prioridad alta" : "prioridad normal"}`;
  if (!aceptados) return `• <b>${corto(envio.titulo)}</b>\n   ${cabecera}\n   No se aceptó para ningún dispositivo.`;
  const partes = [`Llegó a ${tardanzas.length} de ${aceptados} (${porcentaje(tardanzas.length, aceptados)})`];
  const t = [...tardanzas].sort((a, b) => a - b);
  // Con pocos, los cuantiles no dicen nada
  if (t.length === 1) partes.push(`tardó ${duracion(t[0])}`);
  else if (t.length && t.length < 5) partes.push(`el último tardó ${duracion(t.at(-1))}`);
  else if (t.length)
    partes.push(`la mitad en ${duracion(cuantil(t, 0.5))}, 9 de cada 10 en ${duracion(cuantil(t, 0.9))}, el último en ${duracion(t.at(-1))}`);
  partes.push(abiertos ? `${abiertos} lo ${abiertos === 1 ? "abrió" : "abrieron"}` : "nadie lo abrió");
  const espera = ahora - envio.enviado < TTL && tardanzas.length < aceptados ? "\n   <i>Aún puede llegar a más.</i>" : "";
  return `• <b>${corto(envio.titulo)}</b>\n   ${cabecera}\n   ${partes.join("; ")}.${espera}`;
};

export const resumenEntregas = async (env, ahora = Date.now()) => {
  const { results: envios } = await env.ENTREGAS.prepare(
    "SELECT id, enviado, titulo, urgente FROM envios ORDER BY enviado DESC LIMIT ?1",
  )
    .bind(ULTIMOS)
    .all();
  if (!envios.length) return "Todavía no hay envíos medidos.";

  const { results: destinos } = await env.ENTREGAS.prepare(
    `SELECT envio, dispositivo, recibido, abierto FROM destinos
     WHERE aceptado = 1 AND envio IN (SELECT value FROM json_each(?1))`,
  )
    .bind(JSON.stringify(envios.map((e) => e.id)))
    .all();

  const lineas = envios.map((envio) => {
    const suyos = destinos.filter((d) => d.envio === envio.id);
    const tardanzas = suyos.filter((d) => d.recibido != null).map((d) => d.recibido - envio.enviado);
    const abiertos = suyos.filter((d) => d.abierto != null).length;
    return lineaEnvio(envio, tardanzas, abiertos, suyos.length, ahora);
  });

  // Los que no reciben nada: aceptados en varios de estos envíos ya pasado su TTL, y
  // ninguno recibido. Suele ser notificaciones bloqueadas o el ahorro de batería
  const cerrados = new Set(envios.filter((e) => ahora - e.enviado >= TTL).map((e) => e.id));
  const porDispositivo = new Map();
  for (const d of destinos) {
    if (!cerrados.has(d.envio)) continue;
    const cuenta = porDispositivo.get(d.dispositivo) ?? { enviados: 0, recibidos: 0 };
    cuenta.enviados++;
    if (d.recibido != null) cuenta.recibidos++;
    porDispositivo.set(d.dispositivo, cuenta);
  }
  const mudos = [...porDispositivo.values()].filter((c) => c.enviados >= MUDO_DESDE && !c.recibidos).length;
  const pie = mudos
    ? `📵 ${mudos} ${mudos === 1 ? "dispositivo no ha recibido" : "dispositivos no han recibido"} ninguno de sus últimos ${MUDO_DESDE} o más avisos: notificaciones bloqueadas en el móvil, el ahorro de batería o Chrome desinstalado.`
    : null;

  return [`📬 <b>Los últimos ${envios.length} avisos</b>`, lineas.join(LISTA), pie].filter(Boolean).join(LISTA);
};
