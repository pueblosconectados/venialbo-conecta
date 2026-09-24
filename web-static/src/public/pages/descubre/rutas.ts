import type { TagTone } from "../../../theme";

// Etiquetas de los `select` de rutas en .pages.yml. Como en lugares.ts: el CMS guarda
// la clave y el texto se pone aquí. Si se añade una opción allí, hay que añadirla aquí.
type Etiqueta = { nombre: string; icono: string; tono: TagTone };

export const MODALIDADES: Record<string, Etiqueta> = {
  pie: { nombre: "A pie", icono: "🥾", tono: "musgo" },
  bici: { nombre: "En bici", icono: "🚴", tono: "azul" },
  coche: { nombre: "En coche", icono: "🚗", tono: "lila" },
};

export const DIFICULTADES: Record<string, Etiqueta> = {
  facil: { nombre: "Fácil", icono: "", tono: "musgo" },
  media: { nombre: "Media", icono: "", tono: "dorado" },
  dificil: { nombre: "Difícil", icono: "", tono: "rojo" },
};

export const RECORRIDOS: Record<string, string> = {
  circular: "Circular",
  "ida-vuelta": "Ida y vuelta",
  lineal: "Solo ida",
};

export const modalidadRuta = (clave?: string | null): Etiqueta =>
  (clave && MODALIDADES[clave]) || { nombre: clave || "Ruta", icono: "", tono: "gris" };

export const dificultadRuta = (clave?: string | null): Etiqueta | null =>
  clave ? DIFICULTADES[clave] ?? { nombre: clave, icono: "", tono: "gris" } : null;

const numero = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

export type DatosRuta = {
  distancia_km?: number | null;
  duracion?: string | null;
  desnivel_m?: number | null;
  recorrido?: string | null;
};

// Los datos que haya, en el orden en que se leen: "8,5 km", "2 h", "150 m de desnivel",
// "Circular". Los usan la tarjeta (en una línea) y la ficha (en recuadros).
export const datosRuta = (r: DatosRuta): { etiqueta: string; valor: string }[] =>
  [
    typeof r.distancia_km === "number" && { etiqueta: "Distancia", valor: `${numero(r.distancia_km)} km` },
    r.duracion && { etiqueta: "Duración", valor: r.duracion },
    typeof r.desnivel_m === "number" && { etiqueta: "Desnivel", valor: `${numero(r.desnivel_m)} m` },
    r.recorrido && { etiqueta: "Recorrido", valor: RECORRIDOS[r.recorrido] ?? r.recorrido },
  ].filter((d): d is { etiqueta: string; valor: string } => Boolean(d));
