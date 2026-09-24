import { useParams, Link } from "react-router";
import { useOne } from "../../../datos";
import { Alert, Button, Divider, Spin, Tag, Typography } from "antd";
import { PictureOutlined, ReadOutlined, StarFilled, TeamOutlined } from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { CabeceraFicha } from "../../components/CabeceraFicha";
import { ContenidoRico } from "../../components/ContenidoRico";
import { Documentos, type Documento } from "../../components/Documentos";
import { Galeria, type Foto } from "../../components/Galeria";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { VideoYoutube } from "../../components/VideoYoutube";
import { juegoDeMiniaturas } from "../../../miniaturas";
import { colors, softTagStyle } from "../../../theme";
import { categoriaActividad, formatFechasActividad } from "./categorias";

type ActividadDetail = {
  id: string;
  titulo: string;
  fecha: string;
  fecha_fin?: string | null;
  categoria: string;
  resumen?: string | null;
  imagen_url?: string | null;
  contenido?: string | null;
  galeria?: Foto[];
  video_url?: string | null;
  album_externo?: string | null;
  documentos?: Documento[];
  // build-content.mjs cambia la ruta del fichero por lo justo para el enlace
  organiza?: { id: string; nombre: string } | null;
  noticia?: { id: string; titulo: string } | null;
  destacada?: boolean;
};

const tituloSeccion = (texto: string) => (
  <Typography.Title level={4} style={{ margin: "28px 0 12px" }}>
    {texto}
  </Typography.Title>
);

// Casi todo es opcional: cada bloque se pinta solo si tiene algo dentro, para que una
// actividad con dos líneas y tres fotos no enseñe huecos vacíos.
export function ActividadesShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<ActividadDetail>({ resource: "actividades", id });

  if (query.isLoading) return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result) return <Alert type="error" message="Actividad no encontrada" />;

  const a = result;
  const cat = categoriaActividad(a.categoria);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <CabeceraFicha titulo={a.titulo} migas={[{ title: <Link to="/actividades">Actividades</Link> }, { title: a.titulo }]} />
      {a.imagen_url && (
        <ImagenAmpliable
          src={imgUrl(a.imagen_url)}
          srcSet={juegoDeMiniaturas(a.imagen_url)}
          sizes="(max-width: 832px) 100vw, 800px"
          alt={a.titulo}
          wrapperStyle={{ display: "block", width: "100%", marginBottom: 24 }}
          style={{
            width: "100%",
            maxHeight: 400,
            objectFit: "cover",
            borderRadius: 14,
            border: `1px solid ${colors.borde}`,
          }}
        />
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Tag style={softTagStyle(cat.tono)}>{cat.nombre}</Tag>
        {a.destacada && (
          <Tag icon={<StarFilled />} style={softTagStyle("dorado")}>
            Destacada
          </Tag>
        )}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{a.titulo}</Typography.Title>
      <Typography.Text style={{ color: colors.marronSuave, display: "block" }}>
        {formatFechasActividad(a.fecha, a.fecha_fin)}
      </Typography.Text>
      {a.organiza && (
        <Typography.Text style={{ color: colors.marronSuave, display: "block", marginTop: 4 }}>
          <TeamOutlined /> Organiza{" "}
          <Link to={`/servicios/${a.organiza.id}`} style={{ color: colors.musgo, fontWeight: 500 }}>
            {a.organiza.nombre}
          </Link>
        </Typography.Text>
      )}
      <Divider style={{ borderColor: colors.borde }} />

      {/* Sin relato, el resumen hace sus veces para que la ficha no empiece en las fotos */}
      {a.contenido ? (
        <ContenidoRico texto={a.contenido} />
      ) : (
        a.resumen && <Typography.Paragraph style={{ fontSize: 16 }}>{a.resumen}</Typography.Paragraph>
      )}

      {a.galeria && a.galeria.length > 0 && (
        <>
          {tituloSeccion("Fotos")}
          <Galeria fotos={a.galeria} titulo={a.titulo} />
        </>
      )}
      {a.album_externo && (
        <Button
          href={a.album_externo}
          target="_blank"
          rel="noopener noreferrer"
          icon={<PictureOutlined />}
          style={{ marginTop: 16 }}
        >
          Ver más fotos
        </Button>
      )}

      {a.video_url && (
        <>
          {tituloSeccion("Vídeo")}
          <VideoYoutube url={a.video_url} titulo={a.titulo} />
        </>
      )}

      <Documentos documentos={a.documentos} />

      {a.noticia && (
        <Typography.Paragraph style={{ margin: "28px 0 0", color: colors.marronSuave }}>
          <ReadOutlined /> Se anunció en la noticia{" "}
          <Link to={`/noticias/${a.noticia.id}`} style={{ color: colors.musgo, fontWeight: 500 }}>
            {a.noticia.titulo}
          </Link>
        </Typography.Paragraph>
      )}

      <div style={{ marginTop: 28 }}>
        <Link to="/actividades" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a Actividades
        </Link>
      </div>
    </div>
  );
}
