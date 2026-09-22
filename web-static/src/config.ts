// Versión estática: los datos y las imágenes se sirven desde public/ (ver scripts/export-data.mjs)
export const BASE_URL = import.meta.env.BASE_URL;

export const imgUrl = (path?: string | null): string | undefined =>
  path ? `${BASE_URL}${path.replace(/^\//, "")}` : undefined;

// Formularios de Tally. Se crean y mantienen desde tally/ (ver su README); aquí solo
// viven las direcciones públicas. Lo que llega por ahí lo publicamos nosotros a mano.
export const FORMULARIOS = {
  contacto: "https://tally.so/r/obJXzX",
  tablon: "https://tally.so/r/NpzGOW",
  negocios: "https://tally.so/r/ZjxqQa",
};

export const CONTACTO_EMAIL = "info@venialboconecta.es";

export const formatFecha = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
