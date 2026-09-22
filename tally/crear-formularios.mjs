// Crea (o actualiza) en Tally los formularios definidos en tally/formularios/.
//
//   node tally/crear-formularios.mjs                 → todos, en borrador
//   node tally/crear-formularios.mjs contacto        → solo ese
//   node tally/crear-formularios.mjs --publicar      → los crea ya publicados
//   node tally/crear-formularios.mjs --dry           → enseña el JSON, no llama a la API
//
// La clave NO vive en el repositorio. Se lee de la variable TALLY_API_KEY o, si no
// está, del fichero que indique TALLY_API_KEY_FILE (por defecto ~/.config/tally/api-key).
//
// Los identificadores que devuelve Tally se guardan en formularios-creados.json, que sí
// se commitea: no son secretos y son lo que permite que la segunda ejecución actualice
// el formulario en vez de crear otro.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_FORMULARIOS = join(AQUI, "formularios");
const FICHERO_IDS = join(AQUI, "formularios-creados.json");
const FICHERO_TEMA = join(AQUI, "tema.json");
const API = "https://api.tally.so";

const args = process.argv.slice(2);
const PUBLICAR = args.includes("--publicar");
const DRY = args.includes("--dry");
const pedidos = args.filter((a) => !a.startsWith("--"));

const leerClave = async () => {
  if (process.env.TALLY_API_KEY) return process.env.TALLY_API_KEY.trim();
  const ruta = process.env.TALLY_API_KEY_FILE ?? join(homedir(), ".config/tally/api-key");
  const clave = await readFile(ruta, "utf8").catch(() => null);
  if (!clave) {
    throw new Error(
      `No hay clave: define TALLY_API_KEY o deja la clave en ${ruta}` +
        " (TALLY_API_KEY_FILE cambia esa ruta).",
    );
  }
  return clave.trim();
};

// Los uuid tienen que ser estables entre ejecuciones: si cambiaran, al actualizar el
// formulario Tally vería preguntas nuevas y perdería el hilo con las respuestas ya
// recibidas. Se derivan del nombre del formulario y de la clave del campo (uuid v5).
const NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";
const uuidEstable = (...partes) => {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(partes.join("/"), "utf8")]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // versión 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Cada tipo nuestro se traduce al bloque de Tally que le corresponde.
const TIPOS = {
  texto: "INPUT_TEXT",
  email: "INPUT_EMAIL",
  telefono: "INPUT_PHONE_NUMBER",
  enlace: "INPUT_LINK",
  parrafo: "TEXTAREA",
  archivo: "FILE_UPLOAD",
};

const bloquesDeCampo = (slug, campo) => {
  const { clave, etiqueta, ayuda, requerido = false } = campo;
  const uuidTitulo = uuidEstable(slug, clave, "titulo");
  const bloques = [
    {
      uuid: uuidTitulo,
      type: "TITLE",
      groupUuid: uuidEstable(slug, clave, "grupo-titulo"),
      groupType: "QUESTION",
      payload: { html: etiqueta },
    },
  ];

  if (campo.tipo === "desplegable") {
    // Todas las opciones de un desplegable comparten groupUuid: eso es lo que las
    // agrupa como opciones de la misma pregunta.
    const grupo = uuidEstable(slug, clave, "grupo-opciones");
    const opciones = campo.opciones ?? [];
    opciones.forEach((texto, i) => {
      bloques.push({
        uuid: uuidEstable(slug, clave, `opcion-${i}`),
        type: "DROPDOWN_OPTION",
        groupUuid: grupo,
        groupType: "DROPDOWN",
        payload: {
          index: i,
          isFirst: i === 0,
          isLast: i === opciones.length - 1,
          text: texto,
          isRequired: requerido,
        },
      });
    });
    return bloques;
  }

  const type = TIPOS[campo.tipo];
  if (!type) throw new Error(`Tipo de campo desconocido: ${campo.tipo} (${slug}/${clave})`);

  const payload = { isRequired: requerido };
  if (ayuda) payload.placeholder = ayuda;

  bloques.push({
    uuid: uuidEstable(slug, clave, "campo"),
    type,
    groupUuid: uuidEstable(slug, clave, "grupo-campo"),
    groupType: type,
    payload,
  });
  return bloques;
};

// El tema (colores y logo) sale de tema.json, que no está escrito a mano: es lo que
// genera el editor de Tally al personalizar un formulario, leído luego por la API.
// Inventarse claves ahí rompe el formulario público, así que se copia tal cual.
const leerTema = async () => {
  const crudo = await readFile(FICHERO_TEMA, "utf8").catch(() => null);
  return crudo ? JSON.parse(crudo) : {};
};

const cuerpoDe = (slug, definicion, tema = {}) => {
  const tituloPayload = { html: definicion.titulo };
  if (tema.logo) tituloPayload.logo = tema.logo;

  const bloques = [
    {
      uuid: uuidEstable(slug, "form-title"),
      type: "FORM_TITLE",
      groupUuid: uuidEstable(slug, "grupo-form-title"),
      groupType: "TEXT",
      payload: tituloPayload,
    },
  ];

  if (definicion.intro) {
    bloques.push({
      uuid: uuidEstable(slug, "intro"),
      type: "TEXT",
      groupUuid: uuidEstable(slug, "grupo-intro"),
      groupType: "TEXT",
      payload: { html: definicion.intro },
    });
  }

  for (const campo of definicion.campos) bloques.push(...bloquesDeCampo(slug, campo));

  // Aviso de privacidad, al final: enlaza a /privacidad de la web.
  if (definicion.nota) {
    bloques.push({
      uuid: uuidEstable(slug, "nota"),
      type: "TEXT",
      groupUuid: uuidEstable(slug, "grupo-nota"),
      groupType: "TEXT",
      payload: { html: definicion.nota },
    });
  }

  const cuerpo = { status: PUBLICAR ? "PUBLISHED" : "DRAFT", blocks: bloques };
  const settings = {};
  if (tema.styles) settings.styles = tema.styles;
  // El idioma cambia los textos que pone Tally: el botón de enviar, los avisos de
  // campo obligatorio y la pantalla de "gracias".
  if (tema.idioma) settings.language = tema.idioma;
  if (Object.keys(settings).length) cuerpo.settings = settings;
  return cuerpo;
};

const llamar = async (clave, metodo, ruta, cuerpo) => {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${clave}`,
      "Content-Type": "application/json",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    // El texto del error puede traer la pista de qué bloque no le ha gustado.
    throw new Error(`${metodo} ${ruta} → HTTP ${respuesta.status}: ${texto.slice(0, 600)}`);
  }
  return texto ? JSON.parse(texto) : null;
};

const main = async () => {
  const ficheros = (await readdir(DIR_FORMULARIOS))
    .filter((f) => f.endsWith(".json"))
    .filter((f) => pedidos.length === 0 || pedidos.includes(f.replace(/\.json$/, "")));

  if (ficheros.length === 0) {
    console.error(`No hay nada que hacer. Formularios: ${(await readdir(DIR_FORMULARIOS)).join(", ")}`);
    process.exit(1);
  }

  const ids = JSON.parse(await readFile(FICHERO_IDS, "utf8").catch(() => "{}"));

  const tema = await leerTema();

  if (DRY) {
    for (const fichero of ficheros) {
      const slug = fichero.replace(/\.json$/, "");
      const definicion = JSON.parse(await readFile(join(DIR_FORMULARIOS, fichero), "utf8"));
      console.log(`\n=== ${slug}`);
      console.log(JSON.stringify(cuerpoDe(slug, definicion, tema), null, 2));
    }
    return;
  }

  const clave = await leerClave();

  for (const fichero of ficheros) {
    const slug = fichero.replace(/\.json$/, "");
    const definicion = JSON.parse(await readFile(join(DIR_FORMULARIOS, fichero), "utf8"));
    const cuerpo = cuerpoDe(slug, definicion, tema);
    const existente = ids[slug]?.id;

    const forma = existente
      ? await llamar(clave, "PATCH", `/forms/${existente}`, cuerpo)
      : await llamar(clave, "POST", "/forms", cuerpo);

    const id = forma?.id ?? existente;
    ids[slug] = {
      id,
      nombre: definicion.titulo,
      estado: cuerpo.status,
      url: `https://tally.so/r/${id}`,
      editar: `https://tally.so/forms/${id}/edit`,
      actualizado: new Date().toISOString().slice(0, 10),
    };
    console.log(`${existente ? "actualizado" : "creado"}  ${slug}  → ${ids[slug].editar}`);
  }

  await writeFile(FICHERO_IDS, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(`\nIdentificadores guardados en ${FICHERO_IDS.replace(`${AQUI}/`, "tally/")}`);
};

main().catch((error) => {
  // Nunca imprimir la clave, solo el mensaje.
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
