import { haCaducado } from "../../../datos";
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
// Con hora (el build la deja como "09:30"): "3 de marzo de 2026, a las 9:30", o
// "…, de 18:00 a 20:00" si tiene hora de fin. Si se repite: "Los lunes, del 19 de
// octubre al 14 de diciembre de 2026, de 18:00 a 20:00".
export type FechasActividad = {
  fecha: string;
  fecha_fin?: string | null;
  hora?: string | null;
  hora_fin?: string | null;
  repeticion?: string | null;
};

// Cada cuántas semanas, según el valor del CMS (el build ya quita lo que no vale)
export const SEMANAS_REPETICION: Record<string, number> = { semanal: 1, quincenal: 2 };
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

export const formatFechasActividad = (a: FechasActividad): string => {
  let dias = formatDias(a.fecha, a.fecha_fin);
  const semanas = a.repeticion ? SEMANAS_REPETICION[a.repeticion] : undefined;
  if (semanas) {
    const dia = DIAS_PLURAL[new Date(`${a.fecha.slice(0, 10)}T12:00:00`).getDay()];
    const cada = semanas === 1 ? `Los ${dia}` : `Cada dos ${dia}`;
    dias = `${cada}, ${dias.charAt(0).toLowerCase()}${dias.slice(1)}`;
  }
  if (!a.hora) return dias;
  return a.hora_fin
    ? `${dias}, de ${formatHora(a.hora)} a ${formatHora(a.hora_fin)}`
    : `${dias}, a las ${formatHora(a.hora)}`;
};

// "09:30" → "9:30"
export const formatHora = (hora: string) => hora.replace(/^0(?=\d)/, "");

const formatDias = (fecha: string, fechaFin?: string | null): string => {
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

// Ya celebrada cuando ha pasado su último día (incluido). Como la caducidad, se calcula
// al visitar: una actividad pasa sola de «Próximas» a «Ya celebradas» sin publicar.
export const yaCelebrada = (a: { fecha: string; fecha_fin?: string | null }): boolean => {
  const inicio = a.fecha.slice(0, 10);
  const fin = a.fecha_fin?.slice(0, 10);
  return haCaducado(fin && fin > inicio ? fin : inicio);
};
