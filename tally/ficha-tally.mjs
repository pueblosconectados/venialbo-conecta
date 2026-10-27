// Lo que se hace desde los botones de Telegram con lo que llega por Tally: subir las fotos
// a la ficha, publicarla o descartarla. Lo lanza .github/workflows/ficha-tally.yml, que
// lanza el Worker al pulsar el botón (avisos/worker/src/comandos.js).
//
//   node tally/ficha-tally.mjs fotos     <formulario> <respuesta>
//   node tally/ficha-tally.mjs publicar  <formulario> <respuesta>
//   node tally/ficha-tally.mjs descartar <formulario> <respuesta>
//   node tally/ficha-tally.mjs --avisar  manda al Worker el resultado (resultado.json)
//
// <formulario> es negocios, tablon o casas; <respuesta>, el id de la respuesta en Tally.
//
// Si la respuesta aún no está en el CMS (se ha pulsado antes de que llegara), se trae
// primero con su importador. La ficha se busca en tally/fichas-importadas.json.
//
// LAS FOTOS SOLO ENTRAN AQUÍ, y solo porque alguien las ha visto en el grupo y ha pulsado
// «Subir»: lo que entra en git se queda en el historial para siempre. Se piden a la API
// de Tally en el momento (las direcciones van firmadas: no se imprimen ni se pasan por
// los inputs del workflow, que se ven en la página pública de la ejecución), se giran
// según su EXIF, se reducen a 1600 px y se guardan en JPG sin metadatos.
//
// De Tally no se borra nunca nada: «descartar» quita la ficha del CMS, y la respuesta se
// queda en Tally con sus fotos.

import { execFileSync } from "node:child_process";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { RAIZ, idDelFormulario, leerClave, leerFichas, leerImportadas, pedirJson } from "./comun.mjs";

// sharp está en las dependencias de la web; no se instala dos veces
const sharp = createRequire(join(RAIZ, "web-static", "package.json"))("sharp");

const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const RESULTADO = join(RAIZ, "resultado.json");
const IMAGENES = "web-static/public/media/imagenes";
const ANCHO_MAXIMO = 1600;
const CALIDAD = 82;

// Por formulario: su slug en formularios-creados.json, su importador, la clave en
// respuestas-importadas.json y cómo se pone la foto en la ficha
const FORMULARIOS = {
  negocios: { slug: "alta-negocio", importador: "importar-negocios.mjs", pregunta: "logo", foto: "logo_url", galeria: false },
  tablon: { slug: "tablon", importador: "importar-tablon.mjs", pregunta: "foto", foto: "imagen_url", galeria: true },
  casas: { slug: "casas", importador: "importar-casas.mjs", pregunta: "foto", foto: "imagen_url", galeria: true },
};
const ACCIONES = new Set(["fotos", "publicar", "descartar"]);

const leerJson = async (ruta) => JSON.parse(await readFile(join(RAIZ, ruta), "utf8"));
const escribirJson = (ruta, datos) => writeFile(join(RAIZ, ruta), `${JSON.stringify(datos, null, 2)}\n`, "utf8");
const existe = (ruta) => readFile(join(RAIZ, ruta)).then(() => true, () => false);

// La ruta de la ficha de esa respuesta; si no está traída, la trae
const fichaDe = async (formulario, respuesta) => {
  const { importador } = FORMULARIOS[formulario];
  const importadas = await leerImportadas();
  if (!(importadas[formulario] ?? []).includes(respuesta)) {
    console.log("La respuesta aún no estaba en el CMS: se trae primero.");
    execFileSync("node", [join(RAIZ, "tally", importador), respuesta], { stdio: "inherit" });
  }
  return (await leerFichas())[formulario]?.[respuesta] ?? null;
};

// Las fotos de la respuesta, pedidas a Tally ahora: [{ url, mimeType }]
const fotosDe = async (formulario, respuesta) => {
  const { slug, pregunta } = FORMULARIOS[formulario];
  const clave = await leerClave();
  const formId = await idDelFormulario(slug);
  const definicion = await leerJson(`tally/formularios/${slug}.json`);
  const etiqueta = definicion.campos.find((c) => c.clave === pregunta)?.etiqueta;
  for (let pagina = 1; ; pagina++) {
    const datos = await pedirJson(clave, `/forms/${formId}/submissions?page=${pagina}&limit=100`);
    const envio = datos.submissions.find((s) => s.id === respuesta);
    if (envio) {
      const idPregunta = datos.questions.find((q) => q.title === etiqueta)?.id;
      const archivos = envio.responses.find((r) => r.questionId === idPregunta)?.answer;
      return (Array.isArray(archivos) ? archivos : []).filter((a) => a?.url && String(a.mimeType).startsWith("image/"));
    }
    if (!datos.hasMore) throw new Error("No encuentro esa respuesta en Tally");
  }
};

const subirFotos = async (formulario, respuesta, ruta, ficha) => {
  const { foto, galeria } = FORMULARIOS[formulario];
  const base = basename(ruta, ".json");
  const fotos = await fotosDe(formulario, respuesta);
  if (!fotos.length) return { estado: "nada", mensaje: "La respuesta no trae fotos." };

  // Los negocios tienen una sola foto
  const elegidas = galeria ? fotos : fotos.slice(0, 1);
  const nuevas = [];
  for (const [i, archivo] of elegidas.entries()) {
    const nombre = `${base}-tally-${i + 1}.jpg`;
    const destino = `${IMAGENES}/${nombre}`;
    if (!(await existe(destino))) {
      const respuestaFoto = await fetch(archivo.url);
      if (!respuestaFoto.ok) throw new Error(`Tally no da la foto ${i + 1}: HTTP ${respuestaFoto.status}`);
      // .rotate() endereza según el EXIF; al reencodar sin withMetadata se van todos los
      // metadatos, también el GPS
      await sharp(Buffer.from(await respuestaFoto.arrayBuffer()))
        .rotate()
        .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: CALIDAD, mozjpeg: true })
        .toFile(join(RAIZ, destino));
    }
    nuevas.push(`/media/imagenes/${nombre}`);
  }

  // A la ficha, sin repetir: la primera de foto principal si no tiene, el resto a la
  // galería (en los negocios, solo la principal)
  const yaEstan = new Set([ficha[foto], ...(ficha.galeria ?? []).map((g) => g.imagen)]);
  const faltan = nuevas.filter((n) => !yaEstan.has(n));
  if (!faltan.length) return { estado: "ya", mensaje: "Las fotos ya estaban en la ficha." };
  if (!ficha[foto]) ficha[foto] = faltan.shift();
  if (galeria && faltan.length) ficha.galeria = [...(ficha.galeria ?? []), ...faltan.map((imagen) => ({ imagen }))];
  else if (faltan.length) console.log(`(La ficha ya tenía foto: ${faltan.length} se quedan en la carpeta sin usar.)`);
  await escribirJson(ruta, ficha);
  return { estado: "hecho", fotos: elegidas.length, mensaje: `${elegidas.length === 1 ? "Subida 1 foto" : `Subidas ${elegidas.length} fotos`}.` };
};

const publicar = async (ruta, ficha) => {
  if (ficha.activo === true) return { estado: "ya", mensaje: "Ya estaba publicada." };
  ficha.activo = true;
  await escribirJson(ruta, ficha);
  return { estado: "hecho", mensaje: "Publicada." };
};

// Quita la ficha y las fotos que se le subieron desde aquí (las que se llaman
// <ficha>-tally-N.jpg). Las que se subieran desde el CMS se quedan: las encuentra
// «Buscar imágenes sin usar».
const descartar = async (ruta) => {
  const base = basename(ruta, ".json");
  const fotos = (await readdir(join(RAIZ, IMAGENES)))
    .filter((f) => f.startsWith(`${base}-tally-`))
    .map((f) => `${IMAGENES}/${f}`);
  for (const f of [ruta, ...fotos]) await unlink(join(RAIZ, f));
  return { estado: "hecho", mensaje: "Quitada del CMS. La respuesta sigue en Tally." };
};

const hacer = async (accion, formulario, respuesta) => {
  if (!ACCIONES.has(accion) || !FORMULARIOS[formulario] || !/^[A-Za-z0-9]{3,20}$/.test(respuesta ?? ""))
    throw new Error("Uso: node tally/ficha-tally.mjs fotos|publicar|descartar negocios|tablon|casas <respuesta>");

  const ruta = await fichaDe(formulario, respuesta);
  const base = { accion, formulario, respuesta, ruta };
  if (!ruta) return { ...base, estado: "error", mensaje: "No sé qué ficha salió de esa respuesta: puede que se trajera antes del 27 de octubre de 2026. Hazlo desde el CMS." };
  if (!(await existe(ruta))) return { ...base, estado: "ya", mensaje: "La ficha ya no está en el CMS: se descartó o se borró." };

  const ficha = await leerJson(ruta);
  const titulo = String(ficha.titulo ?? ficha.nombre ?? basename(ruta, ".json")).trim();
  const resultado =
    accion === "fotos" ? await subirFotos(formulario, respuesta, ruta, ficha) : accion === "publicar" ? await publicar(ruta, ficha) : await descartar(ruta);
  return { ...base, titulo, activo: accion === "descartar" ? false : ficha.activo === true, ...resultado };
};

if (process.argv[2] === "--avisar") {
  // Después del push: que el grupo sepa que ya está
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8"));
  const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  const r = await fetch(`${WORKER}/fichas`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(resultado),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
} else {
  const [accion, formulario, respuesta] = process.argv.slice(2);
  const resultado = await hacer(accion, formulario, respuesta);
  await writeFile(RESULTADO, JSON.stringify(resultado), "utf8");
  // Sin nada personal: el registro es público
  console.log(`${accion} ${formulario} ${respuesta}: ${resultado.estado}. ${resultado.mensaje}`);
  if (resultado.ruta) console.log(`Ficha: ${resultado.ruta}`);
}
