// Vuelve una ficha a como estaba en un commit anterior: lo que hace el botón «↩️ Sí,
// deshacer» de /deshacer en el grupo de Telegram (avisos/worker/src/deshacer.js). Lo
// lanza el workflow deshacer.yml.
//
//   node avisos/deshacer.mjs <ruta> <commit de antes> <sha esperado | ninguno>
//   node avisos/deshacer.mjs --avisar     cuenta en el grupo lo que ha pasado
//
// Solo toca la ficha si sigue como estaba cuando salió el botón (su SHA es el esperado):
// si alguien la ha guardado entretanto, no hace nada y lo dice. Lo comprueba otra vez
// justo antes de empujar, por si el CMS guarda mientras tanto. Commitea y empuja él
// mismo; el workflow lanza después la publicación.
//
// Sin dependencias. El registro de la Action es público: solo se imprime la ruta.

import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const RESULTADO = join(RAIZ, ".deshacer-resultado.json");
const RUTA_FICHA = /^web-static\/content\/[a-z]+\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const INTENTOS = 3;

const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const intentar = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

// El SHA del fichero en una versión, o "ninguno" si ahí no existe
const shaEn = (version, ruta) => intentar("rev-parse", "--verify", "--quiet", `${version}:${ruta}`) ?? "ninguno";

const tituloDe = (texto) => {
  try {
    const f = JSON.parse(texto);
    return String(f.titulo || f.nombre || "").trim() || undefined;
  } catch {
    return undefined;
  }
};

const deshacer = async (ruta, base, esperado) => {
  if (!RUTA_FICHA.test(ruta ?? "") || ruta.includes("..")) return { estado: "error", mensaje: "la ruta no es de una ficha" };
  if (!/^[0-9a-f]{40}$/.test(base ?? "")) return { estado: "error", mensaje: "el commit de antes no es válido" };
  if (!/^([0-9a-f]{40}|ninguno)$/.test(esperado ?? "")) return { estado: "error", mensaje: "el SHA esperado no es válido" };

  // El checkout es superficial: el commit de antes se trae aparte
  git("fetch", "--quiet", "--depth=1", "origin", base);
  const antes = intentar("show", `${base}:${ruta}`);
  const ahora = intentar("show", `HEAD:${ruta}`);
  const titulo = tituloDe(ahora ?? "") ?? tituloDe(antes ?? "");
  if (shaEn("HEAD", ruta) !== esperado) return { estado: "cambiada", ruta, titulo };
  if (antes === null && ahora === null) return { estado: "error", ruta, titulo, mensaje: "no existe ni antes ni ahora" };

  const fichero = join(RAIZ, ruta);
  let efecto;
  if (antes === null) {
    await rm(fichero);
    efecto = "borrada";
  } else {
    // Tal cual estaba, byte a byte: el commit no cambia nada más
    await writeFile(fichero, execFileSync("git", ["show", `${base}:${ruta}`], { cwd: RAIZ }));
    efecto = ahora === null ? "recuperada" : "restaurada";
  }
  git("add", "-A", "--", ruta);
  // diff --quiet sale con error si hay cambios: sin error, es que no hay nada
  if (intentar("diff", "--cached", "--quiet") !== null) return { estado: "error", ruta, titulo, mensaje: "no hay nada que cambiar" };
  git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "--quiet", "-m", `Deshacer ${ruta} (desde Telegram)`);

  // El CMS commitea en main por su cuenta: antes de empujar, que nadie haya tocado la
  // ficha, y rebasar sobre lo demás
  for (let intento = 1; intento <= INTENTOS; intento++) {
    git("fetch", "--quiet", "origin", "main");
    if (shaEn("origin/main", ruta) !== esperado) return { estado: "cambiada", ruta, titulo };
    if (intentar("rebase", "--quiet", "origin/main") === null) {
      intentar("rebase", "--abort");
      return { estado: "error", ruta, titulo, mensaje: "no se ha podido juntar con lo último de main" };
    }
    if (intentar("push", "--quiet", "origin", "HEAD:main") !== null) return { estado: "hecho", ruta, titulo, efecto };
  }
  return { estado: "error", ruta, titulo, mensaje: "GitHub no ha aceptado el push" };
};

if (process.argv[2] === "--avisar") {
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8").catch(() => '{"estado":"error"}'));
  const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  if (!resultado.ruta) throw new Error("No hay resultado que contar");
  const r = await fetch(`${WORKER}/deshecho`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(resultado),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
} else {
  const [ruta, base, esperado] = process.argv.slice(2);
  let resultado;
  try {
    resultado = await deshacer(ruta, base, esperado);
  } catch (e) {
    console.error(e.message);
    resultado = { estado: "error", ...(RUTA_FICHA.test(ruta ?? "") ? { ruta } : {}), mensaje: "ha fallado algo en la Action" };
  }
  await writeFile(RESULTADO, JSON.stringify(resultado), "utf8");
  console.log(`${ruta}: ${resultado.estado}${resultado.efecto ? ` (${resultado.efecto})` : ""}${resultado.mensaje ? `. ${resultado.mensaje}` : ""}`);
  if (process.env.GITHUB_OUTPUT && resultado.estado === "hecho") appendFileSync(process.env.GITHUB_OUTPUT, "hecho=1\n");
}
