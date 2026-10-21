// Manda los avisos push de lo que se ha publicado (fase 3 de NOTIFICACIONES.md).
//
//   node avisos/enviar.mjs novedades     manda lo nuevo: avisos de portada, noticias,
//                                        actividades y anuncios
//   node avisos/enviar.mjs inicializar   da por avisado todo lo publicado, sin mandar nada
//
//   --dry   enseña lo que mandaría, sin mandar ni apuntar nada
//   --ya    no mira la hora (para probar a mano)
//
// Qué es nuevo sale de comparar lo publicado y vigente (web-static/public/data/, así que
// antes hay que pasar build-content) con notificados.json, que guarda los ids de lo ya
// avisado. No vale mirar qué ficheros cambian en un commit: lo de Tally entra oculto y se
// activa después, y corregir una errata no debe volver a avisar.
//
// Se lanza al terminar cada publicación de la web. De 22:00 a 9:00 (hora de Madrid) no se
// manda nada: lo publicado de noche se queda pendiente y sale en la pasada de las 9:00.
// Si en una publicación entran varias cosas, van juntas en un solo aviso.
//
// Hasta el 2026-10-19 noticias, actividades y anuncios iban en un resumen a las 19:00. Se
// cambió porque se publica poco: no hay tanto que agrupar.
//
// El repositorio es público y los registros de Actions también: no se imprime nada de
// las suscripciones, solo cuántas son.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { apuntarAceptados, apuntarEnvio, nuevoId } from "./entregas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = join(RAIZ, "web-static", "public", "data");
const NOTIFICADOS = join(RAIZ, "avisos", "notificados.json");
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";

const [modo] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const YA = process.argv.includes("--ya");

// ── La hora de Madrid ───────────────────────────────────────────────────────

const ahora = new Date();
const horaMadrid = Number(
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "numeric", hourCycle: "h23" }).format(ahora),
);
const hoyMadrid = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);
// "2026-10-25 14:05", para comparar con las caducidades que llevan hora
const ahoraMadrid = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short",
}).format(ahora);

// Las fechas del CMS van sin hora ("2026-10-25") y valen hasta el final de ese día;
// los anuncios con «Hasta las» la llevan ("2026-10-25T14:00") y valen hasta esa hora
const vigenteHasta = (fecha) =>
  !fecha || (fecha.length > 10 ? fecha.replace("T", " ").slice(0, 16) > ahoraMadrid : fecha.slice(0, 10) >= hoyMadrid);

// ── Qué se avisa ────────────────────────────────────────────────────────────

const RECURSOS = {
  avisos: {
    // Los avisos de portada son lo urgente: van con prioridad alta
    urgente: true,
    vigente: (a) => vigenteHasta(a.fecha_caducidad),
    uno: (a) => ({
      titulo: a.nivel === "urgente" ? "Aviso urgente" : "Aviso del pueblo",
      cuerpo: a.titulo,
      url: a.enlace ?? "/",
    }),
    nombre: ["aviso", "avisos"],
  },
  noticias: {
    vigente: () => true,
    uno: (n) => ({ titulo: "Nueva noticia", cuerpo: n.titulo, url: `/noticias/${n.id}` }),
    nombre: ["noticia", "noticias"],
    listado: "/noticias",
  },
  // De una actividad se avisa al publicarla, si aún no se ha celebrado. Las que se suben
  // después, con las fotos, no avisan.
  actividades: {
    vigente: (a) => vigenteHasta(a.fecha_fin ?? a.fecha),
    uno: (a) => ({ titulo: "Nueva actividad", cuerpo: a.titulo, url: `/actividades/${a.id}` }),
    nombre: ["actividad", "actividades"],
    listado: "/actividades",
  },
  anuncios: {
    vigente: (a) => vigenteHasta(a.fecha_caducidad),
    uno: (a) => ({ titulo: "Nuevo en el tablón", cuerpo: a.titulo.trim(), url: `/tablon/${a.id}` }),
    nombre: ["anuncio", "anuncios"],
    listado: "/tablon",
  },
};

const leerJson = async (ruta) => JSON.parse(await readFile(ruta, "utf8"));
const clave = (recurso, id) => `${recurso}/${id}`;

const publicado = async (recursos) =>
  (
    await Promise.all(
      recursos.map(async (r) =>
        (await leerJson(join(DATOS, `${r}.json`))).map((fila) => ({ recurso: r, fila })),
      ),
    )
  ).flat();

// «2 noticias, 1 actividad y 1 anuncio»
const recuento = (novedades) => {
  const partes = Object.entries(RECURSOS)
    .map(([r, { nombre }]) => {
      const n = novedades.filter((x) => x.recurso === r).length;
      return n ? `${n} ${nombre[n === 1 ? 0 : 1]}` : null;
    })
    .filter(Boolean);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
};

const recortar = (texto, max) =>
  texto.length > max ? `${texto.slice(0, max).replace(/\s+\S*$/, "")}…` : texto;

// Una novedad, su propio aviso; varias, un resumen que lleva al listado o a la portada
const mensajeDe = (novedades) => {
  if (novedades.length === 1) {
    const { recurso, fila } = novedades[0];
    return RECURSOS[recurso].uno(fila);
  }
  const recursos = new Set(novedades.map((x) => x.recurso));
  const unico = recursos.size === 1 ? RECURSOS[[...recursos][0]] : null;
  const titulos = novedades.map((x) => RECURSOS[x.recurso].uno(x.fila).cuerpo).join(" · ");
  return {
    titulo: unico === RECURSOS.avisos ? `${novedades.length} avisos del pueblo` : "Novedades en Venialbo",
    cuerpo: recortar(unico === RECURSOS.avisos ? titulos : `${recuento(novedades)}: ${titulos}`, 220),
    url: unico?.listado ?? "/",
  };
};

// ── El envío ────────────────────────────────────────────────────────────────

const secretos = async () => {
  const token =
    process.env.AVISOS_TOKEN ??
    (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8").catch(() => null));
  const privada =
    process.env.VAPID_PRIVADA ??
    (await leerJson(join(RAIZ, ".secretos", "vapid.json")).catch(() => null))?.privateKey;
  // La pública sale de la web, para no tenerla en dos sitios
  const config = await readFile(join(RAIZ, "web-static", "src", "config.ts"), "utf8");
  const publica = config.match(/VAPID_PUBLICA =\s*"([^"]+)"/)?.[1];
  if (!token || !privada || !publica) throw new Error("Faltan AVISOS_TOKEN, VAPID_PRIVADA o la clave pública");
  return { token: token.trim(), privada: privada.trim(), publica };
};

const enviar = async (mensaje, urgente) => {
  const { token, privada, publica } = await secretos();
  webpush.setVapidDetails("mailto:info@venialboconecta.es", publica, privada);

  const r = await fetch(`${WORKER}/suscripciones`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`El Worker ha respondido ${r.status} al pedir la lista`);
  const suscripciones = await r.json();

  const opciones = {
    // Lo urgente, al momento; lo demás, cuando a Android le venga bien (ahorra batería)
    urgency: urgente ? "high" : "normal",
    // Si el móvil está apagado, cuánto tiempo guarda el aviso el servicio de push
    TTL: 12 * 3600,
  };
  // El id vuelve del móvil al recibirlo: así se sabe si llegó (entregas.mjs)
  const id = nuevoId();
  await apuntarEnvio(token, id, `${mensaje.titulo}: ${mensaje.cuerpo}`, urgente);
  const cuerpo = JSON.stringify({ ...mensaje, id });
  const aceptados = [];
  const muertas = [];
  const fallos = [];
  // De 20 en 20, para no abrir cientos de conexiones a la vez
  for (let i = 0; i < suscripciones.length; i += 20) {
    await Promise.all(
      suscripciones.slice(i, i + 20).map(async (sub) => {
        try {
          await webpush.sendNotification(sub, cuerpo, opciones);
          aceptados.push(sub.endpoint);
        } catch (e) {
          // 404 o 410: el móvil ya no la tiene (permiso retirado, datos borrados…)
          if (e.statusCode === 404 || e.statusCode === 410) muertas.push(sub.endpoint);
          else fallos.push(e.statusCode ?? e.code ?? "sin respuesta");
        }
      }),
    );
  }

  await apuntarAceptados(token, id, aceptados);
  const bien = aceptados.length;

  if (muertas.length) {
    const b = await fetch(`${WORKER}/borrar`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ endpoints: muertas }),
    });
    if (!b.ok) console.warn(`  ⚠ El Worker ha respondido ${b.status} al borrar las caducadas`);
  }

  console.log(
    `Enviado a ${bien} de ${suscripciones.length}` +
      (muertas.length ? `; ${muertas.length} ya no existían y se han borrado` : "") +
      (fallos.length ? `; ${fallos.length} han fallado (${[...new Set(fallos)].join(", ")})` : ""),
  );
  // Si no ha llegado a nadie y no es porque no haya nadie, algo va mal (las claves, el
  // servicio de push): no se apunta como avisado, para que se reintente
  if (suscripciones.length && !bien && fallos.length) throw new Error("No se ha podido enviar a nadie");
};

// ── Adelante ────────────────────────────────────────────────────────────────

const guardar = async (ids) => {
  if (DRY) return;
  await writeFile(NOTIFICADOS, `${JSON.stringify([...ids].sort(), null, 2)}\n`);
};

if (modo === "inicializar") {
  const ya = new Set(await leerJson(NOTIFICADOS).catch(() => []));
  for (const { recurso, fila } of await publicado(Object.keys(RECURSOS))) ya.add(clave(recurso, fila.id));
  await guardar(ya);
  console.log(`${ya.size} publicaciones dadas por avisadas${DRY ? " (--dry: sin guardar)" : ""}`);
  process.exit(0);
}

if (modo !== "novedades") {
  console.error("Uso: node avisos/enviar.mjs novedades|inicializar [--dry] [--ya]");
  process.exit(1);
}

if (!YA && (horaMadrid >= 22 || horaMadrid < 9)) {
  console.log(`Son las ${horaMadrid}:xx en Madrid: lo nuevo espera a las 9:00`);
  process.exit(0);
}

// Sin notificados.json, todo lo publicado parecería nuevo y se mandaría el archivo entero
const notificados = await leerJson(NOTIFICADOS).catch(() => null);
if (!notificados) {
  console.error("No hay avisos/notificados.json: primero `node avisos/enviar.mjs inicializar`");
  process.exit(1);
}
const ya = new Set(notificados);

const pendientes = (await publicado(Object.keys(RECURSOS))).filter(({ recurso, fila }) => !ya.has(clave(recurso, fila.id)));
const novedades = pendientes.filter(({ recurso, fila }) => RECURSOS[recurso].vigente(fila));
// Lo que caducó o ya se celebró antes de avisar, se da por avisado sin mandarlo
for (const { recurso, fila } of pendientes) ya.add(clave(recurso, fila.id));

if (!novedades.length) {
  console.log("Nada nuevo");
  if (pendientes.length) await guardar(ya);
  process.exit(0);
}

for (const { recurso, fila } of novedades) console.log(`  · ${recurso}: ${fila.titulo}`);
const mensaje = mensajeDe(novedades);
console.log(`Aviso: «${mensaje.titulo}» — ${mensaje.cuerpo} → ${mensaje.url}`);

if (DRY) {
  console.log("--dry: no se manda ni se apunta nada");
  process.exit(0);
}
await enviar(mensaje, novedades.some(({ recurso }) => RECURSOS[recurso].urgente));
await guardar(ya);
