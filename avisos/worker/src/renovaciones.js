// Lo que caduca y hay que renovar a mano: el token de GitHub del Worker (sin él no se
// traen solos los formularios ni se avisa de las Actions que fallan), el de Cloudflare
// del resumen de visitas y lo que se apunte en RENOVACIONES (wrangler.toml), como el
// dominio. Cada día a las 10:00 se mira y se avisa al grupo cuando a algo le quedan 15
// días y otra vez cuando le quedan 3; /renovaciones lo lista todo.
//
// - GitHub dice la caducidad de un token de grano fino en la cabecera
//   github-authentication-token-expiration de cualquier respuesta. Sin cabecera, el token
//   no caduca. Si ya lo rechaza, de eso avisa publicaciones.js: aquí sale como «rechazado».
// - Cloudflare la da en `expires_on` de /user/tokens/verify. El de ahora no caduca.
// - RENOVACIONES es una lista JSON [{ "nombre", "fecha": "AAAA-MM-DD", "enlace" }] de lo
//   que no se puede preguntar (el dominio .es no tiene RDAP). Al renovarlo se cambia la
//   fecha y se vuelve a desplegar.
//
// El estado va en el KV ESTADO, clave "renovaciones": { <id>: { fecha, umbral } }, el
// último umbral avisado para esa fecha. Si la fecha cambia (se ha renovado) se dice una
// vez y se empieza de cero.

import { caducidadToken } from "./github.js";
import { aTelegram, elemento, escapaHtml, LISTA } from "./telegram.js";

const CLAVE = "renovaciones";
// De mayor a menor: en cada uno se avisa una vez
const UMBRALES = [15, 3];
const DIA = 24 * 60 * 60 * 1000;

const formatoDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
const hoyMadrid = (ahora) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);

// Días que faltan, contados por días de Madrid, no por horas
const diasHasta = (fecha, ahora) => {
  const dia = hoyMadrid(new Date(fecha));
  return Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoyMadrid(ahora)}T12:00:00Z`)) / DIA);
};

const cuando = (dias) =>
  dias < 0 ? `caducó hace ${-dias} ${dias === -1 ? "día" : "días"}` : dias === 0 ? "caduca hoy" : dias === 1 ? "caduca mañana" : `caduca en ${dias} días`;

const cloudflare = async (env) => {
  const respuesta = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
  });
  if (respuesta.status === 401 || respuesta.status === 403) return { rechazado: true };
  if (!respuesta.ok) throw new Error(`Cloudflare: HTTP ${respuesta.status}`);
  const { result } = await respuesta.json();
  if (result?.status && result.status !== "active") return { rechazado: true };
  return { fecha: result?.expires_on ? Date.parse(result.expires_on) : null };
};

const aMano = (env) => {
  let lista;
  try {
    lista = JSON.parse(env.RENOVACIONES || "[]");
  } catch {
    throw new Error("RENOVACIONES en wrangler.toml no es JSON válido");
  }
  return lista.map(({ nombre, fecha, enlace }) => ({
    id: `mano:${nombre}`,
    nombre,
    fecha: Date.parse(`${fecha}T12:00:00Z`),
    enlace,
    como: "Al renovarlo, cambia la fecha en RENOVACIONES (avisos/worker/wrangler.toml) y vuelve a desplegar.",
  }));
};

// [{ id, nombre, fecha (ms o null si no caduca), rechazado?, error?, enlace, como }]
export const renovables = async (env) => {
  const preguntar = async (base, consulta) => {
    try {
      return { ...base, ...(await consulta()) };
    } catch (e) {
      return { ...base, fecha: null, error: String(e.message ?? e) };
    }
  };
  const automaticos = await Promise.all([
    preguntar(
      {
        id: "github",
        nombre: "Token de GitHub del Worker",
        enlace: "https://github.com/settings/personal-access-tokens",
        como: "Se regenera en GitHub y se cambia con <code>npx wrangler secret put GITHUB_TOKEN</code> en avisos/worker.",
      },
      () => caducidadToken(env),
    ),
    preguntar(
      {
        id: "cloudflare",
        nombre: "Token de Cloudflare del resumen de visitas",
        enlace: "https://dash.cloudflare.com/profile/api-tokens",
        como: "Se crea otro y se cambia con <code>npx wrangler secret put CF_ANALYTICS_TOKEN</code> en avisos/worker.",
      },
      () => cloudflare(env),
    ),
  ]);
  return [...automaticos, ...aMano(env)];
};

// El primer umbral en el que ya se está (15, luego 3), o null si aún queda más
const umbralDe = (dias) => UMBRALES.filter((u) => dias <= u).at(-1) ?? null;

// Compara con lo ya avisado. Devuelve el estado nuevo y los mensajes.
export const revisar = (anterior, lista, ahora) => {
  const nuevo = {};
  const mensajes = [];
  for (const r of lista) {
    // Si no se ha podido preguntar, se deja como estaba hasta la próxima
    if (r.error) {
      if (anterior[r.id]) nuevo[r.id] = anterior[r.id];
      continue;
    }
    // Lo rechazado ya lo avisa publicaciones.js (GitHub) o no hay a qué esperar
    if (r.rechazado || !r.fecha) continue;

    const visto = anterior[r.id];
    const dias = diasHasta(r.fecha, ahora);
    if (visto && visto.fecha !== r.fecha && visto.umbral != null) {
      mensajes.push({ texto: `🟢 <b>${escapaHtml(r.nombre)}</b> renovado: ahora caduca el ${formatoDia.format(r.fecha)}.` });
    }
    const umbral = umbralDe(dias);
    const yaAvisado = visto?.fecha === r.fecha ? visto.umbral : null;
    if (umbral != null && dias >= 0 && (yaAvisado == null || umbral < yaAvisado)) {
      mensajes.push({
        texto: `⏳ <b>${escapaHtml(r.nombre)}</b> ${cuando(dias)} (el ${formatoDia.format(r.fecha)}).\n${r.como}`,
        botones: r.enlace ? [{ text: "Renovarlo", url: r.enlace }] : [],
      });
      nuevo[r.id] = { fecha: r.fecha, umbral };
    } else {
      nuevo[r.id] = { fecha: r.fecha, umbral: yaAvisado };
    }
  }
  return { nuevo, mensajes };
};

// Lo que hace el cron, una vez al día
export const recordarRenovaciones = async (env, { ahora = Date.now() } = {}) => {
  const anterior = (await env.ESTADO.get(CLAVE, "json")) ?? {};
  const { nuevo, mensajes } = revisar(anterior, await renovables(env), ahora);
  for (const { texto, botones } of mensajes) {
    // Si Telegram falla no se guarda: mañana se vuelve a intentar
    if (!(await aTelegram(env, texto, botones))) throw new Error("Telegram no aceptó el aviso");
  }
  if (JSON.stringify(nuevo) !== JSON.stringify(anterior)) await env.ESTADO.put(CLAVE, JSON.stringify(nuevo));
};

// /renovaciones: todo, lo que antes caduca primero
export const listaRenovaciones = async (env, { ahora = Date.now() } = {}) => {
  const lista = await renovables(env);
  const orden = (r) => (r.rechazado ? -Infinity : r.error ? Infinity - 1 : r.fecha ?? Infinity);
  const lineas = lista
    .sort((a, b) => orden(a) - orden(b))
    .map((r) => {
      if (r.rechazado) return elemento(`🔴 ${r.nombre}`, "rechazado: ha caducado o le han quitado permisos");
      if (r.error) return elemento(`⚪️ ${r.nombre}`, `no he podido mirarlo (${escapaHtml(r.error)})`);
      if (!r.fecha) return elemento(`🟢 ${r.nombre}`, "no caduca");
      const dias = diasHasta(r.fecha, ahora);
      const icono = dias < 0 ? "🔴" : dias <= UMBRALES[0] ? "🟡" : "🟢";
      return elemento(`${icono} ${r.nombre}`, `${cuando(dias)} (el ${formatoDia.format(r.fecha)})`);
    });
  const botones = lista
    .filter((r) => r.enlace && (r.rechazado || (r.fecha && diasHasta(r.fecha, ahora) <= UMBRALES[0])))
    .map((r) => [{ text: `Renovar: ${r.nombre}`, url: r.enlace }]);
  return { texto: `🗓 <b>Lo que hay que renovar</b>${LISTA}${lineas.join(LISTA)}`, botones };
};
