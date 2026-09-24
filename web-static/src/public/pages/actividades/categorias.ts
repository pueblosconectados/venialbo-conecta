import type { TagTone } from "../../../theme";

// Las categorías de actividades. Son una lista fija del `select` de .pages.yml, no una
// colección como las de Noticias, así que el CMS solo guarda la clave ("formacion"):
// la etiqueta, el emoji y el color se ponen aquí. Si se añade una en .pages.yml, hay
// que añadirla también aquí; si no, sale con su clave tal cual y en gris.
export const CATEGORIAS_ACTIVIDAD: Record<
  string,
  { nombre: string; icono: string; tono: TagTone }
> = {
  formacion: { nombre: "Formación y talleres", icono: "🎓", tono: "azul" },
  mayores: { nombre: "Mayores", icono: "🧓", tono: "lila" },
  infancia: { nombre: "Infancia y juventud", icono: "🧒", tono: "dorado" },
  cultura: { nombre: "Cultura", icono: "🎭", tono: "terracota" },
  deporte: { nombre: "Deporte", icono: "⚽", tono: "rojo" },
  fiestas: { nombre: "Fiestas y tradiciones", icono: "🎉", tono: "dorado" },
  "medio-ambiente": { nombre: "Medio ambiente", icono: "🌳", tono: "musgo" },
  salud: { nombre: "Salud", icono: "🩺", tono: "azul" },
  otra: { nombre: "Otra", icono: "📌", tono: "gris" },
};

export const categoriaActividad = (clave?: string | null) =>
  (clave && CATEGORIAS_ACTIVIDAD[clave]) || {
    nombre: clave || "Sin categoría",
    icono: "",
    tono: "gris" as TagTone,
  };

// "3 de marzo de 2026", o el intervalo si duró varios días, sin repetir lo que
// comparten: "del 3 al 24 de marzo de 2026", "del 28 de marzo al 2 de abril de 2026".
export const formatFechasActividad = (fecha: string, fechaFin?: string | null): string => {
  // Las fechas vienen sin hora ("2026-03-03"): a mediodía para que el huso horario no
  // las mueva de día.
  const d = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
  const inicio = d(fecha);
  const fmt = (f: Date, o: Intl.DateTimeFormatOptions) => f.toLocaleDateString("es-ES", o);
  const completa = { day: "numeric", month: "long", year: "numeric" } as const;

  if (!fechaFin || fechaFin.slice(0, 10) <= fecha.slice(0, 10)) return fmt(inicio, completa);

  const fin = d(fechaFin);
  const mismoAno = inicio.getFullYear() === fin.getFullYear();
  const mismoMes = mismoAno && inicio.getMonth() === fin.getMonth();
  const desde = mismoMes
    ? fmt(inicio, { day: "numeric" })
    : mismoAno
      ? fmt(inicio, { day: "numeric", month: "long" })
      : fmt(inicio, completa);
  return `Del ${desde} al ${fmt(fin, completa)}`;
};
