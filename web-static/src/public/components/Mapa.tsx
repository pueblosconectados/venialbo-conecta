import { useState } from "react";
import { Button } from "antd";
import { EnvironmentOutlined, ExpandOutlined } from "@ant-design/icons";

type Props = {
  latitud: number;
  longitud: number;
  /** Para el título del iframe, que es lo que lee un lector de pantalla. */
  nombre: string;
};

// Mapa de un punto: el <iframe> de OpenStreetMap con un marcador, y debajo "Cómo
// llegar" (abre la app de mapas del móvil con la ruta ya puesta) y "Ver mapa grande".
//
// Es la opción B del punto 13: no suma nada al JavaScript de la web. El día que haya
// mapa interactivo (opción C, con Leaflet) se sustituye este componente y las fichas no
// tienen que cambiar, porque ya le pasan las coordenadas.
//
// El mapa lleva una capa encima que hay que tocar para usarlo. Sin ella, en el móvil el
// dedo que baja por la ficha se queda arrastrando el mapa y la página no avanza.
export const Mapa = ({ latitud, longitud, nombre }: Props) => {
  const [activo, setActivo] = useState(false);

  // Un recuadro de unos 700 × 550 m alrededor del punto: se ve la calle y lo de al lado
  const dLon = 0.004;
  const dLat = 0.0025;
  const bbox = [longitud - dLon, latitud - dLat, longitud + dLon, latitud + dLat].join(",");
  const embed =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${latitud},${longitud}`;
  const grande = `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=17/${latitud}/${longitud}`;
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}`;

  return (
    <div>
      <div className="vc-mapa">
        <iframe src={embed} title={`Mapa: ${nombre}`} loading="lazy" />
        {!activo && (
          <button type="button" className="vc-mapa-capa" onClick={() => setActivo(true)}>
            <span>Toca para mover el mapa</span>
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <Button type="primary" icon={<EnvironmentOutlined />} href={comoLlegar} target="_blank" rel="noopener noreferrer">
          Cómo llegar
        </Button>
        <Button icon={<ExpandOutlined />} href={grande} target="_blank" rel="noopener noreferrer">
          Ver mapa grande
        </Button>
      </div>
    </div>
  );
};
