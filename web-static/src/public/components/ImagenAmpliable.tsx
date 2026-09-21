import type { CSSProperties } from "react";
import { useState } from "react";
import { Image } from "antd";
import { useCierreConAtras } from "./useCierreConAtras";

type Props = {
  // imgUrl() devuelve undefined si no hay ruta; las fichas ya comprueban antes que
  // la imagen existe, pero el tipo lo arrastra.
  src?: string;
  alt: string;
  /** Estilos de la imagen en la pagina (los de la <img> de antes). */
  style?: CSSProperties;
  /** Estilos del hueco que ocupa, porque antd envuelve la imagen en un <div>. */
  wrapperStyle?: CSSProperties;
};

// La imagen adjunta de una ficha (noticia, negocio, anuncio): al tocarla se ve
// entera, superpuesta sobre la pagina. Es el <Image> de antd, que ya trae la
// superposicion, el zoom y el cierre con Esc o pulsando fuera; lo unico que se
// anade es el cierre con el boton atras.
export const ImagenAmpliable = ({ src, alt, style, wrapperStyle }: Props) => {
  const [abierta, setAbierta] = useState(false);
  useCierreConAtras(abierta, () => setAbierta(false));

  return (
    <Image
      src={src}
      alt={alt}
      decoding="async"
      style={{ cursor: "zoom-in", ...style }}
      wrapperStyle={wrapperStyle}
      preview={{
        visible: abierta,
        onVisibleChange: setAbierta,
        // El texto por defecto de antd esta en ingles
        mask: "Ver imagen completa",
      }}
    />
  );
};
