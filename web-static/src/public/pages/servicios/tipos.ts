import type { TagTone } from "../../../theme";

// Etiquetas del `select` de tipo de servicios en .pages.yml. El CMS solo guarda la
// clave ("salud"); el texto, el emoji y el color se ponen aquí. Si se añade una opción
// en .pages.yml, hay que añadirla también aquí; si no, sale con su clave y en gris.
// El orden es el del desplegable del filtro.
type Etiqueta = { nombre: string; icono: string; tono: TagTone };

export const TIPOS_SERVICIO: Record<string, Etiqueta> = {
  salud: { nombre: "Salud", icono: "🩺", tono: "rojo" },
  social: { nombre: "Servicios sociales", icono: "🤝", tono: "terracota" },
  cultura: { nombre: "Cultura y formación", icono: "📚", tono: "lila" },
  transporte: { nombre: "Transporte", icono: "🚌", tono: "azul" },
  venta_reparto: { nombre: "Venta y reparto", icono: "🛒", tono: "musgo" },
  asociacion: { nombre: "Asociación", icono: "👥", tono: "lila" },
  institucion: { nombre: "Institución", icono: "🏛️", tono: "dorado" },
  otro: { nombre: "Otro", icono: "📌", tono: "gris" },
};

export const tipoServicio = (clave?: string | null): Etiqueta =>
  (clave && TIPOS_SERVICIO[clave]) || { nombre: clave || "Sin tipo", icono: "", tono: "gris" };
