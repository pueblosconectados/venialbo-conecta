// Duplicados y spam en lo que llega de Tally (idea 27 de IDEAS.md). Antes de avisar,
// tally.js pregunta aquí si la respuesta se parece a algo que ya hay, o si tiene pinta
// de spam, y lo que salga va en el aviso, justo encima de «✅ Publicar». No bloquea
// nada: es una pista para el que revisa.
//
// Repetido, si comparte con otra ficha:
// - un teléfono (los 9 dígitos, se escriban como se escriban), o
// - el título, sin contar las palabras de relleno ni las que lleva cualquier anuncio
//   («se vende casa» no dice nada: hay tres), o
// - casi toda la descripción (copiar y pegar el mismo texto).
//
// Se compara con lo publicado (data/buscador.json de la web, que tiene el texto entero;
// lo caducado no cuenta) y con lo que ha llegado por Tally en los últimos 60 días, que
// puede estar aún oculto: de cada respuesta se guarda una huella en el KV ESTADO
// ("recibida:<id>", todo en los metadatos, para leerlas con un solo list). Los negocios
// se comparan con negocios y servicios; el tablón y las casas, con el tablón (las casas
// se publican en él).

import { escapaHtml } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const DIAS_KV = 60;
const PREFIJO = "recibida:";

// formulario (el `traer` de tally.js) → los recursos del buscador con que se compara
const CON_QUE = {
  negocios: ["negocios", "servicios"],
  tablon: ["anuncios"],
  casas: ["anuncios"],
};
// Las respuestas recibidas: tablón y casas se comparan entre sí
const GRUPO = { negocios: "n", tablon: "t", casas: "t" };
const NOMBRE = { negocios: "negocio", servicios: "servicio", anuncios: "tablón" };

// Palabras que no distinguen un título de otro
const RELLENO = new Set(
  (
    "de del la las el los lo un una unos unas y o en a al con por para sin se mi su " +
    "vendo vende venden compro compra busco busca alquilo alquila alquilan cambio regalo " +
    "doy necesito ofrezco casa piso venta alquiler anuncio urgente"
  ).split(" "),
);

const normaliza = (texto) =>
  String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const palabras = (texto) => normaliza(texto).split(/[^a-z0-9ñ]+/).filter(Boolean);
const delTitulo = (texto) => new Set(palabras(texto).filter((p) => p.length > 1 && !RELLENO.has(p)));
const deDescripcion = (texto) => new Set(palabras(texto).filter((p) => p.length >= 4));

// Los teléfonos españoles de un texto, en 9 dígitos: "(+34) 980 57 30 80" → 980573080.
// Entre grupos de cifras, un solo separador: en buscador.json los campos van separados
// por varios espacios, y el teléfono no puede juntarse con la fecha que va detrás. Dos
// seguidos ("980 57 30 80 622 75 19 09") se separan al llegar a 9 cifras.
export const telefonosDe = (texto) => {
  const telefonos = new Set();
  const encontrados = String(texto).replace(/\((\+?\d+)\)/g, "$1").match(/(?:\+|00)?\d+(?:[ .\-]\d+)*/g) ?? [];
  for (const seguidos of encontrados) {
    let cifras = "";
    for (const grupo of seguidos.split(/[ .\-]/)) {
      cifras += grupo.replace(/\D/g, "");
      // El prefijo suelto ("+34 649…") no cuenta para las 9
      if (/^(?:00|\+)?34$/.test(grupo) && cifras.length <= 4) cifras = "";
      if (cifras.length >= 9) {
        const sinPrefijo = cifras.replace(/^(?:00)?34(?=\d{9}$)/, "");
        if (/^[6789]\d{8}$/.test(sinPrefijo)) telefonos.add(sinPrefijo);
        cifras = "";
      }
    }
  }
  return [...telefonos];
};

// Mismo título: las mismas palabras que cuentan, o casi (dos en común y poco más)
const mismoTitulo = (a, b) => {
  if (!a.size || !b.size) return false;
  const comunes = [...a].filter((p) => b.has(p)).length;
  if (comunes === a.size && comunes === b.size) return true;
  return comunes >= 2 && comunes / (a.size + b.size - comunes) >= 0.6;
};

// Misma descripción: casi todas sus palabras están en el texto de la otra ficha. Solo
// con descripciones de cierta longitud, que en las cortas coincide cualquier cosa.
const mismaDescripcion = (descripcion, texto) => {
  if (descripcion.size < 8) return false;
  const otras = texto instanceof Set ? texto : new Set(palabras(texto));
  return [...descripcion].filter((p) => otras.has(p)).length / descripcion.size >= 0.7;
};

// ── El spam ────────────────────────────────────────────────────────────────

const ACORTADORES = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|ow\.ly|shorturl\.at|t\.me)\//i;
const DOMINIOS_RAROS = /\b[a-z0-9-]+\.(?:ru|xyz|top|click|cn|su|icu|buzz|monster|cfd|sbs|loan|work)\b/i;
const ENLACE = /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|es|info|biz|io|me|link|shop|online|site)\b/gi;
const OTRA_ESCRITURA = /[Ѐ-ӿ֐-ۿ฀-๿぀-ヿ一-鿿가-힯]/;
const PALABRAS_SPAM =
  /\b(?:casino|apuestas?|bitcoin|cripto\w*|crypto\w*|forex|viagra|cialis|prestamos? rapidos?|ganar dinero|seo|backlinks?|onlyfans|xxx|porno?)\b/;

// Las razones para sospechar, en palabras; vacío si no hay ninguna
export const pareceSpam = (campos) => {
  const razones = new Set();
  // Los enlaces, en los campos de texto: los de enlace (web, Facebook…) están para eso
  const textos = campos.filter((c) => ["INPUT_TEXT", "TEXTAREA"].includes(c.type) && typeof c.value === "string").map((c) => c.value);
  const todos = campos.filter((c) => typeof c.value === "string").map((c) => c.value);

  const sinCorreos = (t) => t.replace(/\S+@\S+\.\S+/g, " ");
  if (todos.some((t) => ACORTADORES.test(t))) razones.add("enlaces acortados");
  if (todos.some((t) => DOMINIOS_RAROS.test(sinCorreos(t)))) razones.add("enlaces a dominios raros");
  // Uno puede ser la web del negocio; varios ya no es normal
  const enlaces = textos.map((t) => sinCorreos(t).match(ENLACE)?.length ?? 0).reduce((a, b) => a + b, 0);
  if (enlaces >= 2) razones.add("varios enlaces en el texto");
  if (todos.some((t) => OTRA_ESCRITURA.test(t))) razones.add("letras de otro alfabeto");
  if (textos.some((t) => PALABRAS_SPAM.test(normaliza(t)))) razones.add("palabras de spam");

  // Texto sin sentido: aporreado de teclado, palabras sin vocales o larguísimas, la misma
  // letra muchas veces seguidas
  const sinSentido = textos.some((t) => {
    const n = normaliza(sinCorreos(t)).replace(/https?:\/\/\S+/g, " ");
    if (/asdf|qwert|zxcv|hjkl|([a-zñ])\1{4,}/.test(n)) return true;
    return n.split(/[^a-zñ]+/).some((p) => p.length > 25 || (p.length >= 5 && !/[aeiouy]/.test(p)));
  });
  if (sinSentido) razones.add("texto sin sentido");
  return [...razones];
};

// ── Los repetidos ──────────────────────────────────────────────────────────

const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const formatoDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const dia = (fecha) => (/^\d{4}-\d{2}-\d{2}/.test(fecha ?? "") ? formatoDia.format(new Date(`${fecha.slice(0, 10)}T12:00:00Z`)) : null);

// En qué se parecen; vacío si en nada
const parecidos = (nueva, otra) =>
  [
    nueva.telefonos.some((t) => otra.telefonos.includes(t)) && "mismo teléfono",
    mismoTitulo(nueva.titulo, otra.titulo) && "mismo título",
    mismaDescripcion(nueva.descripcion, otra.texto) && "misma descripción",
  ].filter(Boolean);

const publicadas = async (recursos) => {
  const respuesta = await fetch(`${WEB}/data/buscador.json`, { cache: "no-store" });
  if (!respuesta.ok) return [];
  const hoy = hoyMadrid();
  return (await respuesta.json())
    .filter((f) => recursos.includes(f.recurso))
    .filter((f) => !(typeof f.fecha_caducidad === "string" && f.fecha_caducidad.slice(0, 10) < hoy))
    .map((f) => ({
      donde: NOMBRE[f.recurso],
      nombre: f.titulo,
      // Los anuncios llevan la fecha delante en el id (así los nombra el CMS)
      fecha: /^\d{4}-\d{2}-\d{2}-/.test(f.id) ? f.id.slice(0, 10) : null,
      titulo: delTitulo(f.titulo),
      telefonos: telefonosDe(f.texto),
      texto: new Set(palabras(f.texto)),
    }));
};

const recibidas = async (env, grupo, respuesta) => {
  const huellas = [];
  let cursor;
  do {
    const pagina = await env.ESTADO.list({ prefix: `${PREFIJO}${grupo}:`, cursor });
    for (const { name, metadata: m } of pagina.keys) {
      // Tally reintenta el webhook si falla: la propia respuesta no cuenta
      if (!m || name === `${PREFIJO}${grupo}:${respuesta}`) continue;
      huellas.push({
        donde: "recibida por Tally",
        nombre: m.n,
        fecha: m.d,
        titulo: delTitulo(m.n),
        telefonos: m.p ?? [],
        texto: new Set(palabras(m.x ?? "")),
      });
    }
    cursor = pagina.list_complete ? null : pagina.cursor;
  } while (cursor);
  return huellas;
};

// Lo que hace falta para comparar, sacado de los campos del formulario
const huellaDe = (campos, etiquetaTitulo) => {
  const textos = campos.filter((c) => typeof c.value === "string");
  const titulo =
    textos.find((c) => c.label === etiquetaTitulo)?.value ?? textos.find((c) => c.type === "INPUT_TEXT")?.value ?? "";
  const descripcion = textos.filter((c) => c.type === "TEXTAREA").map((c) => c.value).join(" ");
  return {
    nombre: titulo.trim(),
    titulo: delTitulo(titulo),
    descripcion: deDescripcion(descripcion),
    textoDescripcion: descripcion,
    telefonos: telefonosDe(textos.map((c) => c.value).join(" \n ")),
  };
};

// Los metadatos de KV no pueden pasar de 1024 bytes (y una ñ o un emoji ocupan más de
// uno): se recorta la descripción hasta que quepa
const metadatosDe = (nueva) => {
  const m = { n: nueva.nombre.slice(0, 100), d: hoyMadrid(), p: nueva.telefonos.slice(0, 3) };
  let x = normaliza(nueva.textoDescripcion).replace(/\s+/g, " ").slice(0, 600);
  while (new TextEncoder().encode(JSON.stringify({ ...m, x })).length > 1000) x = x.slice(0, -50);
  return { ...m, x };
};

// Las líneas de aviso para el mensaje de Telegram (HTML), ya escapadas; vacío si no hay
// nada. Nunca falla: si algo va mal, se avisa sin ellas.
export const revisarRespuesta = async (env, { formulario, respuesta, campos, etiquetaTitulo }) => {
  const lineas = [];
  try {
    const spam = pareceSpam(campos);
    if (spam.length) lineas.push(`🚩 <b>Ojo, puede ser spam:</b> ${escapaHtml(spam.join(", "))}.`);
  } catch {}

  const grupo = GRUPO[formulario];
  if (!grupo) return lineas;
  try {
    const nueva = huellaDe(campos, etiquetaTitulo);
    const [enLaWeb, llegadas] = await Promise.all([
      publicadas(CON_QUE[formulario]).catch(() => []),
      respuesta ? recibidas(env, grupo, respuesta).catch(() => []) : [],
    ]);
    const repetidos = [...enLaWeb, ...llegadas]
      .map((otra) => ({ otra, en: parecidos(nueva, otra) }))
      .filter(({ en }) => en.length)
      .sort((a, b) => b.en.length - a.en.length)
      .slice(0, 3);
    for (const { otra, en } of repetidos) {
      const cuando = dia(otra.fecha);
      const donde = [otra.donde, cuando && `del ${cuando}`].filter(Boolean).join(", ");
      lineas.push(`⚠️ <b>Parece repetido</b> de «${escapaHtml(otra.nombre || "sin título")}» (${escapaHtml(donde)}): ${en.join(", ")}.`);
    }

    if (respuesta) {
      await env.ESTADO.put(`${PREFIJO}${grupo}:${respuesta}`, "", {
        expirationTtl: DIAS_KV * 24 * 60 * 60,
        metadata: metadatosDe(nueva),
      });
    }
  } catch {}
  return lineas;
};
