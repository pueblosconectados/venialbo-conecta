// «Esta semana en Venialbo» (idea 25 de IDEAS.md): los viernes a las 10:00 llega al grupo
// un resumen listo para reenviar al grupo del pueblo, con «📲 Enviar por WhatsApp» (wa.me
// con el texto ya escrito). /semana lo enseña cuando se quiera, y GET /semana (con el
// token) lo devuelve sin mandarlo (?enviar lo manda).
//
// Lo que entra, de lo publicado en la web (data/*.json, sin token, como caducidad.js):
// - Agenda: las actividades de los próximos DIAS días (de viernes a jueves: el viernes
//   siguiente ya sale en el siguiente), cada día que caen las que se repiten, y las
//   fechas señaladas (las anuales, cada año).
// - Avisos de portada vigentes.
// - Lo publicado en los últimos DIAS días: noticias, anuncios del tablón y casas.
// - Las actividades celebradas esta semana que ya tienen fotos en la web.
// Sin enlace por cosa (WhatsApp solo saca la vista previa del primero): uno por apartado.
// Si no hay nada, el viernes no escribe.
//
// Es el mismo texto que serviría para una newsletter (la 14 de MEJORAS.md).

import { escapaHtml, llamarTelegram } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const DIAS = 7;
const DIA = 24 * 60 * 60 * 1000;
const SEMANAS_REPETICION = { semanal: 1, quincenal: 2 };
// wa.me con el texto: lo que cabe sin que la dirección se haga demasiado larga
const MAX_URL_WHATSAPP = 4000;

const hoyMadrid = (ahora) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);
const ms = (iso) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const sumar = (dia, n) => iso(ms(dia) + n * DIA);

const CORTO = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });
const LARGO = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
// «Sáb 31», «Dom 1»
const corto = (dia) => {
  const t = CORTO.format(new Date(ms(dia))).replace(",", "").replace(".", "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const largo = (dia) => LARGO.format(new Date(ms(dia))).replace(",", "");
const hora = (h) => (h ? h.replace(/^0(\d)/, "$1") : null);

const leer = async (recurso) => {
  const r = await fetch(`${WEB}/data/${recurso}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error(`La web: HTTP ${r.status} en data/${recurso}.json`);
  return r.json();
};

// Lo que pasa cada día de [desde, hasta]: [{ dia, orden, texto }]
const agenda = (actividades, fechas, desde, hasta) => {
  const lineas = [];
  for (const a of actividades) {
    const inicio = a.fecha.slice(0, 10);
    const fin = a.fecha_fin && a.fecha_fin.slice(0, 10) > inicio ? a.fecha_fin.slice(0, 10) : inicio;
    if (fin < desde || inicio > hasta) continue;
    const cuando = [a.hora && hora(a.hora), a.titulo.trim()].filter(Boolean).join(" · ");
    const semanas = SEMANAS_REPETICION[a.repeticion];
    if (semanas) {
      // Cada día que cae dentro de la semana
      for (let d = inicio; d <= fin; d = sumar(d, 7 * semanas))
        if (d >= desde && d <= hasta) lineas.push({ dia: d, orden: a.hora ?? "", texto: `${corto(d)} · ${cuando}` });
    } else if (fin === inicio) {
      lineas.push({ dia: inicio, orden: a.hora ?? "", texto: `${corto(inicio)} · ${cuando}` });
    } else if (inicio >= desde) {
      lineas.push({ dia: inicio, orden: a.hora ?? "", texto: `${corto(inicio)} a ${corto(fin).toLowerCase()} · ${cuando}` });
    } else {
      // Empezó antes y sigue: sale el primer día de la semana
      lineas.push({ dia: desde, orden: "", texto: `Hasta el ${corto(fin).toLowerCase()} · ${cuando}` });
    }
  }
  // Las fechas señaladas; las anuales, en el año que toque
  for (const f of fechas) {
    const inicio = f.fecha.slice(0, 10);
    const dura = f.fecha_fin && f.fecha_fin.slice(0, 10) > inicio ? (ms(f.fecha_fin) - ms(inicio)) / DIA : 0;
    const candidatos = f.anual ? [desde.slice(0, 4), hasta.slice(0, 4)].map((y) => `${y}${inicio.slice(4)}`) : [inicio];
    for (const d of new Set(candidatos)) {
      if (f.anual && d < inicio) continue;
      const fin = sumar(d, dura);
      if (fin < desde || d > hasta) continue;
      const dia = d < desde ? desde : d;
      lineas.push({ dia, orden: "", texto: `${corto(dia)} · 🎉 ${f.nombre.trim()}` });
    }
  }
  return lineas.sort((a, b) => a.dia.localeCompare(b.dia) || a.orden.localeCompare(b.orden)).map((l) => l.texto);
};

const apartado = (titulo, lineas, enlace) =>
  lineas.length ? [`${titulo}`, ...lineas.map((l) => `• ${l}`), ...(enlace ? [`👉 ${WEB}${enlace}`] : [])].join("\n") : null;

// { texto (para WhatsApp), vacio }
export const semana = async ({ ahora = Date.now() } = {}) => {
  const hoy = hoyMadrid(ahora);
  const hasta = sumar(hoy, DIAS - 1);
  const haceUnaSemana = sumar(hoy, -(DIAS - 1));
  const [actividades, fechas, noticias, anuncios, avisos] = await Promise.all(
    ["actividades", "fechas", "noticias", "anuncios", "avisos"].map(leer),
  );

  const vigente = (f) => !f.fecha_caducidad || f.fecha_caducidad.slice(0, 10) >= hoy;
  const reciente = (f) => (f.fecha_publicacion ?? "").slice(0, 10) >= haceUnaSemana && (f.fecha_publicacion ?? "").slice(0, 10) <= hoy;
  const esCasa = (a) => String(a.tipo).startsWith("casa_");
  const celebradaEstaSemana = (a) => {
    const fin = (a.fecha_fin ?? a.fecha).slice(0, 10);
    return fin < hoy && fin >= haceUnaSemana;
  };

  const partes = [
    apartado("📅 *Agenda*", agenda(actividades, fechas, hoy, hasta), "/actividades"),
    apartado("📢 *Avisos*", avisos.filter(vigente).map((a) => a.titulo.trim())),
    apartado("📸 *Ya están las fotos*", actividades.filter((a) => celebradaEstaSemana(a) && a.fotos > 0).map((a) => a.titulo.trim()), "/actividades"),
    apartado("📰 *Noticias*", noticias.filter(reciente).map((n) => n.titulo.trim()), "/noticias"),
    apartado("📌 *Tablón*", anuncios.filter((a) => !esCasa(a) && reciente(a) && vigente(a)).map((a) => a.titulo.trim()), "/tablon"),
    apartado("🏠 *Casas en venta y alquiler*", anuncios.filter((a) => esCasa(a) && reciente(a) && vigente(a)).map((a) => a.titulo.trim()), "/tablon"),
  ].filter(Boolean);

  const texto = [
    `🗞 *Esta semana en Venialbo*\n_Del ${largo(hoy)} al ${largo(hasta)}_`,
    ...partes,
    `Todo en 👉 ${WEB}`,
  ].join("\n\n");
  return { texto, vacio: partes.length === 0 };
};

const botones = (texto) => {
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  return [
    ...(whatsapp.length <= MAX_URL_WHATSAPP ? [[{ text: "📲 Enviar por WhatsApp", url: whatsapp }]] : []),
    [{ text: "🌐 Abrir la web", url: WEB }],
  ];
};

// El mensaje para el grupo (también la respuesta de /semana)
export const mensajeSemana = async (opciones) => {
  const { texto, vacio } = await semana(opciones);
  if (vacio) return { texto: "😴 Esta semana no hay nada que contar: ni agenda, ni avisos, ni nada nuevo publicado.", botones: [], vacio };
  const largoDeMas = `https://wa.me/?text=${encodeURIComponent(texto)}`.length > MAX_URL_WHATSAPP;
  return {
    texto: [
      "📣 <b>Para reenviar al grupo del pueblo</b>",
      escapaHtml(texto),
      ...(largoDeMas ? ["<i>Es demasiado largo para el botón de WhatsApp: mantén pulsado el mensaje para copiarlo.</i>"] : []),
    ].join("\n\n"),
    botones: botones(texto),
    vacio,
  };
};

// El viernes a las 10:00. Si no hay nada, no escribe.
export const enviarSemana = async (env, opciones) => {
  const { texto, botones: filas, vacio } = await mensajeSemana(opciones);
  if (vacio) return null;
  const ok = await llamarTelegram(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: texto,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: filas },
  });
  if (!ok) throw new Error("Telegram no aceptó el resumen de la semana");
  return texto;
};
