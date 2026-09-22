// Convierte las respuestas del formulario de alta de negocios en fichas del CMS.
//
//   node tally/importar-negocios.mjs             → lista lo que hay sin importar
//   node tally/importar-negocios.mjs <id>        → escribe el borrador de esa respuesta
//   node tally/importar-negocios.mjs --todas     → escribe todas las que falten
//   node tally/importar-negocios.mjs <id> --forzar → reescribe aunque la ficha ya exista
//
// Lo que escribe es un BORRADOR: la ficha sale con "activo": false, así que no aparece
// en la web hasta que alguien la repase en el CMS y la marque como visible. Esa revisión
// es el punto de todo esto: lo manda un vecino y alguien tiene que leerlo antes.
//
// LA FOTO NO SE DESCARGA A PROPÓSITO. Un binario que manda un desconocido, una vez
// commiteado, se queda en el historial de git para siempre: quitarlo obliga a reescribir
// la historia con push --force sobre una rama donde el CMS commitea por su cuenta. Así
// que el script deja el enlace de la imagen, alguien la mira, y si vale se sube desde el
// CMS con el selector de imágenes de siempre.
//
// La clave de API se lee igual que en crear-formularios.mjs (TALLY_API_KEY, o el fichero
// de TALLY_API_KEY_FILE, o ~/.config/tally/api-key).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const FICHERO_IDS = join(AQUI, "formularios-creados.json");
const FICHERO_DEFINICION = join(AQUI, "formularios", "alta-negocio.json");
const FICHERO_IMPORTADAS = join(AQUI, "respuestas-importadas.json");
const DIR_FICHAS = join(RAIZ, "web-static", "content", "negocios");
const API = "https://api.tally.so";

const args = process.argv.slice(2);
const TODAS = args.includes("--todas");
const FORZAR = args.includes("--forzar");
// El repositorio es público y los registros de Actions también, así que cuando esto
// corre ahí no se imprime nada personal: ni quién manda la ficha ni el enlace de su
// foto, que va firmado y abre la imagen a cualquiera que lo lea.
const DISCRETO = args.includes("--discreto") || process.env.CI === "true";
const pedidas = args.filter((a) => !a.startsWith("--"));

const leerClave = async () => {
  if (process.env.TALLY_API_KEY) return process.env.TALLY_API_KEY.trim();
  const ruta = process.env.TALLY_API_KEY_FILE ?? join(homedir(), ".config/tally/api-key");
  const clave = await readFile(ruta, "utf8").catch(() => null);
  if (!clave) throw new Error(`No hay clave: ni TALLY_API_KEY ni ${ruta}`);
  return clave.trim();
};

// El nombre del fichero sigue el patrón del CMS ("{primary}.json") y se limpia igual
// que hace Pages CMS con su "rename: safe": sin tildes, sin mayúsculas, con guiones.
const slugificar = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// Del campo del formulario al campo de la ficha. Las claves son las del fichero de
// definición, así que si allí se renombra un campo, aquí salta el aviso en vez de
// perderse el dato en silencio.
const A_FICHA = {
  nombre: "nombre",
  categoria_negocio: "categoria_negocio",
  descripcion: "descripcion",
  direccion: "direccion",
  horario: "horario",
  telefono: "telefono",
  telefono_movil: "telefono_movil",
  email: "email",
  web_url: "web_url",
  facebook: ["redes_sociales", "facebook"],
  instagram: ["redes_sociales", "instagram"],
  youtube: ["redes_sociales", "youtube"],
  logo: "logo_url",
  // "persona_contacto" no va a la ficha a propósito: es para saber quién lo manda y el
  // aviso de privacidad dice que eso no se publica. Se enseña por pantalla y ahí queda.
};

// Orden de las claves en el JSON, el mismo que tiene el esquema del CMS.
const ORDEN = [
  "nombre",
  "categoria_negocio",
  "descripcion",
  "logo_url",
  "direccion",
  "telefono",
  "telefono_movil",
  "email",
  "web_url",
  "redes_sociales",
  "horario",
  "activo",
];

const llamar = async (clave, ruta) => {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${clave}` },
  });
  if (!respuesta.ok) {
    throw new Error(`GET ${ruta} → HTTP ${respuesta.status}: ${await respuesta.text()}`);
  }
  return respuesta.json();
};

const existe = async (ruta) =>
  readFile(ruta, "utf8").then(
    () => true,
    () => false,
  );

const main = async () => {
  const clave = await leerClave();
  const ids = JSON.parse(await readFile(FICHERO_IDS, "utf8"));
  const formId = ids["alta-negocio"]?.id;
  if (!formId) throw new Error("No sé el id del formulario: falta alta-negocio en formularios-creados.json");

  const definicion = JSON.parse(await readFile(FICHERO_DEFINICION, "utf8"));
  // etiqueta → clave, porque la API devuelve las preguntas por su título.
  const porEtiqueta = new Map(definicion.campos.map((c) => [c.etiqueta, c.clave]));

  const importadas = JSON.parse(await readFile(FICHERO_IMPORTADAS, "utf8").catch(() => "[]"));

  const urlEnTally = `https://tally.so/forms/${formId}/submissions`;
  const datos = await llamar(clave, `/forms/${formId}/submissions`);
  const preguntas = new Map(datos.questions.map((q) => [q.id, q.title]));

  const pendientes = datos.submissions.filter(
    (s) => s.isCompleted && (pedidas.length ? pedidas.includes(s.id) : !importadas.includes(s.id)),
  );

  if (pendientes.length === 0) {
    const total = datos.submissions.length;
    console.log(
      pedidas.length
        ? `No encuentro esa respuesta entre las ${total} del formulario.`
        : `Nada que importar: las ${total} respuestas ya están pasadas al CMS.`,
    );
    return;
  }

  if (!TODAS && pedidas.length === 0) {
    if (DISCRETO) {
      console.log(`${pendientes.length} respuesta(s) sin importar. Se ven en ${urlEnTally}`);
      return;
    }
    console.log(`${pendientes.length} respuesta(s) sin importar:\n`);
    for (const s of pendientes) {
      const nombre = s.responses.find((r) => preguntas.get(r.questionId) === "Nombre del negocio");
      console.log(`  ${s.id}  ${s.submittedAt.slice(0, 10)}  ${nombre?.answer ?? "(sin nombre)"}`);
    }
    console.log(`\nPara pasarlas al CMS:  node tally/importar-negocios.mjs <id>   (o --todas)`);
    return;
  }

  for (const envio of pendientes) {
    // clave del campo → respuesta
    const valores = new Map();
    for (const r of envio.responses) {
      const etiqueta = preguntas.get(r.questionId);
      const campo = porEtiqueta.get(etiqueta);
      if (!campo) {
        console.warn(`  ⚠ pregunta sin sitio en la ficha: ${etiqueta} — se ignora`);
        continue;
      }
      const vacio = r.answer === null || r.answer === "" || (Array.isArray(r.answer) && !r.answer.length);
      if (!vacio) valores.set(campo, r.answer);
    }

    const nombre = valores.get("nombre");
    if (!nombre) {
      console.warn(`  ⚠ ${envio.id}: sin nombre de negocio, no se puede crear la ficha`);
      continue;
    }
    const slug = slugificar(nombre);
    const destino = join(DIR_FICHAS, `${slug}.json`);

    console.log(`\n${nombre}  (respuesta ${envio.id}, ${envio.submittedAt.slice(0, 10)})`);

    if (!FORZAR && (await existe(destino))) {
      console.warn(`  ⚠ ya existe content/negocios/${slug}.json — no lo toco (usa --forzar)`);
      continue;
    }

    const ficha = { activo: false };
    for (const [campo, valor] of valores) {
      const destinoCampo = A_FICHA[campo];
      if (!destinoCampo) continue; // persona_contacto y compañía
      if (campo === "logo") {
        continue; // la foto no entra en el repositorio; se avisa más abajo
      } else if (Array.isArray(destinoCampo)) {
        const [grupo, sub] = destinoCampo;
        ficha[grupo] = { ...(ficha[grupo] ?? {}), [sub]: valor };
      } else {
        ficha[destinoCampo] = valor;
      }
    }

    const ordenada = {};
    for (const k of ORDEN) if (k in ficha) ordenada[k] = ficha[k];
    for (const k of Object.keys(ficha)) if (!(k in ordenada)) ordenada[k] = ficha[k];

    await mkdir(DIR_FICHAS, { recursive: true });
    await writeFile(destino, `${JSON.stringify(ordenada, null, 2)}\n`, "utf8");
    console.log(`  escrito content/negocios/${slug}.json  (activo: false, no sale en la web todavía)`);

    const quien = valores.get("persona_contacto");
    if (quien && !DISCRETO) {
      console.log(`  lo manda: ${quien}  ← esto no se publica, no va en la ficha`);
    }

    const fotos = valores.get("logo") ?? [];
    if (fotos.length && DISCRETO) {
      console.log(`  lleva foto: míralo en Tally antes de subirla al CMS → ${urlEnTally}`);
    }
    for (const foto of DISCRETO ? [] : fotos) {
      console.log(`  FOTO SIN REVISAR: ${foto.url}`);
      console.log("    ábrela, mírala, y si vale súbela desde el CMS en 'Logo o foto'.");
    }

    const faltan = ["telefono", "telefono_movil", "email", "web_url"].filter((c) => !valores.has(c));
    if (faltan.length === 4) console.log("  ⚠ no ha dejado ninguna forma de contacto");

    importadas.push(envio.id);
  }

  await writeFile(FICHERO_IMPORTADAS, `${JSON.stringify(importadas, null, 2)}\n`, "utf8");
  console.log(`\nRepásalas en el CMS y marca "Visible en la web" las que valgan.`);
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
