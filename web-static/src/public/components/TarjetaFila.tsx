import type { ReactNode } from "react";
import { Link } from "react-router";
import { Card } from "antd";
import { colors } from "../../theme";
import { Imagen } from "./Imagen";

// Tarjeta de los directorios (Servicios y Negocios): la imagen pequeña a la izquierda,
// dentro de la tarjeta, y el texto al lado. Antes la imagen iba encima, sobre el mismo
// crema que la página, y en el móvil no se sabía si era de la tarjeta de arriba o de
// la de abajo.
//
// La imagen va con `contain` sobre blanco porque hay de todo: logos en PNG que no se
// pueden recortar y fotos de fachadas. Sin imagen, el hueco lo ocupa `sinImagen` (un
// icono), para que todas las tarjetas queden alineadas.

const LADO = 80;

type Props = {
  to: string;
  imagen?: string | null;
  alt: string;
  sinImagen: ReactNode;
  children: ReactNode;
};

export function TarjetaFila({ to, imagen, alt, sinImagen, children }: Props) {
  const hueco = {
    width: LADO,
    height: LADO,
    flexShrink: 0,
    borderRadius: 10,
    border: `1px solid ${colors.borde}`,
    background: colors.blanco,
  };

  return (
    <Link to={to} className="vc-card-link">
      <Card styles={{ body: { padding: 16, display: "flex", gap: 16, alignItems: "flex-start" } }}>
        {imagen ? (
          <Imagen
            src={imagen}
            alt={alt}
            sizes={`${LADO}px`}
            style={{ ...hueco, objectFit: "contain", padding: 4 }}
          />
        ) : (
          <div
            style={{
              ...hueco,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: colors.musgoFondo,
            }}
          >
            {sinImagen}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
      </Card>
    </Link>
  );
}
