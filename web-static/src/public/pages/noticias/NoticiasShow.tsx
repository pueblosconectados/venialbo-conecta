import { useParams, Link } from "react-router";
import { useOne } from "../../../datos";
import {
  Alert,
  Breadcrumb,
  Divider,
  Spin,
  Tag,
  Typography,
} from "antd";
import { StarFilled } from "@ant-design/icons";
import { formatFecha, imgUrl } from "../../../config";
import { ContenidoRico } from "../../components/ContenidoRico";
import { Documentos, type Documento } from "../../components/Documentos";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { juegoDeMiniaturas } from "../../../miniaturas";
import { colors, softTagStyle, softTagStyleFromHex } from "../../../theme";

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
      <Documentos documentos={n.documentos} />
      <Link to="/noticias" style={{ color: colors.musgo, fontWeight: 500 }}>← Volver a Noticias</Link>
    </div>
  );
}
