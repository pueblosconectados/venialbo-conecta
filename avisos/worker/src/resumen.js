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
// Las cifras son aproximadas: quien lleva bloqueador no cuenta, y Cloudflare guarda solo
// una de cada 10 cargas y multiplica (sampleInterval, mirado el 2026-10-29): por eso todo
// acaba en 0. El mensaje lo dice al final.

import { aTelegram, escapaHtml } from "./telegram.js";

const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const WEB = "https://venialboconecta.es";
const DIA = 24 * 60 * 60 * 1000;
const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);
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
      count sum { visits } avg { sampleInterval }
    }
    previa: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: $sitio, datetime_geq: $previaDesde, datetime_lt: $desde }) {
      count sum { visits }
    }
    paginas: rumPageloadEventsAdaptiveGroups(limit: 300, orderBy: [count_DESC], filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      count dimensions { requestPath }
    }
    entradas: rumPageloadEventsAdaptiveGroups(limit: 20, orderBy: [sum_visits_DESC], filter: { siteTag: $sitio, datetime_geq: $desde, datetime_lt: $hasta }) {
      sum { visits } dimensions { requestPath }
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
        if (ficha.titulo || ficha.nombre) return (ficha.titulo || ficha.nombre).trim();
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
const EMOJI_ORIGEN = {
  "Directo, WhatsApp u otras apps": "💬",
  Facebook: "📘",
  Instagram: "📸",
  WhatsApp: "💬",
  Telegram: "✈️",
  Google: "🔎",
  "Otros buscadores": "🔎",
};

const DISPOSITIVOS = { mobile: "📱 Móvil", desktop: "💻 Ordenador", tablet: "📲 Tablet" };

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
const diaCorto = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric" });
const BARRA = 8;
const FRANJAS = [
  ["🌅 Mañana", (h) => h >= 6 && h < 14],
  ["☀️ Tarde", (h) => h >= 14 && h < 20],
  ["🌙 Noche", (h) => h >= 20 || h < 6],
];

// Las barras de cada día, el día con más visitas, la hora punta y el reparto por franjas,
// en hora de Madrid. La API agrupa por horas en UTC; se pasan a Madrid antes de sumar.
// Las barras van sin cifra: Cloudflare estima cada agrupación por separado y los días no
// siempre suman el total de arriba.
const cuandoSeEntra = (horas, semana, ahora) => {
  const porDia = new Map();
  const porHora = new Map();
  let total = 0;
  for (const { sum, dimensions } of horas) {
    if (!sum.visits) continue;
    const instante = new Date(dimensions.datetimeHour);
    const dia = fechaMadrid(instante);
    const hora = horaMadrid(instante);
    porDia.set(dia, (porDia.get(dia) ?? 0) + sum.visits);
    porHora.set(hora, (porHora.get(hora) ?? 0) + sum.visits);
    total += sum.visits;
  }
  if (!total) return null;

  // Con la semana en curso, solo los días que ya han empezado
  const dias = Array.from({ length: 7 }, (_, i) => sumaDias(semana.primerDia, i)).filter(
    (dia) => medianocheMadrid(dia) <= ahora,
  );
  const maximo = Math.max(...dias.map((dia) => porDia.get(dia) ?? 0));
  const fuerte = dias.find((dia) => (porDia.get(dia) ?? 0) === maximo);
  const barras = dias.map((dia) => {
    const llenas = Math.round(((porDia.get(dia) ?? 0) / maximo) * BARRA);
    const nombre = diaCorto.format(new Date(`${dia}T12:00:00Z`));
    return `<code>${nombre.padEnd(6)}</code> ${"🟩".repeat(llenas) || "▫️"}${dia === fuerte ? " ⭐" : ""}`;
  });

  const horaPunta = [...porHora].sort((a, b) => b[1] - a[1])[0][0];
  const franjas = FRANJAS.map(([nombre, enFranja]) => {
    const suma = [...porHora].filter(([h]) => enFranja(h)).reduce((s, [, v]) => s + v, 0);
    return `${nombre} ${porcentaje(suma, total)} %`;
  });

  return {
    barras: barras.join("\n"),
    fuerte,
    nombreFuerte: diaMadrid.format(medianocheMadrid(fuerte).getTime() + 12 * 3600_000),
    cuando: `🕘 Hora punta: las ${horaPunta}:00\n${franjas.join(" · ")}`,
  };
};

// Lo que se publicó ese día, para ver si el pico vino de ahí. El id de noticias,
// actividades y anuncios empieza por la fecha en que se crearon.
const PUBLICABLES = ["noticias", "actividades", "anuncios"];
const publicadoEl = async (fecha) => {
  const titulos = [];
  for (const recurso of PUBLICABLES) {
    try {
      const respuesta = await fetch(`${WEB}/data/${recurso}.json`);
      if (!respuesta.ok) continue;
      for (const ficha of await respuesta.json()) {
        if (ficha.id?.startsWith(fecha)) titulos.push((ficha.titulo ?? ficha.id).trim());
      }
    } catch {
      // Sin esa lista, el día fuerte sale igual, sin lo publicado
    }
  }
  return titulos;
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

  if (avisos.length) return `⚠️ <b>Va lenta</b>\n${avisos.join("\n")}`;
  // Si va bien, una línea con el tiempo de carga en el móvil
  if (!movil) return null;
  const segundos = (movil.quantiles.pageLoadTimeP50 / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 });
  return `⚡ Va rápida: en el móvil carga en ${segundos} s ✅`;
};

// ── El mensaje ───────────────────────────────────────────────────────────────

const numero = new Intl.NumberFormat("es-ES");
const n = (x) => numero.format(x);

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

// La sección de una ruta: "/tablon/2026-10-21-bando" → "/tablon"
const seccionDe = (ruta) => `/${ruta.split("/")[1] ?? ""}`;
// Lo que no cuenta como sección: la portada va aparte, y lo demás no es contenido
const NO_SECCION = new Set(["/", "/buscar", "/borrador", "/privacidad"]);

export const resumenSemanal = async (env, { ahora = new Date(), enCurso = false } = {}) => {
  const semana = semanas(ahora, enCurso);
  const datos = await consultar(env, semana);

  const visitas = datos.total[0]?.sum.visits ?? 0;
  const vistas = datos.total[0]?.count ?? 0;
  const visitasAntes = datos.previa[0]?.sum.visits ?? 0;
  const muestreo = Math.round(datos.total[0]?.avg?.sampleInterval ?? 1);

  const lineas = [`📊 <b>Resumen de la semana</b>\n${rotulo(semana)}${enCurso ? " (en curso)" : ""}`];

  if (!vistas) {
    lineas.push("No se registró ninguna visita.");
  } else {
    const cuando = cuandoSeEntra(datos.horas, semana, ahora);
    const dias = Math.max(1, Math.min(7, Math.ceil((ahora - semana.desde) / DIA)));
    const porVisita = (vistas / Math.max(visitas, 1)).toLocaleString("es-ES", { maximumFractionDigits: 1 });
    lineas.push(
      [
        `👥 <b>${n(visitas)} ${visitas === 1 ? "visita" : "visitas"}</b> · ${n(vistas)} páginas vistas`,
        comparacion(visitas, visitasAntes),
        `📅 Unas ${n(Math.round(visitas / dias))} al día · ${porVisita} páginas por visita`,
      ].join("\n"),
    );

    if (cuando) {
      const publicado = await publicadoEl(cuando.fuerte);
      const motivo = publicado.length
        ? `\nEse día se publicó ${publicado.slice(0, 3).map((t) => `«${escapaHtml(t)}»`).join(", ")}${publicado.length > 3 ? "…" : ""}`
        : "";
      lineas.push(`📈 <b>Día a día</b>\n${cuando.barras}\n⭐ El día fuerte: el ${cuando.nombreFuerte}${motivo}`);
    }

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

    // Cada sección con sus fichas: «Actividades» es el listado más todas las actividades
    const porSeccion = new Map();
    for (const [ruta, cuenta] of porRuta) {
      const seccion = seccionDe(ruta);
      if (NO_SECCION.has(seccion) || !SECCIONES[seccion]) continue;
      porSeccion.set(seccion, (porSeccion.get(seccion) ?? 0) + cuenta);
    }
    if (porSeccion.size) {
      const secciones = [...porSeccion].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const portada = porRuta.get("/") ?? 0;
      lineas.push(
        `🗂️ <b>Por secciones</b> (de las páginas vistas)\nPortada ${porcentaje(portada, vistas)} % · ${secciones
          .map(([s, c]) => `${SECCIONES[s]} ${porcentaje(c, vistas)} %`)
          .join(" · ")}`,
      );
    }

    // Una visita cuenta en la página por la que se entra: la portada, o una ficha que
    // alguien ha compartido
    const porEntrada = new Map();
    for (const { sum, dimensions } of datos.entradas) {
      if (!sum.visits) continue;
      const ruta = dimensions.requestPath.replace(/(.)\/$/, "$1");
      porEntrada.set(ruta, (porEntrada.get(ruta) ?? 0) + sum.visits);
    }
    const porPortada = porEntrada.get("/") ?? 0;
    if (porEntrada.size) {
      const ficha = [...porEntrada].filter(([ruta]) => FICHAS.some(([patron]) => patron.test(ruta))).sort((a, b) => b[1] - a[1])[0];
      const entradas = [`🏠 Por la portada: ${porcentaje(porPortada, visitas)} %`];
      if (ficha) entradas.push(`🔗 La ficha que más gente trajo: «${escapaHtml(await nombreDe(ficha[0]))}» · ${n(ficha[1])}`);
      lineas.push(`🚪 <b>Por dónde entran</b>\n${entradas.join("\n")}`);
    }

    // Solo las entradas desde fuera: pasar de una página a otra de la web no es un origen
    const propio = new URL(WEB).hostname;
    const porOrigen = new Map();
    for (const { sum, dimensions } of datos.origenes) {
      if (!sum.visits || dimensions.refererHost.endsWith(propio)) continue;
      const nombre = origenDe(dimensions.refererHost);
      porOrigen.set(nombre, (porOrigen.get(nombre) ?? 0) + sum.visits);
    }
    if (porOrigen.size) {
      const totalOrigenes = [...porOrigen.values()].reduce((s, v) => s + v, 0);
      const origenes = [...porOrigen].sort((a, b) => b[1] - a[1]).slice(0, 5);
      lineas.push(
        `🧭 <b>De dónde llegan</b>\n${origenes
          .map(([o, v]) => `${EMOJI_ORIGEN[o] ?? "🌐"} ${escapaHtml(o)}: ${porcentaje(v, totalOrigenes)} %`)
          .join("\n")}`,
      );
    }

    const dispositivos = datos.dispositivos.filter((d) => d.sum.visits);
    const totalDispositivos = dispositivos.reduce((s, d) => s + d.sum.visits, 0);
    const lineasUso = [];
    if (totalDispositivos) {
      lineasUso.push(
        dispositivos
          .map((d) => `${DISPOSITIVOS[d.dimensions.deviceType] ?? d.dimensions.deviceType} ${porcentaje(d.sum.visits, totalDispositivos)} %`)
          .join(" · "),
      );
    }
    if (cuando) lineasUso.push(cuando.cuando);
    // Cuenta las veces que se abre y también lo que se escribe, que cambia la dirección
    const buscador = porRuta.get("/buscar") ?? 0;
    if (buscador) lineasUso.push(`🔍 Buscador: ${n(buscador)} páginas vistas`);
    if (lineasUso.length) lineas.push(lineasUso.join("\n"));

    const fuera = datos.paises.filter((p) => p.sum.visits && p.dimensions.countryName !== "ES" && !NO_PAIS.has(p.dimensions.countryName));
    if (fuera.length) {
      const total = fuera.reduce((s, p) => s + p.sum.visits, 0);
      const detalle = fuera.slice(0, 4).map((p) => `${paisDe(p.dimensions.countryName)} ${n(p.sum.visits)}`).join(", ");
      lineas.push(`🌍 ${n(total)} ${total === 1 ? "visita" : "visitas"} desde fuera de España (${escapaHtml(detalle)}${fuera.length > 4 ? "…" : ""})`);
    }

    const rendimiento = await avisosDeLentitud(datos);
    if (rendimiento) lineas.push(rendimiento);
  }

  const avisos = await suscriptores(env);
  lineas.push(`🔔 ${n(avisos)} ${avisos === 1 ? "dispositivo" : "dispositivos"} con los avisos activados`);
  if (muestreo > 1) {
    lineas.push(`<i>ℹ️ Cifras aproximadas: Cloudflare cuenta 1 de cada ${muestreo} cargas y multiplica.</i>`);
  }

  return lineas.join("\n\n");
};

const BOTONES = [{ text: "📊 Ver las estadísticas", url: "https://dash.cloudflare.com/?to=/:account/web-analytics" }];

export const enviarResumen = async (env, opciones) => {
  const texto = await resumenSemanal(env, opciones);
  if (!(await aTelegram(env, texto, BOTONES))) throw new Error("Telegram no aceptó el resumen");
  return texto;
};
