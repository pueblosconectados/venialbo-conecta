// Lo que va a desaparecer de la web: los anuncios del tablón y los avisos tienen fecha de
// caducidad, y pasada se quitan solos (haCaducado en web-static/src/datos.ts). /caducan
// lista lo que se va en los próximos DIAS_LISTA días, y cada día a las 10:00 se avisa en
// el grupo de lo que está en su último día de mañana, para que dé tiempo a renovarlo.
//
// Los datos salen de la web publicada (data/anuncios.json y data/avisos.json), que ya
// lleva la fecha calculada: también la de los anuncios de vecinos sin fecha, que caducan
// a los 30 días (caducidadDe en build-content.mjs). Sin token: son públicos.
//
// La fecha es el último día que se ve: haCaducado lo deja hasta las 23:59 de ese día.

import { aTelegram, elemento, LISTA } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const DIAS_LISTA = 7;
const MAX_BOTONES = 4;
const DIA = 24 * 60 * 60 * 1000;

const RECURSOS = [
  { recurso: "anuncios", tipo: "Anuncio", ruta: "/tablon/" },
  { recurso: "avisos", tipo: "Aviso", ruta: null },
];

const hoyMadrid = (ahora) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / DIA);

const formatoDia = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const diaCorto = (fecha) => formatoDia.format(new Date(`${fecha}T12:00:00Z`));

const cuando = (dias) => (dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`);

// [{ tipo, recurso, id, titulo, ultimoDia, dias }] de lo que aún se ve, del que antes se va
export const caducables = async (ahora = new Date()) => {
  const hoy = hoyMadrid(ahora);
  const listas = await Promise.all(
    RECURSOS.map(async ({ recurso, tipo }) => {
      const respuesta = await fetch(`${WEB}/data/${recurso}.json`, { cache: "no-store" });
      if (!respuesta.ok) throw new Error(`La web: HTTP ${respuesta.status} en data/${recurso}.json`);
      return (await respuesta.json())
        .filter((f) => typeof f.fecha_caducidad === "string" && f.fecha_caducidad)
        .map((f) => {
          const ultimoDia = f.fecha_caducidad.slice(0, 10);
          return { tipo: f.casa ? "Casa vendida" : tipo, recurso, id: f.id, casa: Boolean(f.casa), titulo: String(f.titulo ?? f.id).trim(), ultimoDia, dias: diasEntre(hoy, ultimoDia) };
        });
    }),
  );
  return listas
    .flat()
    .filter((f) => f.dias >= 0)
    .sort((a, b) => a.dias - b.dias);
};

// La pantalla de edición en Pages CMS, para cambiar la fecha y que siga. El fichero se
// llama como el id. Las casas salen en data/anuncios.json, pero en el CMS tienen su
// colección (solo caducan las vendidas, a los 7 días)
const enlaceCms = ({ recurso, id, casa }) => {
  const coleccion = casa ? "casas" : recurso;
  return `${CMS}/${coleccion}/edit/${encodeURIComponent(`web-static/content/${coleccion}/${id}.json`)}`;
};

const lineas = (fichas) =>
  fichas.map(
    (f) => elemento(f.titulo, `${f.tipo} · último día ${cuando(f.dias)}${f.dias > 1 ? ` (${diaCorto(f.ultimoDia)})` : ""}`),
  );

// Una fila por botón: los títulos no caben juntos
const botones = (fichas) =>
  fichas.slice(0, MAX_BOTONES).map((f) => [
    { text: `📝 ${f.titulo.length > 28 ? `${f.titulo.slice(0, 27)}…` : f.titulo}`, url: enlaceCms(f) },
  ]);

const COMO_RENOVAR = "<i>Para que siga, cambia su fecha de caducidad en el CMS.</i>";

// Para /caducan
export const listaCaducan = async (ahora = new Date()) => {
  const pronto = (await caducables(ahora)).filter((f) => f.dias <= DIAS_LISTA);
  if (!pronto.length) return { texto: `✅ Nada desaparece de la web en los próximos ${DIAS_LISTA} días.` };
  return {
    texto: [`⏳ <b>Se van de la web en ${DIAS_LISTA} días: ${pronto.length}</b>`, lineas(pronto).join(LISTA), COMO_RENOVAR].join(
      "\n\n",
    ),
    botones: botones(pronto),
  };
};

// Lo que hace el cron a las 10:00: solo escribe si mañana es el último día de algo
export const recordarCaducan = async (env, { ahora = new Date(), enviar = true } = {}) => {
  const manana = (await caducables(ahora)).filter((f) => f.dias === 1);
  if (!manana.length) return null;
  const texto = [
    `⏳ <b>Mañana ${manana.length === 1 ? "se ve" : "se ven"} por última vez en la web</b>`,
    lineas(manana).join(LISTA),
    COMO_RENOVAR,
  ].join("\n\n");
  if (enviar && !(await aTelegram(env, texto, botones(manana)))) throw new Error("Telegram no aceptó el aviso");
  return texto;
};
