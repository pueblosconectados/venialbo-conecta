// Comprueba los enlaces de lo que se ve en la web y manda al Worker los que no funcionan;
// el Worker avisa al grupo de los que fallan dos semanas seguidas (worker/src/enlaces.js).
// Lo lanza .github/workflows/enlaces.yml cada lunes.
//
//   node avisos/enlaces.mjs         comprueba y lo manda
//   node avisos/enlaces.mjs --dry   solo enseña lo que falla, sin mandarlo
//
// Qué se mira, de las fichas visibles y sin caducar:
// - Las direcciones de los campos (webs, Drive, la sede…) y las de dentro del texto.
// - Los vídeos de YouTube, por su oEmbed: la página de un vídeo borrado da 200 igual.
// - Los archivos propios (/media/documentos/…, /media/imagenes/…): que estén en el repo.
//
// Lo que no se puede comprobar se salta: Facebook contesta 400 a cualquier robot,
// Instagram 200 a todo (la pantalla de entrar) y Wikiloc tiene la protección de
// Cloudflare. Tampoco las webs que piden el «Just a moment…» de Cloudflare.
//
// Las redirecciones se siguen a mano y guardando las cookies: la sede electrónica entra
// en bucle sin ellas. Si el Worker no acepta el envío, la Action falla, y de eso ya
// avisa el Worker (publicaciones.js).

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENIDO = "web-static/content";
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const DRY = process.argv.includes("--dry");

// Sin enlaces que mirar
const FUERA = new Set(["categorias"]);
const NO_COMPROBABLES = [/(^|\.)facebook\.com$/, /(^|\.)fb\.(com|me)$/, /(^|\.)instagram\.com$/, /(^|\.)wikiloc\.com$/, /^loc\.wiki$/];
const NAVEGADOR = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ESPERA = 20_000;
const MAX_SALTOS = 10;
const A_LA_VEZ = 6;

const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

// ── Los enlaces de cada ficha ───────────────────────────────────────────────

// Lo que va en el texto: direcciones sueltas o de Markdown, sin la puntuación de detrás
const EN_TEXTO = /https?:\/\/[^\s)<>"\]]+|(?<=\]\()\/media\/[^\s)"]+/g;

const direccionesDe = (valor, encontradas = new Set()) => {
  if (typeof valor === "string") {
    if (/^(https?:\/\/|\/media\/)\S+$/.test(valor.trim())) encontradas.add(valor.trim());
    else for (const m of valor.match(EN_TEXTO) ?? []) encontradas.add(m.replace(/[.,;:!?]+$/, ""));
  } else if (Array.isArray(valor)) valor.forEach((v) => direccionesDe(v, encontradas));
  else if (valor && typeof valor === "object") Object.values(valor).forEach((v) => direccionesDe(v, encontradas));
  return encontradas;
};

const visible = (f) =>
  f.activo !== false && f.activa !== false && !(typeof f.fecha_caducidad === "string" && f.fecha_caducidad && f.fecha_caducidad.slice(0, 10) < hoy);

// Map de dirección → [{ coleccion, ruta, titulo }]
const leerEnlaces = async () => {
  const enlaces = new Map();
  for (const coleccion of await readdir(join(RAIZ, CONTENIDO))) {
    if (FUERA.has(coleccion)) continue;
    for (const fichero of await readdir(join(RAIZ, CONTENIDO, coleccion))) {
      if (!fichero.endsWith(".json")) continue;
      const ruta = `${CONTENIDO}/${coleccion}/${fichero}`;
      const ficha = JSON.parse(await readFile(join(RAIZ, ruta), "utf8"));
      if (!visible(ficha)) continue;
      const titulo = String(ficha.titulo ?? ficha.nombre ?? fichero.replace(/\.json$/, "")).trim();
      for (const url of direccionesDe(ficha)) {
        if (!enlaces.has(url)) enlaces.set(url, []);
        enlaces.get(url).push({ coleccion, ruta, titulo });
      }
    }
  }
  return enlaces;
};

// ── Comprobar ───────────────────────────────────────────────────────────────

// Los archivos que hay en el repo (git, para no necesitar las imágenes bajadas)
const archivos = new Set(
  execFileSync("git", ["ls-files", "web-static/public/media"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .map((r) => r.replace(/^web-static\/public/, "")),
);

const idYoutube = (url) => {
  const { hostname, pathname, searchParams } = url;
  if (hostname === "youtu.be") return pathname.slice(1).split("/")[0];
  if (/(^|\.)youtube\.com$/.test(hostname)) {
    if (pathname === "/watch") return searchParams.get("v");
    const m = pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
    if (m) return m[2];
  }
  return null;
};

// GET siguiendo las redirecciones a mano, con las cookies que vaya poniendo cada web
const pedir = async (url) => {
  const cookies = new Map();
  let actual = url;
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const host = new URL(actual).host;
    const respuesta = await fetch(actual, {
      redirect: "manual",
      headers: {
        "user-agent": NAVEGADOR,
        "accept-language": "es-ES,es;q=0.9",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        ...(cookies.get(host) ? { cookie: [...cookies.get(host)].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
      signal: AbortSignal.timeout(ESPERA),
    });
    for (const c of respuesta.headers.getSetCookie()) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i < 1) continue;
      if (!cookies.has(host)) cookies.set(host, new Map());
      cookies.get(host).set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
    const destino = respuesta.headers.get("location");
    if (respuesta.status >= 300 && respuesta.status < 400 && destino) {
      await respuesta.body?.cancel();
      actual = new URL(destino, actual).href;
      continue;
    }
    return respuesta;
  }
  return null;
};

const MOTIVOS_RED = {
  ENOTFOUND: "la dirección ya no existe (el dominio no responde)",
  EAI_AGAIN: "el dominio no responde",
  ECONNREFUSED: "la web rechaza la conexión",
  ECONNRESET: "la web corta la conexión",
  UND_ERR_CONNECT_TIMEOUT: "la web no responde",
  CERT_HAS_EXPIRED: "el certificado de la web ha caducado",
  ERR_TLS_CERT_ALTNAME_INVALID: "el certificado no es de esa web",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "el certificado de la web no es válido",
};

// null si funciona o no se puede saber; si no, el motivo
const comprobar = async (direccion) => {
  if (direccion.startsWith("/media/")) {
    return archivos.has(decodeURI(direccion.split(/[?#]/)[0])) ? null : "el archivo no está en la web";
  }
  const url = new URL(direccion);
  if (NO_COMPROBABLES.some((r) => r.test(url.hostname))) return "saltar";
  try {
    const video = idYoutube(url);
    if (video) {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video}`)}`, {
        signal: AbortSignal.timeout(ESPERA),
      });
      await r.body?.cancel();
      // 401: existe pero no deja incrustarlo, que aquí da igual
      return r.ok || r.status === 401 ? null : "el vídeo ya no está o es privado";
    }
    const r = await pedir(direccion);
    if (!r) return "demasiadas redirecciones";
    const cuerpo = r.ok ? "" : (await r.text()).slice(0, 5000);
    if (r.ok) await r.body?.cancel();
    if (r.ok) return null;
    // La comprobación de Cloudflare: la web está, pero no deja pasar a robots
    if (r.headers.get("cf-mitigated") === "challenge" || /<title>Just a moment/i.test(cuerpo)) return "saltar";
    if (r.status === 404) return "la página ya no existe (404)";
    if (r.status === 410) return "la página se ha borrado (410)";
    if (r.status >= 500) return `la web da error (${r.status})`;
    return `la web no deja entrar (${r.status})`;
  } catch (e) {
    if (e.name === "TimeoutError") return `no responde en ${ESPERA / 1000} s`;
    const codigo = e.cause?.code ?? e.code;
    return MOTIVOS_RED[codigo] ?? `no se puede abrir (${codigo ?? e.message})`;
  }
};

// ── Todo ────────────────────────────────────────────────────────────────────

const enlaces = await leerEnlaces();
const pendientes = [...enlaces.keys()];
const fallan = [];
let saltados = 0;

await Promise.all(
  Array.from({ length: A_LA_VEZ }, async () => {
    while (pendientes.length) {
      const url = pendientes.shift();
      const motivo = await comprobar(url);
      if (motivo === "saltar") saltados++;
      else if (motivo) fallan.push({ url, motivo, fichas: enlaces.get(url) });
    }
  }),
);
fallan.sort((a, b) => a.url.localeCompare(b.url));

console.log(`${enlaces.size} enlaces: ${enlaces.size - saltados - fallan.length} bien, ${fallan.length} fallan, ${saltados} sin poder comprobar.`);
for (const { url, motivo, fichas } of fallan) console.log(`✗ ${url}\n  ${motivo} · ${fichas.map((f) => f.ruta).join(", ")}`);

if (!DRY) {
  const token =
    process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  const r = await fetch(`${WORKER}/enlaces`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify({ fallan }),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
}
