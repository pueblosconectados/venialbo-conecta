// Lo que comparten los scripts de tally/: la clave, los uuid estables, las llamadas a
// la API y la cuenta de lo ya importado.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(AQUI, "..");
export const API = "https://api.tally.so";

const FICHERO_IDS = join(AQUI, "formularios-creados.json");
const FICHERO_IMPORTADAS = join(AQUI, "respuestas-importadas.json");

// El repositorio es público y los registros de Actions también, así que cuando esto
// corre ahí no se imprime nada personal: ni quién manda la ficha ni el enlace de su
// foto, que va firmado y abre la imagen a cualquiera que lo lea.
export const DISCRETO =
  process.argv.includes("--discreto") || process.env.CI === "true";

export const leerClave = async () => {
  if (process.env.TALLY_API_KEY) return process.env.TALLY_API_KEY.trim();
  const ruta = process.env.TALLY_API_KEY_FILE ?? join(homedir(), ".config/tally/api-key");
  const clave = await readFile(ruta, "utf8").catch(() => null);
  if (!clave) throw new Error(`No hay clave: ni TALLY_API_KEY ni ${ruta}`);
  return clave.trim();
};

// Los uuid de los bloques se derivan del nombre del formulario y del campo (uuid v5),
// no son aleatorios. Además de evitar duplicados al actualizar, esto permite el camino
// de vuelta: una respuesta de desplegable llega como el uuid de su opción, y sabiendo
// cómo se generan se traduce a la clave que usa el CMS.
const NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";
export const uuidEstable = (...partes) => {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(partes.join("/"), "utf8")]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // versión 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Nombre de fichero como lo haría Pages CMS con su "rename: safe"
export const slugificar = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const pedirJson = async (clave, ruta) => {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${clave}` },
  });
  if (!respuesta.ok) {
    throw new Error(`GET ${ruta} → HTTP ${respuesta.status}: ${await respuesta.text()}`);
  }
  return respuesta.json();
};

export const idDelFormulario = async (slug) => {
  const ids = JSON.parse(await readFile(FICHERO_IDS, "utf8"));
  const id = ids[slug]?.id;
  if (!id) throw new Error(`No sé el id de "${slug}": no está en formularios-creados.json`);
  return id;
};

// { negocios: [ids...], tablon: [ids...] }. La primera versión era una lista suelta,
// de cuando solo se importaban negocios: se migra al vuelo.
export const leerImportadas = async () => {
  const crudo = await readFile(FICHERO_IMPORTADAS, "utf8").catch(() => null);
  if (!crudo) return {};
  const datos = JSON.parse(crudo);
  return Array.isArray(datos) ? { negocios: datos } : datos;
};

export const guardarImportadas = async (datos) => {
  await writeFile(FICHERO_IMPORTADAS, `${JSON.stringify(datos, null, 2)}\n`, "utf8");
};

export const existe = async (ruta) =>
  readFile(ruta, "utf8").then(
    () => true,
    () => false,
  );

// Fecha de la respuesta en la hora del pueblo, no en UTC: si alguien publica un anuncio
// a las 00:30 de un martes, la ficha no debe decir que fue el lunes.
const EN_MADRID = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// "2026-09-22T16:19" — el formato que el CMS pide para las fechas con hora
export const fechaHoraLocal = (iso) => EN_MADRID.format(new Date(iso)).replace(" ", "T");
export const fechaLocal = (iso) => fechaHoraLocal(iso).slice(0, 10);

export const sumarDias = (iso, dias) =>
  fechaLocal(new Date(new Date(iso).getTime() + dias * 86400000).toISOString());
