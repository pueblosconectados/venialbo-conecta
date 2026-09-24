import { useState } from "react";
import { PlayCircleFilled, YoutubeOutlined } from "@ant-design/icons";
import { colors } from "../../theme";

// Saca el id del vídeo de cualquiera de las formas en que YouTube da el enlace:
// youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID.
const idDeYoutube = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") ?? u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)?.[2] ?? null;
    }
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

// Un vídeo de YouTube que no se carga hasta que se pulsa.
//
// La web promete en Privacidad que no lleva rastreadores, y un <iframe> de YouTube,
// aunque sea el de youtube-nocookie, llama a Google en cuanto se pinta la página.
// Así solo lo hace quien quiere ver el vídeo. Tampoco se pide la miniatura a YouTube,
// por lo mismo. Si el enlace no es de YouTube, se deja como enlace normal.
export const VideoYoutube = ({ url, titulo }: { url?: string | null; titulo: string }) => {
  const [cargado, setCargado] = useState(false);
  if (!url) return null;

  const id = idDeYoutube(url);
  if (!id)
    return (
      <p>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: colors.musgo, fontWeight: 500 }}>
          Ver el vídeo
        </a>
      </p>
    );

  return (
    <div className="vc-video">
      {cargado ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`Vídeo: ${titulo}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setCargado(true)}>
          <PlayCircleFilled style={{ fontSize: 56 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>Ver el vídeo</span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            <YoutubeOutlined /> Se carga desde YouTube al pulsar
          </span>
        </button>
      )}
    </div>
  );
};
