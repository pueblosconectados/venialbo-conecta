// Las casas en venta o alquiler del tablón no caducan: se quedan hasta que en el CMS se
// pone el día en que se vendieron (web-static/scripts/build-content.mjs). En el CMS van
// en su colección (content/casas); en data/anuncios.json, mezcladas con los anuncios. Para
// que no se quede ninguna vendida para siempre porque nadie avisó, cada día a las 10:00
// se recuerda en el grupo la que cumple CADA_DIAS días publicada (y otra vez a los 180,
// a los 270…), para preguntar al vecino si sigue.
//
// Sin estado: cuenta los días desde fecha_publicacion, así que si el cron de ese día
// falla, ese recordatorio se pierde y llega el siguiente. Para «reiniciar la cuenta»
// cuando el vecino confirma que sigue, basta con no hacer nada: vuelve a los 3 meses.
//
// Los datos salen de la web publicada (data/anuncios.json), como en caducidad.js.

import { aTelegram, elemento, LISTA } from "./telegram.js";

const WEB = "https://venialboconecta.es";
const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/main/collection";
const CADA_DIAS = 90;
const DIA = 24 * 60 * 60 * 1000;
const CASAS = { casa_venta: "en venta", casa_alquiler: "en alquiler" };

const hoyMadrid = (ahora) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(ahora);
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / DIA);

const enlaceCms = (id) =>
  `${CMS}/casas/edit/${encodeURIComponent(`web-static/content/casas/${id}.json`)}`;

const euros = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

const meses = (dias) => {
  const n = Math.round(dias / 30);
  return `${n} ${n === 1 ? "mes" : "meses"}`;
};

// Lo que hace el cron a las 10:00: solo escribe si alguna cumple hoy los 3, 6, 9… meses
export const recordarCasas = async (env, { ahora = new Date(), enviar = true } = {}) => {
  const respuesta = await fetch(`${WEB}/data/anuncios.json`, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`La web: HTTP ${respuesta.status} en data/anuncios.json`);
  const hoy = hoyMadrid(ahora);
  const toca = (await respuesta.json())
    .filter((f) => CASAS[f.tipo] && !f.casa?.vendida && typeof f.fecha_publicacion === "string")
    .map((f) => ({ ...f, dias: diasEntre(f.fecha_publicacion.slice(0, 10), hoy) }))
    .filter((f) => f.dias > 0 && f.dias % CADA_DIAS === 0);
  if (!toca.length) return null;

  const texto = [
    `🏠 <b>${toca.length === 1 ? "¿Sigue disponible esta casa?" : "¿Siguen disponibles estas casas?"}</b>`,
    // Con el precio, que muchas se llaman igual («Se vende casa»)
    toca
      .map((f) => {
        const precio = f.casa?.precio ? ` · ${euros.format(f.casa.precio)} €${f.tipo === "casa_alquiler" ? "/mes" : ""}` : "";
        return elemento(String(f.titulo ?? f.id).trim(), `${CASAS[f.tipo]}${precio} · publicada hace ${meses(f.dias)}`);
      })
      .join(LISTA),
    "<i>Pregunta al vecino. Si ya se ha vendido o alquilado, pon el día en «Vendida o alquilada el» en el CMS; si sigue, no hace falta hacer nada.</i>",
  ].join("\n\n");
  // Una fila por botón: los títulos no caben juntos
  const botones = toca.slice(0, 4).map((f) => {
    const titulo = String(f.titulo ?? f.id).trim();
    return [{ text: `📝 ${titulo.length > 28 ? `${titulo.slice(0, 27)}…` : titulo}`, url: enlaceCms(f.id) }];
  });
  if (enviar && !(await aTelegram(env, texto, botones))) throw new Error("Telegram no aceptó el recordatorio");
  return texto;
};
