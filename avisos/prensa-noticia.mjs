// Crea una noticia oculta a partir de un aviso de prensa de news-rastreator: lo que hace
// el botón «📰 Crear noticia» en el grupo de Telegram (avisos/worker/src/prensa.js). Lo
// lanza el workflow prensa-noticia.yml.
//
//   node avisos/prensa-noticia.mjs            crea la noticia con lo que llega en TITULO,
//                                             FUENTE, ENLACE, FECHA y MENSAJE
//   node avisos/prensa-noticia.mjs --dry      lo mismo, pero solo la enseña
//   node avisos/prensa-noticia.mjs --avisar   cuenta en el grupo lo que ha pasado
//
// La noticia entra **oculta**, en la categoría «Otras», sin foto y con una línea que
// lleva al periódico. Lo demás (la foto, la categoría, contarla) es cosa de quien la
// revise: la foto y el texto son del periódico y no se copian.
//
// Google News solo da un enlace suyo, news.google.com/rss/articles/<id>, que lleva al
// periódico con JavaScript. El enlace de verdad se le pide a su batchexecute, como hace
// la propia página; si eso falla (Google lo cambia de vez en cuando), se deja el suyo,
// que también funciona. Con cualquiera de los dos dentro, no se crea dos veces.
//
// Sin dependencias. El registro de la Action es público, pero todo lo que se imprime ya
// lo es: es una noticia de prensa.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fechaHoraLocal, RAIZ, slugificar } from "../tally/comun.mjs";

const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
const NOTICIAS = "web-static/content/noticias";
const CATEGORIA = "web-static/content/categorias/otras.json";
const RESULTADO = join(process.env.RUNNER_TEMP ?? tmpdir(), "prensa-noticia-resultado.json");
const GOOGLE_NEWS = /^https:\/\/news\.google\.com\/(?:rss\/)?articles\/([\w-]+)/;
const ESPERA = 30_000;
const CABECERAS = { "user-agent": "Mozilla/5.0 (compatible; VenialboConecta; +https://venialboconecta.es/)" };

// El enlace del periódico, o null si Google no lo da
export const enlaceReal = async (id) => {
  const pagina = await fetch(`https://news.google.com/rss/articles/${id}`, {
    headers: CABECERAS,
    signal: AbortSignal.timeout(ESPERA),
  });
  if (!pagina.ok) return null;
  const html = await pagina.text();
  const ts = html.match(/data-n-a-ts="(\d+)"/)?.[1];
  const sg = html.match(/data-n-a-sg="([\w-]+)"/)?.[1];
  if (!ts || !sg) return null;

  const peticion = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`,
  ];
  const respuesta = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { ...CABECERAS, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `f.req=${encodeURIComponent(JSON.stringify([[peticion]]))}`,
    signal: AbortSignal.timeout(ESPERA),
  });
  if (!respuesta.ok) return null;
  // Viene como )]}'\n\n[[…]]: el segundo trozo, y dentro otro JSON en texto
  const datos = JSON.parse((await respuesta.text()).split("\n\n")[1]);
  const enlace = JSON.parse(datos[0][2])[1];
  return /^https?:\/\//.test(enlace) && !/^https:\/\/news\.google\.com\//.test(enlace) ? enlace : null;
};

// La noticia que ya lleva alguno de esos textos, si se había creado antes
const yaCreada = async (marcas) => {
  for (const fichero of (await readdir(join(RAIZ, NOTICIAS))).filter((f) => f.endsWith(".json"))) {
    const ruta = `${NOTICIAS}/${fichero}`;
    const contenido = await readFile(join(RAIZ, ruta), "utf8");
    if (marcas.some((m) => contenido.includes(m))) return { ruta, ficha: JSON.parse(contenido) };
  }
  return null;
};

// El primer nombre libre: "2026-10-30-venialbo-….json", "…-2.json"…
const nombreLibre = async (dir, base, extension) => {
  const existentes = new Set(await readdir(join(RAIZ, dir)));
  for (let n = 1; ; n++) {
    const nombre = `${base}${n > 1 ? `-${n}` : ""}${extension}`;
    if (!existentes.has(nombre)) return `${dir}/${nombre}`;
  }
};

const crear = async ({ titulo, fuente, enlace, fecha }, { dry }) => {
  const id = enlace.match(GOOGLE_NEWS)[1];
  const real = await enlaceReal(id).catch((e) => {
    console.log(`Google no da el enlace del periódico (${e.message}): se deja el suyo.`);
    return null;
  });
  // El de Google con el id basta para reconocerlo, con o sin ?oc=5 detrás
  const anterior = await yaCreada([id, ...(real ? [real] : [])]);
  if (anterior)
    return { estado: "ya", mensaje: "ya estaba en el CMS", titulo: anterior.ficha.titulo, ruta: anterior.ruta, activa: anterior.ficha.activa === true };

  const cuando = fechaHoraLocal(fecha && !Number.isNaN(Date.parse(fecha)) ? fecha : new Date().toISOString());
  const slug = slugificar(titulo).replace(/-+$/, "") || "noticia-de-prensa";
  const ruta = await nombreLibre(NOTICIAS, `${cuando.slice(0, 10)}-${slug}`, ".json");
  const donde = fuente ? `de ${fuente} ` : "completa ";
  const ficha = {
    titulo,
    fecha_publicacion: cuando,
    categoria: CATEGORIA,
    destacada: false,
    activa: false,
    contenido: `Puedes ver la noticia ${donde}[aquí](${real ?? enlace}).\n`,
  };

  if (dry) console.log(`${real ? `Periódico: ${real}` : "Sin enlace del periódico"}\n→ ${ruta}\n${JSON.stringify(ficha, null, 2)}`);
  else await writeFile(join(RAIZ, ruta), `${JSON.stringify(ficha, null, 2)}\n`, "utf8");
  return { estado: "hecho", mensaje: real ? "creada" : "creada con el enlace de Google News", titulo, ruta, activa: false, google: !real };
};

if (process.argv[2] === "--avisar") {
  // Después del push, o si algo ha fallado: que el grupo sepa cómo ha ido
  const resultado = JSON.parse(await readFile(RESULTADO, "utf8").catch(() => '{"estado":"error","mensaje":"la Action ha fallado antes de terminar"}'));
  // En la Action, la noticia creada no vale de nada si el commit no ha llegado a main
  if (process.env.GITHUB_ACTIONS && resultado.estado === "hecho" && process.env.SUBIDO !== "1")
    Object.assign(resultado, { estado: "error", mensaje: "no se ha podido guardar en GitHub", ruta: undefined });
  // Para devolverle al aviso su botón si ha fallado
  const mensaje = process.env.MENSAJE ?? "";
  const segundos = Math.floor(Date.parse(process.env.FECHA ?? "") / 1000);
  if (/^\d{1,12}$/.test(mensaje)) resultado.mensaje_id = Number(mensaje);
  if (segundos > 0) resultado.segundos = segundos;
  const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  if (!token) throw new Error("Falta AVISOS_TOKEN");
  const r = await fetch(`${WORKER}/prensa-noticia`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.trim()}`, "content-type": "application/json" },
    body: JSON.stringify(resultado),
  });
  console.log(`Worker: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
} else {
  const dry = process.argv.includes("--dry");
  const datos = {
    titulo: (process.env.TITULO ?? "").trim(),
    fuente: (process.env.FUENTE ?? "").trim(),
    enlace: (process.env.ENLACE ?? "").trim(),
    fecha: (process.env.FECHA ?? "").trim(),
  };
  let resultado;
  try {
    if (!datos.titulo || datos.titulo.length > 300 || datos.fuente.length > 100) throw new Error("el aviso no trae bien el título o la fuente");
    if (!GOOGLE_NEWS.test(datos.enlace)) throw new Error("el enlace no es de Google News");
    resultado = await crear(datos, { dry });
  } catch (e) {
    resultado = { estado: "error", mensaje: String(e.message ?? e).slice(0, 300) };
  }
  if (!dry) await writeFile(RESULTADO, JSON.stringify(resultado), "utf8");
  console.log(`${resultado.estado}. ${resultado.mensaje}${resultado.ruta ? `\nNoticia: ${resultado.ruta}` : ""}`);
  if (resultado.estado === "hecho" && process.env.GITHUB_OUTPUT && !dry)
    await writeFile(process.env.GITHUB_OUTPUT, "hecho=1\n", { flag: "a" });
}
