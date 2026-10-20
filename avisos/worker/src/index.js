// El Worker de los avisos (fase 2 de NOTIFICACIONES.md): guarda las suscripciones push
// de los vecinos y se las da a la Action que envía. Es la única pieza con servidor del
// proyecto, así que hace lo mínimo.
//
//   POST /suscribir      la web      guarda una suscripción
//   POST /baja           la web      la borra
//   GET  /suscripciones  la Action   la lista entera (con el token)
//   POST /borrar         la Action   quita las que el servicio de push da por muertas
//   POST /tally          Tally       una respuesta de formulario, que va a Telegram
//                                    (en tally.js)
//   GET  /resumen        a mano      el resumen semanal de visitas (con el token; en
//                                    resumen.js). Solo lo enseña: ?enviar lo manda al
//                                    grupo y ?en-curso usa lo que va de semana
//   GET  /vigilancia     a mano      lo que vería ahora la vigilancia (con el token; en
//                                    vigilancia.js). No avisa ni guarda nada
//   POST /telegram       Telegram    los comandos del grupo y los botones (en comandos.js)
//
// Y el cron de wrangler.toml, cada 5 minutos: la vigilancia de GitHub y de la web, y
// los lunes a las 9:00 el resumen semanal.
//
// Cada suscripción se guarda en KV con el hash de su dirección como clave y la propia
// suscripción como metadato. Así la lista entera sale de una sola llamada a list(), sin
// leer clave por clave, y volver a suscribirse desde el mismo móvil no duplica nada.
// No se guardan IPs, fechas ni nada que no sea la suscripción.

import { webhookTally } from "./tally.js";
import { enviarResumen, horaMadrid, resumenSemanal } from "./resumen.js";
import { vigilar } from "./vigilancia.js";
import { webhookTelegram } from "./comandos.js";

// Los servicios de push conocidos. Lo demás se rechaza, para que nadie llene el KV con
// direcciones inventadas.
const SERVICIOS = [
  /^fcm\.googleapis\.com$/, // Chrome, Brave, Samsung Internet, Edge en Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge en Windows
];

// KV deja 1024 bytes de metadatos por clave; una suscripción real ronda los 400
const MAX_METADATOS = 1024;
const MAX_CUERPO = 4096;

const json = (datos, estado = 200, cabeceras = {}) =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", ...cabeceras },
  });

const sha256 = async (texto) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// Solo la web puede suscribir y dar de baja desde el navegador. No es una defensa (con
// curl se salta), pero evita que otra web use el Worker.
const cors = (request, env) => {
  const origen = request.headers.get("origin");
  const permitidos = env.ORIGENES.split(",").map((o) => o.trim());
  if (!origen || !permitidos.includes(origen)) return null;
  return {
    "access-control-allow-origin": origen,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
};

const leerCuerpo = async (request) => {
  const texto = await request.text();
  if (texto.length > MAX_CUERPO) throw new Error("demasiado grande");
  return JSON.parse(texto);
};

// Se queda solo con lo que hace falta para enviar, y comprueba que tiene buena pinta
const limpiarSuscripcion = (sub) => {
  const endpoint = sub?.endpoint;
  const { p256dh, auth } = sub?.keys ?? {};
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string")
    return null;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !SERVICIOS.some((s) => s.test(url.hostname))) return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return null;
  const limpia = { endpoint, keys: { p256dh, auth } };
  return JSON.stringify(limpia).length <= MAX_METADATOS ? limpia : null;
};

// El token de la Action, comparado sin dar pistas por el tiempo de respuesta
const conToken = (request, env) => {
  const dado = new TextEncoder().encode(request.headers.get("authorization") ?? "");
  const esperado = new TextEncoder().encode(`Bearer ${env.TOKEN}`);
  return dado.byteLength === esperado.byteLength && crypto.subtle.timingSafeEqual(dado, esperado);
};

const suscribir = async (request, env, cabeceras) => {
  const sub = limpiarSuscripcion(await leerCuerpo(request));
  if (!sub) return json({ error: "suscripción no válida" }, 400, cabeceras);
  await env.SUSCRIPCIONES.put(await sha256(sub.endpoint), "", { metadata: sub });
  return json({ ok: true }, 200, cabeceras);
};

const baja = async (request, env, cabeceras) => {
  const { endpoint } = await leerCuerpo(request);
  if (typeof endpoint !== "string") return json({ error: "falta endpoint" }, 400, cabeceras);
  await env.SUSCRIPCIONES.delete(await sha256(endpoint));
  return json({ ok: true }, 200, cabeceras);
};

const listar = async (env) => {
  const suscripciones = [];
  let cursor;
  do {
    const pagina = await env.SUSCRIPCIONES.list({ cursor });
    for (const k of pagina.keys) if (k.metadata) suscripciones.push(k.metadata);
    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
  return json(suscripciones);
};

const borrar = async (request, env) => {
  const { endpoints } = await leerCuerpo(request);
  if (!Array.isArray(endpoints)) return json({ error: "falta endpoints" }, 400);
  for (const e of endpoints) await env.SUSCRIPCIONES.delete(await sha256(String(e)));
  return json({ borradas: endpoints.length });
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const metodo = request.method;

    try {
      if (pathname === "/suscribir" || pathname === "/baja") {
        const cabeceras = cors(request, env);
        if (!cabeceras) return json({ error: "origen no permitido" }, 403);
        if (metodo === "OPTIONS") return new Response(null, { status: 204, headers: cabeceras });
        if (metodo !== "POST") return json({ error: "método no permitido" }, 405, cabeceras);
        return pathname === "/suscribir"
          ? await suscribir(request, env, cabeceras)
          : await baja(request, env, cabeceras);
      }

      if (pathname === "/suscripciones" || pathname === "/borrar") {
        if (!conToken(request, env)) return json({ error: "no autorizado" }, 401);
        if (pathname === "/suscripciones" && metodo === "GET") return await listar(env);
        if (pathname === "/borrar" && metodo === "POST") return await borrar(request, env);
        return json({ error: "método no permitido" }, 405);
      }

      if (pathname === "/tally") return await webhookTally(request, env, json);

      if (pathname === "/resumen") {
        if (!conToken(request, env)) return json({ error: "no autorizado" }, 401);
        if (metodo !== "GET") return json({ error: "método no permitido" }, 405);
        const { searchParams } = new URL(request.url);
        const opciones = { enCurso: searchParams.has("en-curso") };
        try {
          const texto = searchParams.has("enviar")
            ? await enviarResumen(env, opciones)
            : await resumenSemanal(env, opciones);
          return json({ enviado: searchParams.has("enviar"), texto });
        } catch (e) {
          // Cloudflare o Telegram fallaron: aquí sí se dice cuál, que es quien lo lanza a mano
          return json({ error: String(e.message ?? e) }, 502);
        }
      }

      if (pathname === "/telegram") return await webhookTelegram(request, env);

      if (pathname === "/vigilancia") {
        if (!conToken(request, env)) return json({ error: "no autorizado" }, 401);
        if (metodo !== "GET") return json({ error: "método no permitido" }, 405);
        return json(await vigilar(env, { enviar: false }));
      }

      return json({ error: "no existe" }, 404);
    } catch {
      // JSON roto o cuerpo demasiado grande. Sin detalles: no hay registros que mirar
      return json({ error: "petición no válida" }, 400);
    }
  },

  // Un solo cron, cada 5 minutos (el plan gratuito da pocos por cuenta). La vigilancia
  // corre siempre; el resumen, solo en el de las 9:00 en punto de un lunes en Madrid.
  // Así tampoco hay que tocar nada con el cambio de hora.
  async scheduled(controller, env, ctx) {
    const momento = new Date(controller.scheduledTime);
    ctx.waitUntil(vigilar(env));
    const esLunes = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "short" }).format(momento) === "Mon";
    if (esLunes && horaMadrid(momento) === 9 && momento.getUTCMinutes() === 0) ctx.waitUntil(enviarResumen(env));
  },
};
