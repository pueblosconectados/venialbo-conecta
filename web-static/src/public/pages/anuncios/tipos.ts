import type { TagTone } from "../../../theme";

// Los tipos del tablón, como los guarda el CMS (.pages.yml). «Información» lo ponemos
// nosotros y tiene su propio apartado arriba; las casas, el suyo debajo, y no caducan
// hasta que se venden o se alquilan. El resto son anuncios de vecinos.
export const INFORMACION = "informacion";
export const CASAS = new Set(["casa_venta", "casa_alquiler"]);

export const TIPO_LABEL: Record<string, string> = {
  informacion: "Información",
  casa_venta: "Se vende",
  casa_alquiler: "Se alquila",
  mascota_perdida: "Mascota perdida",
  compra_venta: "Compra / Venta",
  objeto_perdido: "Objeto perdido",
  otro: "Otro",
};

export const TIPO_TONE: Record<string, TagTone> = {
  informacion: "dorado",
  casa_venta: "terracota",
  casa_alquiler: "lila",
  mascota_perdida: "terracota",
  compra_venta: "musgo",
  objeto_perdido: "azul",
  otro: "gris",
};

/** Los datos de una casa, de su colección del CMS; build-content.mjs los agrupa aquí. */
export type DatosCasa = {
  precio?: number | null;
  superficie?: number | null;
  habitaciones?: number | null;
  banos?: number | null;
  /** Desde qué día está vendida o alquilada: sale con el sello y se va a los 7 días. */
  vendida?: string | null;
  /** El anuncio en Idealista, Fotocasa, Facebook… Ya viene completo de build-content. */
  enlace?: string | null;
};

export const selloVendida = (tipo: string) => (tipo === "casa_alquiler" ? "Alquilada" : "Vendida");

const euros = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

// «45.000 €», «550 €/mes», «155 m²», «3 habitaciones»…, en el orden en que se leen
export const cifrasCasa = (tipo: string, casa?: DatosCasa | null): string[] => {
  if (!casa) return [];
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  return [
    casa.precio ? `${euros.format(casa.precio)} €${tipo === "casa_alquiler" ? "/mes" : ""}` : null,
    casa.superficie ? `${euros.format(casa.superficie)} m²` : null,
    casa.habitaciones ? plural(casa.habitaciones, "habitación", "habitaciones") : null,
    casa.banos ? plural(casa.banos, "baño", "baños") : null,
  ].filter((c): c is string => c !== null);
};

// El nombre de la web del enlace externo, para el botón: «Ver en Idealista»
const PLATAFORMAS: [RegExp, string][] = [
  [/idealista\./, "Idealista"],
  [/fotocasa\./, "Fotocasa"],
  [/habitaclia\./, "Habitaclia"],
  [/pisos\.com/, "pisos.com"],
  [/milanuncios\./, "Milanuncios"],
  [/wallapop\./, "Wallapop"],
  [/(facebook|fb)\.(com|me)/, "Facebook"],
];

export const nombrePlataforma = (enlace: string): string => {
  let host = "";
  try {
    host = new URL(enlace).hostname.replace(/^www\./, "");
  } catch {
    return "otra web";
  }
  return PLATAFORMAS.find(([patron]) => patron.test(host))?.[1] ?? host;
};
