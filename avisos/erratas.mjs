// Busca posibles faltas de ortografía en lo que se acaba de guardar en el CMS y las manda
// al grupo de Telegram, con un botón a cada ficha en el CMS para corregirla. Lo lanza
// .github/workflows/erratas.yml en cada push que toca web-static/content/.
//
//   node avisos/erratas.mjs <desde> <hasta>   lo cambiado entre esos dos commits
//   node avisos/erratas.mjs --todo            todo el contenido (para ajustar la lista)
//
//   --dry   enseña el mensaje, sin mandarlo
//
// Lo revisa LanguageTool (su API pública y gratuita: ortografía y gramática). De cada
// ficha cambiada solo se miran los campos de texto que han cambiado: si no, una palabra
// que se decidió dejar volvería a salir cada vez que alguien tocara la ficha. Las
// palabras del pueblo y los nombres propios que no conoce van en erratas-palabras.txt.
//
// Si LanguageTool no responde, no se avisa y la Action no falla: es una ayuda, no un
// control. Nada de esto toca la publicación de la web.

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENIDO = "web-static/content";
const PALABRAS = join(RAIZ, "avisos", "erratas-palabras.txt");
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const LANGUAGETOOL = "https://api.languagetool.org/v2/check";

const DRY = process.argv.includes("--dry");
const TODO = process.argv.includes("--todo");
const [desde, hasta] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

// Cómo se llama cada colección en el mensaje. Las categorías no tienen texto que revisar.
const TIPOS = {
  noticias: "noticia",
  actividades: "actividad",
  anuncios: "anuncio",
  casas: "casa",
  avisos: "aviso de portada",
  negocios: "negocio",
  servicios: "servicio",
  lugares: "lugar",
  rutas: "ruta",
  fechas: "fecha",
  enlaces: "enlace",
};

// Los campos que se leen en la web. Direcciones, teléfonos, horarios… no: están llenos de
// nombres de calles y abreviaturas que darían avisos sin sentido.
const CAMPOS = new Set([
  "titulo", "nombre", "resumen", "descripcion", "contenido", "pie", "nota",
  "como_visitar", "recomendaciones", "informacion_adicional",
]);

// Lo que LanguageTool señala pero aquí no es un error: estilo, tipografía (comillas
// rectas, espacios) y las mayúsculas, que en títulos y nombres propios son a propósito
const CATEGORIAS_FUERA = new Set(["STYLE", "TYPOGRAPHY", "CASING", "REDUNDANCY", "REPETITIONS_STYLE"]);
const REGLAS_FUERA = new Set([
  "WHITESPACE_RULE",
  "UPPERCASE_SENTENCE_START",
  "COMMA_PARENTHESIS_WHITESPACE",
  "DOUBLE_PUNCTUATION",
]);

// ── El texto de cada ficha ──────────────────────────────────────────────────

// El Markdown fuera: de un enlace queda su texto; las imágenes y las direcciones sueltas
// se quitan, que no son texto
const sinMarkdown = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>`]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

// Los textos de una ficha, campo a campo, también lo anidado (pies de foto…):
// Map de "galeria.0.pie" → texto
const textos = (valor, ruta = "", salida = new Map()) => {
  if (Array.isArray(valor)) valor.forEach((v, i) => textos(v, `${ruta}.${i}`, salida));
  else if (valor && typeof valor === "object")
    for (const [k, v] of Object.entries(valor)) textos(v, ruta ? `${ruta}.${k}` : k, salida);
  else if (typeof valor === "string" && CAMPOS.has(ruta.split(".").at(-1))) {
    const t = sinMarkdown(valor);
    if (t) salida.set(ruta, t);
  }
  return salida;
};

const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" });

const leerFicha = (texto) => {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
};

// Las fichas a revisar: [{ recurso, id, ficha, campos: Map }]
const cambiadas = async () => {
  if (TODO) {
    const fichas = [];
    for (const recurso of Object.keys(TIPOS)) {
      const dir = join(RAIZ, CONTENIDO, recurso);
      for (const f of (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"))) {
        const ficha = leerFicha(await readFile(join(dir, f), "utf8"));
        if (ficha) fichas.push({ recurso, id: f.replace(/\.json$/, ""), ficha, campos: textos(ficha) });
      }
    }
    return fichas;
  }

  // Un push que crea la rama no trae «antes» (todo ceros): se compara con el commit anterior
  const base = /^0+$/.test(desde) ? `${hasta}~1` : desde;
  const rutas = git("diff", "--name-only", "--diff-filter=AM", base, hasta, "--", CONTENIDO)
    .split("\n")
    .filter((r) => r.endsWith(".json"));
  const fichas = [];
  for (const ruta of rutas) {
    const [, recurso, fichero] = ruta.match(/^web-static\/content\/([^/]+)\/([^/]+)\.json$/) ?? [];
    if (!TIPOS[recurso]) continue;
    const ficha = leerFicha(git("show", `${hasta}:${ruta}`));
    if (!ficha) continue;
    // Lo que había antes; si la ficha es nueva, nada
    let antes = new Map();
    try {
      antes = textos(leerFicha(git("show", `${base}:${ruta}`)) ?? {});
    } catch {}
    const campos = new Map([...textos(ficha)].filter(([campo, t]) => antes.get(campo) !== t));
    if (campos.size) fichas.push({ recurso, id: fichero, ficha, campos });
  }
  return fichas;
};

// ── La revisión ─────────────────────────────────────────────────────────────

const normaliza = (t) => t.toLowerCase().normalize("NFC");

const leerPalabras = async () =>
  new Set(
    (await readFile(PALABRAS, "utf8").catch(() => ""))
      .split("\n")
      .map((l) => l.replace(/#.*/, "").trim())
      .filter(Boolean)
      .map(normaliza),
  );

// Cada campo se manda como un párrafo. Varias fichas van juntas en una petición, sin
// pasar de MAX_PETICION, y se apunta dónde empieza cada trozo para saber de quién es
// cada error. Entre peticiones se espera: la API gratuita admite unas 20 por minuto.
const MAX_PETICION = 15000;
const ESPERA_MS = 3500;

const revisar = async (fichas, palabras) => {
  const trozos = fichas.flatMap((f, n) => [...f.campos.values()].map((texto) => ({ n, texto })));
  const lotes = [];
  for (const t of trozos) {
    const lote = lotes.at(-1);
    if (!lote || lote.largo + t.texto.length > MAX_PETICION) lotes.push({ trozos: [t], largo: t.texto.length });
    else (lote.trozos.push(t), (lote.largo += t.texto.length + 2));
  }

  const errores = fichas.map(() => []);
  for (const [i, lote] of lotes.entries()) {
    if (i) await new Promise((r) => setTimeout(r, ESPERA_MS));
    let inicio = 0;
    const tramos = lote.trozos.map((t) => {
      const tramo = { ...t, inicio };
      inicio += t.texto.length + 2;
      return tramo;
    });
    const respuesta = await fetch(LANGUAGETOOL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ language: "es", text: lote.trozos.map((t) => t.texto).join("\n\n") }),
    });
    if (!respuesta.ok) throw new Error(`LanguageTool: HTTP ${respuesta.status}`);
    for (const m of (await respuesta.json()).matches) {
      if (CATEGORIAS_FUERA.has(m.rule.category.id) || REGLAS_FUERA.has(m.rule.id)) continue;
      const tramo = tramos.findLast((t) => t.inicio <= m.offset);
      const mal = tramo.texto.slice(m.offset - tramo.inicio, m.offset - tramo.inicio + m.length);
      // El fragmento entero está en la lista («la Titán», «Cl@ve»), o todas sus palabras
      const palabrasMal = mal.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (palabras.has(normaliza(mal.trim())) || palabrasMal.every((p) => palabras.has(normaliza(p)))) continue;
      errores[tramo.n].push({ mal, bien: m.replacements[0]?.value ?? null, motivo: m.message });
    }
  }
  return errores;
};

// ── El mensaje ──────────────────────────────────────────────────────────────

const escapaHtml = (texto) =>
  String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const recorta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

// Telegram corta en 4096 caracteres: si hay mucho, se dice cuánto queda fuera. Con
// --todo --dry se pueden subir (MAX_FICHAS=200 MAX_POR_FICHA=50) para verlo todo
const MAX_FICHAS = Number(process.env.MAX_FICHAS ?? 8);
const MAX_POR_FICHA = Number(process.env.MAX_POR_FICHA ?? 6);

const bloque = ({ recurso, id, ficha, errores }) => {
  const titulo = recorta(String(ficha.titulo ?? ficha.nombre ?? id).trim(), 80);
  const lineas = errores.slice(0, MAX_POR_FICHA).map(({ mal, bien, motivo }) =>
    bien && bien !== mal
      ? ` • «${escapaHtml(recorta(mal, 60))}» → ${escapaHtml(recorta(bien, 60))}`
      : ` • «${escapaHtml(recorta(mal, 60))}»: ${escapaHtml(recorta(motivo, 100))}`,
  );
  if (errores.length > MAX_POR_FICHA) lineas.push(` • y ${errores.length - MAX_POR_FICHA} más`);
  return `<b>${escapaHtml(titulo)}</b> (${TIPOS[recurso]})\n${lineas.join("\n")}`;
};

// Las fichas entran mientras quepan; lo que no, se cuenta al final
const MAX_TEXTO = 3800;

const mensaje = (conErrores) => {
  const partes = ["📝 <b>Posibles erratas en lo último que se ha guardado</b>"];
  const incluidas = [];
  for (const f of conErrores.slice(0, MAX_FICHAS)) {
    const b = bloque(f);
    if ([...partes, b].join("\n\n").length > MAX_TEXTO) break;
    partes.push(b);
    incluidas.push(f);
  }
  const fuera = conErrores.length - incluidas.length;
  if (fuera > 0) partes.push(fuera === 1 ? "Y 1 ficha más." : `Y ${fuera} fichas más.`);
  const botones = incluidas.map(({ recurso, id, ficha }) => [
    {
      text: `✏️ ${recorta(String(ficha.titulo ?? ficha.nombre ?? id).trim(), 30)}`,
      url: `${CMS}/${recurso}/edit/${encodeURIComponent(`${CONTENIDO}/${recurso}/${id}.json`)}`,
    },
  ]);
  return { texto: partes.join("\n\n"), botones };
};

// ── Adelante ────────────────────────────────────────────────────────────────

if (!TODO && (!desde || !hasta)) {
  console.error("Uso: node avisos/erratas.mjs <desde> <hasta> | --todo [--dry]");
  process.exit(2);
}

const fichas = await cambiadas();
if (!fichas.length) {
  console.log("Ningún texto cambiado");
  process.exit(0);
}

let errores;
try {
  errores = await revisar(fichas, await leerPalabras());
} catch (e) {
  console.log(`No se ha podido revisar (${e.message}); esta vez no se avisa`);
  process.exit(0);
}

const conErrores = fichas.map((f, n) => ({ ...f, errores: errores[n] })).filter((f) => f.errores.length);
console.log(`${fichas.length} fichas revisadas, ${conErrores.length} con posibles erratas`);
if (!conErrores.length) process.exit(0);

const { texto, botones } = mensaje(conErrores);
if (DRY) {
  console.log(`\n${texto}\n`);
  for (const [b] of botones) console.log(`[${b.text}] ${b.url}`);
  process.exit(0);
}

const token =
  process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
if (!token) throw new Error("Falta AVISOS_TOKEN");
const r = await fetch(`${WORKER}/erratas`, {
  method: "POST",
  headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
  body: JSON.stringify({ texto, botones }),
});
console.log(r.ok ? "Mandado al grupo" : `El Worker ha contestado ${r.status}: ${await r.text()}`);
if (!r.ok) process.exit(1);
