import { useEffect, type ReactNode } from "react";
import { Breadcrumb } from "antd";
import { Compartir } from "./Compartir";

type Props = {
  /** Las migas de pan: la sección con su enlace y la ficha. */
  migas: { title: ReactNode }[];
  /** El nombre de la ficha: para el botón de compartir y la pestaña del navegador. */
  titulo: string;
};

// Lo de arriba de todas las fichas: las migas de pan y, a su derecha, Compartir.
//
// También pone el título de la pestaña. Quien entra por un enlace compartido llega a
// una página con el título de esa ficha (scripts/paginas-compartir.mjs), y sin esto la
// pestaña lo conservaría al ir a otra parte de la web. PublicLayout lo devuelve a
// "VenialboConecta" al cambiar de página.
export const CabeceraFicha = ({ migas, titulo }: Props) => {
  useEffect(() => {
    document.title = `${titulo} · VenialboConecta`;
  }, [titulo]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Breadcrumb items={migas} style={{ minWidth: 0, paddingTop: 5 }} />
      <Compartir titulo={titulo} />
    </div>
  );
};
