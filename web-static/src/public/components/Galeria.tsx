import { useState } from "react";
import { Image } from "antd";
import { imgUrl } from "../../config";
import { Imagen } from "./Imagen";
import { useCierreConAtras } from "./useCierreConAtras";

export type Foto = {
  imagen: string;
  pie?: string | null;
};

type Props = {
  fotos?: Foto[];
  /** Para el texto alternativo de las fotos que no llevan pie. */
  titulo: string;
};

// Las fotos de una actividad (y, más adelante, de lugares y rutas): una cuadrícula de
// miniaturas y, al tocar una, la superposición de antd para pasar de una a otra.
//
// En la cuadrícula van las miniaturas webp (<Imagen> con srcset); al ampliar se carga
// el original. El pie de foto se lee al ampliarla, encima de los botones: en la
// cuadrícula no cabe sin que se descuadre.
export const Galeria = ({ fotos, titulo }: Props) => {
  const [actual, setActual] = useState(0);
  const [abierta, setAbierta] = useState(false);
  useCierreConAtras(abierta, () => setAbierta(false));

  if (!fotos?.length) return null;

  const pie = fotos[actual]?.pie;

  return (
    <>
      <div className="vc-galeria">
        {fotos.map((f, i) => (
          <button
            key={`${f.imagen}-${i}`}
            type="button"
            className="vc-galeria-foto"
            onClick={() => {
              setActual(i);
              setAbierta(true);
            }}
            aria-label={f.pie ? `Ampliar: ${f.pie}` : `Ampliar la foto ${i + 1}`}
          >
            <Imagen
              src={f.imagen}
              alt={f.pie || `${titulo}, foto ${i + 1}`}
              // Dos columnas en móvil y cuatro en escritorio, en una ficha de 800 px
              sizes="(max-width: 575px) 50vw, 200px"
              wrapperStyle={{ height: "100%" }}
              style={{ height: "100%", objectFit: "cover" }}
            />
          </button>
        ))}
      </div>
      <Image.PreviewGroup
        items={fotos.map((f) => imgUrl(f.imagen) ?? "")}
        preview={{
          visible: abierta,
          current: actual,
          onVisibleChange: (visible) => setAbierta(visible),
          onChange: (indice) => setActual(indice),
          toolbarRender: (botones) => (
            <div className="vc-galeria-barra">
              {pie && <p className="vc-galeria-pie">{pie}</p>}
              {botones}
            </div>
          ),
        }}
      />
    </>
  );
};
