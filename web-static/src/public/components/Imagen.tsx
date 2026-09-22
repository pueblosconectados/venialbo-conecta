import type { CSSProperties } from "react";
import { imgUrl } from "../../config";
import { juegoDeMiniaturas } from "../../miniaturas";

// Pinta una imagen dejando que el navegador elija el tamaño que le hace falta.
//
// De cada foto de /media/imagenes/ hay tres versiones pequeñas en webp, hechas por
// scripts/miniaturas.mjs antes de compilar. Aquí se ofrecen las tres y el navegador se
// baja la que cuadre con el hueco y con su pantalla: una tarjeta de 180 px en un móvil
// se lleva 35 KB en vez del 1,3 MB del original.
//
// El original sigue siendo el `src` del <img>, así que un navegador que no entienda
// webp —Safari anterior a 2020— se lo baja entero y lo ve igual de bien.

type Props = {
  src: string;
  alt: string;
  /** Cuánto espacio ocupa la imagen, para que el navegador acierte al elegir. */
  sizes?: string;
  style?: CSSProperties;
  wrapperStyle?: CSSProperties;
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
};

export function Imagen({
  src,
  alt,
  sizes = "100vw",
  style,
  wrapperStyle,
  className,
  loading = "lazy",
  decoding = "async",
}: Props) {
  const miniaturas = juegoDeMiniaturas(src);

  return (
    <picture style={{ display: "block", ...wrapperStyle }} className={className}>
      {miniaturas && <source type="image/webp" srcSet={miniaturas} sizes={sizes} />}
      <img
        src={imgUrl(src)}
        alt={alt}
        loading={loading}
        decoding={decoding}
        // El <picture> rompe la regla de antd que estira la imagen de portada de una
        // tarjeta, así que el ancho se pone aquí.
        style={{ width: "100%", display: "block", ...style }}
      />
    </picture>
  );
}
