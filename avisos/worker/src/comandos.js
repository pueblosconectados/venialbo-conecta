// POST /telegram: el webhook del bot. Telegram llama aquí con cada comando que se
// escribe en el grupo y con cada pulsación de un botón con callback_data, y esto
// contesta. El webhook y el menú de comandos los da de alta avisos/telegram-config.mjs.
//
//   /estado      si GitHub Pages, Actions y la web funcionan ahora (vigilancia.js), y
//                qué workflows del repositorio están fallando (publicaciones.js)
//   /visitas     lo que va de semana (resumen.js)
//   /pendientes  lo que han mandado por Tally y aún no está en el CMS, con botones
//                para traerlo, y lo que ya está pero oculto sin revisar (revision.js)
//   /caducan     lo que desaparece de la web en los próximos 7 días (caducidad.js)
//   /cambios     los últimos guardados en el CMS, con quién y cuándo (cambios.js)
//   /buscar x    busca en todo lo que se ve en la web (buscar.js)
//   /republicar  vuelve a lanzar la publicación de la web
//   /avisos      cuántos dispositivos tienen las push activadas, y si los últimos
//                avisos les llegaron y cuánto tardaron (entregas.js)
//   /chatid      el id de este chat
//   /ayuda       la lista
//
// El bot es público: cualquiera puede escribirle. Por eso Telegram manda en cada
// llamada la cabecera X-Telegram-Bot-Api-Secret-Token (TELEGRAM_WEBHOOK_SECRET, fijada
// en setWebhook), y solo se contesta en el chat del grupo (TELEGRAM_CHAT_ID). La única
// excepción es /chatid, que solo dice el id del chat donde se escribe: quien lo pide ya
// lo tiene, y sirve justo para sacar el de un chat nuevo.
//
// Se contesta en la propia respuesta del webhook (Telegram ejecuta el método que va en
// el cuerpo), así que no hace falta otra llamada. A Telegram se le responde siempre
// 200, también a lo que se ignora: si no, reintenta.
//
// Con el webhook puesto, getUpdates deja de funcionar (error 409). Para el chat_id, /chatid.

import { lanzarTraer, lanzarWorkflow, leerImportadas, PUBLICAR, TRAER } from "./github.js";
import { resumenSemanal, suscriptores } from "./resumen.js";
import { aTelegram, elemento, escapaHtml, filas, LISTA } from "./telegram.js";
import { COMPONENTES, estadoDe, vigilar } from "./vigilancia.js";
import { fallandoAhora, marcarReintentado, nombreDe } from "./publicaciones.js";
import { listaSinRevisar, sinRevisar } from "./revision.js";
import { listaCaducan } from "./caducidad.js";
import { ultimosCambios } from "./cambios.js";
import { buscar } from "./buscar.js";
import { resumenEntregas } from "./entregas.js";

const TALLY = "https://api.tally.so";

// Lo que se trae al CMS, por formulario: su id de tally/formularios-creados.json y la
// pregunta que hace de título en la lista de pendientes
const FORMULARIOS = {
  negocios: { id: "ZjxqQa", titulo: "Nombre del negocio", nombre: "Altas de negocio", boton: "altas" },
  tablon: { id: "NpzGOW", titulo: "Título del anuncio", nombre: "Anuncios del tablón", boton: "anuncios" },
  casas: { id: "kbd67J", titulo: "Título del anuncio", nombre: "Casas en venta y alquiler", boton: "casas" },
};
const MAX_LISTA = 5;

const igualSeguro = (a, b) => {
  const x = new TextEncoder().encode(a ?? "");
  const y = new TextEncoder().encode(b ?? "");
  return x.byteLength === y.byteLength && x.byteLength > 0 && crypto.subtle.timingSafeEqual(x, y);
};

const delGrupo = (chat, env) => String(chat?.id) === String(env.TELEGRAM_CHAT_ID).trim();

// ── Los comandos ─────────────────────────────────────────────────────────────

const estado = async (env) => {
  const { github, fallo } = await vigilar(env, { enviar: false });
  const lineas = ["🩺 <b>Estado ahora</b>"];
  if (!github) lineas.push("⚪️ githubstatus.com no contesta");
  for (const [id, { nombre }] of Object.entries(COMPONENTES)) {
    const actual = github?.[id];
    if (!actual) continue;
    const { icono, texto } = estadoDe(actual.estado);
    lineas.push(`${icono} ${nombre}: ${texto}${actual.incidente ? ` («${escapaHtml(actual.incidente)}»)` : ""}`);
  }
  lineas.push(fallo ? `🔴 La web: ${escapaHtml(fallo)}` : "🟢 La web: responde");
  const fallando = await fallandoAhora(env);
  if (!fallando.length) lineas.push("🟢 Nuestras Actions: todas bien la última vez");
  for (const { nombre } of fallando) lineas.push(`🔴 Falla «${escapaHtml(nombre)}»`);
  return { texto: lineas.join("\n"), botones: fallando.map(({ nombre, url }) => ({ text: `Ver «${nombre}»`, url })) };
};

const visitas = async (env) => ({ texto: await resumenSemanal(env, { enCurso: true }) });

const avisos = async (env) => {
  const total = await suscriptores(env);
  return {
    texto: [
      `🔔 ${total} ${total === 1 ? "dispositivo tiene" : "dispositivos tienen"} los avisos activados`,
      await resumenEntregas(env),
    ].join(LISTA),
  };
};

// Todas las respuestas completas de un formulario, de todas las páginas
const respuestasDe = async (env, formId) => {
  const todas = [];
  let preguntas = [];
  for (let pagina = 1; ; pagina++) {
    const respuesta = await fetch(`${TALLY}/forms/${formId}/submissions?page=${pagina}&limit=100`, {
      headers: { authorization: `Bearer ${env.TALLY_API_KEY}` },
    });
    if (!respuesta.ok) throw new Error(`Tally: HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    preguntas = datos.questions ?? preguntas;
    todas.push(...datos.submissions.filter((s) => s.isCompleted));
    if (!datos.hasMore) break;
  }
  return { preguntas, respuestas: todas };
};

const diaCorto = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });

const pendientes = async (env) => {
  const importadas = await leerImportadas(env);
  const lineas = [];
  const botones = [];
  for (const [clave, formulario] of Object.entries(FORMULARIOS)) {
    const { preguntas, respuestas } = await respuestasDe(env, formulario.id);
    const yaHechas = new Set(importadas[clave] ?? []);
    const faltan = respuestas.filter((s) => !yaHechas.has(s.id));
    if (!faltan.length) continue;

    const pregunta = preguntas.find((q) => q.title === formulario.titulo)?.id;
    const lista = faltan.slice(0, MAX_LISTA).map((s) => {
      const titulo = s.responses.find((r) => r.questionId === pregunta)?.answer || "(sin título)";
      return elemento(String(titulo).trim(), `llegó el ${diaCorto.format(new Date(s.submittedAt))}`);
    });
    if (faltan.length > MAX_LISTA) lista.push(`• …y ${faltan.length - MAX_LISTA} más`);
    lineas.push(`<b>${formulario.nombre}: ${faltan.length}</b>${LISTA}${lista.join(LISTA)}`);
    botones.push({ text: `📥 Traer ${formulario.boton} (${faltan.length})`, callback_data: `traer:${clave}` });
  }
  const partes = lineas.length ? ["📋 <b>Sin traer al CMS</b>", ...lineas] : ["✅ Todo lo de los formularios está ya en el CMS."];

  // Lo que ya está en el CMS pero sigue oculto sin que nadie lo haya tocado
  const fichas = await sinRevisar(env);
  const filasBotones = botones.length ? [botones] : [];
  if (fichas.length) {
    const lista = listaSinRevisar(fichas);
    partes.push(`🕰 <b>En el CMS, ocultas sin revisar: ${fichas.length}</b>${LISTA}${lista.lineas.join(LISTA)}`);
    filasBotones.push(...lista.botones.map((b) => [b]));
  } else {
    partes.push("✅ Nada oculto esperando revisión.");
  }
  if (lineas.length) partes.push("<i>Los mensajes de contacto no se traen, no salen aquí.</i>");
  return { texto: partes.join("\n\n"), botones: filasBotones };
};

const republicar = async (env) => {
  if (!(await lanzarWorkflow(env, PUBLICAR).catch(() => false)))
    return { texto: "⚠️ GitHub no ha aceptado lanzar la publicación. Mira el token de GitHub del Worker." };
  // Se puede republicar sin que haya fallado nada: el mensaje solo habla del fallo si lo hubo
  if (await marcarReintentado(env, PUBLICAR))
    return { texto: "🔁 Publicando la web de nuevo. La última vez falló: si vuelve a fallar, os aviso." };
  return { texto: "🔁 Publicando la web de nuevo con lo último del CMS. Estará en un par de minutos." };
};

const chatid = async (_env, mensaje) => ({ texto: `El id de este chat es <code>${mensaje.chat.id}</code>` });

// Separados: los que solo consultan y los que cambian algo (lanzan una Action, mandan
// algo…). Un comando nuevo va en el grupo que le toque.
const CONSULTAR = [
  ["estado", "Si GitHub y la web funcionan ahora"],
  ["visitas", "Las visitas de lo que va de semana"],
  ["pendientes", "Lo de los formularios sin traer o sin revisar"],
  ["caducan", "Lo que desaparece de la web en 7 días"],
  ["cambios", "Lo último que se ha guardado en el CMS, y quién"],
  ["buscar", "Busca en la web: /buscar panadería"],
  ["avisos", "Cuántos tienen los avisos y si les llegan"],
  ["chatid", "El id de este chat"],
  ["ayuda", "Esta lista"],
];
const HACER = [["republicar", "Vuelve a publicar la web"]];

// La misma lista, para el menú de Telegram (telegram-config.mjs la lee de aquí). El menú
// no tiene apartados: los que hacen algo van al final y con ⚡ delante.
export const COMANDOS = [
  ...CONSULTAR.map(([command, description]) => ({ command, description })),
  ...HACER.map(([command, description]) => ({ command, description: `⚡ ${description}` })),
];

const ayuda = async () => ({
  texto: [
    "🤖 <b>Lo que me puedes pedir</b>",
    ["👀 <b>Para consultar</b>", ...CONSULTAR.map(([c, d]) => `/${c} · ${d}`)].join("\n"),
    ["⚡ <b>Hacen algo</b>", ...HACER.map(([c, d]) => `/${c} · ${d}`)].join("\n"),
  ].join("\n\n"),
});

const caducan = async () => listaCaducan();

const cambios = async (env) => ultimosCambios(env);

// Lo que va detrás del comando: "/buscar bar toca" → "bar toca"
const buscarEnWeb = async (_env, _mensaje, argumentos) => buscar(argumentos);

const ACCIONES = { estado, visitas, pendientes, caducan, cambios, buscar: buscarEnWeb, republicar, avisos, chatid, ayuda, start: ayuda };
// Los que se contestan fuera del grupo
const EN_CUALQUIER_CHAT = new Set(["chatid"]);

// ── Las pulsaciones de botones ───────────────────────────────────────────────

const pulsacion = async (env, consulta) => {
  const responder = (text, show_alert = false) => ({
    method: "answerCallbackQuery",
    callback_query_id: consulta.id,
    text,
    show_alert,
  });
  if (!delGrupo(consulta.message?.chat, env)) return responder("Esto solo funciona en el grupo.");

  const [accion, cual] = String(consulta.data ?? "").split(":");
  const quien = escapaHtml(consulta.from?.first_name ?? "Alguien");

  // «🔁 Reintentar» de los avisos de Actions que fallan (publicaciones.js)
  if (accion === "reintentar" && /^[a-z0-9-]+\.yml$/.test(cual ?? "")) {
    if (!(await lanzarWorkflow(env, cual).catch(() => false)))
      return responder("GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker.", true);
    await marcarReintentado(env, cual);
    await aTelegram(env, `🔁 ${quien} ha relanzado «${escapaHtml(nombreDe(cual))}». Si vuelve a fallar, os aviso.`);
    return responder("🔁 Lanzado de nuevo.");
  }

  if (accion !== "traer" || !TRAER[cual]) return responder("No sé qué hacer con este botón.");

  if (!(await lanzarTraer(env, cual).catch(() => false)))
    return responder("GitHub no ha aceptado lanzarlo. Usa el botón del CMS y mira el token de GitHub del Worker.", true);

  // El aviso al grupo, para que el otro admin también se entere de que ya está pedido
  const { texto, ocultos } = TRAER[cual];
  await aTelegram(env, `📥 ${quien} ha pedido traer ${texto} al CMS. En un par de minutos estarán en la lista, ${ocultos}.`);
  return responder("📥 Hecho: en un par de minutos estará en el CMS.");
};

// ── La ruta ──────────────────────────────────────────────────────────────────

const contestar = (mensaje, { texto, botones = [] }) => ({
  method: "sendMessage",
  chat_id: mensaje.chat.id,
  text: texto,
  parse_mode: "HTML",
  link_preview_options: { is_disabled: true },
  reply_parameters: { message_id: mensaje.message_id, allow_sending_without_reply: true },
  ...(botones.length ? { reply_markup: { inline_keyboard: filas(botones) } } : {}),
});

const responderJson = (cuerpo) =>
  new Response(cuerpo ? JSON.stringify(cuerpo) : "", {
    status: 200,
    headers: cuerpo ? { "content-type": "application/json; charset=utf-8" } : {},
  });

export const webhookTelegram = async (request, env) => {
  if (request.method !== "POST") return new Response("método no permitido", { status: 405 });
  if (!igualSeguro(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET))
    return new Response("no autorizado", { status: 401 });

  const update = await request.json();

  if (update.callback_query) return responderJson(await pulsacion(env, update.callback_query));

  const mensaje = update.message;
  const texto = mensaje?.text?.trim() ?? "";
  if (!texto.startsWith("/")) return responderJson(null);

  // "/estado@VenialboBot argumentos" → "estado"
  const comando = texto.slice(1).split(/\s/)[0].split("@")[0].toLowerCase();
  const accion = ACCIONES[comando];
  if (!accion) return responderJson(null);
  if (!EN_CUALQUIER_CHAT.has(comando) && !delGrupo(mensaje.chat, env)) return responderJson(null);

  try {
    const argumentos = texto.replace(/^\S+\s*/, "");
    return responderJson(contestar(mensaje, await accion(env, mensaje, argumentos)));
  } catch (e) {
    return responderJson(contestar(mensaje, { texto: `⚠️ No he podido: ${escapaHtml(String(e.message ?? e))}` }));
  }
};
