// Retira un anuncio del Tablón que alguien ha pedido quitar por el formulario de
// contacto: lo que hace el botón del aviso en el grupo de Telegram
// (avisos/worker/src/retirar.js). Lo lanza el workflow retirar.yml.
//
//   node avisos/retirar.mjs <ruta>       retira la ficha
//   node avisos/retirar.mjs --avisar     cuenta en el grupo lo que ha pasado
//
// - Un anuncio (content/anuncios) se oculta: `activo: false`. No se borra, y /deshacer
//   lo vuelve a poner.
// - Una casa (content/casas) no se quita al momento: se pone «Vendida o alquilada el» a
//   hoy, y sale con el sello una semana antes de irse sola (DIAS_VENDIDA en
//   build-content.mjs), como dice la web junto al enlace.
//
// Si ya estaba oculto, o la casa ya tenía fecha, no toca nada y lo dice. Commitea y
// empuja él mismo (guardar-ficha.mjs); el workflow lanza después la publicación.
//
// Sin dependencias. El registro de la Action es público: solo se imprime la ruta.

import { appendFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contarAlWorker, guardarFicha, hoyMadrid, leerFicha, RAIZ } from "./guardar-ficha.mjs";

const RESULTADO = join(RAIZ, ".retirar-resultado.json");
const RUTA = /^web-static\/content\/(anuncios|casas)\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

const retirar = async (ruta) => {
  if (!RUTA.test(ruta ?? "") || ruta.includes("..")) return { estado: "error", mensaje: "la ruta no es de un anuncio ni de una casa" };
  const leida = await leerFicha(ruta);
  if (!leida) return { estado: "error", ruta, mensaje: "ya no existe" };
  const { ficha } = leida;
  const titulo = String(ficha.titulo ?? "").trim() || undefined;
  const casa = ruta.includes("/casas/");

  if (ficha.activo === false) return { estado: "ya", ruta, titulo, efecto: "oculta" };
  if (casa && ficha.vendida) return { estado: "ya", ruta, titulo, efecto: "vendida", vendida: String(ficha.vendida).slice(0, 10) };
  if (casa) ficha.vendida = hoyMadrid();
  else ficha.activo = false;

  const guardado = await guardarFicha(ruta, leida, `Retirar ${ruta} (desde Telegram)`);
  const efecto = casa ? "vendida" : "oculta";
  if (guardado === "hecho") return { estado: "hecho", ruta, titulo, efecto, ...(casa ? { vendida: ficha.vendida } : {}) };
  if (guardado === "cambiada") return { estado: "error", ruta, titulo, mensaje: "alguien la ha guardado mientras tanto" };
  return { estado: "error", ruta, titulo, mensaje: guardado };
};

if (process.argv[2] === "--avisar") {
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8").catch(() => '{"estado":"error"}'));
  if (!resultado.ruta) throw new Error("No hay resultado que contar");
  await contarAlWorker("/retirado", resultado);
} else {
  const [ruta] = process.argv.slice(2);
  let resultado;
  try {
    resultado = await retirar(ruta);
  } catch (e) {
    console.error(e.message);
    resultado = { estado: "error", ...(RUTA.test(ruta ?? "") ? { ruta } : {}), mensaje: "ha fallado algo en la Action" };
  }
  await writeFile(RESULTADO, JSON.stringify(resultado), "utf8");
  console.log(`${ruta}: ${resultado.estado}${resultado.efecto ? ` (${resultado.efecto})` : ""}${resultado.mensaje ? `. ${resultado.mensaje}` : ""}`);
  if (process.env.GITHUB_OUTPUT && resultado.estado === "hecho") appendFileSync(process.env.GITHUB_OUTPUT, "hecho=1\n");
}
