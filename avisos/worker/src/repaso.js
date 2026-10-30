// El repaso del contenido, para que no envejezca: el primer lunes de cada mes a las 10:00
// se manda al grupo, y /repaso lo enseña cuando se quiera. Tres partes:
//
// - Fichas sin revisar: negocios y servicios que nadie ha tocado en MESES meses. Son
//   las que tienen teléfonos y horarios, lo que antes deja de valer. Cada una lleva
//   «✅ Sigue igual», que la da por revisada otros MESES meses sin hacer un commit.
// - Fichas cojas: publicadas pero sin algo que debería tener (FALTAS). Cada una lleva
//   «👌 Así está bien», que la quita de la lista mientras le falte lo mismo: si un día
//   le falta otra cosa, vuelve a salir.
// - Los enlaces rotos que ya ha confirmado la comprobación semanal (enlaces.js). Solo
//   en /repaso: el aviso de esos va aparte, el lunes que se confirman.
//
// Se lee con GraphQL, como revision.js: una llamada trae el texto de todas las fichas y
// otra el último commit de los negocios y servicios. Lo que se marca con los botones va
// en el KV ESTADO, clave "repaso": { igual: { <ruta>: ms }, bien: { <ruta>: firma } }.

import { graphql } from "./github.js";
import { aTelegram, elemento, escapaHtml, LISTA } from "./telegram.js";
import { enlacesRotos } from "./enlaces.js";

const CLAVE = "repaso";
const MESES = 6;
const DIA = 24 * 60 * 60 * 1000;
const MAX_LISTA = 10;
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const REPO = `repository(owner: "pueblosconectados", name: "venialbo-conecta")`;

const hay = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === "object" && v ? Object.values(v).some(hay) : v != null && String(v).trim() !== "");
const algunoDe = (f, ...campos) => campos.some((c) => hay(f[c]));

// Las actividades ya celebradas sin fotos solo cuentan entre estos días después: antes
// no ha dado tiempo, y después ya no se van a subir
const FOTOS_DESDE = 3;
const FOTOS_HASTA = 45;
// Las noticias sin foto, solo las recientes
const NOTICIAS_DIAS = 30;

const diasDesde = (fecha, hoy) => Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${String(fecha).slice(0, 10)}T12:00:00Z`)) / DIA);

// Lo que le falta a una ficha publicada, por colección. Calibrado contra el contenido
// del 2026-10-27: que salga lo que de verdad falta, no lo que a esa ficha no le hace
// falta (a un servicio no se le pide horario ni dirección: el bibliobús no tiene).
const FALTAS = {
  negocios: (f) => [
    !algunoDe(f, "logo_url") && "sin foto",
    !algunoDe(f, "telefono", "telefono_movil") && "sin teléfono",
    !algunoDe(f, "direccion") && "sin dirección",
    !algunoDe(f, "horario") && "sin horario",
    !algunoDe(f, "descripcion") && "sin descripción",
  ],
  servicios: (f) => [
    !algunoDe(f, "logo_url") && "sin foto",
    !algunoDe(f, "telefono", "email", "web_url", "enlaces", "redes_sociales") && "sin forma de contacto",
    !algunoDe(f, "descripcion", "informacion_adicional") && "sin descripción",
  ],
  lugares: (f) => [
    !algunoDe(f, "imagen_url") && "sin foto",
    !algunoDe(f, "coordenadas") && "sin coordenadas",
    !algunoDe(f, "contenido", "resumen") && "sin texto",
  ],
  rutas: (f) => [
    !algunoDe(f, "imagen_url") && "sin foto",
    !algunoDe(f, "coordenadas_salida") && "sin punto de salida",
    !algunoDe(f, "gpx", "wikiloc_url") && "sin GPX ni Wikiloc",
    !algunoDe(f, "duracion") && "sin duración",
    !algunoDe(f, "contenido", "resumen") && "sin descripción",
  ],
  actividades: (f, hoy) => {
    const dias = diasDesde(f.fecha_fin || f.fecha, hoy);
    const sinFotos = !algunoDe(f, "galeria", "album_facebook", "album_drive", "video_url");
    return [
      !algunoDe(f, "imagen_url") && "sin foto",
      !algunoDe(f, "contenido", "resumen") && "sin texto",
      // Las que se repiten no tienen un «después»
      !f.repeticion && sinFotos && dias >= FOTOS_DESDE && dias <= FOTOS_HASTA && "ya celebrada y sin fotos ni vídeo",
    ];
  },
  noticias: (f, hoy) => [diasDesde(f.fecha_publicacion, hoy) <= NOTICIAS_DIAS && !algunoDe(f, "imagen_url") && "sin foto"],
};

const COLECCIONES = {
  negocios: { tipo: "Negocio", titulo: (f) => f.nombre, revisar: true },
  servicios: { tipo: "Servicio", titulo: (f) => f.nombre, revisar: true },
  lugares: { tipo: "Lugar", titulo: (f) => f.nombre },
  rutas: { tipo: "Ruta", titulo: (f) => f.nombre },
  actividades: { tipo: "Actividad", titulo: (f) => f.titulo },
  noticias: { tipo: "Noticia", titulo: (f) => f.titulo },
};

const hoyMadrid = (ahora) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);
const formatoMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });
const formatoDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

const enlaceCms = (coleccion, ruta) => `${CMS}/${coleccion}/edit/${encodeURIComponent(ruta)}`;
const corto = (texto, max = 22) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

// Lo que va en el callback_data de los botones (Telegram deja 64 bytes; la ruta no cabe)
export const huella = async (ruta) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ruta));
  return [...new Uint8Array(bytes).slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const leerEstado = async (env) => ({ igual: {}, bien: {}, ...((await env.ESTADO.get(CLAVE, "json")) ?? {}) });

// Todas las fichas visibles de COLECCIONES: [{ coleccion, ruta, titulo, ficha }]
const fichasVisibles = async (env) => {
  const carpetas = Object.keys(COLECCIONES)
    .map((c) => `${c}: object(expression: "main:web-static/content/${c}") { ... on Tree { entries { path object { ... on Blob { text } } } } }`)
    .join("\n");
  const { repository: arbol } = await graphql(env, `{ ${REPO} { ${carpetas} } }`);
  const fichas = [];
  for (const [coleccion, { titulo }] of Object.entries(COLECCIONES)) {
    for (const { path, object } of arbol[coleccion]?.entries ?? []) {
      if (!path.endsWith(".json") || !object?.text) continue;
      let ficha;
      try {
        ficha = JSON.parse(object.text);
      } catch {
        continue;
      }
      if (ficha.activo === false || ficha.activa === false) continue;
      fichas.push({ coleccion, ruta: path, titulo: String(titulo(ficha) || path.split("/").pop()).trim(), ficha });
    }
  }
  return fichas;
};

// La firma de lo que le falta, para «Así está bien»
const firma = (faltas) => faltas.join("|");

const faltasDe = ({ coleccion, ficha }, hoy) => FALTAS[coleccion](ficha, hoy).filter(Boolean);

// { antiguas: [{ ..., desde }], cojas: [{ ..., faltas }] }, lo más viejo primero
export const repaso = async (env, { ahora = Date.now() } = {}) => {
  const [fichas, estado] = await Promise.all([fichasVisibles(env), leerEstado(env)]);
  const hoy = hoyMadrid(ahora);

  const cojas = fichas
    .map((f) => ({ ...f, faltas: faltasDe(f, hoy) }))
    .filter((f) => f.faltas.length && estado.bien[f.ruta] !== firma(f.faltas));

  // El último commit de cada negocio y servicio, en la misma llamada (un alias por
  // fichero). Cualquier guardado cuenta como revisión, y «Sigue igual» también.
  const revisables = fichas.filter((f) => COLECCIONES[f.coleccion].revisar);
  const historias = revisables
    .map((f, i) => `f${i}: history(first: 1, path: ${JSON.stringify(f.ruta)}) { nodes { committedDate } }`)
    .join("\n");
  const { repository: repo } = revisables.length
    ? await graphql(env, `{ ${REPO} { object(expression: "main") { ... on Commit { ${historias} } } } }`)
    : { repository: { object: {} } };
  const limite = new Date(ahora);
  limite.setMonth(limite.getMonth() - MESES);
  const antiguas = revisables
    .map((f, i) => {
      const commit = Date.parse(repo.object[`f${i}`]?.nodes?.[0]?.committedDate ?? "") || 0;
      return { ...f, desde: Math.max(commit, estado.igual[f.ruta] ?? 0) };
    })
    .filter((f) => f.desde && f.desde < limite.getTime())
    .sort((a, b) => a.desde - b.desde);

  return { antiguas, cojas };
};

const masDe = (lista) => (lista.length > MAX_LISTA ? `${LISTA}• …y ${lista.length - MAX_LISTA} más` : "");

const mensajeAntiguas = async (antiguas) => ({
  texto: [
    `🕰 <b>${antiguas.length === 1 ? "Una ficha lleva" : `${antiguas.length} fichas llevan`} más de ${MESES} meses sin revisar</b>`,
    "¿Siguen igual el teléfono, el horario y lo demás?",
    antiguas
      .slice(0, MAX_LISTA)
      .map((f) => elemento(f.titulo, `${COLECCIONES[f.coleccion].tipo} · sin tocar desde el ${formatoDia.format(f.desde)}`))
      .join(LISTA) + masDe(antiguas),
    "<i>Si está todo bien, «✅ Sigue igual». Si algo ha cambiado, edítala: guardarla también cuenta.</i>",
  ].join("\n\n"),
  botones: await Promise.all(
    antiguas.slice(0, MAX_LISTA).map(async (f) => [
      { text: `✅ Sigue igual: ${corto(f.titulo)}`, callback_data: `igual:${await huella(f.ruta)}` },
      { text: "✏️ Editar", url: enlaceCms(f.coleccion, f.ruta) },
    ]),
  ),
});

const mensajeCojas = async (cojas) => ({
  texto: [
    `🧩 <b>${cojas.length === 1 ? "Una ficha publicada está coja" : `${cojas.length} fichas publicadas están cojas`}</b>`,
    cojas
      .slice(0, MAX_LISTA)
      .map((f) => elemento(f.titulo, `${COLECCIONES[f.coleccion].tipo} · ${escapaHtml(f.faltas.join(" · "))}`))
      .join(LISTA) + masDe(cojas),
    "<i>Si no tiene arreglo o no le hace falta, «👌 Así está bien» y deja de salir mientras le falte lo mismo.</i>",
  ].join("\n\n"),
  botones: await Promise.all(
    cojas.slice(0, MAX_LISTA).map(async (f) => [
      { text: `✏️ ${corto(f.titulo)}`, url: enlaceCms(f.coleccion, f.ruta) },
      { text: "👌 Así está bien", callback_data: `bien:${await huella(f.ruta)}` },
    ]),
  ),
});

// /repaso: todo, cada parte en su mensaje (cada una con sus botones). El primero va
// como respuesta al comando; los demás, al grupo.
export const mensajesRepaso = async (env, { ahora = Date.now(), conEnlaces = true } = {}) => {
  const { antiguas, cojas } = await repaso(env, { ahora });
  const mensajes = [];
  if (antiguas.length) mensajes.push(await mensajeAntiguas(antiguas));
  if (cojas.length) mensajes.push(await mensajeCojas(cojas));
  if (conEnlaces) {
    const rotos = await enlacesRotos(env);
    if (rotos) mensajes.push(rotos);
  }
  return mensajes;
};

// El primer lunes de cada mes a las 10:00. Si no hay nada, no escribe.
export const recordarRepaso = async (env, { ahora = Date.now() } = {}) => {
  const mensajes = await mensajesRepaso(env, { ahora, conEnlaces: false });
  if (!mensajes.length) return;
  mensajes[0].texto = `🧹 <b>Repaso de ${formatoMes.format(ahora)}</b>\n\n${mensajes[0].texto}`;
  for (const { texto, botones } of mensajes) {
    if (!(await aTelegram(env, texto, botones))) throw new Error("Telegram no aceptó el repaso");
  }
};

// Los botones: «igual» o «bien» con la huella de la ruta. Devuelve el título de la ficha
// y lo que se ha apuntado, o null si ya no está (borrada u oculta desde entonces).
export const marcar = async (env, accion, codigo, { ahora = Date.now() } = {}) => {
  const fichas = await fichasVisibles(env);
  let ficha = null;
  for (const f of fichas) if ((await huella(f.ruta)) === codigo) ficha = f;
  if (!ficha) return null;
  const estado = await leerEstado(env);
  if (accion === "igual") {
    estado.igual[ficha.ruta] = ahora;
  } else {
    const faltas = faltasDe(ficha, hoyMadrid(ahora));
    if (faltas.length) estado.bien[ficha.ruta] = firma(faltas);
  }
  await env.ESTADO.put(CLAVE, JSON.stringify(estado));
  const vuelve = new Date(ahora);
  vuelve.setMonth(vuelve.getMonth() + MESES);
  return { titulo: ficha.titulo, vuelve: formatoMes.format(vuelve) };
};
