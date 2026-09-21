import type { CSSProperties, MouseEvent } from "react";
import { useRef, useState } from "react";
import { Image } from "antd";
import { renderMarkdown } from "../../markdown";
import { useCierreConAtras } from "./useCierreConAtras";

type Props = {
  texto?: string | null;
  style?: CSSProperties;
};

// El contenido en Markdown de una ficha (noticia, negocio, servicio, anuncio).
//
// Las imagenes que el CMS inserta dentro del texto no son componentes: markdown-it
// las devuelve como <img> en crudo dentro del HTML, asi que no se les puede poner un
// <Image> de antd. En vez de eso se escucha el clic en el contenedor y se mira si
// viene de una imagen (delegacion de eventos), y la superposicion la pinta un
// PreviewGroup controlado, que ademas permite pasar de una imagen a otra si la ficha
// tiene varias.
export const ContenidoRico = ({ texto, style }: Props) => {
  const contenedor = useRef<HTMLDivElement>(null);
  const [fuentes, setFuentes] = useState<string[]>([]);
  const [actual, setActual] = useState(0);
  const [abierta, setAbierta] = useState(false);
  useCierreConAtras(abierta, () => setAbierta(false));

  if (!texto) return null;

  const alPulsar = (evento: MouseEvent<HTMLDivElement>) => {
    const destino = evento.target as HTMLElement;
    if (destino.tagName !== "IMG" || !contenedor.current) return;
    // Una imagen que ademas es un enlace: manda el enlace.
    if (destino.closest("a")) return;

    // Se leen del DOM en el momento del clic y no del Markdown: asi el orden es
    // exactamente el que ve el visitante y las rutas ya vienen resueltas.
    const imagenes = Array.from(contenedor.current.querySelectorAll("img"));
    const indice = imagenes.indexOf(destino as HTMLImageElement);
    if (indice < 0) return;

    setFuentes(imagenes.map((img) => img.currentSrc || img.src));
    setActual(indice);
    setAbierta(true);
  };

  return (
    <>
      {/*
        El contenido viene en Markdown desde Pages CMS. renderMarkdown escapa
        el HTML en crudo, asi que la cadena resultante no puede traer etiquetas
        del contenido.
      */}
      <div
        ref={contenedor}
        className="vc-md"
        style={style}
        onClick={alPulsar}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(texto) }}
      />
      <Image.PreviewGroup
        items={fuentes}
        preview={{
          visible: abierta,
          current: actual,
          onVisibleChange: (visible) => setAbierta(visible),
          onChange: (indice) => setActual(indice),
        }}
      />
    </>
  );
};
