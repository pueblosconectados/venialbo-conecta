import type { CSSProperties } from "react";
import { colors } from "../../theme";

// El distintivo «¡Nuevo!» (ver esNuevo en datos.ts). Relleno y en blanco, no en tono
// suave como las demás etiquetas, para que salte a la vista. En línea, en la ficha, con
// las otras etiquetas. Flotando (la tarjeta de antd ya es position: relative): en la
// esquina, sobre la foto de las tarjetas de los listados; o como pestaña centrada sobre
// el borde de arriba en las de la portada, que en el móvil son tan estrechas que en la
// esquina tapaba el icono.
type Posicion = "linea" | "esquina" | "pestana";

const FLOTANTE: Record<Exclude<Posicion, "linea">, CSSProperties> = {
  esquina: { top: 10, left: 10 },
  pestana: { top: 0, left: "50%", transform: "translate(-50%, -50%)" },
};

export const EtiquetaNuevo = ({ posicion = "linea" }: { posicion?: Posicion }) => (
  <span
    className="vc-nuevo"
    style={{
      background: colors.terracotaOscuro,
      color: colors.blanco,
      fontWeight: 700,
      fontSize: 12,
      lineHeight: "20px",
      padding: "1px 10px",
      borderRadius: 6,
      whiteSpace: "nowrap",
      display: "inline-block",
      ...(posicion !== "linea" && {
        position: "absolute",
        zIndex: 1,
        boxShadow: "0 1px 4px rgba(61, 47, 31, 0.3)",
        ...FLOTANTE[posicion],
      }),
    }}
  >
    ¡Nuevo!
  </span>
);
