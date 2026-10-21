// Versión estática: los datos y las imágenes se sirven desde public/ (ver scripts/export-data.mjs)
export const BASE_URL = import.meta.env.BASE_URL;

export const imgUrl = (path?: string | null): string | undefined =>
  path ? `${BASE_URL}${path.replace(/^\//, "")}` : undefined;

// Formularios de Tally. Se crean y mantienen desde tally/ (ver su README); aquí solo
// viven las direcciones públicas. Lo que llega por ahí lo publicamos nosotros a mano.
export const FORMULARIOS = {
  contacto: "https://tally.so/r/obJXzX",
  tablon: "https://tally.so/r/NpzGOW",
  casas: "https://tally.so/r/kbd67J",
  negocios: "https://tally.so/r/ZjxqQa",
};

export const CONTACTO_EMAIL = "info@venialboconecta.es";

// Clave pública VAPID de los avisos push (ver NOTIFICACIONES.md). La privada está en
// .secretos/vapid.json. No se puede cambiar sin perder a todos los suscriptores.
export const VAPID_PUBLICA =
  "BBrC708VaZ68j67GO4rfnfNxmC5OIZuhqt5I68Tw4x8VtMWsSy4L-UfgXF4UvHETwZEK6vgVH3QlGo76V6aUNB8";

// El Worker que guarda las suscripciones (avisos/worker/). Para probar con el de local:
// VITE_AVISOS_URL=http://127.0.0.1:8787 npm run dev
export const AVISOS_URL =
  import.meta.env.VITE_AVISOS_URL ?? "https://venialbo-avisos.venialboconecta.workers.dev";

export const formatFecha = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
