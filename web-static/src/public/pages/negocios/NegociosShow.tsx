import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
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
  MobileOutlined,
  PhoneOutlined,
  YoutubeOutlined,
} from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { colors, softTagStyle } from "../../../theme";
import { ContenidoRico } from "../../components/ContenidoRico";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { juegoDeMiniaturas } from "../../../miniaturas";

type Negocio = {
  id: string;
  nombre: string;
  descripcion?: string;
  direccion?: string;
  telefono?: string;
  telefono_movil?: string;
  email?: string;
  web_url?: string;
  redes_sociales?: Record<string, string>;
  logo_url?: string;
  horario?: string;
  categoria_negocio?: string;
  activo: boolean;
};

export function NegociosShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<Negocio>({
    resource: "negocios",
    id,
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result)
    return <Alert type="error" message="Negocio no encontrado" />;

  const n = result;
  const redes = n.redes_sociales ?? {};

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/negocios">Negocios</Link> },
          { title: n.nombre },
        ]}
      />
      {n.logo_url && (
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
            src={imgUrl(n.logo_url)}
          srcSet={juegoDeMiniaturas(n.logo_url)}
          sizes="(max-width: 480px) 60vw, 300px"
            alt={n.nombre}
            style={{ maxHeight: 160, display: "block" }}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {n.categoria_negocio && (
          <Tag style={softTagStyle("terracota")}>{n.categoria_negocio}</Tag>
        )}
        {!n.activo && <Tag style={softTagStyle("rojo")}>Cerrado</Tag>}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{n.nombre}</Typography.Title>
      <ContenidoRico texto={n.descripcion} style={{ fontSize: 15 }} />
      <Divider style={{ borderColor: colors.borde }} />
      <Descriptions column={1} size="small">
        {n.direccion && (
          <Descriptions.Item label="Dirección">{n.direccion}</Descriptions.Item>
        )}
        {n.horario && (
          <Descriptions.Item label="Horario">{n.horario}</Descriptions.Item>
        )}
        {n.telefono && (
          <Descriptions.Item label="Teléfono fijo">
            <a href={`tel:${n.telefono}`}>{n.telefono}</a>
          </Descriptions.Item>
        )}
        {n.telefono_movil && (
          <Descriptions.Item label="Teléfono móvil">
            <a href={`tel:${n.telefono_movil}`}>{n.telefono_movil}</a>
          </Descriptions.Item>
        )}
        {n.email && (
          <Descriptions.Item label="Email">
            <a href={`mailto:${n.email}`}>{n.email}</a>
          </Descriptions.Item>
        )}
      </Descriptions>
      <Space wrap style={{ marginTop: 16 }}>
        {n.telefono && (
          <Button
            icon={<PhoneOutlined />}
            type="primary"
            href={`tel:${n.telefono}`}
          >
            {n.telefono_movil ? "Llamar al fijo" : "Llamar"}
          </Button>
        )}
        {n.telefono_movil && (
          <Button
            icon={<MobileOutlined />}
            type="primary"
            href={`tel:${n.telefono_movil}`}
          >
            {n.telefono ? "Llamar al móvil" : "Llamar"}
          </Button>
        )}
        {n.web_url && (
          <Button
            icon={<GlobalOutlined />}
            href={n.web_url}
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
        {n.email && (
          <Button icon={<MailOutlined />} href={`mailto:${n.email}`}>
            Email
          </Button>
        )}
      </Space>
      <div style={{ marginTop: 24 }}>
        <Link to="/negocios" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver al directorio
        </Link>
      </div>
    </div>
  );
}
