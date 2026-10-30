// Guardar en main el cambio de una ficha desde una Action lanzada por Telegram
// (alargar.mjs, retirar.mjs): commitea y empuja, comprobando antes de empujar que nadie
// ha guardado esa ficha mientras tanto. El CMS commitea en main por su cuenta, así que
// rebasa sobre lo demás y lo reintenta.

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
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

export const sumarDias = (dia, dias) => {
  const fecha = new Date(`${String(dia).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

// "2026-10-30" en la hora del pueblo
export const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

// { texto, ficha } de la ficha en el checkout, o null si no existe
export const leerFicha = async (ruta) => {
  const texto = await readFile(join(RAIZ, ruta), "utf8").catch(() => null);
  return texto === null ? null : { texto, ficha: JSON.parse(texto) };
};

// Escribe la ficha (con 2 espacios, como el CMS, y el salto final si lo tenía), la
// commitea y la empuja. Devuelve "hecho", "cambiada" (alguien la guardó entretanto) o
// un mensaje de error.
export const guardarFicha = async (ruta, { texto, ficha }, mensaje) => {
  const esperado = shaEn("HEAD", ruta);
  await writeFile(join(RAIZ, ruta), `${JSON.stringify(ficha, null, 2)}${texto.endsWith("\n") ? "\n" : ""}`, "utf8");
  git("add", "--", ruta);
  git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "--quiet", "-m", mensaje);
  for (let intento = 1; intento <= INTENTOS; intento++) {
    git("fetch", "--quiet", "origin", "main");
    if (shaEn("origin/main", ruta) !== esperado) return "cambiada";
    if (intentar("rebase", "--quiet", "origin/main") === null) {
      intentar("rebase", "--abort");
      return "no se ha podido juntar con lo último de main";
    }
    if (intentar("push", "--quiet", "origin", "HEAD:main") !== null) return "hecho";
  }
  return "GitHub no ha aceptado el push";
};

// Le cuenta al Worker cómo ha ido (POST <ruta>), con el id del aviso al que contestar
export const contarAlWorker = async (camino, resultado) => {
  if (/^\d{1,12}$/.test(process.env.MENSAJE ?? "")) resultado.mensaje_id = Number(process.env.MENSAJE);
  const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  const r = await fetch(`${WORKER}${camino}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(resultado),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
};
