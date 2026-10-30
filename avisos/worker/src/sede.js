// La sede electrónica del Ayuntamiento: cada hora, de 7:30 a 22:30, mira su tablón de
// anuncios y avisa al grupo de lo nuevo, uno por mensaje. El Ayuntamiento no avisa, y
// mucho de lo que sube acaba en el Tablón de la web.
//
// La sede es de Gestiona (esPublico) y no tiene RSS: se lee la tabla HTML de /board, que
// trae los 10 últimos, del más nuevo al más viejo, sin sesión. Cada anuncio tiene un
// enlace fijo, /preview-document/<uuid>, que se abre sin sesión: ese uuid es lo que se
// apunta como visto en el KV ESTADO.
//
// - La primera vez solo apunta lo que hay, sin avisar.
// - Solo se avisa de lo publicado en los últimos DIAS_RECIENTE días: si quitan un
//   anuncio, sube a la primera página uno viejo que nunca se apuntó.
// - Si los 10 son nuevos de golpe, puede haber más en la página 2: se dice.
// - Si la sede no contesta, o la página cambia y ya no se encuentra la tabla, avisa tras
//   FALLOS_AVISO vueltas seguidas (horas), y otra vez al volver. La sede va lenta a veces.

import { aTelegram, elemento, escapaHtml, LISTA } from "./telegram.js";

export const SEDE = "https://venialbo.sedelectronica.es";
const TABLON = `${SEDE}/board`;
const CLAVE = "sede";
const ESPERA = 30_000;
const FALLOS_AVISO = 3;
const DIAS_RECIENTE = 7;
// Lo que se recuerda: de sobra para la primera página
const MAX_VISTOS = 100;
const DIA = 24 * 60 * 60 * 1000;

const entidades = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const texto = (html) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (todo, nombre) => entidades[nombre] ?? todo)
    .replace(/\s+/g, " ")
    .trim();

const celda = (fila, nombre) => {
  const m = fila.match(new RegExp(`class="class_${nombre}"[^>]*>([\\s\\S]*?)</td>`));
  return m ? texto(m[1]) : "";
};

// "30/10/2026" → milisegundos de ese día (en UTC; para contar días basta)
const fechaDe = (dma) => {
  const [d, m, a] = dma.split("/").map(Number);
  return a ? Date.UTC(a, m - 1, d) : NaN;
};

// Las filas de la tabla, en el orden de la sede. null si no está la tabla: la página ha
// cambiado (una tabla sin filas es un tablón vacío, que puede pasar).
export const anunciosDe = (html) => {
  const inicio = html.indexOf("AdvertisementBoardListPanel");
  if (inicio < 0) return null;
  const tabla = html.slice(inicio, html.indexOf("</table>", inicio));
  return tabla
    .split('<td class="class_name"')
    .slice(1)
    .map((fila) => {
      const id = fila.match(/\/preview-document\/([0-9a-f-]{36})/)?.[1];
      const enlace = fila.match(/class="gIconLink"[^>]*>([\s\S]*?)<\/a>/);
      return {
        id,
        titulo: (enlace && texto(enlace[1])) || celda(fila, "description"),
        expediente: celda(fila, "folderCode"),
        procedimiento: celda(fila, "folderName"),
        fecha: celda(fila, "dateFrom"),
      };
    })
    .filter((a) => a.id);
};

export const enlaceDe = (anuncio) => `${SEDE}/preview-document/${anuncio.id}`;

// Los anuncios, o { fallo } con el motivo
const leerTablon = async () => {
  try {
    const respuesta = await fetch(TABLON, {
      headers: { "user-agent": "VenialboConecta (+https://venialboconecta.es/)" },
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA),
    });
    if (!respuesta.ok) return { fallo: `responde con un error (HTTP ${respuesta.status})` };
    const anuncios = anunciosDe(await respuesta.text());
    return anuncios ? { anuncios } : { fallo: "ha cambiado la página y no encuentro la lista de anuncios" };
  } catch (e) {
    return { fallo: e?.name === "TimeoutError" ? `no contesta en ${ESPERA / 1000} s` : "no se puede conectar" };
  }
};

const BOTON_TABLON = { text: "Abrir el tablón de la sede", url: TABLON };

const mensajeNuevo = (anuncio) => ({
  texto: [
    "🏛️ <b>Nuevo en la sede electrónica</b>",
    `<b>${escapaHtml(anuncio.titulo)}</b>`,
    escapaHtml([anuncio.procedimiento, anuncio.fecha].filter(Boolean).join(" · ")),
  ].join("\n"),
  botones: [{ text: "Ver en la sede", url: enlaceDe(anuncio) }],
});

// Compara con la vez anterior y devuelve el estado nuevo y los mensajes que tocan. Lo
// que se guarda: { vistos: [uuid…], fallos, caida, motivo }. Sin `vistos`, es
// la primera vez. `ahora` en milisegundos.
export const comparar = (anterior, { anuncios, fallo }, ahora) => {
  const nuevo = { vistos: anterior.vistos, fallos: 0, caida: false };
  const mensajes = [];

  if (fallo) {
    const fallos = (anterior.fallos ?? 0) + 1;
    Object.assign(nuevo, { fallos, caida: anterior.caida ?? false, motivo: fallo });
    if (!anterior.caida && fallos >= FALLOS_AVISO) {
      nuevo.caida = true;
      mensajes.push({
        texto: `⚠️ <b>No puedo mirar la sede electrónica</b>\nEl tablón ${escapaHtml(fallo)}, ${fallos} veces seguidas. Mientras dure no os aviso de lo que suban: miradlo a mano.`,
        botones: [BOTON_TABLON],
      });
    }
    return { nuevo, mensajes };
  }

  if (anterior.caida)
    mensajes.push({ texto: "🟢 <b>Vuelvo a poder mirar la sede electrónica</b>\nOs aviso de lo nuevo, si lo hay." });

  const vistos = new Set(anterior.vistos ?? []);
  const nuevos = anterior.vistos ? anuncios.filter((a) => !vistos.has(a.id)) : [];
  // Del más viejo al más nuevo, como han ido subiendo
  const recientes = nuevos.filter((a) => !(ahora - fechaDe(a.fecha) > DIAS_RECIENTE * DIA)).reverse();
  mensajes.push(...recientes.map(mensajeNuevo));
  if (anuncios.length >= 10 && nuevos.length === anuncios.length)
    mensajes.push({
      texto: `🏛️ Han subido ${anuncios.length} o más de golpe a la sede: puede haber más en la página siguiente.`,
      botones: [BOTON_TABLON],
    });

  // Lo de ahora primero; lo que ya no está en la página se va olvidando
  nuevo.vistos = [...new Set([...anuncios.map((a) => a.id), ...(anterior.vistos ?? [])])].slice(0, MAX_VISTOS);
  return { nuevo, mensajes };
};

const leerEstado = async (env) => (await env.ESTADO.get(CLAVE, "json")) ?? {};

// Lo que hace el cron. Con `enviar: false` solo calcula (para GET /sede).
export const vigilarSede = async (env, { enviar = true, ahora = Date.now() } = {}) => {
  const [anterior, lectura] = await Promise.all([leerEstado(env), leerTablon()]);
  const { nuevo, mensajes } = comparar(anterior, lectura, ahora);
  if (!enviar) return { ...lectura, anterior, nuevo, mensajes };

  for (const { texto, botones } of mensajes) {
    // Si Telegram falla no se guarda el estado: la próxima vez se vuelve a intentar
    if (!(await aTelegram(env, texto, botones))) throw new Error("Telegram no aceptó el aviso");
  }
  // Solo se escribe si ha cambiado algo (el KV gratuito da 1.000 escrituras al día)
  if (JSON.stringify(nuevo) !== JSON.stringify(anterior)) await env.ESTADO.put(CLAVE, JSON.stringify(nuevo));
  return { mensajes: mensajes.length };
};

// Para /sede: lo último que hay en el tablón, ahora
const MAX_LISTA = 5;
export const listaSede = async () => {
  const { anuncios, fallo } = await leerTablon();
  if (fallo) return { texto: `⚠️ El tablón de la sede ${escapaHtml(fallo)}.`, botones: [BOTON_TABLON] };
  if (!anuncios.length) return { texto: "🏛️ El tablón de la sede está vacío.", botones: [BOTON_TABLON] };
  const lista = anuncios
    .slice(0, MAX_LISTA)
    .map((a) => elemento(a.titulo, `${escapaHtml(a.fecha)} · <a href="${enlaceDe(a)}">ver</a>`));
  return {
    texto: [`🏛️ <b>Lo último en la sede electrónica</b>`, ...lista].join(LISTA),
    botones: [BOTON_TABLON],
  };
};
