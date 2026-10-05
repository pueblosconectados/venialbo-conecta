// Baja la foto de perfil de los enlaces de interés que son redes sociales, para que la
// tarjeta lleve la cara del canal o la página y no solo el icono de la red.
//
//   content/enlaces/avae-venialbo.json  (url: youtube.com/@avaevenialbo)
//     → public/avatares/avae-venialbo.webp  (112×112)
//
// La imagen sale de la vista previa del enlace (og:image), la misma que pinta WhatsApp
// al pegarlo. Facebook e Instagram solo se la dan a quien se presenta como el robot de
// las vistas previas de Facebook, así que es el User-Agent que se usa.
//
// Se baja aquí, al compilar, y la web la sirve desde su propio dominio: el que visita la
// página no le pide nada a Facebook ni a Google. Además, las direcciones de Facebook
// van firmadas y caducan a los pocos días, así que enlazarlas directamente no valdría.
//
// Los avatares NO se commitean (están en .gitignore). Para no preguntar en cada build,
// uno que tiene menos de DIAS_VALIDO días no se vuelve a bajar. Si la red no contesta
// (sin conexión, o porque bloquea a GitHub), se queda el que hubiera y si no hay
// ninguno la tarjeta enseña el icono: nunca para el build.
//
// Si en el CMS se sube una «Imagen» a mano, manda esa y aquí no se baja nada.
//
//   npm run avatares
//
// Se ejecuta solo, antes de generar el contenido (ver "dev" y "build" en package.json).

import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENLACES_DIR = join(ROOT, "content", "enlaces");
const AVATARES_DIR = join(ROOT, "public", "avatares");

// Se pinta a 56 px: 112 para pantallas densas
const LADO = 112;
const DIAS_VALIDO = 7;
const ESPERA_MS = 15000;
const USER_AGENT = "facebookexternalhit/1.1";

// Las webs normales también tienen og:image, pero suele ser un banner o una foto
// apaisada, no una cara: solo se busca en las redes.
const REDES = /(^|\.)(facebook\.com|instagram\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com)$/;

const decodificar = (texto) =>
  texto.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x2F;/gi, "/").replace(/&#39;/g, "'");

const pedir = async (url) => {
  const respuesta = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
    redirect: "follow",
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return respuesta;
};

const imagenDePortada = async (url) => {
  const html = await (await pedir(url)).text();
  // El orden de los atributos cambia de una red a otra
  const meta =
    html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) ??
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/);
  if (!meta) throw new Error("la página no trae imagen de vista previa");
  return decodificar(meta[1]);
};

const reciente = async (fichero) => {
  const info = await stat(fichero).catch(() => null);
  return info && Date.now() - info.mtimeMs < DIAS_VALIDO * 24 * 3600 * 1000;
};

const main = async () => {
  await mkdir(AVATARES_DIR, { recursive: true });

  const ficheros = (await readdir(ENLACES_DIR).catch(() => [])).filter((f) => f.endsWith(".json"));
  const quedan = new Set();
  let bajados = 0;
  let guardados = 0;

  for (const f of ficheros) {
    const id = basename(f, ".json");
    const enlace = JSON.parse(await readFile(join(ENLACES_DIR, f), "utf8"));
    if (enlace.activo === false || enlace.imagen) continue;

    let servidor;
    try {
      servidor = new URL(/^https?:\/\//i.test(enlace.url) ? enlace.url : `https://${enlace.url}`).hostname;
    } catch {
      continue; // build-content.mjs ya avisa de la dirección mala
    }
    if (!REDES.test(servidor)) continue;

    const destino = join(AVATARES_DIR, `${id}.webp`);
    quedan.add(`${id}.webp`);
    if (await reciente(destino)) {
      guardados++;
      continue;
    }

    try {
      const imagen = await imagenDePortada(enlace.url);
      const datos = Buffer.from(await (await pedir(imagen)).arrayBuffer());
      await writeFile(destino, await sharp(datos).resize(LADO, LADO, { fit: "cover" }).webp({ quality: 85 }).toBuffer());
      bajados++;
    } catch (error) {
      const hay = await stat(destino).catch(() => null);
      console.warn(`avatar de ${id}: ${error.message}${hay ? " (se queda el anterior)" : " (saldrá el icono)"}`);
    }
  }

  // Los de enlaces borrados, ocultos o que ya llevan imagen propia
  for (const f of await readdir(AVATARES_DIR)) {
    if (!quedan.has(f)) await unlink(join(AVATARES_DIR, f));
  }

  console.log(`avatares: ${bajados} bajados, ${guardados} ya estaban`);
};

main().catch((error) => {
  // Un avatar es adorno: si algo falla de verdad, se avisa y el build sigue
  console.warn(`avatares: ${error.message}`);
});
