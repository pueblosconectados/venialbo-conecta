import { BASE_URL } from "./config";

// De cada foto de /media/imagenes/ hay tres versiones pequeñas en webp, hechas por
// scripts/miniaturas.mjs antes de compilar. Ofreciéndolas todas, el navegador se baja
// la que cuadra con el hueco y con su pantalla: una tarjeta de 180 px en un móvil se
// lleva 35 KB en vez del 1,3 MB del original.
const ANCHOS = [400, 800, 1200];

// /media/imagenes/foto.jpg → /media/imagenes/derivadas/foto-400.webp 400w, …
export const juegoDeMiniaturas = (ruta?: string | null): string | undefined => {
  if (!ruta || !ruta.startsWith("/media/imagenes/")) return undefined;
  const partes = ruta.replace(/^\//, "").split("/");
  const fichero = partes.pop();
  if (!fichero) return undefined;
  const base = fichero.replace(/\.[^.]+$/, "");
  const carpeta = [...partes, "derivadas"].join("/");
  return ANCHOS.map((w) => `${BASE_URL}${carpeta}/${base}-${w}.webp ${w}w`).join(", ");
};
