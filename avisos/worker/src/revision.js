// Lo que lleva días oculto sin revisar: las altas de negocio y los anuncios que llegan por
// Tally entran en el CMS ocultos (`"activo": false`), y alguien tiene que repasarlos y
// hacerlos visibles. Cada día a las 10:00 (hora de Madrid), si hay alguno que lleve más de
// DIAS_AVISO días así, se recuerda en el grupo de Telegram. /pendientes los lista también.
//
// "Sin revisar" es: oculto y con el último commit todavía de la Action que lo trajo
// (github-actions[bot]). Si alguien lo abre en el CMS y lo guarda, aunque lo deje oculto,
// ya cuenta como revisado: es que lo ha ocultado a propósito. Las noticias y demás
// ocultas no salen: son borradores de los admin, no llegan de fuera.
//
// Se lee con la API GraphQL de GitHub (con GITHUB_TOKEN, "Contents: Read"): una llamada
// trae todas las fichas con su contenido y otra el último commit de las ocultas. Por REST
// sería una petición por fichero, y el plan gratuito da 50 por ejecución.

import { graphql, leerFichasTally } from "./github.js";
import { botonesFicha } from "./fichas.js";
import { aTelegram, elemento, LISTA } from "./telegram.js";

const DIAS_AVISO = 2;
const BOT = "github-actions[bot]";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const DIA = 24 * 60 * 60 * 1000;

// `formulario`: el de Tally del que llegan, para los botones de publicar y descartar
const COLECCIONES = {
  negocios: { carpeta: "web-static/content/negocios", titulo: (f) => f.nombre, tipo: "Alta de negocio", formulario: "negocios" },
  anuncios: { carpeta: "web-static/content/anuncios", titulo: (f) => f.titulo, tipo: "Anuncio", formulario: "tablon" },
  casas: { carpeta: "web-static/content/casas", titulo: (f) => f.titulo, tipo: "Casa", formulario: "casas" },
};

const REPO = `repository(owner: "pueblosconectados", name: "venialbo-conecta")`;

// La pantalla de edición de la ficha en Pages CMS (el mismo formato que reconoce
// web-static/src/markdown.ts)
const enlaceCms = (coleccion, ruta) => `${CMS}/${coleccion}/edit/${encodeURIComponent(ruta)}`;

// [{ coleccion, ruta, titulo, desde }] de lo oculto sin revisar, del más viejo al más nuevo
export const sinRevisar = async (env) => {
  const carpetas = Object.entries(COLECCIONES)
    .map(([c, { carpeta }]) => `${c}: object(expression: "main:${carpeta}") { ... on Tree { entries { path object { ... on Blob { text } } } } }`)
    .join("\n");
  const { repository: arbol } = await graphql(env, `{ ${REPO} { ${carpetas} } }`);

  const ocultas = [];
  for (const [coleccion, { titulo }] of Object.entries(COLECCIONES)) {
    for (const { path, object } of arbol[coleccion]?.entries ?? []) {
      if (!path.endsWith(".json") || !object?.text) continue;
      let ficha;
      try {
        ficha = JSON.parse(object.text);
      } catch {
        continue;
      }
      if (ficha.activo === false) ocultas.push({ coleccion, ruta: path, titulo: titulo(ficha) || path.split("/").pop() });
    }
  }
  if (!ocultas.length) return [];

  // El último commit de cada una, en la misma llamada (un alias por fichero)
  const historias = ocultas
    .map((o, i) => `f${i}: history(first: 1, path: ${JSON.stringify(o.ruta)}) { nodes { committedDate author { name } } }`)
    .join("\n");
  const { repository: repo } = await graphql(env, `{ ${REPO} { object(expression: "main") { ... on Commit { ${historias} } } } }`);

  // La respuesta de Tally de cada una, para publicarla o descartarla desde Telegram. Si
  // no se puede leer, salen sin esos botones
  const respuestas = new Map();
  for (const [formulario, porId] of Object.entries(await leerFichasTally(env).catch(() => ({}))))
    for (const [id, ruta] of Object.entries(porId)) respuestas.set(ruta, { formulario, id });

  return ocultas
    .map((o, i) => ({ ...o, commit: repo.object[`f${i}`]?.nodes?.[0] }))
    .filter((o) => o.commit?.author?.name === BOT)
    .map(({ commit, ...o }) => ({ ...o, desde: Date.parse(commit.committedDate), respuesta: respuestas.get(o.ruta) }))
    .sort((a, b) => a.desde - b.desde);
};

const hace = (desde, ahora) => {
  const dias = Math.floor((ahora - desde) / DIA);
  if (dias >= 1) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  const horas = Math.max(1, Math.floor((ahora - desde) / 3_600_000));
  return `hace ${horas} h`;
};

// Las líneas de la lista y, por ficha (hasta 3), una fila con el botón para abrirla en
// el CMS y otra con publicar y descartar si se sabe de qué respuesta de Tally salió.
// Los títulos no caben de tres en tres: un botón por fila.
export const listaSinRevisar = (fichas, ahora = Date.now()) => ({
  lineas: fichas.map(
    (f) => elemento(f.titulo, `${COLECCIONES[f.coleccion].tipo} · llegó ${hace(f.desde, ahora)}`),
  ),
  filas: fichas.slice(0, 3).flatMap((f) => [
    [{ text: `📝 ${f.titulo.length > 24 ? `${f.titulo.slice(0, 23)}…` : f.titulo}`, url: enlaceCms(f.coleccion, f.ruta) }],
    ...(f.respuesta ? [botonesFicha(f.respuesta.formulario, f.respuesta.id)] : []),
  ]),
});

// Lo que hace el cron a las 10:00: solo escribe si hay algo de más de DIAS_AVISO días
export const recordarSinRevisar = async (env, { ahora = Date.now(), enviar = true } = {}) => {
  const viejas = (await sinRevisar(env)).filter((f) => ahora - f.desde >= DIAS_AVISO * DIA);
  if (!viejas.length) return null;
  const { lineas, filas } = listaSinRevisar(viejas, ahora);
  const texto = [
    `🕰 <b>${viejas.length === 1 ? "Hay una ficha" : `Hay ${viejas.length} fichas`} sin revisar en el CMS</b>`,
    viejas.length === 1
      ? "Llegó por los formularios y sigue oculta sin que nadie la haya tocado:"
      : "Llegaron por los formularios y siguen ocultas sin que nadie las haya tocado:",
    lineas.join(LISTA),
    viejas.length === 1
      ? "<i>Repásala y márcala como visible. Si no vale, guárdala oculta o bórrala, y deja de salir aquí.</i>"
      : "<i>Repásalas y márcalas como visibles. Las que no valgan, guárdalas ocultas o bórralas, y dejan de salir aquí.</i>",
  ].join("\n\n");
  if (enviar && !(await aTelegram(env, texto, filas)))
    throw new Error("Telegram no aceptó el recordatorio");
  return texto;
};
