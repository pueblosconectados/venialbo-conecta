import type { TagTone } from "../../../theme";

// Etiquetas de los dos `select` de lugares en .pages.yml. El CMS solo guarda la clave
// ("religioso"); el texto, el emoji y el color se ponen aquí. Si se añade una opción
// en .pages.yml, hay que añadirla también aquí; si no, sale con su clave y en gris.
type Etiqueta = { nombre: string; icono: string; tono: TagTone };

export const TIPOS_LUGAR: Record<string, Etiqueta> = {
  religioso: { nombre: "Patrimonio religioso", icono: "⛪", tono: "terracota" },
  popular: { nombre: "Patrimonio popular", icono: "🍷", tono: "dorado" },
  naturaleza: { nombre: "Naturaleza y paisaje", icono: "🌿", tono: "musgo" },
  mirador: { nombre: "Mirador", icono: "👀", tono: "azul" },
  publico: { nombre: "Edificios y espacios públicos", icono: "🏛️", tono: "lila" },
  otro: { nombre: "Otro", icono: "📍", tono: "gris" },
};

export const VISITABLE: Record<string, Etiqueta> = {
  abierto: { nombre: "Siempre abierto", icono: "🟢", tono: "musgo" },
  horario: { nombre: "Con horario", icono: "🕒", tono: "azul" },
  cita: { nombre: "Con cita o preguntando", icono: "🔑", tono: "dorado" },
  fuera: { nombre: "Solo se ve por fuera", icono: "👁️", tono: "gris" },
};

const desconocida = (clave?: string | null): Etiqueta => ({
  nombre: clave || "Sin tipo",
  icono: "",
  tono: "gris",
});

export const tipoLugar = (clave?: string | null) =>
  (clave && TIPOS_LUGAR[clave]) || desconocida(clave);

export const visitableLugar = (clave?: string | null) =>
  clave ? VISITABLE[clave] ?? desconocida(clave) : null;
