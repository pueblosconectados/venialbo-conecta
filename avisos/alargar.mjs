// Alarga 30 días un anuncio del Tablón: lo que hace el botón «⏳ +30 días» del aviso de
// lo que caduca y de /caducan en el grupo de Telegram (avisos/worker/src/caducidad.js).
// Lo lanza el workflow alargar.yml.
//
//   node avisos/alargar.mjs <ruta> <último día que se veía> [<mensaje>]
//   node avisos/alargar.mjs --avisar     cuenta en el grupo lo que ha pasado
//
// Solo alarga si el anuncio sigue caducando el día que decía el aviso: si alguien le ha
// cambiado la fecha entretanto, o ya se ha alargado, no hace nada y lo dice. Así dos
// toques no suman 60 días. La fecha nueva es ese día más 30; la hora («Hasta las»), si
// la tenía, se queda. Un anuncio de vecinos sin fecha caduca a los 30 días de publicarse
// (caducidadDe en build-content.mjs): se le pone la fecha.
//
// Commitea y empuja él mismo, como deshacer.mjs, comprobando antes de empujar que nadie
// ha guardado la ficha mientras; el workflow lanza después la publicación.
//
// Sin dependencias. El registro de la Action es público: solo se imprime la ruta.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const RESULTADO = join(RAIZ, ".alargar-resultado.json");
const RUTA_ANUNCIO = /^web-static\/content\/anuncios\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS = 30;
// Los mismos que DIAS_ANUNCIO en build-content.mjs
const DIAS_ANUNCIO = 30;
const INTENTOS = 3;

const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const intentar = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};
const shaEn = (version, ruta) => intentar("rev-parse", "--verify", "--quiet", `${version}:${ruta}`) ?? "ninguno";

const sumarDias = (dia, dias) => {
  const fecha = new Date(`${String(dia).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

// El último día que se ve, como lo calcula la build; null si no caduca
export const ultimoDia = (f) => {
  if (f.fecha_caducidad) return String(f.fecha_caducidad).slice(0, 10);
  if (f.tipo === "informacion") return null;
  return sumarDias(f.fecha_publicacion ?? "", DIAS_ANUNCIO);
};

const alargar = async (ruta, desde) => {
  if (!RUTA_ANUNCIO.test(ruta ?? "") || ruta.includes("..")) return { estado: "error", mensaje: "la ruta no es de un anuncio" };
  const fichero = join(RAIZ, ruta);
  const texto = await readFile(fichero, "utf8").catch(() => null);
  if (texto === null) return { estado: "error", ruta, mensaje: "el anuncio ya no existe" };
  if (!FECHA.test(desde ?? "")) return { estado: "error", ruta, mensaje: "la fecha del aviso no es válida" };
  const ficha = JSON.parse(texto);
  const titulo = String(ficha.titulo ?? "").trim() || undefined;
  const ahora = ultimoDia(ficha);
  if (ahora !== desde) return { estado: "cambiada", ruta, titulo, ...(ahora ? { hasta: ahora } : {}) };

  const hasta = sumarDias(desde, DIAS);
  const esperado = shaEn("HEAD", ruta);
  ficha.fecha_caducidad = hasta;
  await writeFile(fichero, `${JSON.stringify(ficha, null, 2)}${texto.endsWith("\n") ? "\n" : ""}`, "utf8");
  git("add", "--", ruta);
  git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "--quiet", "-m", `Alargar ${ruta} (desde Telegram)`);

  // El CMS commitea en main por su cuenta: antes de empujar, que nadie haya tocado la
  // ficha, y rebasar sobre lo demás
  for (let intento = 1; intento <= INTENTOS; intento++) {
    git("fetch", "--quiet", "origin", "main");
    if (shaEn("origin/main", ruta) !== esperado) return { estado: "cambiada", ruta, titulo };
    if (intentar("rebase", "--quiet", "origin/main") === null) {
      intentar("rebase", "--abort");
      return { estado: "error", ruta, titulo, mensaje: "no se ha podido juntar con lo último de main" };
    }
    if (intentar("push", "--quiet", "origin", "HEAD:main") !== null) return { estado: "hecho", ruta, titulo, hasta };
  }
  return { estado: "error", ruta, titulo, mensaje: "GitHub no ha aceptado el push" };
};

if (process.argv[2] === "--avisar") {
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8").catch(() => '{"estado":"error"}'));
  if (!resultado.ruta) throw new Error("No hay resultado que contar");
  if (/^\d{1,12}$/.test(process.env.MENSAJE ?? "")) resultado.mensaje_id = Number(process.env.MENSAJE);
  const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  const r = await fetch(`${WORKER}/alargado`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(resultado),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
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
