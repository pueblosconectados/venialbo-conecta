// /deshacer: volver una ficha a como estaba antes de su último cambio, desde el grupo de
// Telegram (idea 20 de IDEAS.md). Es el seguro para cuando alguien borra o estropea algo
// desde el móvil.
//
// No revierte commits: devuelve un fichero a como estaba. Cada guardado del CMS toca una
// sola ficha, y casi nunca es el último commit de main (siempre hay alguno de las Actions
// encima), así que un `git revert` del último no serviría.
//
// - La tanda: los commits seguidos de una ficha, de quien sean (el CMS, «Publicar desde
//   Telegram», un deshacer anterior), separados menos de 30 minutos. Al guardar se suele
//   guardar varias veces seguidas, y deshacer solo el último dejaría la ficha a medias.
//   Deshacer la deja como estaba antes del primero; las demás fichas no se tocan.
//   La llegada desde Tally ("… recibidas por el formulario") no entra en la tanda: es el
//   punto de partida, y quitarla es «🗑 Descartar», que tiene su botón.
// - /deshacer enseña las 5 fichas tocadas más recientemente, cada una con su botón. Al
//   pulsarlo pide confirmación y dice qué cambiará; «Sí» lanza el workflow deshacer.yml
//   (avisos/deshacer.mjs), que al terminar llama a POST /deshecho para contarlo.
// - Si alguien guarda la ficha entre que sale el botón y se confirma, no se hace nada:
//   el botón lleva el SHA que tenía el fichero, y la Action lo comprueba antes de tocar.
// - Deshacer también se deshace: su commit, "Deshacer <ruta> (desde Telegram)", sale en
//   /deshacer como una tanda más.
// - Lo que no se deshace: el aviso push y el texto para difundir, si ya salieron, y las
//   fotos subidas en la tanda, que se quedan en media/ (las encuentra imagenes-huerfanas).
//
// Lo de cada botón va en el KV ESTADO ("deshacer:<id>", una hora): no cabe en los 64
// bytes de callback_data. El GITHUB_TOKEN del Worker sigue sin poder escribir.

import { ficherosDeCommit, graphql, lanzarWorkflow, listarCommits } from "./github.js";
import { deSlug, hace, nombres, TIPOS } from "./cambios.js";
import { elemento, escapaHtml, LISTA, llamarTelegram } from "./telegram.js";

const WORKFLOW = "deshacer.yml";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const REPO = `repository(owner: "pueblosconectados", name: "venialbo-conecta")`;
const CUANTAS = 5;
// Los commits del bot no dicen qué fichas tocan: se pregunta, pero no por muchos
const MAX_DEL_BOT = 6;
const SEGUIDOS = 30 * 60_000;
const HORA = 60 * 60;
const BOT = "github-actions[bot]";

export const RUTA_FICHA = /^web-static\/content\/([a-z]+)\/([A-Za-z0-9][A-Za-z0-9._-]*)\.json$/;

// Las fichas que nombra un commit en su mensaje; null si hay que preguntar a GitHub
const fichasDelMensaje = (mensaje) => {
  const linea = mensaje.split("\n")[0];
  const m =
    linea.match(/^(?:Create|Update|Delete) (\S+) \(via Pages CMS\)$/) ?? linea.match(/^(?:Deshacer|Alargar) (\S+) \(desde Telegram\)$/);
  if (m) return [m[1]];
  if (linea.startsWith("content: ")) return null;
  return [];
};

// Las rutas de las últimas fichas tocadas, de la más reciente a la más vieja
const fichasRecientes = async (env) => {
  const rutas = [];
  let preguntados = 0;
  for (const { sha, commit } of await listarCommits(env)) {
    let ficheros = fichasDelMensaje(commit.message);
    if (ficheros === null) {
      if (preguntados++ >= MAX_DEL_BOT) continue;
      ficheros = await ficherosDeCommit(env, sha).catch(() => []);
    }
    for (const ruta of ficheros) if (RUTA_FICHA.test(ruta) && !rutas.includes(ruta)) rutas.push(ruta);
    if (rutas.length >= CUANTAS) break;
  }
  return rutas.slice(0, CUANTAS);
};

const leerJson = (texto) => {
  try {
    return texto == null ? null : JSON.parse(texto);
  } catch {
    return null;
  }
};

const DE_TALLY = /^content: .* recibid[ao]s por el formulario$/;

// Los commits seguidos de la ficha, del más nuevo al más viejo; vacío si lo último es su
// llegada desde Tally
const tandaDe = (historia) => {
  if (DE_TALLY.test(historia[0].messageHeadline)) return [];
  const tanda = [historia[0]];
  for (const c of historia.slice(1)) {
    if (DE_TALLY.test(c.messageHeadline)) break;
    if (Date.parse(tanda.at(-1).authoredDate) - Date.parse(c.authoredDate) > SEGUIDOS) break;
    tanda.push(c);
  }
  return tanda;
};

// ── Qué cambia al deshacer ──────────────────────────────────────────────────

const ETIQUETAS = {
  titulo: "el título",
  nombre: "el nombre",
  descripcion: "la descripción",
  contenido: "el texto",
  resumen: "el resumen",
  imagen_url: "la foto",
  logo_url: "el logo",
  galeria: "las fotos",
  fotos: "las fotos",
  fecha: "la fecha",
  fecha_publicacion: "la fecha de publicación",
  fecha_caducidad: "la fecha de caducidad",
  hora_caducidad: "la hora de caducidad",
  fecha_fin: "la fecha de fin",
  hora: "la hora",
  hora_fin: "la hora de fin",
  imagen: "la foto",
  video_url: "el vídeo",
  album_drive: "el álbum",
  album_facebook: "el álbum",
  web_url: "la web",
  url: "el enlace",
  enlace: "el enlace",
  coordenadas: "la ubicación",
  categoria: "la categoría",
  organiza: "quién organiza",
  superficie: "los metros",
  habitaciones: "las habitaciones",
  banos: "los baños",
  nota: "la nota",
  destacada: "lo de destacada",
  horario: "el horario",
  telefono: "el teléfono",
  telefono_movil: "el móvil",
  email: "el correo",
  direccion: "la dirección",
  contacto: "el contacto",
  precio: "el precio",
  tipo: "el tipo",
  categoria_negocio: "el tipo de negocio",
  redes_sociales: "las redes",
  enlaces: "los enlaces",
  documentos: "los documentos",
  novedad_hasta: "lo de «¡Nuevo!»",
};
const etiqueta = (clave) => ETIQUETAS[clave] ?? clave.replace(/_/g, " ");
const ACTIVO = ["activo", "activa"];
const MAX_CAMPOS = 6;

// "Vuelve el horario, el móvil y la foto de antes; vuelve a estar oculta"
export const queCambia = (antes, ahora) => {
  if (!antes) return "Se borra la ficha.";
  if (!ahora) return "Vuelve la ficha, como estaba antes de borrarla.";
  const partes = [];
  const activo = ACTIVO.find((k) => k in antes || k in ahora);
  if (activo && (antes[activo] !== false) !== (ahora[activo] !== false))
    partes.push(antes[activo] === false ? "vuelve a estar oculta" : "vuelve a estar publicada");

  const claves = [...new Set([...Object.keys(antes), ...Object.keys(ahora)])].filter((k) => !ACTIVO.includes(k));
  const distintas = claves.filter((k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify(ahora[k] ?? null));
  const vacio = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
  const vuelven = distintas.filter((k) => !vacio(antes[k])).map(etiqueta);
  const quitan = distintas.filter((k) => vacio(antes[k])).map(etiqueta);
  const lista = (l) => {
    const vistas = l.slice(0, MAX_CAMPOS);
    const mas = l.length - vistas.length;
    return nombres(mas ? [...vistas, `${mas} más`] : vistas);
  };
  if (vuelven.length) partes.push(`vuelve${vuelven.length > 1 ? "n" : ""} ${lista(vuelven)} de antes`);
  if (quitan.length) partes.push(`se quita${quitan.length > 1 ? "n" : ""} ${lista(quitan)}`);
  if (!partes.length) return null;
  const texto = partes.join("; ");
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`;
};

// ── /deshacer ───────────────────────────────────────────────────────────────

const autorDe = (c) => (c.author?.name === BOT ? "el bot" : c.author?.name ?? "alguien");

const recorta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

export const listaDeshacer = async (env, { ahora = Date.now() } = {}) => {
  const rutas = await fichasRecientes(env);
  if (!rutas.length) return { texto: "No encuentro cambios recientes en las fichas." };

  // El historial y el contenido de ahora de cada ficha, y lo ya avisado, en una consulta
  const historias = rutas
    .map(
      (r, i) =>
        `h${i}: history(path: ${JSON.stringify(r)}, first: 20) { nodes { oid messageHeadline authoredDate author { name } parents(first: 1) { nodes { oid } } } }`,
    )
    .join("\n");
  const actuales = rutas.map((r, i) => `a${i}: object(expression: ${JSON.stringify(`main:${r}`)}) { ... on Blob { oid text } }`).join("\n");
  const { repository: datos } = await graphql(
    env,
    `{ ${REPO} {
      main: object(expression: "main") { ... on Commit { ${historias} } }
      ${actuales}
      notificados: object(expression: "main:avisos/notificados.json") { ... on Blob { text } }
    } }`,
  );

  const fichas = rutas
    .map((ruta, i) => {
      const historia = datos.main[`h${i}`]?.nodes ?? [];
      if (!historia.length) return null;
      const tanda = tandaDe(historia);
      if (!tanda.length) return null;
      const base = tanda.at(-1).parents.nodes[0]?.oid;
      if (!base) return null;
      return { ruta, tanda, base, actual: datos[`a${i}`] ?? null };
    })
    .filter(Boolean);

  // Cómo estaba cada una antes de su tanda
  const antes = fichas.length
    ? (
        await graphql(
          env,
          `{ ${REPO} { ${fichas.map((f, i) => `b${i}: object(expression: ${JSON.stringify(`${f.base}:${f.ruta}`)}) { ... on Blob { text } }`).join("\n")} } }`,
        )
      ).repository
    : {};
  const avisadas = new Set(leerJson(datos.notificados?.text) ?? []);

  const lineas = [];
  const botones = [];
  for (const [i, f] of fichas.entries()) {
    const [, coleccion, id] = f.ruta.match(RUTA_FICHA);
    const ahoraJson = leerJson(f.actual?.text);
    const antesJson = leerJson(antes[`b${i}`]?.text);
    // Creada y borrada en la misma tanda, o guardada sin cambiar nada: nada que deshacer
    if (!antesJson && !ahoraJson) continue;
    const efecto = queCambia(antesJson, ahoraJson);
    if (!efecto) continue;

    const titulo = String(ahoraJson?.titulo || ahoraJson?.nombre || antesJson?.titulo || antesJson?.nombre || deSlug(id)).trim();
    const autores = nombres([...new Set(f.tanda.map(autorDe))]);
    const guardados = f.tanda.length === 1 ? "1 cambio" : `${f.tanda.length} cambios`;
    const quien = `${guardados} de ${autores}, ${hace(Date.parse(f.tanda[0].authoredDate), ahora)}`;
    // Lo que no se deshace: si ya se avisó a los móviles y deshacer la quita de la web
    const visible = (j) => Boolean(j) && (j.activo ?? j.activa) !== false;
    const seQuita = visible(ahoraJson) && !visible(antesJson);
    const avisada = seQuita && avisadas.has(`${coleccion}/${id}`);

    const clave = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.ESTADO.put(
      `deshacer:${clave}`,
      JSON.stringify({ ruta: f.ruta, base: f.base, esperado: f.actual?.oid ?? "ninguno", titulo, quien, efecto, avisada }),
      { expirationTtl: HORA },
    );
    lineas.push(elemento(titulo, `${escapaHtml(TIPOS[coleccion] ?? coleccion)} · ${escapaHtml(quien)}`));
    botones.push([{ text: `↩️ ${recorta(titulo, 30)}`, callback_data: `desh:${clave}` }]);
  }
  if (!lineas.length) return { texto: "No hay nada que deshacer en las últimas fichas tocadas." };

  return {
    texto: [
      "↩️ <b>¿Qué ficha vuelvo a como estaba?</b>",
      lineas.join(LISTA),
      "<i>Cada botón deshace los cambios seguidos de esa ficha, y solo de esa. Antes de hacer nada, os digo qué cambia y pregunto. Los botones valen una hora.</i>",
    ].join("\n\n"),
    botones,
  };
};

// ── Los botones ─────────────────────────────────────────────────────────────

export const esBotonDeshacer = (accion) => ["desh", "deshok", "deshno"].includes(accion);

// La confirmación, para el mensaje y para cuando se cancela
const resumen = (d) =>
  [
    `<b>${escapaHtml(d.titulo)}</b>: ${escapaHtml(d.quien)}.`,
    escapaHtml(d.efecto),
    ...(d.avisada ? ["📣 <i>Ya se avisó a los móviles de esta ficha: eso no se deshace.</i>"] : []),
  ].join("\n");

const NO_VALE = "Este botón ya no vale: ha pasado la hora o ya se ha usado. Escribe /deshacer otra vez.";
const CAMBIADA = "Alguien ha vuelto a guardar esta ficha desde que salió la lista. Escribe /deshacer otra vez.";

// El SHA de la ficha ahora mismo en main, o "ninguno" si no existe
const shaAhora = async (env, ruta) => {
  const { repository } = await graphql(env, `{ ${REPO} { f: object(expression: ${JSON.stringify(`main:${ruta}`)}) { oid } } }`);
  return repository.f?.oid ?? "ninguno";
};

// Devuelve el texto para answerCallbackQuery y si va como alerta
export const pulsacionDeshacer = async (env, consulta, accion, clave, quien) => {
  if (!/^[0-9a-f]{10}$/.test(clave ?? "")) return ["No sé qué hacer con este botón.", true];
  const mensaje = consulta.message;
  const datos = await env.ESTADO.get(`deshacer:${clave}`, "json");
  if (!datos) return [NO_VALE, true];
  const editar = (texto) =>
    llamarTelegram(env, "editMessageText", { chat_id: mensaje.chat.id, message_id: mensaje.message_id, text: texto, parse_mode: "HTML" });

  if (accion === "desh") {
    if ((await shaAhora(env, datos.ruta)) !== datos.esperado) return [CAMBIADA, true];
    await llamarTelegram(env, "sendMessage", {
      chat_id: mensaje.chat.id,
      text: `↩️ <b>¿Deshago esto?</b>\n\n${resumen(datos)}`,
      parse_mode: "HTML",
      reply_parameters: { message_id: mensaje.message_id, allow_sending_without_reply: true },
      reply_markup: {
        inline_keyboard: [
          [
            { text: "↩️ Sí, deshacer", callback_data: `deshok:${clave}` },
            { text: "❌ No", callback_data: `deshno:${clave}` },
          ],
        ],
      },
    });
    return ["Mira la pregunta de abajo."];
  }

  if (accion === "deshno") {
    await editar(`👌 ${quien} lo deja como está.\n\n${resumen(datos)}`);
    return ["Vale, no se toca."];
  }

  // Se borra antes de lanzar nada: dos toques seguidos no lanzan dos Actions
  await env.ESTADO.delete(`deshacer:${clave}`);
  const inputs = { ruta: datos.ruta, base: datos.base, esperado: datos.esperado };
  if (!(await lanzarWorkflow(env, WORKFLOW, inputs).catch(() => false))) {
    await env.ESTADO.put(`deshacer:${clave}`, JSON.stringify(datos), { expirationTtl: HORA });
    return ["GitHub no ha aceptado lanzarlo. Mira el token de GitHub del Worker, o hazlo desde GitHub.", true];
  }
  await editar(`⏳ ${quien} lo deshace. Os aviso cuando esté.\n\n${resumen(datos)}`);
  return ["↩️ En marcha."];
};

// ── POST /deshecho: lo que cuenta la Action al terminar ─────────────────────

const valido = (r) =>
  r &&
  ["hecho", "cambiada", "error"].includes(r.estado) &&
  typeof r.ruta === "string" &&
  RUTA_FICHA.test(r.ruta) &&
  (r.efecto === undefined || ["restaurada", "borrada", "recuperada"].includes(r.efecto)) &&
  (r.titulo === undefined || (typeof r.titulo === "string" && r.titulo.length <= 300)) &&
  (r.mensaje === undefined || (typeof r.mensaje === "string" && r.mensaje.length <= 500));

export const contarDeshecho = async (r, env) => {
  if (!valido(r)) return { error: "resultado no válido" };
  const [, coleccion, id] = r.ruta.match(RUTA_FICHA);
  const titulo = `«${escapaHtml(r.titulo || deSlug(id))}»`;
  let texto;
  if (r.estado === "hecho") {
    const que = { restaurada: "vuelve a estar como antes", borrada: "se ha borrado", recuperada: "ha vuelto" }[r.efecto];
    texto = `↩️ Deshecho: ${titulo} ${que}. En la web, en un par de minutos.\n<i>Si no era eso, /deshacer lo vuelve a poner.</i>`;
  } else if (r.estado === "cambiada") texto = `⚠️ ${titulo} no se ha deshecho: alguien la ha guardado entretanto. Escribe /deshacer otra vez.`;
  else texto = `⚠️ No se ha podido deshacer ${titulo}${r.mensaje ? `: ${escapaHtml(r.mensaje)}` : ""}. Mira la Action «Deshacer desde Telegram».`;

  const botones =
    r.estado === "hecho" && r.efecto !== "borrada"
      ? [[{ text: "📝 Ver en el CMS", url: `${CMS}/${coleccion}/edit/${encodeURIComponent(r.ruta)}` }]]
      : [];
  const enviado = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: texto,
    parse_mode: "HTML",
    ...(botones.length ? { reply_markup: { inline_keyboard: botones } } : {}),
  });
  return enviado ? { ok: true } : { error: "Telegram no lo ha aceptado" };
};
