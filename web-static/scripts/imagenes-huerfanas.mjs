// Busca archivos de public/media/ (imágenes y PDF) que ya no referencia nadie.
//
// Pages CMS sube los archivos al repo, pero al borrar una noticia (o al cambiarle
// la foto o el PDF adjunto) el fichero se queda ahí para siempre: sigue ocupando
// sitio y sigue publicándose en dist/. Este script los localiza.
//
//   npm run imagenes-huerfanas            → solo informa
//   npm run imagenes-huerfanas -- --borrar → informa y las borra
//
// Aviso: borrarlas del árbol no las quita del historial de Git, que no adelgaza.

import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Las dos carpetas de medios: imagenes/ y documentos/.
const MEDIA_DIR = join(ROOT, "public", "media");

// Dónde puede aparecer el nombre de un archivo. content/ es lo que edita el CMS;
// src/ e index.html cubren los que estén escritos a mano en el código.
const DONDE_SE_BUSCA = ["content", "src", "index.html"];

const BORRAR = process.argv.includes("--borrar");

const listar = async (ruta) => {
  const info = await stat(ruta).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [ruta];
  const entradas = await readdir(ruta, { withFileTypes: true });
  const anidadas = await Promise.all(
    entradas.map((e) => listar(join(ruta, e.name))),
  );
  return anidadas.flat();
};

// Solo texto: los binarios no referencian nada y leerlos sería tirar el tiempo
const ES_BINARIO = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|mp4|pdf)$/i;

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const archivos = (await listar(MEDIA_DIR)).filter((f) => extname(f) !== "");
if (archivos.length === 0) {
  console.log("No hay archivos en public/media/");
  process.exit(0);
}

const ficherosDeTexto = (
  await Promise.all(DONDE_SE_BUSCA.map((d) => listar(join(ROOT, d))))
)
  .flat()
  .filter((f) => !ES_BINARIO.test(f));

const textoDelProyecto = (
  await Promise.all(ficherosDeTexto.map((f) => readFile(f, "utf8").catch(() => "")))
).join("\n");

// Se busca por nombre de fichero, no por ruta completa: así valen igual las
// referencias de los JSON ("/media/imagenes/foto.jpg") y las de dentro del
// Markdown del contenido, que el CMS escribe con otra forma.
const huerfanas = [];
for (const ruta of archivos) {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  if (!textoDelProyecto.includes(nombre)) {
    huerfanas.push({ ruta, nombre, bytes: (await stat(ruta)).size });
  }
}

if (huerfanas.length === 0) {
  console.log(`✔ Ninguno huérfano: los ${archivos.length} archivos están en uso.`);
  process.exit(0);
}

huerfanas.sort((a, b) => b.bytes - a.bytes);
const total = huerfanas.reduce((suma, h) => suma + h.bytes, 0);

console.log(
  `${huerfanas.length} de ${archivos.length} archivos sin referenciar (${kb(total)}):\n`,
);
for (const h of huerfanas) {
  console.log(`  ${kb(h.bytes).padStart(8)}  ${relative(ROOT, h.ruta)}`);
}

if (!BORRAR) {
  console.log("\nPara borrarlas:  npm run imagenes-huerfanas -- --borrar");
  process.exit(0);
}

await Promise.all(huerfanas.map((h) => unlink(h.ruta)));
console.log(`\n✔ Borrados ${huerfanas.length} archivos (${kb(total)} liberados).`);
