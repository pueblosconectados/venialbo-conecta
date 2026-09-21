// Reduce las imágenes de public/media/imagenes/ que entran demasiado grandes.
//
// Pages CMS sube al repo el fichero tal cual sale de la cámara del móvil: 2500 px
// y 1,6 MB para pintarlo en un recuadro de 180 px. Eso engorda el repo para siempre
// (Git guarda cada versión) y obliga al vecino a descargárselo entero desde el 4G.
// Este script lo deja en un tamaño razonable conservando el nombre del fichero, que
// es lo que referencian los JSON del contenido.
//
//   npm run normaliza-imagenes              → solo informa
//   npm run normaliza-imagenes -- --escribir → reescribe las que sobran de tamaño
//
// Se ejecuta solo en cada despliegue (.github/workflows/web-static-pages.yml).

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_DIR = join(ROOT, "public", "media", "imagenes");

// 1600 px de ancho cubre una pantalla grande con pantalla retina; la web nunca
// pinta una imagen más ancha que eso.
const ANCHO_MAXIMO = 1600;
const CALIDAD = 82;

// Reescribir una imagen no es gratis: Git guarda el fichero nuevo entero y el viejo
// se queda en el historial. Por eso solo compensa cuando el ahorro es de verdad; si
// no, se engorda el repo para ganar cuatro kilobytes.
const AHORRO_MINIMO_BYTES = 50 * 1024;
const AHORRO_MINIMO_RATIO = 0.2;

// Formatos que sabemos reencodar sin cambiar la extensión. Los GIF pueden estar
// animados y los SVG son texto: fuera de aquí.
const FORMATOS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const ESCRIBIR = process.argv.includes("--escribir");

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const comprimir = (imagen, ext) =>
  ext === ".png"
    ? imagen.png({ compressionLevel: 9 })
    : ext === ".webp"
      ? imagen.webp({ quality: CALIDAD })
      : imagen.jpeg({ quality: CALIDAD, mozjpeg: true });

const ficheros = (await readdir(MEDIA_DIR, { withFileTypes: true }).catch(() => []))
  .filter((e) => e.isFile() && FORMATOS.has(extname(e.name).toLowerCase()))
  .map((e) => join(MEDIA_DIR, e.name));

if (ficheros.length === 0) {
  console.log("No hay imágenes que normalizar en public/media/imagenes/");
  process.exit(0);
}

const cambios = [];
for (const ruta of ficheros) {
  const ext = extname(ruta).toLowerCase();
  const original = await readFile(ruta);
  const meta = await sharp(original)
    .metadata()
    .catch(() => null);
  if (!meta?.width) {
    console.log(`  ⚠ no se pudo leer ${relative(ROOT, ruta)}, se deja como está`);
    continue;
  }

  // .rotate() aplica la orientación del EXIF antes de redimensionar. Sin esto las
  // fotos verticales de móvil saldrían tumbadas, porque al reencodar se pierde el
  // EXIF que le decía al navegador cómo girarlas. De paso se van los datos de GPS
  // que traen las fotos de móvil, que no pintan nada en una web pública.
  let imagen = sharp(original).rotate();
  if (meta.width > ANCHO_MAXIMO) {
    imagen = imagen.resize({ width: ANCHO_MAXIMO, withoutEnlargement: true });
  }
  const nuevo = await comprimir(imagen, ext).toBuffer();

  const ahorro = original.length - nuevo.length;
  if (ahorro < AHORRO_MINIMO_BYTES || ahorro / original.length < AHORRO_MINIMO_RATIO) {
    continue;
  }

  const nuevaMeta = await sharp(nuevo).metadata();
  cambios.push({
    ruta,
    antes: original.length,
    despues: nuevo.length,
    medidas: `${meta.width}×${meta.height} → ${nuevaMeta.width}×${nuevaMeta.height}`,
    buffer: nuevo,
  });
}

if (cambios.length === 0) {
  console.log(`✔ Las ${ficheros.length} imágenes ya están en un tamaño razonable.`);
  process.exit(0);
}

cambios.sort((a, b) => b.antes - b.despues - (a.antes - a.despues));
const antes = cambios.reduce((s, c) => s + c.antes, 0);
const despues = cambios.reduce((s, c) => s + c.despues, 0);

console.log(
  `${cambios.length} de ${ficheros.length} imágenes se pueden reducir ` +
    `(${kb(antes)} → ${kb(despues)}, se ahorran ${kb(antes - despues)}):\n`,
);
for (const c of cambios) {
  console.log(
    `  ${kb(c.antes).padStart(8)} → ${kb(c.despues).padEnd(8)}  ` +
      `${relative(ROOT, c.ruta)}  (${c.medidas})`,
  );
}

if (!ESCRIBIR) {
  console.log("\nPara aplicarlo:  npm run normaliza-imagenes -- --escribir");
  process.exit(0);
}

for (const c of cambios) await writeFile(c.ruta, c.buffer);
console.log(`\n✔ Reescritas ${cambios.length} imágenes (${kb(antes - despues)} menos).`);
