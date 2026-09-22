import { useParams, Link } from "react-router";
import { useOne } from "../../../datos";
import {
  Alert,
  Breadcrumb,
  Button,
  Descriptions,
  Divider,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  FacebookOutlined,
  GlobalOutlined,
  InstagramOutlined,
  MailOutlined,
  PhoneOutlined,
  YoutubeOutlined,
} from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { colors, softTagStyle, type TagTone } from "../../../theme";
import { ContenidoRico } from "../../components/ContenidoRico";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { juegoDeMiniaturas } from "../../../miniaturas";

type Servicio = {
  id: string;
  nombre: string;
  tipo: string;
  descripcion?: string;
  logo_url?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  web_url?: string;
  redes_sociales?: Record<string, string>;
  horario?: string;
  informacion_adicional?: string;
  activo: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  medico: "Médico",
  comedor: "Comedor",
  bibliobus: "Bibliobús",
  venta_ambulante: "Venta ambulante",
  asociacion: "Asociación",
  institucion: "Institución",
  otro: "Otro",
};

const TIPO_TONE: Record<string, TagTone> = {
  medico: "rojo",
  comedor: "terracota",
  bibliobus: "azul",
  venta_ambulante: "musgo",
  asociacion: "lila",
  institucion: "dorado",
  otro: "gris",
};

export function ServiciosShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<Servicio>({
    resource: "servicios",
    id,
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result)
    return <Alert type="error" message="Servicio no encontrado" />;

  const s = result;
  const redes = s.redes_sociales ?? {};

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/servicios">Servicios e instituciones</Link> },
          { title: s.nombre },
        ]}
      />
      {s.logo_url && (
        <div
          style={{
            background: colors.crema,
            border: `1px solid ${colors.borde}`,
            borderRadius: 14,
            padding: 20,
            marginBottom: 20,
            display: "inline-block",
          }}
        >
          <ImagenAmpliable
            src={imgUrl(s.logo_url)}
          srcSet={juegoDeMiniaturas(s.logo_url)}
          sizes="(max-width: 480px) 60vw, 300px"
            alt={s.nombre}
            style={{ maxHeight: 160, display: "block" }}
          />
        </div>
      )}
      <Tag style={{ ...softTagStyle(TIPO_TONE[s.tipo] ?? "gris"), marginBottom: 12 }}>
        {TIPO_LABEL[s.tipo] ?? s.tipo}
      </Tag>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{s.nombre}</Typography.Title>
      <ContenidoRico texto={s.descripcion} style={{ fontSize: 15 }} />
      <Divider style={{ borderColor: colors.borde }} />
      <Descriptions column={1} size="small">
        {s.direccion && (
          <Descriptions.Item label="Dirección">{s.direccion}</Descriptions.Item>
        )}
        {s.horario && (
          <Descriptions.Item label="Horario">{s.horario}</Descriptions.Item>
        )}
        {s.telefono && (
          <Descriptions.Item label="Teléfono">
            <a href={`tel:${s.telefono}`}>{s.telefono}</a>
          </Descriptions.Item>
        )}
        {s.email && (
          <Descriptions.Item label="Email">
            <a href={`mailto:${s.email}`}>{s.email}</a>
          </Descriptions.Item>
        )}
        {s.informacion_adicional && (
          <Descriptions.Item label="Más información">
            {s.informacion_adicional}
          </Descriptions.Item>
        )}
      </Descriptions>
      <Space wrap style={{ marginTop: 16 }}>
        {s.telefono && (
          <Button
            icon={<PhoneOutlined />}
            type="primary"
            href={`tel:${s.telefono}`}
          >
            Llamar
          </Button>
        )}
        {s.web_url && (
          <Button
            icon={<GlobalOutlined />}
            href={s.web_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Web
          </Button>
        )}
        {redes.facebook && (
          <Button
            icon={<FacebookOutlined />}
            href={redes.facebook}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </Button>
        )}
        {redes.instagram && (
          <Button
            icon={<InstagramOutlined />}
            href={redes.instagram}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </Button>
        )}
        {redes.youtube && (
          <Button
            icon={<YoutubeOutlined />}
            href={redes.youtube}
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube
          </Button>
        )}
        {s.email && (
          <Button icon={<MailOutlined />} href={`mailto:${s.email}`}>
            Email
          </Button>
        )}
      </Space>
      <div style={{ marginTop: 24 }}>
        <Link to="/servicios" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a Servicios e instituciones
        </Link>
      </div>
    </div>
  );
}
