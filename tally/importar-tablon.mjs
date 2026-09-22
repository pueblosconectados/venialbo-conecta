// Convierte las respuestas del formulario del tablón en anuncios del CMS.
//
//   node tally/importar-tablon.mjs             → lista lo que hay sin importar
//   node tally/importar-tablon.mjs <id>        → escribe el borrador de esa respuesta
//   node tally/importar-tablon.mjs --todas     → escribe todas las que falten
//   node tally/importar-tablon.mjs <id> --forzar → reescribe aunque el anuncio ya exista
//
// Igual que el de negocios: el anuncio se escribe con "activo": false y no sale en la
// web hasta que alguien lo repase en el CMS. Y LA FOTO NO SE DESCARGA, que aquí importa
// más todavía: en el tablón la foto es lo normal, y un binario que manda un desconocido,
// una vez commiteado, se queda en el historial de git para siempre.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DISCRETO,
  RAIZ,
  existe,
  fechaHoraLocal,
  guardarImportadas,
  idDelFormulario,
  leerClave,
  leerImportadas,
  pedirJson,
  slugificar,
  sumarDias,
  uuidEstable,
} from "./comun.mjs";

const SLUG = "tablon";
const DIR_ANUNCIOS = join(RAIZ, "web-static", "content", "anuncios");
const FICHERO_DEFINICION = join(RAIZ, "tally", "formularios", `${SLUG}.json`);

// El vecino no pone fecha de caducidad y el CMS la exige, así que se le da un mes desde
// que lo manda. Se cambia aquí y basta: el anuncio caduca solo, y el que la quiera
// distinta la toca en el CMS antes de publicarlo.
const DIAS_QUE_DURA = 30;

const args = process.argv.slice(2);
const TODAS = args.includes("--todas");
const FORZAR = args.includes("--forzar");
const pedidas = args.filter((a) => !a.startsWith("--"));

// Del campo del formulario al campo de la ficha. "quien_lo_manda" no está a propósito:
// el aviso de privacidad dice que eso no se publica.
const A_FICHA = {
  titulo: "titulo",
  tipo: "tipo",
  descripcion: "descripcion",
  contacto: "contacto",
};

const ORDEN = [
  "titulo",
  "tipo",
  "descripcion",
  "contacto",
  "imagen_url",
  "fecha_publicacion",
  "fecha_caducidad",
  "activo",
];

const main = async () => {
  const clave = await leerClave();
  const formId = await idDelFormulario(SLUG);
  const definicion = JSON.parse(await readFile(FICHERO_DEFINICION, "utf8"));
  const porEtiqueta = new Map(definicion.campos.map((c) => [c.etiqueta, c.clave]));

  // Una respuesta de desplegable llega como el uuid del bloque de la opción elegida.
  // Como esos uuid los genera el propio repositorio, se pueden recalcular y traducir a
  // la clave que usa el CMS (mascota_perdida, compra_venta…).
  const porUuid = new Map();
  for (const campo of definicion.campos) {
    if (campo.tipo !== "desplegable") continue;
    campo.opciones.forEach((opcion, i) => {
      const valor = typeof opcion === "string" ? slugificar(opcion) : opcion.valor;
      porUuid.set(uuidEstable(SLUG, campo.clave, `opcion-${i}`), valor);
    });
  }

  const importadas = await leerImportadas();
  const yaHechas = importadas[SLUG] ?? [];

  const urlEnTally = `https://tally.so/forms/${formId}/submissions`;
  const datos = await pedirJson(clave, `/forms/${formId}/submissions`);
  const preguntas = new Map(datos.questions.map((q) => [q.id, q.title]));

  const pendientes = datos.submissions.filter(
    (s) => s.isCompleted && (pedidas.length ? pedidas.includes(s.id) : !yaHechas.includes(s.id)),
  );

  if (pendientes.length === 0) {
    console.log(
      pedidas.length
        ? `No encuentro esa respuesta entre las ${datos.submissions.length} del formulario.`
        : `Nada que importar: los ${datos.submissions.length} anuncios ya están pasados al CMS.`,
    );
    return;
  }

  if (!TODAS && pedidas.length === 0) {
    if (DISCRETO) {
      console.log(`${pendientes.length} anuncio(s) sin importar. Se ven en ${urlEnTally}`);
      return;
    }
    console.log(`${pendientes.length} anuncio(s) sin importar:\n`);
    for (const s of pendientes) {
      const titulo = s.responses.find((r) => preguntas.get(r.questionId) === "Título del anuncio");
      console.log(`  ${s.id}  ${s.submittedAt.slice(0, 10)}  ${titulo?.answer ?? "(sin título)"}`);
    }
    console.log(`\nPara pasarlos al CMS:  node tally/importar-tablon.mjs <id>   (o --todas)`);
    return;
  }

  for (const envio of pendientes) {
    const valores = new Map();
    for (const r of envio.responses) {
      const etiqueta = preguntas.get(r.questionId);
      const campo = porEtiqueta.get(etiqueta);
      if (!campo) {
        console.warn(`  ⚠ pregunta sin sitio en la ficha: ${etiqueta} — se ignora`);
        continue;
      }
      const vacio =
        r.answer === null || r.answer === "" || (Array.isArray(r.answer) && !r.answer.length);
      if (!vacio) valores.set(campo, r.answer);
    }

    const titulo = valores.get("titulo");
    if (!titulo) {
      console.warn(`  ⚠ ${envio.id}: sin título, no se puede crear el anuncio`);
      continue;
    }

    const fecha = fechaHoraLocal(envio.submittedAt);
    // El CMS nombra los anuncios "{year}-{month}-{day}-{titulo}.json"
    const slug = `${fecha.slice(0, 10)}-${slugificar(titulo)}`;
    const destino = join(DIR_ANUNCIOS, `${slug}.json`);

    console.log(`\n${titulo}  (respuesta ${envio.id}, ${fecha.slice(0, 10)})`);

    if (!FORZAR && (await existe(destino))) {
      console.warn(`  ⚠ ya existe content/anuncios/${slug}.json — no lo toco (usa --forzar)`);
      continue;
    }

    const ficha = {
      fecha_publicacion: fecha,
      fecha_caducidad: sumarDias(envio.submittedAt, DIAS_QUE_DURA),
      activo: false,
    };
    for (const [campo, valor] of valores) {
      const destinoCampo = A_FICHA[campo];
      if (!destinoCampo) continue;
      if (campo === "tipo") {
        const elegido = Array.isArray(valor) ? valor[0] : valor;
        const tipo = porUuid.get(elegido);
        if (!tipo) {
          console.warn(`  ⚠ no reconozco el tipo elegido (${elegido}): se queda en "otro"`);
        }
        ficha.tipo = tipo ?? "otro";
      } else {
        ficha[destinoCampo] = valor;
      }
    }

    const ordenada = {};
    for (const k of ORDEN) if (k in ficha) ordenada[k] = ficha[k];
    for (const k of Object.keys(ficha)) if (!(k in ordenada)) ordenada[k] = ficha[k];

    await mkdir(DIR_ANUNCIOS, { recursive: true });
    await writeFile(destino, `${JSON.stringify(ordenada, null, 2)}\n`, "utf8");
    console.log(`  escrito content/anuncios/${slug}.json  (activo: false, caduca el ${ficha.fecha_caducidad})`);

    const quien = valores.get("quien_lo_manda");
    if (quien && !DISCRETO) {
      console.log(`  lo manda: ${quien}  ← esto no se publica, no va en la ficha`);
    }

    const fotos = valores.get("foto") ?? [];
    if (fotos.length) {
      // El anuncio solo tiene hueco para una imagen, aunque el formulario admita cuatro.
      const cuantas = fotos.length === 1 ? "una foto" : `${fotos.length} fotos`;
      if (DISCRETO) {
        console.log(`  lleva ${cuantas}: míralas en Tally y sube la que valga → ${urlEnTally}`);
      } else {
        console.log(`  lleva ${cuantas} (la ficha admite una; elige):`);
        for (const foto of fotos) console.log(`    ${foto.url}`);
      }
    }

    yaHechas.push(envio.id);
  }

  importadas[SLUG] = yaHechas;
  await guardarImportadas(importadas);
  console.log(`\nRepásalos en el CMS, en Tablón, y marca "Visible en la web" los que valgan.`);
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
