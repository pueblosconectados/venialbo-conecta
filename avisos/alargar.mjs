// Alarga 30 días un anuncio del Tablón: lo que hace el botón «⏳ +30 días» del aviso de
// lo que caduca y de /caducan en el grupo de Telegram (avisos/worker/src/caducidad.js).
// Lo lanza el workflow alargar.yml.
//
//   node avisos/alargar.mjs <ruta> <último día que se veía>
//   node avisos/alargar.mjs --avisar     cuenta en el grupo lo que ha pasado
//
// Solo alarga si el anuncio sigue caducando el día que decía el aviso: si alguien le ha
// cambiado la fecha entretanto, o ya se ha alargado, no hace nada y lo dice. Así dos
// toques no suman 60 días. La fecha nueva es ese día más 30; la hora («Hasta las»), si
// la tenía, se queda. Un anuncio de vecinos sin fecha caduca a los 30 días de publicarse
// (caducidadDe en build-content.mjs): se le pone la fecha.
//
// Commitea y empuja él mismo (guardar-ficha.mjs); el workflow lanza después la
// publicación.
//
// Sin dependencias. El registro de la Action es público: solo se imprime la ruta.

import { appendFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contarAlWorker, guardarFicha, leerFicha, RAIZ, sumarDias } from "./guardar-ficha.mjs";

const RESULTADO = join(RAIZ, ".alargar-resultado.json");
const RUTA_ANUNCIO = /^web-static\/content\/anuncios\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS = 30;
// Los mismos que DIAS_ANUNCIO en build-content.mjs
const DIAS_ANUNCIO = 30;

// El último día que se ve, como lo calcula la build; null si no caduca
export const ultimoDia = (f) => {
  if (f.fecha_caducidad) return String(f.fecha_caducidad).slice(0, 10);
  if (f.tipo === "informacion") return null;
  return sumarDias(f.fecha_publicacion ?? "", DIAS_ANUNCIO);
};

const alargar = async (ruta, desde) => {
  if (!RUTA_ANUNCIO.test(ruta ?? "") || ruta.includes("..")) return { estado: "error", mensaje: "la ruta no es de un anuncio" };
  const leida = await leerFicha(ruta);
  if (!leida) return { estado: "error", ruta, mensaje: "el anuncio ya no existe" };
  if (!FECHA.test(desde ?? "")) return { estado: "error", ruta, mensaje: "la fecha del aviso no es válida" };
  const { ficha } = leida;
  const titulo = String(ficha.titulo ?? "").trim() || undefined;
  const ahora = ultimoDia(ficha);
  if (ahora !== desde) return { estado: "cambiada", ruta, titulo, ...(ahora ? { hasta: ahora } : {}) };

  const hasta = sumarDias(desde, DIAS);
  ficha.fecha_caducidad = hasta;
  const guardado = await guardarFicha(ruta, leida, `Alargar ${ruta} (desde Telegram)`);
  if (guardado === "hecho") return { estado: "hecho", ruta, titulo, hasta };
  if (guardado === "cambiada") return { estado: "cambiada", ruta, titulo };
  return { estado: "error", ruta, titulo, mensaje: guardado };
};

if (process.argv[2] === "--avisar") {
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8").catch(() => '{"estado":"error"}'));
  if (!resultado.ruta) throw new Error("No hay resultado que contar");
  await contarAlWorker("/alargado", resultado);
} else {
  const [ruta, desde] = process.argv.slice(2);
  let resultado;
  try {
    resultado = await alargar(ruta, desde);
  } catch (e) {
    console.error(e.message);
    resultado = { estado: "error", ...(RUTA_ANUNCIO.test(ruta ?? "") ? { ruta } : {}), mensaje: "ha fallado algo en la Action" };
  }
  await writeFile(RESULTADO, JSON.stringify(resultado), "utf8");
  console.log(`${ruta}: ${resultado.estado}${resultado.hasta ? ` (hasta el ${resultado.hasta})` : ""}${resultado.mensaje ? `. ${resultado.mensaje}` : ""}`);
  if (process.env.GITHUB_OUTPUT && resultado.estado === "hecho") appendFileSync(process.env.GITHUB_OUTPUT, "hecho=1\n");
}
