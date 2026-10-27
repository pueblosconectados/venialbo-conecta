// Convierte las respuestas del formulario de casas en fichas de «Casas en venta y
// alquiler» del CMS (content/casas). Es el del tablón con otros campos.
//
//   node tally/importar-casas.mjs             → lista lo que hay sin importar
//   node tally/importar-casas.mjs <id>        → escribe el borrador de esa respuesta
//   node tally/importar-casas.mjs --todas     → escribe todas las que falten
//   node tally/importar-casas.mjs <id> --forzar → reescribe aunque la casa ya exista
//
// Como en el tablón: la casa se escribe con "activo": false y no sale en la web hasta
// que alguien la repase en el CMS, y LAS FOTOS NO SE DESCARGAN (un binario que manda un
// desconocido, una vez commiteado, se queda en el historial de git para siempre). No
// lleva fecha de caducidad: las casas se quitan cuando se venden.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DISCRETO,
  RAIZ,
  existe,
  fechaHoraLocal,
  apuntarFicha,
  guardarImportadas,
  idDelFormulario,
  leerClave,
  leerImportadas,
  pedirJson,
  slugificar,
  uuidEstable,
} from "./comun.mjs";

const SLUG = "casas";
const DIR_CASAS = join(RAIZ, "web-static", "content", "casas");
const FICHERO_DEFINICION = join(RAIZ, "tally", "formularios", `${SLUG}.json`);

const args = process.argv.slice(2);
const TODAS = args.includes("--todas");
const FORZAR = args.includes("--forzar");
const pedidas = args.filter((a) => !a.startsWith("--"));

// Del campo del formulario al campo de la ficha. "quien_lo_manda" no está a propósito:
// el aviso de privacidad dice que eso no se publica.
const A_FICHA = {
  titulo: "titulo",
  tipo: "tipo",
  precio: "precio",
  superficie: "superficie",
  habitaciones: "habitaciones",
  banos: "banos",
  descripcion: "descripcion",
  contacto: "contacto",
  enlace: "enlace",
};

// El orden de los campos en el CMS (.pages.yml, colección casas)
const ORDEN = [
  "titulo",
  "tipo",
  "precio",
  "superficie",
  "habitaciones",
  "banos",
  "descripcion",
  "contacto",
  "enlace",
  "imagen_url",
  "fecha_publicacion",
  "activo",
];

const main = async () => {
  const clave = await leerClave();
  const formId = await idDelFormulario(SLUG);
  const definicion = JSON.parse(await readFile(FICHERO_DEFINICION, "utf8"));
  const porEtiqueta = new Map(definicion.campos.map((c) => [c.etiqueta, c.clave]));

  // Una respuesta de desplegable llega como el uuid del bloque de la opción elegida.
  // Como esos uuid los genera el propio repositorio, se pueden recalcular y traducir a
  // la clave que usa el CMS (casa_venta, casa_alquiler).
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
        : `Nada que importar: las ${datos.submissions.length} casas ya están pasadas al CMS.`,
    );
    return;
  }

  if (!TODAS && pedidas.length === 0) {
    if (DISCRETO) {
      console.log(`${pendientes.length} casa(s) sin importar. Se ven en ${urlEnTally}`);
      return;
    }
    console.log(`${pendientes.length} casa(s) sin importar:\n`);
    for (const s of pendientes) {
      const titulo = s.responses.find((r) => preguntas.get(r.questionId) === "Título del anuncio");
      console.log(`  ${s.id}  ${s.submittedAt.slice(0, 10)}  ${titulo?.answer ?? "(sin título)"}`);
    }
    console.log(`\nPara pasarlas al CMS:  node tally/importar-casas.mjs <id>   (o --todas)`);
    return;
  }

  for (const envio of pendientes) {
    const valores = new Map();
    for (const r of envio.responses) {
      const etiqueta = preguntas.get(r.questionId);
      // La casilla de aceptar la privacidad es la única pregunta sin título, y no
      // va a la ficha: Tally ya no deja enviar sin marcarla.
      if (!etiqueta) continue;
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
      console.warn(`  ⚠ ${envio.id}: sin título, no se puede crear la casa`);
      continue;
    }

    const fecha = fechaHoraLocal(envio.submittedAt);
    // El CMS nombra las casas "{year}-{month}-{day}-{titulo}.json". Si se llamara igual
    // que un anuncio del tablón, build-content.mjs lo dice: comparten dirección en la web.
    const slug = `${fecha.slice(0, 10)}-${slugificar(titulo)}`;
    const destino = join(DIR_CASAS, `${slug}.json`);

    console.log(`\n${titulo}  (respuesta ${envio.id}, ${fecha.slice(0, 10)})`);

    if (!FORZAR && (await existe(destino))) {
      console.warn(`  ⚠ ya existe content/casas/${slug}.json — no lo toco (usa --forzar)`);
      continue;
    }

    const ficha = {
      fecha_publicacion: fecha,
      activo: false,
    };
    for (const [campo, valor] of valores) {
      const destinoCampo = A_FICHA[campo];
      if (!destinoCampo) continue;
      if (campo === "tipo") {
        const elegido = Array.isArray(valor) ? valor[0] : valor;
        const tipo = porUuid.get(elegido);
        if (!tipo) {
          console.warn(`  ⚠ no reconozco si es venta o alquiler (${elegido}): se queda en venta`);
        }
        ficha.tipo = tipo ?? "casa_venta";
      } else {
        ficha[destinoCampo] = valor;
      }
    }

    const ordenada = {};
    for (const k of ORDEN) if (k in ficha) ordenada[k] = ficha[k];
    for (const k of Object.keys(ficha)) if (!(k in ordenada)) ordenada[k] = ficha[k];

    await mkdir(DIR_CASAS, { recursive: true });
    await writeFile(destino, `${JSON.stringify(ordenada, null, 2)}\n`, "utf8");
    console.log(`  escrito content/casas/${slug}.json  (activo: false)`);

    const quien = valores.get("quien_lo_manda");
    if (quien && !DISCRETO) {
      console.log(`  lo manda: ${quien}  ← esto no se publica, no va en la ficha`);
    }

    const fotos = valores.get("foto") ?? [];
    if (fotos.length) {
      // Caben las cuatro: una como «Foto principal» y el resto en «Más fotos».
      const cuantas = fotos.length === 1 ? "una foto" : `${fotos.length} fotos`;
      if (DISCRETO) {
        console.log(`  lleva ${cuantas}: míralas en Tally y sube las que valgan → ${urlEnTally}`);
      } else {
        console.log(`  lleva ${cuantas} (una de foto principal, el resto en «Más fotos»):`);
        for (const foto of fotos) console.log(`    ${foto.url}`);
      }
    }

    yaHechas.push(envio.id);
    await apuntarFicha(SLUG, envio.id, destino);
  }

  importadas[SLUG] = yaHechas;
  await guardarImportadas(importadas);
  console.log(`\nRepásalas en el CMS, en Casas en venta y alquiler, y marca "Visible en la web" las que valgan.`);
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
