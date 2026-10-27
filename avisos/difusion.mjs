// El texto listo para difundir lo nuevo por WhatsApp y Facebook (idea 24 de IDEAS.md).
// Cuando enviar.mjs manda el aviso push de algo nuevo, llama a esto, y al grupo de los
// admin llega un mensaje por novedad con el texto para WhatsApp a la vista y dos botones:
// «📲 Enviar por WhatsApp» (abre WhatsApp con el texto ya escrito, para elegir el grupo)
// y «📋 Copiar para Facebook» (la versión con etiquetas, al portapapeles). Lo manda el
// Worker, que es quien tiene el bot (POST /difundir, worker/src/difusion.js).
//
// A mano, para cualquier cosa publicada (por ejemplo, algo que se avisó antes de esto):
//
//   node avisos/difusion.mjs noticias/<id> [actividades/<id>…] [--dry]
//
// Lee la web generada (web-static/public/data/): antes hay que pasar build-content.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = join(RAIZ, "web-static", "public", "data");
const SITIO = "https://venialboconecta.es";
const WORKER = "https://venialbo-avisos.venialboconecta.workers.dev";
// Lo que admite el botón de copiar de Telegram (copy_text)
const MAX_FACEBOOK = 256;
const MAX_RESUMEN = 200;
const ETIQUETAS = "#Venialbo #Zamora";

const leerJson = async (ruta) => JSON.parse(await readFile(ruta, "utf8"));

const sinMarkdown = (md) =>
  String(md ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const recortar = (texto, max) =>
  texto.length > max ? `${texto.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s.,;:]+$/, "")}…` : texto;

const DIA = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
// Sin la coma que pone Intl («domingo, 25 de octubre»)
const dia = (fecha) => DIA.format(new Date(`${fecha.slice(0, 10)}T12:00:00Z`)).replace(",", "");
// «09:30» → «9:30»
const hora = (h) => h.replace(/^0(\d)/, "$1");

// «Domingo 25 de octubre a las 9:30», «Del miércoles 4 de noviembre al jueves 5…»
const cuando = (a) => {
  const desde = dia(a.fecha);
  const texto =
    a.fecha_fin && a.fecha_fin.slice(0, 10) !== a.fecha.slice(0, 10)
      ? `del ${desde} al ${dia(a.fecha_fin)}`
      : `${desde}${a.hora ? ` a las ${hora(a.hora)}` : ""}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Lo que va en cada texto, según lo que sea: { icono, titulo, linea, resumen, ruta }
const PIEZAS = {
  noticias: async (n) => ({
    icono: "📰",
    titulo: n.titulo,
    resumen: sinMarkdown((await leerJson(join(DATOS, "noticias", `${n.id}.json`))).contenido),
    ruta: `/noticias/${n.id}`,
  }),
  actividades: async (a, { fotos }) => ({
    icono: fotos ? "📸" : "📅",
    titulo: fotos ? `Ya están las fotos: ${a.titulo}` : a.titulo,
    linea: fotos ? null : cuando(a),
    resumen: sinMarkdown(a.resumen || (await leerJson(join(DATOS, "actividades", `${a.id}.json`))).contenido),
    ruta: `/actividades/${a.id}`,
  }),
  anuncios: async (a) => ({
    icono: a.tipo?.startsWith("casa_") ? "🏠" : "📌",
    titulo: a.titulo,
    resumen: sinMarkdown(a.descripcion),
    ruta: `/tablon/${a.id}`,
  }),
  avisos: async (a) => ({
    icono: a.nivel === "urgente" ? "⚠️" : "📢",
    titulo: a.titulo,
    ruta: a.enlace ?? "/",
  }),
};

// Los dos textos de una novedad. `fotos`: es una actividad ya celebrada que avisa de sus fotos.
export const textosDe = async (recurso, fila, { fotos = false } = {}) => {
  const p = await PIEZAS[recurso](fila, { fotos });
  const titulo = String(p.titulo ?? "").trim();
  const url = `${SITIO}${p.ruta}`;
  const resumen = p.resumen ? recortar(p.resumen, MAX_RESUMEN) : "";

  // WhatsApp: *negrita* en el título, y el enlace al final (saca la vista previa)
  const whatsapp = [`${p.icono} *${titulo}*`, p.linea && `🗓 ${p.linea}`, resumen, `👉 ${url}`].filter(Boolean).join("\n");

  // Facebook: sin marcas (no las entiende), con etiquetas, y en 256 caracteres: se
  // recorta el resumen, y si ni así cabe, el título
  const montar = (t, r) => [`${p.icono} ${t}`, p.linea, r, `👉 ${url}`, ETIQUETAS].filter(Boolean).join("\n\n");
  let facebook = montar(titulo, resumen);
  if (facebook.length > MAX_FACEBOOK) {
    const sitio = MAX_FACEBOOK - montar(titulo, "").length - 2;
    facebook = montar(titulo, sitio >= 40 ? recortar(resumen, sitio) : "");
  }
  if (facebook.length > MAX_FACEBOOK) facebook = montar(recortar(titulo, Math.max(20, titulo.length - (facebook.length - MAX_FACEBOOK))), "");
  if (facebook.length > MAX_FACEBOOK) facebook = facebook.slice(0, MAX_FACEBOOK);

  return { titulo, url, whatsapp, facebook };
};

// Al grupo de los admin, por el Worker. Si falla, se dice y ya: es una ayuda
export const difundir = async (token, mensajes) => {
  const r = await fetch(`${WORKER}/difundir`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ mensajes }),
  });
  if (!r.ok) console.warn(`  ⚠ El Worker ha respondido ${r.status} al texto para difundir: ${await r.text()}`);
  else console.log(`Texto para difundir: ${mensajes.length} al grupo`);
};

// node avisos/difusion.mjs <recurso>/<id>… [--dry]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const DRY = process.argv.includes("--dry");
  const pedidas = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!pedidas.length) {
    console.error("Uso: node avisos/difusion.mjs noticias/<id> [actividades/<id>…] [--dry]");
    process.exit(1);
  }
  const mensajes = [];
  for (const pedida of pedidas) {
    const [recurso, id] = pedida.split("/");
    if (!PIEZAS[recurso]) throw new Error(`No sé difundir «${recurso}»: ${Object.keys(PIEZAS).join(", ")}`);
    const fila = (await leerJson(join(DATOS, `${recurso}.json`))).find((f) => f.id === id);
    if (!fila) throw new Error(`No está publicado: ${pedida}`);
    // Una actividad ya celebrada se difunde por sus fotos, como en enviar.mjs
    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
    const celebrada = recurso === "actividades" && (fila.fecha_fin ?? fila.fecha).slice(0, 10) < hoy;
    mensajes.push(await textosDe(recurso, fila, { fotos: celebrada }));
  }
  for (const m of mensajes) console.log(`── WhatsApp\n${m.whatsapp}\n── Facebook (${m.facebook.length})\n${m.facebook}\n`);
  if (!DRY) {
    const token = process.env.AVISOS_TOKEN ?? (await readFile(join(RAIZ, ".secretos", "token-avisos"), "utf8")).trim();
    await difundir(token, mensajes);
  }
}
