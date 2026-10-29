// /cambios: los últimos guardados en el CMS, con quién y cuándo, para coordinarse entre
// los admin y no pisarse.
//
// Salen de los commits de main que hace Pages CMS: llevan el nombre de quien edita y un
// mensaje "Create|Update|Delete <ruta> (via Pages CMS)". Se juntan los seguidos de la
// misma persona sobre la misma ficha (el CMS hace un commit por guardado) y las fotos que
// sube de una tanda. El título sale del contenido actual de la ficha, con una sola
// consulta GraphQL; si ya no existe, del nombre del fichero.

import { graphql, listarCommits } from "./github.js";
import { elemento, LISTA } from "./telegram.js";

const CUANTOS = 5;
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const REPO = `repository(owner: "pueblosconectados", name: "venialbo-conecta")`;

export const TIPOS = {
  noticias: "Noticia",
  actividades: "Actividad",
  anuncios: "Anuncio",
  casas: "Casa",
  avisos: "Aviso",
  negocios: "Negocio",
  servicios: "Servicio",
  lugares: "Lugar",
  rutas: "Ruta",
  fechas: "Fecha",
  enlaces: "Enlace",
  categorias: "Categoría",
};
const ICONOS = { Create: "➕", Update: "✏️", Delete: "🗑" };

export const hace = (desde, ahora) => {
  const minutos = Math.max(1, Math.round((ahora - desde) / 60_000));
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
};

// "2026-10-15-retirada-de-merinas" → "Retirada de merinas"
export const deSlug = (id) => {
  const texto = id.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Lo que se puede entender de un commit del CMS, o null si no es suyo
const leer = ({ commit }) => {
  const m = commit.message.split("\n")[0].match(/^(Create|Update|Delete) (\S+) \(via Pages CMS\)$/);
  if (!m) return null;
  const [, accion, ruta] = m;
  const base = { accion, ruta, autor: commit.author.name, fecha: Date.parse(commit.author.date) };
  const ficha = ruta.match(/^web-static\/content\/([^/]+)\/([^/]+)\.json$/);
  if (ficha) return { ...base, tipo: "ficha", coleccion: ficha[1], id: ficha[2] };
  if (ruta.startsWith("web-static/public/media/")) return { ...base, tipo: "archivo" };
  return { ...base, tipo: "otro" };
};

// Junta lo seguido: los guardados de la misma ficha, aunque sean de varias personas, y
// las tandas de archivos de una misma persona. Los commits llegan del más nuevo al más
// viejo, así que manda la acción más nueva (si se borró, borrada), salvo que sea un
// cambio sobre algo creado en la misma tanda: entonces cuenta como creada.
const juntar = (cambios) => {
  const juntos = [];
  for (const c of cambios) {
    const ultimo = juntos.at(-1);
    if (ultimo && c.tipo === "ficha" && ultimo.tipo === "ficha" && ultimo.ruta === c.ruta) {
      if (ultimo.accion === "Update" && c.accion === "Create") ultimo.accion = "Create";
      if (!ultimo.autores.includes(c.autor)) ultimo.autores.push(c.autor);
      continue;
    }
    if (ultimo && ultimo.autor === c.autor && c.tipo === "archivo" && ultimo.tipo === "archivo" && ultimo.accion === c.accion) {
      ultimo.cuantos += 1;
      continue;
    }
    juntos.push({ ...c, cuantos: 1, autores: [c.autor] });
  }
  return juntos;
};

// "MJ-Venialbo", "MJ-Venialbo y David Hernando", "A, B y C"
export const nombres = (lista) => (lista.length < 2 ? lista[0] : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`);

// El título actual de cada ficha que aún existe, en una sola consulta
const titulos = async (env, fichas) => {
  const vivas = fichas.filter((f) => f.accion !== "Delete");
  if (!vivas.length) return new Map();
  const consulta = vivas
    .map((f, i) => `f${i}: object(expression: ${JSON.stringify(`main:${f.ruta}`)}) { ... on Blob { text } }`)
    .join("\n");
  const { repository } = await graphql(env, `{ ${REPO} { ${consulta} } }`);
  const mapa = new Map();
  vivas.forEach((f, i) => {
    try {
      const datos = JSON.parse(repository[`f${i}`]?.text ?? "null");
      const titulo = datos?.titulo || datos?.nombre;
      if (titulo) mapa.set(f.ruta, String(titulo).trim());
    } catch {
      // Sin título: se usa el del fichero
    }
  });
  return mapa;
};

export const ultimosCambios = async (env, { ahora = Date.now() } = {}) => {
  const cambios = juntar((await listarCommits(env)).map(leer).filter(Boolean)).slice(0, CUANTOS);
  if (!cambios.length) return { texto: "No hay guardados recientes del CMS." };

  const titulo = await titulos(env, cambios.filter((c) => c.tipo === "ficha"));
  const tituloDe = (c) => titulo.get(c.ruta) ?? deSlug(c.id);
  const lineas = cambios.map((c) => {
    // De los guardados juntados, la fecha es la del más nuevo
    const quien = `${ICONOS[c.accion]} ${nombres(c.autores)}, ${hace(c.fecha, ahora)}`;
    if (c.tipo === "ficha") {
      return elemento(tituloDe(c), `${TIPOS[c.coleccion] ?? c.coleccion} · ${quien}`);
    }
    if (c.tipo === "archivo") {
      const que = c.cuantos === 1 ? "1 archivo" : `${c.cuantos} archivos`;
      return elemento(`${que} ${c.accion === "Delete" ? "borrados" : "subidos"}`, `Imágenes y documentos · ${quien}`);
    }
    return elemento(c.ruta.split("/").pop(), `Configuración · ${quien}`);
  });

  // Un botón para abrir cada ficha que sigue existiendo (una vez cada una)
  const botones = cambios
    .filter((c) => c.tipo === "ficha" && c.accion !== "Delete")
    .filter((c, i, todas) => todas.findIndex((o) => o.ruta === c.ruta) === i)
    .slice(0, 3)
    .map((c) => {
      const titulo = tituloDe(c);
      return [
        {
          text: `📝 ${titulo.length > 28 ? `${titulo.slice(0, 27)}…` : titulo}`,
          url: `${CMS}/${c.coleccion}/edit/${encodeURIComponent(c.ruta)}`,
        },
      ];
    });

  return {
    texto: [`🗂 <b>Los últimos ${cambios.length} cambios en el CMS</b>`, lineas.join(LISTA), "<i>➕ creado · ✏️ cambiado · 🗑 borrado</i>"].join(
      "\n\n",
    ),
    botones,
  };
};
