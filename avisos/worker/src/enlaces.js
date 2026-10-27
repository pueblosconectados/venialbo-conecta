// POST /enlaces: lo que no funciona de la comprobación semanal de enlaces, que hace
// avisos/enlaces.mjs desde la Action (enlaces.yml) y manda aquí. Se avisa al grupo de un
// enlace cuando falla dos comprobaciones seguidas, para no dar la lata por una web que
// estuvo caída un rato, y una vez más cuando deja de fallar (se ha arreglado o se ha
// quitado de la ficha). /repaso enseña los que fallan ahora.
//
// El estado va en el KV ESTADO, clave "enlaces":
//   { <url>: { veces, motivo, fichas: [{ coleccion, ruta, titulo }], avisado } }
// con lo que falló en la última comprobación; lo que no vino, funciona.

import { aTelegram, elemento, escapaHtml, LISTA } from "./telegram.js";

const CLAVE = "enlaces";
const VECES = 2;
const MAX_ENLACES = 300;
const MAX_LISTA = 10;
const MAX_BOTONES = 6;
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";

const enlaceCms = (coleccion, ruta) => `${CMS}/${coleccion}/edit/${encodeURIComponent(ruta)}`;
const corto = (texto, max = 22) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

// La dirección sin el protocolo y recortada, para leerla en el móvil
const legible = (url) => corto(url.replace(/^https?:\/\/(www\.)?/, ""), 60);

const texto = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

// Que lo que manda la Action tenga buena pinta: los botones salen de aquí y las rutas
// van a parar a un enlace al CMS
const valido = (cuerpo) =>
  Array.isArray(cuerpo?.fallan) &&
  cuerpo.fallan.length <= MAX_ENLACES &&
  cuerpo.fallan.every(
    (e) =>
      texto(e?.url, 2000) &&
      (/^https?:\/\//.test(e.url) || e.url.startsWith("/media/")) &&
      texto(e.motivo, 200) &&
      Array.isArray(e.fichas) &&
      e.fichas.length <= 50 &&
      e.fichas.every(
        (f) => texto(f?.coleccion, 40) && /^[a-z]+$/.test(f.coleccion) && texto(f.ruta, 300) && f.ruta.startsWith(`web-static/content/${f.coleccion}/`) && texto(f.titulo, 300),
      ),
  );

// El enlace en la lista: dónde está y por qué falla
const linea = ({ url, motivo, fichas }) =>
  elemento(
    legible(url),
    `${escapaHtml(motivo)}\n   en ${fichas.map((f) => `«${escapaHtml(f.titulo)}»`).join(", ")}`,
  );

// Un botón por ficha a su edición en el CMS, sin repetir
const botonesDe = (enlaces) => {
  const vistas = new Map();
  for (const { fichas } of enlaces) for (const f of fichas) vistas.set(f.ruta, f);
  return [...vistas.values()].slice(0, MAX_BOTONES).map((f) => [{ text: `✏️ ${corto(f.titulo, 30)}`, url: enlaceCms(f.coleccion, f.ruta) }]);
};

const lista = (enlaces) =>
  enlaces.slice(0, MAX_LISTA).map(linea).join(LISTA) + (enlaces.length > MAX_LISTA ? `${LISTA}• …y ${enlaces.length - MAX_LISTA} más` : "");

export const apuntarEnlaces = async (cuerpo, env) => {
  if (!valido(cuerpo)) return { error: "cuerpo no válido" };
  const anterior = (await env.ESTADO.get(CLAVE, "json")) ?? {};
  const nuevo = {};
  for (const { url, motivo, fichas } of cuerpo.fallan) {
    const antes = anterior[url];
    nuevo[url] = { veces: (antes?.veces ?? 0) + 1, motivo, fichas, avisado: antes?.avisado ?? false };
  }
  const confirmados = Object.entries(nuevo)
    .filter(([, e]) => e.veces >= VECES && !e.avisado)
    .map(([url, e]) => ({ url, ...e }));
  const arreglados = Object.entries(anterior)
    .filter(([url, e]) => e.avisado && !nuevo[url])
    .map(([url, e]) => ({ url, ...e }));

  if (confirmados.length) {
    const mensaje = [
      `🔗 <b>${confirmados.length === 1 ? "Un enlace no funciona" : `${confirmados.length} enlaces no funcionan`}</b>`,
      "Han fallado las dos últimas comprobaciones (una por semana):",
      lista(confirmados),
      "<i>Cámbialo por el bueno o quítalo de la ficha. Si la web solo estaba caída, cuando vuelva lo diré.</i>",
    ].join("\n\n");
    if (!(await aTelegram(env, mensaje, botonesDe(confirmados)))) return { error: "Telegram no lo ha aceptado" };
    for (const { url } of confirmados) nuevo[url].avisado = true;
  }
  if (arreglados.length) {
    const nombres = arreglados.slice(0, MAX_LISTA).map(({ url }) => `• ${escapaHtml(legible(url))}`);
    // Si este falla no pasa nada: es solo la buena noticia
    await aTelegram(env, [`🟢 <b>${arreglados.length === 1 ? "Ya no falla" : "Ya no fallan"}</b> (o se ${arreglados.length === 1 ? "ha" : "han"} quitado de la web)`, ...nombres].join("\n"));
  }
  await env.ESTADO.put(CLAVE, JSON.stringify(nuevo));
  return { ok: true, fallan: cuerpo.fallan.length, avisados: confirmados.length, arreglados: arreglados.length };
};

// Para /repaso: el mensaje con los que fallan ya confirmados, o null si no hay
export const enlacesRotos = async (env) => {
  const estado = (await env.ESTADO.get(CLAVE, "json")) ?? {};
  const rotos = Object.entries(estado)
    .filter(([, e]) => e.veces >= VECES)
    .map(([url, e]) => ({ url, ...e }));
  if (!rotos.length) return null;
  return {
    texto: [`🔗 <b>${rotos.length === 1 ? "Un enlace no funciona" : `${rotos.length} enlaces no funcionan`}</b>`, lista(rotos)].join("\n\n"),
    botones: botonesDe(rotos),
  };
};
