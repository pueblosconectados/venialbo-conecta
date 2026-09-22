import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
import {
  Alert,
  Breadcrumb,
  Divider,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { FilePdfOutlined, StarFilled } from "@ant-design/icons";
import { formatFecha, imgUrl } from "../../../config";
import { ContenidoRico } from "../../components/ContenidoRico";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { juegoDeMiniaturas } from "../../../miniaturas";
import { colors, softTagStyle, softTagStyleFromHex } from "../../../theme";

type Documento = {
  archivo: string;
  titulo?: string | null;
  tamano?: number;
};

type NoticiaDetail = {
  id: string;
  titulo: string;
  contenido: string;
  imagen_url?: string;
  documentos?: Documento[];
  categoria: { id: string; nombre: string; color?: string };
  fecha_publicacion: string;
  destacada: boolean;
  activa: boolean;
};

// El nombre del fichero, para cuando el documento no lleva título puesto.
const nombreDeArchivo = (ruta: string) =>
  decodeURIComponent(ruta.split("/").pop() ?? ruta);

const formatTamano = (bytes?: number) => {
  if (!bytes) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.round(bytes / 1024)} KB`;
};

export function NoticiasShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<NoticiaDetail>({
    resource: "noticias",
    id,
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result)
    return <Alert type="error" message="Noticia no encontrada" />;

  const n = result;
  const documentos = n.documentos ?? [];

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/noticias">Noticias</Link> },
          { title: n.titulo },
        ]}
      />
      {n.imagen_url && (
        <ImagenAmpliable
          src={imgUrl(n.imagen_url)}
          srcSet={juegoDeMiniaturas(n.imagen_url)}
          sizes="(max-width: 832px) 100vw, 800px"
          alt={n.titulo}
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
        <Tag style={softTagStyleFromHex(n.categoria.color ?? "#487824")}>{n.categoria.nombre}</Tag>
        {n.destacada && (
          <Tag icon={<StarFilled />} style={softTagStyle("dorado")}>
            Destacada
          </Tag>
        )}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{n.titulo}</Typography.Title>
      <Typography.Text style={{ color: colors.marronSuave }}>
        {formatFecha(n.fecha_publicacion)}
      </Typography.Text>
      <Divider style={{ borderColor: colors.borde }} />
      <ContenidoRico texto={n.contenido} />
      {documentos.length > 0 && (
        <div style={{ margin: "28px 0" }}>
          <Typography.Title level={4} style={{ marginBottom: 12 }}>
            Documentos
          </Typography.Title>
          <Space direction="vertical" size={8} style={{ display: "flex" }}>
            {documentos.map((d) => {
              const peso = formatTamano(d.tamano);
              return (
                <a
                  key={d.archivo}
                  href={imgUrl(d.archivo)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: colors.crema,
                    border: `1px solid ${colors.borde}`,
                    borderRadius: 10,
                    color: colors.marronTexto,
                  }}
                >
                  <FilePdfOutlined style={{ fontSize: 20, color: colors.terracota }} />
                  <span style={{ fontWeight: 500 }}>
                    {d.titulo || nombreDeArchivo(d.archivo)}
                  </span>
                  <span style={{ color: colors.marronSuave, fontSize: 13 }}>
                    PDF{peso ? ` · ${peso}` : ""}
                  </span>
                </a>
              );
            })}
          </Space>
        </div>
      )}
      <Link to="/noticias" style={{ color: colors.musgo, fontWeight: 500 }}>← Volver a Noticias</Link>
    </div>
  );
}
