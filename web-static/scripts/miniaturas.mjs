// Genera versiones pequeñas de cada imagen para que el navegador no se baje una foto
// de 1600 px cuando la va a pintar en una tarjeta de 180.
//
//   public/media/imagenes/foto.jpg
//     → public/media/imagenes/derivadas/foto-400.webp
//       public/media/imagenes/derivadas/foto-800.webp
//       public/media/imagenes/derivadas/foto-1200.webp
//
// Las derivadas NO se commitean (están en .gitignore): se rehacen en cada build, que
// es rápido porque solo toca lo que ha cambiado. El original se queda donde está y
// sigue siendo lo que referencian los JSON del contenido y lo que se ve al ampliar.
//
//   npm run miniaturas
//
// Se ejecuta solo, antes de compilar (ver el script "build" de package.json).

import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_DIR = join(ROOT, "public", "media", "imagenes");
const DERIVADAS_DIR = join(MEDIA_DIR, "derivadas");

// 400 para las tarjetas de los listados, 800 para pantallas densas, 1200 para la
// imagen grande de una ficha. Por encima de eso ya está el original.
const ANCHOS = [400, 800, 1200];
const CALIDAD = 78;

// Formatos de los que sale una foto. Los SVG son texto y no se tocan.
const ORIGENES = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const main = async () => {
  await mkdir(DERIVADAS_DIR, { recursive: true });

  const entradas = await readdir(MEDIA_DIR, { withFileTypes: true }).catch(() => []);
  const originales = entradas
    .filter((e) => e.isFile() && ORIGENES.has(extname(e.name).toLowerCase()))
    .map((e) => e.name);

  let hechas = 0;
  let saltadas = 0;
  let bytesOriginal = 0;
  let bytesDerivadas = 0;
  const vigentes = new Set();

  for (const nombre of originales) {
    const origen = join(MEDIA_DIR, nombre);
    const info = await stat(origen);
    bytesOriginal += info.size;
    const base = basename(nombre, extname(nombre));

    for (const ancho of ANCHOS) {
      const salida = join(DERIVADAS_DIR, `${base}-${ancho}.webp`);
      vigentes.add(`${base}-${ancho}.webp`);

      // Si ya está hecha y es más nueva que el original, no se rehace
      const hecha = await stat(salida).catch(() => null);
      if (hecha && hecha.mtimeMs >= info.mtimeMs) {
        bytesDerivadas += hecha.size;
        saltadas += 1;
        continue;
      }

      // withoutEnlargement: una imagen de 600 px no se estira a 1200. El fichero se
      // escribe igual, solo que más pequeño de lo que dice su nombre; el navegador
      // elegirá otro y como mucho se baja unos kilobytes de más. A cambio, el
      // componente no necesita saber qué anchos existen para cada imagen.
      await sharp(origen)
        .rotate()
        .resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: CALIDAD })
        .toFile(salida);

      bytesDerivadas += (await stat(salida)).size;
      hechas += 1;
    }
  }

  // Limpiar las derivadas de imágenes que ya no existen
  let borradas = 0;
  for (const f of await readdir(DERIVADAS_DIR).catch(() => [])) {
    if (!vigentes.has(f)) {
      await unlink(join(DERIVADAS_DIR, f));
      borradas += 1;
    }
  }

  console.log(
    `miniaturas: ${hechas} nuevas, ${saltadas} ya estaban` +
      (borradas ? `, ${borradas} huérfanas borradas` : ""),
  );
  console.log(
    `  ${originales.length} originales ${kb(bytesOriginal)} → derivadas ${kb(bytesDerivadas)}`,
  );
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
