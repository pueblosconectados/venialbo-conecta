// Manda los avisos push de lo que se ha publicado (fase 3 de NOTIFICACIONES.md).
//
//   node avisos/enviar.mjs urgentes      avisos de portada nuevos, al momento
//   node avisos/enviar.mjs resumen       noticias, actividades y anuncios nuevos, en un aviso
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
// Lo urgente no se manda de 22:00 a 9:00 (hora de Madrid): se queda pendiente y sale en la
// pasada de las 9:00. El resumen solo sale si son las 19:00. La Action lo lanza a varias
// horas UTC por el cambio de hora y aquí se descartan las que no tocan.
//
// El repositorio es público y los registros de Actions también: no se imprime nada de
// las suscripciones, solo cuántas son.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";

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

// Las fechas del CMS van sin hora ("2026-10-25"): valen hasta el final de ese día
const vigenteHasta = (fecha) => !fecha || fecha.slice(0, 10) >= hoyMadrid;

// ── Qué se avisa ────────────────────────────────────────────────────────────

const RECURSOS = {
  avisos: {
    modo: "urgentes",
    vigente: (a) => vigenteHasta(a.fecha_caducidad),
    uno: (a) => ({
      titulo: a.nivel === "urgente" ? "Aviso urgente" : "Aviso del pueblo",
      cuerpo: a.titulo,
      url: a.enlace ?? "/",
    }),
    nombre: ["aviso", "avisos"],
  },
  noticias: {
    modo: "resumen",
    vigente: () => true,
    uno: (n) => ({ titulo: "Nueva noticia", cuerpo: n.titulo, url: `/noticias/${n.id}` }),
    nombre: ["noticia", "noticias"],
    listado: "/noticias",
  },
  // De una actividad se avisa al publicarla, si aún no se ha celebrado. Las que se suben
  // después, con las fotos, no avisan.
  actividades: {
    modo: "resumen",
    vigente: (a) => vigenteHasta(a.fecha_fin ?? a.fecha),
    uno: (a) => ({ titulo: "Nueva actividad", cuerpo: a.titulo, url: `/actividades/${a.id}` }),
    nombre: ["actividad", "actividades"],
    listado: "/actividades",
  },
  anuncios: {
    modo: "resumen",
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
    titulo: modo === "urgentes" ? `${novedades.length} avisos del pueblo` : "Novedades en Venialbo",
    cuerpo: recortar(modo === "urgentes" ? titulos : `${recuento(novedades)}: ${titulos}`, 220),
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

const enviar = async (mensaje) => {
  const { token, privada, publica } = await secretos();
  webpush.setVapidDetails("mailto:info@venialboconecta.es", publica, privada);

  const r = await fetch(`${WORKER}/suscripciones`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`El Worker ha respondido ${r.status} al pedir la lista`);
  const suscripciones = await r.json();

  const opciones = {
    // Lo urgente, al momento; el resumen, cuando a Android le venga bien (ahorra batería)
    urgency: modo === "urgentes" ? "high" : "normal",
    // Si el móvil está apagado, cuánto tiempo guarda el aviso el servicio de push
    TTL: modo === "urgentes" ? 12 * 3600 : 24 * 3600,
  };
  const cuerpo = JSON.stringify(mensaje);
  let bien = 0;
  const muertas = [];
  const fallos = [];
  // De 20 en 20, para no abrir cientos de conexiones a la vez
  for (let i = 0; i < suscripciones.length; i += 20) {
    await Promise.all(
      suscripciones.slice(i, i + 20).map(async (sub) => {
        try {
          await webpush.sendNotification(sub, cuerpo, opciones);
          bien++;
        } catch (e) {
          // 404 o 410: el móvil ya no la tiene (permiso retirado, datos borrados…)
          if (e.statusCode === 404 || e.statusCode === 410) muertas.push(sub.endpoint);
          else fallos.push(e.statusCode ?? e.code ?? "sin respuesta");
        }
      }),
    );
  }

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

if (modo !== "urgentes" && modo !== "resumen") {
  console.error("Uso: node avisos/enviar.mjs urgentes|resumen|inicializar [--dry] [--ya]");
  process.exit(1);
}

if (!YA && modo === "urgentes" && (horaMadrid >= 22 || horaMadrid < 9)) {
  console.log(`Son las ${horaMadrid}:xx en Madrid: lo urgente espera a las 9:00`);
  process.exit(0);
}
if (!YA && modo === "resumen" && horaMadrid !== 19) {
  console.log(`Son las ${horaMadrid}:xx en Madrid: el resumen es a las 19:00`);
  process.exit(0);
}

// Sin notificados.json, todo lo publicado parecería nuevo y se mandaría el archivo entero
const notificados = await leerJson(NOTIFICADOS).catch(() => null);
if (!notificados) {
  console.error("No hay avisos/notificados.json: primero `node avisos/enviar.mjs inicializar`");
  process.exit(1);
}
const ya = new Set(notificados);

const recursos = Object.keys(RECURSOS).filter((r) => RECURSOS[r].modo === modo);
const pendientes = (await publicado(recursos)).filter(({ recurso, fila }) => !ya.has(clave(recurso, fila.id)));
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
await enviar(mensaje);
await guardar(ya);
