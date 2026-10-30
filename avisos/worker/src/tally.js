// POST /tally: el webhook de los formularios. Tally llama aquí con cada respuesta nueva
// y esto la reenvía, entera, al grupo de Telegram de los administradores (el mismo de
// los avisos de prensa de news-rastreator). Los webhooks los da de alta
// tally/crear-webhooks.mjs.
//
// Tally firma el cuerpo con el secreto compartido (TALLY_SIGNING_SECRET): HMAC-SHA256
// en base64, en la cabecera Tally-Signature. Sin firma buena no se manda nada, para que
// nadie pueda escribir en el grupo a través del bot.
//
// Las altas de negocio y los anuncios se traen solos al CMS: antes de avisar se lanza la
// Action de traer (la del botón de Pages CMS), que los crea ocultos. Si GitHub no la
// acepta, el mensaje lleva un botón «📥 Traer al CMS» para reintentarlo desde Telegram
// (lo atiende comandos.js).
//
// Las altas, anuncios y casas llevan además «✅ Publicar» y «🗑 Descartar», y si traen
// fotos se mandan al grupo debajo del aviso, con «📷 Subir estas fotos» (fichas.js).
//
// Si es un mensaje de contacto que pide quitar un anuncio del Tablón («Pide que lo
// quitemos», o «Avísanos» de una casa vendida), el aviso dice cuál y lleva el botón para
// hacerlo (retirar.js).
//
// Antes, se mira si parece repetido de algo que ya hay o si tiene pinta de spam
// (repetidos.js), y va en el aviso, encima de los botones.
//
// Si Telegram falla se responde 500 y Tally reintenta por su cuenta (a los 5 min, 30 min,
// 1 h, 6 h y 1 día). Volver a lanzar la Action no duplica nada: trae solo lo pendiente.

import { lanzarTraer } from "./github.js";
import { escapaHtml, filas, llamarTelegram } from "./telegram.js";
import { botonesFicha, botonVistaPrevia, enlaceBorrador, mandarFotos } from "./fichas.js";
import { revisarRespuesta } from "./repetidos.js";
import { pedidoRetirar } from "./retirar.js";

// La lista de una colección en Pages CMS. La ficha aún no existe cuando llega el aviso
// (se crea al pulsar el botón de traer), así que se enlaza la lista, no la ficha.
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";

// Los formularios, por su id de tally/formularios-creados.json. `traer` es la Action que
// lo pasa al CMS (ver TRAER en github.js); contacto no se importa a ningún sitio.
// `etiqueta` es la pregunta que hace de título, para buscar repetidos.
const FORMULARIOS = {
  obJXzX: { titulo: "✉️ Mensaje de contacto" },
  ZjxqQa: { titulo: "🏪 Alta de negocio", traer: "negocios", etiqueta: "Nombre del negocio", oculto: "oculta", cms: `${CMS}/negocios` },
  NpzGOW: { titulo: "📌 Anuncio para el tablón", traer: "tablon", etiqueta: "Título del anuncio", oculto: "oculto", cms: `${CMS}/anuncios` },
  kbd67J: { titulo: "🏠 Casa en venta o alquiler", traer: "casas", etiqueta: "Título del anuncio", oculto: "oculta", cms: `${CMS}/casas` },
};

// Lo que dice el pie según haya salido la Action de traer
const pieDe = ({ traer, oculto }, lanzado) => {
  if (!traer) return null;
  if (lanzado) return `📥 Ya va de camino al CMS: en un par de minutos estará en la lista, ${oculto}.`;
  return "⚠️ No se ha podido traer solo al CMS. Pulsa «📥 Traer al CMS» para reintentarlo.";
};

// Telegram corta en 4096 caracteres; se deja margen para la cabecera y el pie
const MAX_CAMPO = 1500;
const MAX_MENSAJE = 4000;
const MAX_CUERPO = 64 * 1024;

const recorta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

const firmaValida = async (cuerpo, firma, secreto) => {
  if (!firma || !secreto) return false;
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const esperada = async (texto) => {
    const bytes = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(texto));
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  };
  const igual = (a, b) => {
    const x = new TextEncoder().encode(a);
    const y = new TextEncoder().encode(b);
    return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
  };
  // La documentación de Tally firma JSON.stringify(cuerpo) en su ejemplo, no los bytes
  // tal cual llegan. Suelen coincidir; por si no, se prueban los dos.
  if (igual(firma, await esperada(cuerpo))) return true;
  return igual(firma, await esperada(JSON.stringify(JSON.parse(cuerpo))));
};

// Una línea por campo respondido. Lo vacío no sale.
const lineaDe = (campo) => {
  const { label, type, value, options } = campo;
  if (value === null || value === undefined || value === "") return null;
  // Las casillas: la de aceptar la privacidad (siempre marcada) y, en los campos de
  // varias casillas, una por opción que repite lo que ya dice el campo entero
  if (typeof value === "boolean") return null;

  let texto;
  if (type === "FILE_UPLOAD" || type === "SIGNATURE") {
    if (!Array.isArray(value) || !value.length) return null;
    // El enlace no se pone (va firmado y abre la foto a quien lo tenga): las fotos van
    // debajo, como álbum (fichas.js)
    texto = `📷 ${value.length} ${value.length === 1 ? "foto, va" : "fotos, van"} aquí debajo`;
  } else if (Array.isArray(value)) {
    if (!value.length) return null;
    const nombres = new Map((options ?? []).map((o) => [o.id, o.text]));
    texto = value.map((v) => nombres.get(v) ?? v).join(", ");
  } else if (typeof value === "object") {
    texto = JSON.stringify(value);
  } else {
    texto = String(value).trim();
    if (!texto) return null;
  }
  return `<b>${escapaHtml(label || "(sin título)")}</b>\n${escapaHtml(recorta(texto, MAX_CAMPO))}`;
};

const formularioDe = ({ formId, formName }) => FORMULARIOS[formId] ?? { titulo: `📝 ${formName}` };

// El id de la respuesta, el mismo que da la API de Tally (y que guardan los importadores)
const respuestaDe = (datos) => datos.submissionId ?? datos.responseId;

// Los enlaces van como botones debajo del mensaje, no como URL sueltas en el texto. Si
// no se pudo traer, una fila más con el botón de reintentar; y en lo que se trae al CMS,
// otra con la vista previa, y otra con publicar y descartar.
const botonesDe = async (env, datos, lanzado, retirada) => {
  const { cms, traer } = formularioDe(datos);
  const enlaces = [
    ...(cms ? [{ text: "📝 Abrir en el CMS", url: cms }] : []),
    { text: "Ver en Tally", url: `https://tally.so/forms/${datos.formId}/submissions` },
  ];
  if (!traer) return [enlaces, ...(retirada?.boton ? [[retirada.boton]] : [])];
  const respuesta = respuestaDe(datos);
  // Estará en cuanto la Action la traiga y se publique la web: unos minutos
  const previa = respuesta ? await enlaceBorrador(env, { respuesta }) : null;
  return [
    enlaces,
    ...(lanzado ? [] : [[{ text: "📥 Traer al CMS", callback_data: `traer:${traer}` }]]),
    ...(previa ? [[botonVistaPrevia(previa)]] : []),
    ...(respuesta ? [botonesFicha(traer, respuesta)] : []),
  ];
};

const mensajeDe = (datos, lanzado, alertas) => {
  const { fields } = datos;
  const formulario = formularioDe(datos);
  const pie = [pieDe(formulario, lanzado)].filter(Boolean);
  const campos = (fields ?? []).map(lineaDe).filter(Boolean);
  // Si aun así no cabe, se quitan campos enteros del final (cortar a ciegas podría
  // romper una etiqueta y Telegram rechazaría el mensaje)
  const montar = (cuantos) =>
    [
      `<b>${escapaHtml(formulario.titulo)}</b>`,
      ...alertas,
      ...campos.slice(0, cuantos),
      ...(cuantos < campos.length ? ["<i>…sigue en Tally</i>"] : []),
      ...pie,
    ].join("\n\n");
  let cuantos = campos.length;
  while (cuantos > 0 && montar(cuantos).length > MAX_MENSAJE) cuantos--;
  return montar(cuantos);
};

export const webhookTally = async (request, env, json, ctx) => {
  if (request.method !== "POST") return json({ error: "método no permitido" }, 405);
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return json({ error: "demasiado grande" }, 413);
  if (!(await firmaValida(cuerpo, request.headers.get("tally-signature"), env.TALLY_SIGNING_SECRET)))
    return json({ error: "firma no válida" }, 401);

  const evento = JSON.parse(cuerpo);
  // Por ahora Tally solo manda este tipo; lo demás se acepta y se ignora
  if (evento.eventType !== "FORM_RESPONSE" || !evento.data) return json({ ignorado: true });

  const { data } = evento;
  const { traer, etiqueta } = formularioDe(data);
  const [lanzado, alertas, retirada] = await Promise.all([
    traer ? lanzarTraer(env, traer).catch(() => false) : null,
    revisarRespuesta(env, { formulario: traer, respuesta: respuestaDe(data), campos: data.fields ?? [], etiquetaTitulo: etiqueta }),
    traer ? null : pedidoRetirar(data.fields ?? []),
  ]);
  const aviso = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: mensajeDe(data, lanzado, [...(retirada ? [retirada.linea] : []), ...alertas]),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: filas(await botonesDe(env, data, lanzado, retirada)) },
  });
  if (!aviso) return json({ error: "telegram" }, 500);

  // Las fotos, después de contestar a Tally: bajarlas y subirlas lleva unos segundos
  const archivos = (data.fields ?? []).filter((f) => f.type === "FILE_UPLOAD" && Array.isArray(f.value)).flatMap((f) => f.value);
  if (traer && archivos.length && respuestaDe(data))
    ctx.waitUntil(mandarFotos(env, { formulario: traer, respuesta: respuestaDe(data), archivos, responderA: aviso.message_id }));
  return json({ ok: true });
};
