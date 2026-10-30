// Pasa un anuncio de la sede electrónica del Ayuntamiento al Tablón: lo que hace el botón
// «📋 Pasar al Tablón» de los avisos de la sede en el grupo de Telegram
// (avisos/worker/src/sede.js). Lo lanza el workflow sede-tablon.yml.
//
//   node avisos/sede-tablon.mjs <uuid> [<mensaje>]   crea la ficha (mensaje: el aviso
//                                                    al que se contesta en el grupo)
//   node avisos/sede-tablon.mjs <uuid> --dry         la baja y la enseña, sin escribir
//   node avisos/sede-tablon.mjs --avisar             cuenta en el grupo lo que ha pasado
//
// La ficha entra **oculta**, de tipo Información, sin caducidad (se limpia a mano) y con
// el PDF en «Documentos para descargar». El PDF se queda en el historial de git para
// siempre: por eso solo entra cuando alguien lo ha visto y ha pulsado el botón.
//
// La página del documento, /preview-document/<uuid>, se abre sin sesión y trae el título
// y la dirección del PDF; el PDF solo se baja con la cookie de esa misma visita. El PDF
// lleva el principio del uuid en el nombre: así se sabe si ya se había pasado.
//
// Sin dependencias. El registro de la Action es público: solo se imprime lo que ya es
// público en la sede.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fechaHoraLocal, RAIZ, slugificar } from "../tally/comun.mjs";

const SEDE = "https://venialbo.sedelectronica.es";
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const ANUNCIOS = "web-static/content/anuncios";
const DOCUMENTOS = "web-static/public/media/documentos";
const RESULTADO = join(process.env.RUNNER_TEMP ?? tmpdir(), "sede-tablon-resultado.json");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ESPERA = 60_000;
// GitHub avisa a partir de 50 MB; un anuncio no debería pasar de unos pocos
const MAX_PDF = 25 * 1024 * 1024;
const CABECERAS = { "user-agent": "VenialboConecta (+https://venialboconecta.es/)" };

const entidades = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const texto = (html) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (todo, nombre) => entidades[nombre] ?? todo)
    .replace(/\s+/g, " ")
    .trim();

// Lo que la sede escribe en mayúsculas y hay que devolver a como se escribe
const PROPIOS = ["Venialbo", "Zamora", "Castilla y León", "Sacyl", "JCyL", "BOP", "BOE", "BOCyL", "IBI", "IVTM"];

// "ANUNCIO. TASA POR APROVECHAMIENTOS…" → "Tasa por aprovechamientos…". Solo si viene
// casi todo en mayúsculas: si no, ya lo ha escrito alguien con cuidado.
export const tituloBonito = (original) => {
  let t = original.replace(/^anuncio\s*[.:–-]\s*/i, "").trim() || original;
  const letras = t.replace(/[^\p{L}]/gu, "");
  const mayusculas = t.replace(/[^\p{Lu}]/gu, "");
  if (letras.length && mayusculas.length / letras.length > 0.7) {
    t = t.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase());
    for (const propio of PROPIOS) t = t.replace(new RegExp(`(?<!\\p{L})${propio}(?!\\p{L})`, "giu"), propio);
  }
  return t;
};

const pedir = async (url, cabeceras = {}) => {
  const respuesta = await fetch(url, { headers: { ...CABECERAS, ...cabeceras }, signal: AbortSignal.timeout(ESPERA) });
  if (!respuesta.ok) throw new Error(`la sede responde con un error (HTTP ${respuesta.status})`);
  return respuesta;
};

// { titulo, pdf } del documento
const leerDocumento = async (uuid) => {
  const pagina = await pedir(`${SEDE}/preview-document/${uuid}`);
  const cookie = pagina.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const html = await pagina.text();
  // Pasa con algunos (una hoja de Sacyl, por ejemplo): en el tablón salen, pero sueltos no
  if (/página solicitada se encuentra deshabilitada/i.test(html))
    throw new Error("la sede no deja abrir este documento fuera de su tablón; hay que pasarlo a mano");
  const titulo = texto(html.match(/<h1 class="c-h1[^"]*"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const ruta = html.match(/src="(\/preview\/pdf\/[^"]+)"/)?.[1];
  if (!titulo || !ruta) throw new Error("la sede ya no tiene ese documento, o ha cambiado la página");

  const respuesta = await pedir(`${SEDE}${ruta}`, { cookie, referer: `${SEDE}/preview-document/${uuid}` });
  if (Number(respuesta.headers.get("content-length")) > MAX_PDF) throw new Error("el PDF es demasiado grande para subirlo");
  const pdf = Buffer.from(await respuesta.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("la sede no ha dado un PDF");
  if (pdf.length > MAX_PDF) throw new Error("el PDF es demasiado grande para subirlo");
  return { titulo, pdf };
};

// La ficha que ya lleva ese PDF, si se había pasado antes
const yaPasada = async (marca) => {
  for (const fichero of (await readdir(join(RAIZ, ANUNCIOS))).filter((f) => f.endsWith(".json"))) {
    const ruta = `${ANUNCIOS}/${fichero}`;
    const contenido = await readFile(join(RAIZ, ruta), "utf8");
    if (contenido.includes(marca)) return { ruta, ficha: JSON.parse(contenido) };
  }
  return null;
};

// El primer nombre libre: "2026-10-30-tasa-por….json", "…-2.json"…
const nombreLibre = async (dir, base, extension) => {
  const existentes = new Set(await readdir(join(RAIZ, dir)));
  for (let n = 1; ; n++) {
    const nombre = `${base}${n > 1 ? `-${n}` : ""}${extension}`;
    if (!existentes.has(nombre)) return `${dir}/${nombre}`;
  }
};

const pasar = async (uuid, { dry }) => {
  const marca = `-${uuid.slice(0, 8)}.pdf`;
  const anterior = await yaPasada(marca);
  if (anterior)
    return {
      estado: "ya",
      mensaje: "ya estaba en el CMS",
      titulo: anterior.ficha.titulo,
      ruta: anterior.ruta,
      activo: anterior.ficha.activo === true,
    };

  const { titulo: original, pdf } = await leerDocumento(uuid);
  const titulo = tituloBonito(original);
  const ahora = fechaHoraLocal(new Date().toISOString());
  const slug = slugificar(titulo) || "anuncio-sede";
  const rutaPdf = `${DOCUMENTOS}/${slug}${marca}`;
  const ruta = await nombreLibre(ANUNCIOS, `${ahora.slice(0, 10)}-${slug}`, ".json");
  const ficha = {
    titulo,
    tipo: "informacion",
    descripcion: `Publicado por el Ayuntamiento en su [sede electrónica](${SEDE}/board). El documento, aquí abajo.`,
    documentos: [{ archivo: rutaPdf.replace("web-static/public", ""), titulo }],
    fecha_publicacion: ahora,
    fecha_caducidad: "",
    activo: false,
  };

  if (dry) {
    console.log(`«${original}»\n→ ${ruta}\n${JSON.stringify(ficha, null, 2)}\n→ ${rutaPdf} (${Math.round(pdf.length / 1024)} KB)`);
  } else {
    await writeFile(join(RAIZ, rutaPdf), pdf);
    await writeFile(join(RAIZ, ruta), `${JSON.stringify(ficha, null, 2)}\n`, "utf8");
  }
  return { estado: "hecho", mensaje: "creada", titulo, ruta, activo: false };
};

if (process.argv[2] === "--avisar") {
  // Después del push, o si algo ha fallado: que el grupo sepa cómo ha ido
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8").catch(() => '{"estado":"error","mensaje":"la Action ha fallado antes de terminar"}'));
  // En la Action, la ficha creada no vale de nada si el commit no ha llegado a main
  if (process.env.GITHUB_ACTIONS && resultado.estado === "hecho" && process.env.SUBIDO !== "1")
    Object.assign(resultado, { estado: "error", mensaje: "no se ha podido guardar en GitHub", ruta: undefined });
  const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  const r = await fetch(`${WORKER}/sede-tablon`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(resultado),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
} else {
  const [uuid, mensaje] = process.argv.slice(2);
  const dry = process.argv.includes("--dry");
  if (!UUID.test(uuid ?? "")) throw new Error("Uso: node avisos/sede-tablon.mjs <uuid del documento> [<mensaje>] [--dry]");
  const base = { documento: uuid, ...(/^\d{1,12}$/.test(mensaje ?? "") ? { mensaje_id: Number(mensaje) } : {}) };
  let resultado;
  try {
    resultado = { ...base, ...(await pasar(uuid, { dry })) };
  } catch (e) {
    resultado = { ...base, estado: "error", mensaje: String(e.message ?? e).slice(0, 300) };
  }
  if (!dry) await writeFile(RESULTADO, JSON.stringify(resultado), "utf8");
  console.log(`${uuid}: ${resultado.estado}. ${resultado.mensaje}${resultado.ruta ? `\nFicha: ${resultado.ruta}` : ""}`);
  if (resultado.estado === "hecho" && process.env.GITHUB_OUTPUT && !dry)
    await writeFile(process.env.GITHUB_OUTPUT, "hecho=1\n", { flag: "a" });
}
