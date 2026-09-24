// Genera, después de compilar, una página HTML por ficha con su vista previa para
// compartir: título, un resumen y una foto.
//
// WhatsApp, Telegram o Facebook no ejecutan JavaScript: leen el HTML tal cual llega y
// buscan las etiquetas og:*. Como la web es una sola página (index.html) que pinta
// todo con JavaScript, sin esto cualquier enlace se vería igual. Aquí se hace una copia
// de dist/index.html por ficha con las etiquetas de esa ficha; la web arranca igual que
// siempre, porque el resto del HTML es el mismo.
//
// De paso, esas direcciones dejan de servirse desde 404.html, que responde con un
// código 404 aunque el navegador pinte la página, y algunas aplicaciones no hacen la
// vista previa de una página que da error.
//
//   dist/noticias/<id>.html              → GitHub Pages lo sirve en /noticias/<id>
//   dist/noticias/index.html             → /noticias (redirige a /noticias/)
//   dist/og/<resumen>.jpg                → la foto de la vista previa, 1200 × 630
//
// La foto se hace aquí y no se usan las miniaturas webp porque no todas las
// aplicaciones entienden webp, y porque el tamaño que esperan es ese.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const PUBLIC_DIR = join(ROOT, "public");

// Las etiquetas og:image y og:url tienen que ser direcciones completas
const BASE = process.env.BASE_PATH ?? "/";
const SITIO = `${(process.env.SITIO_URL ?? "https://venialboconecta.es").replace(/\/$/, "")}${BASE}`;

const ANCHO = 1200;
const ALTO = 630;
const CREMA = "#faf6ef";

// Lo que se cambia en cada página va entre estas dos marcas de index.html
const MARCA_INICIO = "<!-- compartir -->";
const MARCA_FIN = "<!-- /compartir -->";

// ── Textos ──────────────────────────────────────────────────────────────────

// El resumen sale del Markdown del CMS: fuera imágenes, enlaces y símbolos de formato
const aTextoPlano = (md) =>
  String(md ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[#*_>`|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Unos 160 caracteres, que es lo que enseñan sin cortar, y sin partir una palabra
const recortar = (texto, max = 160) => {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  return `${corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:.]$/, "")}…`;
};

const escapar = (texto) =>
  String(texto)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ── Fotos ───────────────────────────────────────────────────────────────────

const hechas = new Map();

const fotoAjustada = async (origen) => {
  const { width = 1, height = 1 } = await sharp(origen).metadata();
  const llena = sharp(origen).resize(ANCHO, ALTO, { fit: "cover" }).flatten({ background: CREMA });
  // Una apaisada (de 1,3 : 1 en adelante) pierde solo un poco por arriba y por abajo al
  // llenar el recuadro, que es 1,9 : 1
  if (width / height >= 1.3) return llena;
  const fondo = await llena.blur(30).modulate({ brightness: 0.8 }).toBuffer();
  const entera = await sharp(origen)
    .resize(ANCHO, ALTO, { fit: "inside" })
    .flatten({ background: CREMA })
    .toBuffer();
  return sharp(fondo).composite([{ input: entera, gravity: "center" }]);
};

// "foto": si es apaisada, se recorta para llenar el recuadro; si es vertical (un cartel,
// que en Noticias son muchos), recortarla se come el título o la fecha, así que va
// entera sobre un fondo hecho con ella misma desenfocada. "logo": entero y centrado
// sobre crema, con margen, que un logo recortado no se reconoce.
const fotoOg = async (ruta, modo = "foto") => {
  const clave = `${ruta}|${modo}`;
  if (hechas.has(clave)) return hechas.get(clave);

  const nombre = createHash("sha1").update(clave).digest("hex").slice(0, 12);
  const destino = join(DIST, "og", `${nombre}.jpg`);
  const origen = join(PUBLIC_DIR, ruta.replace(/^\//, ""));
  await mkdir(dirname(destino), { recursive: true });

  let url;
  try {
    const imagen =
      modo === "logo"
        ? sharp({ create: { width: ANCHO, height: ALTO, channels: 3, background: CREMA } }).composite([
            {
              input: await sharp(origen)
                .resize(ANCHO - 160, ALTO - 110, { fit: "inside" })
                .toBuffer(),
              gravity: "center",
            },
          ])
        : await fotoAjustada(origen);
    await imagen.jpeg({ quality: 80, mozjpeg: true }).toFile(destino);
    url = `${SITIO}og/${nombre}.jpg`;
  } catch (error) {
    // Una foto que no está o no se puede leer no debe tumbar la publicación: se usa el logo
    console.warn(`  ⚠ no se pudo preparar ${ruta} para compartir: ${error.message}`);
    url = ruta === LOGO ? null : await fotoOg(LOGO, "logo");
  }
  hechas.set(clave, url);
  return url;
};

const LOGO = "/venialbo-conecta.webp";

// ── Las páginas ─────────────────────────────────────────────────────────────

const plantilla = await readFile(join(DIST, "index.html"), "utf8");
if (!plantilla.includes(MARCA_INICIO) || !plantilla.includes(MARCA_FIN)) {
  throw new Error(`index.html no tiene las marcas ${MARCA_INICIO} … ${MARCA_FIN}`);
}

const pagina = ({ ruta, titulo, descripcion, imagen, tipo = "website" }) => {
  const url = `${SITIO}${ruta}`;
  const etiquetas = [
    `<title>${escapar(titulo)}</title>`,
    `<meta name="description" content="${escapar(descripcion)}" />`,
    `<meta property="og:site_name" content="VenialboConecta" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:type" content="${tipo}" />`,
    `<meta property="og:title" content="${escapar(titulo)}" />`,
    `<meta property="og:description" content="${escapar(descripcion)}" />`,
    `<meta property="og:url" content="${escapar(url)}" />`,
    imagen && `<meta property="og:image" content="${escapar(imagen)}" />`,
    imagen && `<meta property="og:image:width" content="${ANCHO}" />`,
    imagen && `<meta property="og:image:height" content="${ALTO}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].filter(Boolean);
  const inicio = plantilla.indexOf(MARCA_INICIO) + MARCA_INICIO.length;
  const fin = plantilla.indexOf(MARCA_FIN);
  return `${plantilla.slice(0, inicio)}\n    ${etiquetas.join("\n    ")}\n    ${plantilla.slice(fin)}`;
};

const escribir = async (fichero, html) => {
  const destino = join(DIST, fichero);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, html);
};

const leerJson = async (ruta) => JSON.parse(await readFile(join(DIST, "data", ruta), "utf8"));

// Pages CMS guarda la fecha sin hora: el anuncio vale hasta el final de ese día
const caducado = (fecha) =>
  typeof fecha === "string" && fecha !== "" &&
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T23:59:59` : fecha).getTime() <= Date.now();

const primeraFoto = (f) => f.imagen_url || f.galeria?.find((g) => g?.imagen)?.imagen || null;

// Las secciones: título, descripción y, si la tienen, su propia imagen
const SECCIONES = [
  { ruta: "", titulo: "VenialboConecta", descripcion: "Todo Venialbo en un sitio: lo que pasa y lo que se ha hecho, qué ver y por dónde pasear, sus negocios y servicios, y un tablón para los vecinos." },
  { ruta: "noticias", titulo: "Noticias", descripcion: "Lo último que pasa en Venialbo." },
  { ruta: "actividades", titulo: "Actividades", descripcion: "Lo que se ha hecho en Venialbo: cursos, talleres, excursiones, fiestas…, contado y con fotos." },
  { ruta: "descubre", titulo: "Descubre Venialbo", descripcion: "Qué ver en Venialbo y rutas para recorrerlo." },
  { ruta: "negocios", titulo: "Negocios", descripcion: "El directorio del comercio local de Venialbo." },
  { ruta: "servicios", titulo: "Servicios e instituciones", descripcion: "Médico, comedor, bibliobús, asociaciones e instituciones de Venialbo." },
  { ruta: "tablon", titulo: "Tablón", descripcion: "Anuncios entre vecinos de Venialbo." },
  { ruta: "pueblos-conectados", titulo: "Pueblos Conectados", descripcion: "Un proyecto colaborativo entre Venialbo (Zamora) y Aldearrubia (Salamanca).", imagen: "/pueblos-conectados.webp" },
  { ruta: "privacidad", titulo: "Privacidad", descripcion: "Qué pasa con tus datos en VenialboConecta." },
];
const descripcionDe = Object.fromEntries(SECCIONES.map((s) => [s.ruta, s.descripcion]));

// Las fichas. `ruta` es la sección en la web; `recurso`, el nombre en data/.
const FICHAS = [
  { recurso: "noticias", ruta: "noticias", titulo: (f) => f.titulo, texto: (f) => f.contenido, foto: (f) => f.imagen_url },
  { recurso: "actividades", ruta: "actividades", titulo: (f) => f.titulo, texto: (f) => f.resumen || f.contenido, foto: primeraFoto },
  { recurso: "negocios", ruta: "negocios", titulo: (f) => f.nombre, texto: (f) => f.descripcion || f.categoria_negocio, foto: (f) => f.logo_url, modo: "logo" },
  { recurso: "servicios", ruta: "servicios", titulo: (f) => f.nombre, texto: (f) => f.descripcion, foto: (f) => f.logo_url, modo: "logo" },
  { recurso: "anuncios", ruta: "tablon", titulo: (f) => f.titulo, texto: (f) => f.descripcion, foto: (f) => f.imagen_url, fuera: (f) => caducado(f.fecha_caducidad) },
  { recurso: "lugares", ruta: "descubre/lugares", titulo: (f) => f.nombre, texto: (f) => f.resumen || f.contenido, foto: primeraFoto },
  { recurso: "rutas", ruta: "descubre/rutas", titulo: (f) => f.nombre, texto: (f) => f.resumen || f.contenido, foto: primeraFoto },
];

const logo = await fotoOg(LOGO, "logo");

for (const s of SECCIONES) {
  const html = pagina({
    ruta: s.ruta ? `${s.ruta}/` : "",
    titulo: s.ruta ? `${s.titulo} · VenialboConecta` : s.titulo,
    descripcion: s.descripcion,
    imagen: s.imagen ? await fotoOg(s.imagen, "logo") : logo,
  });
  // La portada es el propio index.html; el build lo copia después a 404.html
  await escribir(s.ruta ? `${s.ruta}/index.html` : "index.html", html);
}

let total = 0;
for (const f of FICHAS) {
  const listado = await leerJson(`${f.recurso}.json`).catch(() => []);
  for (const { id } of listado) {
    const ficha = await leerJson(`${f.recurso}/${id}.json`);
    if (f.fuera?.(ficha)) continue;
    const foto = f.foto(ficha);
    const texto = recortar(aTextoPlano(f.texto(ficha))) || descripcionDe[f.ruta.split("/")[0]];
    await escribir(
      `${f.ruta}/${id}.html`,
      pagina({
        ruta: `${f.ruta}/${id}`,
        titulo: `${f.titulo(ficha)} · VenialboConecta`,
        descripcion: texto,
        imagen: foto ? await fotoOg(foto, f.modo) : logo,
        tipo: "article",
      }),
    );
    total++;
  }
}
console.log(`páginas para compartir: ${SECCIONES.length} secciones y ${total} fichas, ${hechas.size} fotos`);
