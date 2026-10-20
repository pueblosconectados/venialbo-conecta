// /buscar <texto>: busca en todo lo que se ve en la web y devuelve las fichas con lo que
// suele hacer falta desde el móvil (el teléfono de un negocio, el contacto de un
// anuncio…) y botones a la ficha en la web y en el CMS.
//
// Busca en los listados que publica la web (data/<recurso>.json): son públicos, no
// hace falta token, y son lo que ve un vecino. Lo oculto o caducado no sale. Sin
// distinguir mayúsculas ni tildes, y por el principio de las palabras ("toca" encuentra
// "Toca" y "tocar", no "autocaravanas"); con varias, tienen que estar todas. Primero las
// que coinciden en el título.

import { elemento, escapaHtml, LISTA } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const MAX = 5;

// recurso → cómo se llama, dónde está en la web (null: no tiene página propia)
const RECURSOS = {
  negocios: { tipo: "Negocio", ruta: "/negocios/" },
  servicios: { tipo: "Servicio", ruta: "/servicios/" },
  anuncios: { tipo: "Anuncio", ruta: "/tablon/" },
  noticias: { tipo: "Noticia", ruta: "/noticias/" },
  actividades: { tipo: "Actividad", ruta: "/actividades/" },
  lugares: { tipo: "Lugar", ruta: "/descubre/lugares/" },
  rutas: { tipo: "Ruta", ruta: "/descubre/rutas/" },
  avisos: { tipo: "Aviso", ruta: null },
};

const normaliza = (texto) =>
  String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Todo el texto de una ficha, también lo anidado (horarios, contactos…), menos rutas de
// imágenes y enlaces, que dan coincidencias absurdas
const textoDe = (valor) => {
  if (typeof valor === "string") return /^(\/media\/|https?:\/\/)/.test(valor) ? "" : valor;
  if (Array.isArray(valor)) return valor.map(textoDe).join(" ");
  if (valor && typeof valor === "object") return Object.values(valor).map(textoDe).join(" ");
  return "";
};

const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const formatoDia = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Lo que se enseña debajo del título: lo útil de cada tipo
const detalle = (recurso, f) => {
  const partes = [];
  const telefonos = Object.entries(f)
    .filter(([k, v]) => k.startsWith("telefono") && typeof v === "string" && v.trim())
    .map(([, v]) => v.trim());
  if (telefonos.length) partes.push(`📞 ${telefonos.join(" · ")}`);
  if (f.email) partes.push(`✉️ ${f.email}`);
  if (recurso === "anuncios" && f.contacto) partes.push(`📞 ${String(f.contacto).trim()}`);
  if (recurso === "actividades" && f.fecha) partes.push(`📅 ${formatoDia.format(new Date(`${f.fecha}T12:00:00Z`))}`);
  if (!partes.length && f.direccion) partes.push(`📍 ${f.direccion}`);
  return partes.map(escapaHtml).join("\n   ");
};

const recorta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

export const buscar = async (consulta) => {
  const palabras = normaliza(consulta).split(/\s+/).filter((p) => p.length > 1);
  if (!palabras.length) {
    return { texto: "Dime qué buscar, por ejemplo: <code>/buscar panadería</code> o <code>/buscar fiestas agosto</code>" };
  }

  const hoy = hoyMadrid();
  const listas = await Promise.all(
    Object.keys(RECURSOS).map(async (recurso) => {
      const respuesta = await fetch(`${WEB}/data/${recurso}.json`, { cache: "no-store" });
      return respuesta.ok ? (await respuesta.json()).map((f) => ({ recurso, f })) : [];
    }),
  );

  const encontrados = listas
    .flat()
    // Lo caducado sigue en el listado (la web lo quita al visitarla): aquí tampoco sale
    .filter(({ f }) => !(typeof f.fecha_caducidad === "string" && f.fecha_caducidad.slice(0, 10) < hoy))
    .map(({ recurso, f }) => {
      const titulo = String(f.titulo ?? f.nombre ?? f.id).trim();
      const delTitulo = normaliza(titulo).split(/[^a-z0-9ñ]+/);
      const todas = [...delTitulo, ...normaliza(textoDe(f)).split(/[^a-z0-9ñ]+/)];
      const esta = (lista, p) => lista.some((w) => w.startsWith(p));
      if (!palabras.every((p) => esta(todas, p))) return null;
      return { recurso, f, titulo, puntos: palabras.filter((p) => esta(delTitulo, p)).length };
    })
    .filter(Boolean)
    .sort((a, b) => b.puntos - a.puntos);

  if (!encontrados.length) {
    return { texto: `No encuentro nada con «${escapaHtml(consulta)}» en la web. Lo oculto o caducado no sale.` };
  }

  const mostrados = encontrados.slice(0, MAX);
  const lineas = mostrados.map(({ recurso, f, titulo }) => {
    const extra = detalle(recurso, f);
    // La fecha de publicación, para distinguir anuncios y noticias con el mismo título
    const publicado =
      (recurso === "anuncios" || recurso === "noticias") && f.fecha_publicacion
        ? ` · publicado el ${formatoDia.format(new Date(`${f.fecha_publicacion.slice(0, 10)}T12:00:00Z`))}`
        : "";
    return elemento(titulo, `${RECURSOS[recurso].tipo}${publicado}${extra ? `\n   ${extra}` : ""}`);
  });

  // Por resultado, una fila: la ficha en la web (si tiene página) y en el CMS
  const botones = mostrados.map(({ recurso, f, titulo }) => [
    ...(RECURSOS[recurso].ruta ? [{ text: `🌐 ${recorta(titulo, 22)}`, url: `${WEB}${RECURSOS[recurso].ruta}${f.id}` }] : []),
    {
      text: RECURSOS[recurso].ruta ? "📝 CMS" : `📝 ${recorta(titulo, 22)}`,
      url: `${CMS}/${recurso}/edit/${encodeURIComponent(`web-static/content/${recurso}/${f.id}.json`)}`,
    },
  ]);

  const cabecera =
    encontrados.length > MAX
      ? `🔎 <b>${encontrados.length} resultados para «${escapaHtml(consulta)}»</b>, los ${MAX} primeros:`
      : `🔎 <b>${encontrados.length === 1 ? "1 resultado" : `${encontrados.length} resultados`} para «${escapaHtml(consulta)}»</b>`;
  return { texto: [cabecera, lineas.join(LISTA)].join("\n\n"), botones };
};
