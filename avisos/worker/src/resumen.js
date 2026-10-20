// El resumen semanal de visitas: cada lunes a las 9:00 (hora de Madrid) manda al grupo de
// Telegram cómo fue la semana anterior, de lunes a domingo, según Cloudflare Web
// Analytics.
//
// Los datos salen de la API GraphQL de Cloudflare (el dataset de Web Analytics,
// rumPageloadEventsAdaptiveGroups, que Cloudflare no documenta del todo; probado el
// 2026-10-20). Hace falta un token con solo "Account Analytics: Read"
// (CF_ANALYTICS_TOKEN). El siteTag no es el token del script de la web: se saca de la
// propia API agrupando por siteTag y requestHost.
//
// Las cifras son aproximadas: quien lleva bloqueador no cuenta, y Cloudflare muestrea
// cuando hay mucho tráfico (a esta escala, casi nada).

import { aTelegram, escapaHtml } from "./telegram.js";

const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const WEB = "https://venialboconecta.es";
const DIA = 24 * 60 * 60 * 1000;
const PAGINAS = 5;

// ── Las fechas, en hora de Madrid ────────────────────────────────────────────

// "2026-10-26"
const fechaMadrid = (instante) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(instante);

export const horaMadrid = (instante) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(
      instante,
    ),
  );

// Las 00:00 de ese día en Madrid, como instante. El desfase se mira en el propio día,
// porque una semana puede cruzar el cambio de hora.
const medianocheMadrid = (fecha) => {
  const mediodia = new Date(`${fecha}T12:00:00Z`);
  const desfase = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
    .formatToParts(mediodia)
    .find((p) => p.type === "timeZoneName")
    .value.replace("GMT", "");
  const [año, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(año, mes - 1, dia) - Number(desfase || 0) * 3600_000);
};

const sumaDias = (fecha, dias) => new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * DIA).toISOString().slice(0, 10);

// La semana que termina el lunes de esta semana (o el de la siguiente, con `enCurso`, para
// probar con lo que va de semana) y la anterior a esa, para comparar.
const semanas = (ahora, enCurso) => {
  const hoy = fechaMadrid(ahora);
  const diaSemana = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  const lunes = sumaDias(hoy, -diaSemana + (enCurso ? 7 : 0));
  const inicio = sumaDias(lunes, -7);
  return {
    desde: medianocheMadrid(inicio),
    hasta: medianocheMadrid(lunes),
    previaDesde: medianocheMadrid(sumaDias(lunes, -14)),
    primerDia: inicio,
    ultimoDia: sumaDias(lunes, -1),
  };
};

const formatoDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
const rotulo = ({ primerDia, ultimoDia }) => {
  const [a, b] = [primerDia, ultimoDia].map((f) => formatoDia.format(new Date(`${f}T12:00:00Z`)));
  // "Del 19 al 25 de octubre", o "Del 26 de octubre al 1 de noviembre"
  const [diaA, ...mesA] = a.split(" ");
  return mesA.join(" ") === b.split(" ").slice(1).join(" ") ? `Del ${diaA} al ${b}` : `Del ${a} al ${b}`;
};

// ── La consulta ──────────────────────────────────────────────────────────────

const CONSULTA = `query($cuenta: String!, $sitio: String!, $desde: Time!, $hasta: Time!, $previaDesde: Time!) {
  viewer { accounts(filter: { accountTag: $cuenta }) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      count sum { visits }
    }
    previa: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $sitio, datetime_geq: $previaDesde, datetime_lt: $desde }) {
      count sum { visits }
    }
    paginas: rumPageloadEventsAdaptiveGroups(limit: 20, orderBy: [count_DESC], filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      count dimensions { requestPath }
    }
    origenes: rumPageloadEventsAdaptiveGroups(limit: 50, orderBy: [sum_visits_DESC], filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      sum { visits } dimensions { refererHost }
    }
    dispositivos: rumPageloadEventsAdaptiveGroups(limit: 10, orderBy: [sum_visits_DESC], filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      sum { visits } dimensions { deviceType }
    }
    horas: rumPageloadEventsAdaptiveGroups(limit: 200, filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      count sum { visits } dimensions { datetimeHour }
    }
    paises: rumPageloadEventsAdaptiveGroups(limit: 50, orderBy: [sum_visits_DESC], filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      sum { visits } dimensions { countryName }
    }
    carga: rumPerformanceEventsAdaptiveGroups(limit: 10, filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      count dimensions { deviceType } quantiles { pageLoadTimeP50 }
    }
    experiencia: rumWebVitalsEventsAdaptiveGroups(limit: 100, filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      dimensions { requestPath } sum { lcpPoor lcpTotal clsPoor clsTotal inpPoor inpTotal }
    }
  } }
}`;

const consultar = async (env, semana) => {
  const respuesta = await fetch(GRAPHQL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: CONSULTA,
      variables: {
        cuenta: env.CF_ACCOUNT_ID,
        sitio: env.CF_SITE_TAG,
        desde: semana.desde.toISOString(),
        hasta: semana.hasta.toISOString(),
        previaDesde: semana.previaDesde.toISOString(),
      },
    }),
  });
  const { data, errors } = await respuesta.json();
  if (errors?.length || !data) throw new Error(`Cloudflare: ${errors?.map((e) => e.message).join("; ")}`);
  return data.viewer.accounts[0];
};

// ── Los nombres ──────────────────────────────────────────────────────────────

const SECCIONES = {
  "/": "Portada",
  "/noticias": "Noticias",
  "/actividades": "Actividades",
  "/descubre": "Descubre Venialbo",
  "/negocios": "Negocios",
  "/servicios": "Servicios",
  "/tablon": "Tablón",
  "/pueblos-conectados": "Pueblos Conectados",
  "/enlaces": "Enlaces de interés",
  "/privacidad": "Privacidad",
};

// De la ruta de una ficha al recurso de public/data/
const FICHAS = [
  [/^\/noticias\/([^/]+)$/, "noticias"],
  [/^\/actividades\/([^/]+)$/, "actividades"],
  [/^\/descubre\/lugares\/([^/]+)$/, "lugares"],
  [/^\/descubre\/rutas\/([^/]+)$/, "rutas"],
  [/^\/negocios\/([^/]+)$/, "negocios"],
  [/^\/servicios\/([^/]+)$/, "servicios"],
  [/^\/tablon\/([^/]+)$/, "anuncios"],
];

// El título de la ficha, del mismo JSON que carga la web. Si ya no existe (un anuncio
// caducado), se queda la ruta.
const nombreDe = async (ruta) => {
  if (SECCIONES[ruta]) return SECCIONES[ruta];
  for (const [patron, recurso] of FICHAS) {
    const m = ruta.match(patron);
    if (!m) continue;
    try {
      const respuesta = await fetch(`${WEB}/data/${recurso}/${encodeURIComponent(m[1])}.json`);
      if (respuesta.ok) {
        const ficha = await respuesta.json();
        if (ficha.titulo || ficha.nombre) return ficha.titulo || ficha.nombre;
      }
    } catch {
      // Sin título se queda la ruta
    }
  }
  return ruta;
};

// WhatsApp y muchas apps no dicen de dónde viene la visita: eso cae en «directo»
const ORIGENES = [
  [/^$/, "Directo, WhatsApp u otras apps"],
  [/(^|\.)(facebook\.com|fb\.me|fb\.com)$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)(t\.me|telegram\.org)$/, "Telegram"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org)$/, "Otros buscadores"],
];
const origenDe = (host) => ORIGENES.find(([patron]) => patron.test(host))?.[1] ?? host;

const DISPOSITIVOS = { mobile: "Móvil", desktop: "Ordenador", tablet: "Tablet" };

// Los países llegan como código ISO ("FR"); los que no son un país se quedan fuera
const PAISES = new Intl.DisplayNames(["es"], { type: "region" });
const NO_PAIS = new Set(["", "XX", "T1"]);
const paisDe = (codigo) => {
  try {
    return PAISES.of(codigo);
  } catch {
    return codigo;
  }
};

// ── Cuándo se entra ──────────────────────────────────────────────────────────

const diaMadrid = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric" });

// El día con más visitas y la hora punta, en hora de Madrid. La API agrupa por horas
// en UTC; se pasan a Madrid antes de sumar.
const cuandoSeEntra = (horas) => {
  const porDia = new Map();
  const porHora = new Map();
  for (const { sum, dimensions } of horas) {
    if (!sum.visits) continue;
    const instante = new Date(dimensions.datetimeHour);
    const dia = diaMadrid.format(instante);
    const hora = horaMadrid(instante);
    porDia.set(dia, (porDia.get(dia) ?? 0) + sum.visits);
    porHora.set(hora, (porHora.get(hora) ?? 0) + sum.visits);
  }
  const mayor = (mapa) => [...mapa].sort((a, b) => b[1] - a[1])[0];
  const dia = mayor(porDia);
  const hora = mayor(porHora);
  if (!dia) return null;
  // Sin la cifra del día: Cloudflare estima cada agrupación por separado y no siempre
  // cuadra con el total de arriba
  return `🕘 El día con más visitas: ${dia[0]} · La hora punta: ${hora[0]}:00`;
};

// ── Si va lenta ──────────────────────────────────────────────────────────────

// Solo se dice algo si hay un problema; si todo va bien, no ocupa sitio. Los tiempos de
// la API vienen en microsegundos.
const LENTO_MOVIL = 3_000_000;
// Una página va mal si al menos una de cada cuatro cargas sale en «malo» según los
// umbrales de Google (Core Web Vitals) y hay muestras suficientes para fiarse
const MAL_PROPORCION = 0.25;
const MAL_MUESTRAS = 4;
const METRICAS = [
  ["lcp", "tarda en verse"],
  ["cls", "se mueve al cargar"],
  ["inp", "responde lenta al tocar"],
];

const avisosDeLentitud = async ({ carga, experiencia }) => {
  const avisos = [];
  const movil = carga.find((c) => c.dimensions.deviceType === "mobile");
  if (movil && movil.quantiles.pageLoadTimeP50 > LENTO_MOVIL) {
    const segundos = (movil.quantiles.pageLoadTimeP50 / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 });
    avisos.push(`En el móvil, la mitad de las cargas tarda más de ${segundos} s`);
  }

  const porRuta = new Map();
  for (const { dimensions, sum } of experiencia) {
    const ruta = dimensions.requestPath.replace(/(.)\/$/, "$1");
    const suma = porRuta.get(ruta) ?? {};
    for (const [m] of METRICAS) {
      suma[`${m}Poor`] = (suma[`${m}Poor`] ?? 0) + sum[`${m}Poor`];
      suma[`${m}Total`] = (suma[`${m}Total`] ?? 0) + sum[`${m}Total`];
    }
    porRuta.set(ruta, suma);
  }
  const malas = [];
  for (const [ruta, suma] of porRuta) {
    const problemas = METRICAS.filter(
      ([m]) => suma[`${m}Total`] >= MAL_MUESTRAS && suma[`${m}Poor`] / suma[`${m}Total`] >= MAL_PROPORCION,
    ).map(([, texto]) => texto);
    if (problemas.length) malas.push([ruta, problemas]);
  }
  for (const [ruta, problemas] of malas.slice(0, 3)) {
    avisos.push(`${escapaHtml(await nombreDe(ruta))}: ${problemas.join(", ")}`);
  }

  return avisos.length ? `⚠️ <b>Va lenta</b>\n${avisos.join("\n")}` : null;
};

// ── El mensaje ───────────────────────────────────────────────────────────────

const numero = new Intl.NumberFormat("es-ES");
const n = (x) => numero.format(x);
const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

const comparacion = (ahora, antes) => {
  if (!antes) return "Sin datos de la semana anterior para comparar";
  const cambio = Math.round(((ahora - antes) / antes) * 100);
  if (cambio === 0) return "Igual que la semana anterior";
  return `${cambio > 0 ? "↗️ +" : "↘️ "}${cambio} % respecto a la semana anterior (${n(antes)})`;
};

export const suscriptores = async (env) => {
  let total = 0;
  let cursor;
  do {
    const pagina = await env.SUSCRIPCIONES.list({ cursor });
    total += pagina.keys.length;
    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
  return total;
};

export const resumenSemanal = async (env, { ahora = new Date(), enCurso = false } = {}) => {
  const semana = semanas(ahora, enCurso);
  const datos = await consultar(env, semana);

  const visitas = datos.total[0]?.sum.visits ?? 0;
  const vistas = datos.total[0]?.count ?? 0;
  const visitasAntes = datos.previa[0]?.sum.visits ?? 0;

  const lineas = [`📊 <b>Resumen de la semana</b>\n${rotulo(semana)}${enCurso ? " (en curso)" : ""}`];

  if (!vistas) {
    lineas.push("No se registró ninguna visita.");
  } else {
    lineas.push(
      `👥 <b>${n(visitas)} ${visitas === 1 ? "visita" : "visitas"}</b> · ${n(vistas)} páginas vistas\n${comparacion(visitas, visitasAntes)}`,
    );

    // Las rutas con y sin barra final son la misma página
    const porRuta = new Map();
    for (const { count, dimensions } of datos.paginas) {
      const ruta = dimensions.requestPath.replace(/(.)\/$/, "$1");
      porRuta.set(ruta, (porRuta.get(ruta) ?? 0) + count);
    }
    const masVistas = [...porRuta].sort((a, b) => b[1] - a[1]).slice(0, PAGINAS);
    const nombres = await Promise.all(masVistas.map(([ruta]) => nombreDe(ruta)));
    lineas.push(
      `📄 <b>Lo más visto</b>\n${masVistas.map(([, cuenta], i) => `${i + 1}. ${escapaHtml(nombres[i])} · ${n(cuenta)}`).join("\n")}`,
    );

    // Solo las entradas desde fuera: pasar de una página a otra de la web no es un origen
    const propio = new URL(WEB).hostname;
    const porOrigen = new Map();
    for (const { sum, dimensions } of datos.origenes) {
      if (!sum.visits || dimensions.refererHost.endsWith(propio)) continue;
      const nombre = origenDe(dimensions.refererHost);
      porOrigen.set(nombre, (porOrigen.get(nombre) ?? 0) + sum.visits);
    }
    if (porOrigen.size) {
      const origenes = [...porOrigen].sort((a, b) => b[1] - a[1]).slice(0, 5);
      lineas.push(`🔗 <b>De dónde llegan</b>\n${origenes.map(([o, v]) => `${escapaHtml(o)}: ${n(v)}`).join("\n")}`);
    }

    const dispositivos = datos.dispositivos.filter((d) => d.sum.visits);
    const totalDispositivos = dispositivos.reduce((s, d) => s + d.sum.visits, 0);
    if (totalDispositivos) {
      lineas.push(
        `📱 ${dispositivos
          .map((d) => `${DISPOSITIVOS[d.dimensions.deviceType] ?? d.dimensions.deviceType} ${porcentaje(d.sum.visits, totalDispositivos)} %`)
          .join(" · ")}`,
      );
    }

    const cuando = cuandoSeEntra(datos.horas);
    if (cuando) lineas.push(cuando);

    const fuera = datos.paises.filter((p) => p.sum.visits && p.dimensions.countryName !== "ES" && !NO_PAIS.has(p.dimensions.countryName));
    if (fuera.length) {
      const total = fuera.reduce((s, p) => s + p.sum.visits, 0);
      const detalle = fuera.slice(0, 4).map((p) => `${paisDe(p.dimensions.countryName)} ${n(p.sum.visits)}`).join(", ");
      lineas.push(`🌍 ${n(total)} ${total === 1 ? "visita" : "visitas"} desde fuera de España (${escapaHtml(detalle)}${fuera.length > 4 ? "…" : ""})`);
    }

    const lentitud = await avisosDeLentitud(datos);
    if (lentitud) lineas.push(lentitud);
  }

  const avisos = await suscriptores(env);
  lineas.push(`🔔 ${n(avisos)} ${avisos === 1 ? "dispositivo" : "dispositivos"} con los avisos activados`);

  return lineas.join("\n\n");
};

const BOTONES = [{ text: "📊 Ver las estadísticas", url: "https://dash.cloudflare.com/?to=/:account/web-analytics" }];

export const enviarResumen = async (env, opciones) => {
  const texto = await resumenSemanal(env, opciones);
  if (!(await aTelegram(env, texto, BOTONES))) throw new Error("Telegram no aceptó el resumen");
  return texto;
};
