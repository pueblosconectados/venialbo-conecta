// La vigilancia: cada 5 minutos mira si GitHub Pages y GitHub Actions funcionan (según
// githubstatus.com) y si la web responde, y avisa al grupo de Telegram cuando algo
// cambia: al caer y al volver. Mientras dura no repite el aviso.
//
// - Pages sirve la web: si cae, la web puede dejar de verse.
// - Actions publica cada guardado del CMS: si cae, la web se ve pero no se actualiza.
// - La propia web: detecta lo que githubstatus no sabe (el dominio, el DNS, el
//   certificado). Solo avisa tras FALLOS_WEB fallos seguidos, para no dar falsas alarmas.
//
// githubstatus.com es un Statuspage con API pública y sin clave; no tiene webhooks, por
// eso se pregunta. El estado de la vez anterior se guarda en el KV ESTADO, aparte de las
// suscripciones (que el resumen cuenta y el envío push recorre enteras).

import { aTelegram, escapaHtml } from "./telegram.js";

const STATUS = "https://www.githubstatus.com/api/v2";
const WEB = "https://venialboconecta.es/";
const CLAVE = "vigilancia";
const FALLOS_WEB = 2;
const ESPERA_WEB = 15_000;

// Los ids de componentes.json de githubstatus
export const COMPONENTES = {
  vg70hn9s2tyj: { nombre: "GitHub Pages", efecto: "la web puede no verse" },
  br0l2tvcx85d: { nombre: "GitHub Actions", efecto: "lo que se guarde en el CMS no se publica" },
};

const ESTADOS = {
  operational: { texto: "funciona", icono: "🟢" },
  degraded_performance: { texto: "va lento", icono: "🟡" },
  under_maintenance: { texto: "en mantenimiento", icono: "🟡" },
  partial_outage: { texto: "caída parcial", icono: "🟠" },
  major_outage: { texto: "caída total", icono: "🔴" },
};
export const estadoDe = (codigo) => ESTADOS[codigo] ?? { texto: codigo, icono: "⚪️" };

// "1 h 20 min", "35 min"
const duracion = (desde, hasta) => {
  const minutos = Math.max(1, Math.round((hasta - desde) / 60_000));
  const horas = Math.floor(minutos / 60);
  if (!horas) return `${minutos} min`;
  return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`;
};

const leerJson = async (url) => {
  const respuesta = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status}`);
  return respuesta.json();
};

// { id: "partial_outage", ... } y el título del incidente abierto de cada componente.
// null si githubstatus no contesta: esa vez no se compara nada.
const estadoGithub = async () => {
  try {
    const [{ components }, { incidents }] = await Promise.all([
      leerJson(`${STATUS}/components.json`),
      leerJson(`${STATUS}/incidents/unresolved.json`),
    ]);
    const estados = {};
    for (const id of Object.keys(COMPONENTES)) {
      const componente = components.find((c) => c.id === id);
      if (!componente) continue;
      const incidente = incidents.find((i) => i.components?.some((c) => c.id === id));
      estados[id] = { estado: componente.status, incidente: incidente?.name ?? null };
    }
    return estados;
  } catch {
    return null;
  }
};

// null si responde bien; si no, el motivo
const falloWeb = async () => {
  try {
    const respuesta = await fetch(WEB, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(ESPERA_WEB) });
    return respuesta.ok ? null : `responde con un error (HTTP ${respuesta.status})`;
  } catch (e) {
    return e?.name === "TimeoutError" ? `no contesta en ${ESPERA_WEB / 1000} s` : "no se puede conectar";
  }
};

const BOTON_STATUS = { text: "Ver githubstatus.com", url: "https://www.githubstatus.com/" };
const BOTON_WEB = { text: "Abrir la web", url: WEB };

// Compara con la vez anterior y devuelve el estado nuevo y los mensajes que tocan.
// `ahora` en milisegundos. Lo que se guarda:
//   { github: { <id>: { estado, desde } }, web: { fallos, caida, desde, motivo } }
export const comparar = (anterior, github, fallo, ahora) => {
  const nuevo = { github: { ...anterior.github }, web: { fallos: 0, caida: false, ...anterior.web } };
  const mensajes = [];

  for (const [id, actual] of Object.entries(github ?? {})) {
    const { nombre, efecto } = COMPONENTES[id];
    // La primera vez se da por hecho que funcionaba: si ya está caído, se avisa
    const antes = anterior.github?.[id] ?? { estado: "operational", desde: ahora };
    if (actual.estado === antes.estado) continue;

    const { texto, icono } = estadoDe(actual.estado);
    if (actual.estado === "operational") {
      mensajes.push({
        texto: `🟢 <b>${nombre} vuelve a funcionar</b>\nHa estado con problemas ${duracion(antes.desde, ahora)}.`,
        botones: [BOTON_STATUS],
      });
      nuevo.github[id] = { estado: actual.estado, desde: ahora };
    } else {
      const lineas = [`${icono} <b>${nombre}: ${texto}</b>`];
      if (actual.incidente) lineas.push(`«${escapaHtml(actual.incidente)}»`);
      // Si ya estaba mal y solo cambia el grado, se dice desde cuándo, y no se reinicia
      if (antes.estado === "operational") lineas.push(`Mientras dure, ${efecto}. No hay nada que hacer por nuestra parte.`);
      else lineas.push(`Antes: ${estadoDe(antes.estado).texto}. Con problemas desde hace ${duracion(antes.desde, ahora)}.`);
      mensajes.push({ texto: lineas.join("\n"), botones: [BOTON_STATUS] });
      nuevo.github[id] = { estado: actual.estado, desde: antes.estado === "operational" ? ahora : antes.desde };
    }
  }

  const web = nuevo.web;
  if (!fallo) {
    if (web.caida) {
      mensajes.push({
        texto: `🟢 <b>La web vuelve a responder</b>\nHa estado sin funcionar ${duracion(web.desde, ahora)}.`,
        botones: [BOTON_WEB],
      });
    }
    nuevo.web = { fallos: 0, caida: false };
  } else {
    const fallos = web.fallos + 1;
    // desde: el primer fallo de la racha, no el que hace saltar el aviso
    nuevo.web = { ...web, fallos, desde: web.fallos ? web.desde : ahora, motivo: fallo };
    if (!web.caida && fallos >= FALLOS_WEB) {
      nuevo.web.caida = true;
      mensajes.push({
        texto: `🔴 <b>La web no funciona</b>\nvenialboconecta.es ${escapaHtml(fallo)} desde hace ${duracion(nuevo.web.desde, ahora)}.`,
        botones: [BOTON_WEB, BOTON_STATUS],
      });
    }
  }

  return { nuevo, mensajes };
};

const leerEstado = async (env) => (await env.ESTADO.get(CLAVE, "json")) ?? { github: {}, web: {} };

// Lo que hace el cron. Con `enviar: false` solo calcula (para GET /vigilancia).
export const vigilar = async (env, { enviar = true, ahora = Date.now() } = {}) => {
  const [anterior, github, fallo] = await Promise.all([leerEstado(env), estadoGithub(), falloWeb()]);
  const { nuevo, mensajes } = comparar(anterior, github, fallo, ahora);
  if (!enviar) return { anterior, github, fallo, nuevo, mensajes };

  for (const { texto, botones } of mensajes) {
    // Si Telegram falla no se guarda el estado: la próxima vez se vuelve a intentar
    if (!(await aTelegram(env, texto, botones))) throw new Error("Telegram no aceptó el aviso");
  }
  // Solo se escribe si ha cambiado algo (el KV gratuito da 1.000 escrituras al día)
  if (JSON.stringify(nuevo) !== JSON.stringify(anterior)) await env.ESTADO.put(CLAVE, JSON.stringify(nuevo));
  return { mensajes: mensajes.length };
};
