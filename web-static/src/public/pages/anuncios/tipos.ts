import type { TagTone } from "../../../theme";

// Los tipos del tablón, como los guarda el CMS (.pages.yml). «Información» lo ponemos
// nosotros y tiene su propio apartado arriba; el resto son anuncios de vecinos.
export const INFORMACION = "informacion";

export const TIPO_LABEL: Record<string, string> = {
  informacion: "Información",
  mascota_perdida: "Mascota perdida",
  compra_venta: "Compra / Venta",
  objeto_perdido: "Objeto perdido",
  otro: "Otro",
};

export const TIPO_TONE: Record<string, TagTone> = {
  informacion: "dorado",
  mascota_perdida: "terracota",
  compra_venta: "musgo",
  objeto_perdido: "azul",
  otro: "gris",
};
