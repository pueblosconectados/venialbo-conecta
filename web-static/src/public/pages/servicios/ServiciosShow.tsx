import { useParams, Link } from "react-router";
import { esNuevo, useOne } from "../../../datos";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";
import {
  Alert,
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
  LinkOutlined,
  MailOutlined,
  PhoneOutlined,
  YoutubeOutlined,
} from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { colors, softTagStyle } from "../../../theme";
import { CabeceraFicha } from "../../components/CabeceraFicha";
import { ContenidoRico } from "../../components/ContenidoRico";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { juegoDeMiniaturas } from "../../../miniaturas";
import { tipoServicio } from "./tipos";

type Servicio = {
  novedad_hasta?: string | null;
  id: string;
  nombre: string;
  tipo: string;
  descripcion?: string;
  logo_url?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  web_url?: string;
  // «Más enlaces» del CMS: la sede electrónica, un horario… (build-content los limpia)
  enlaces?: { texto: string; url: string }[];
  redes_sociales?: Record<string, string>;
  horario?: string;
  informacion_adicional?: string;
  activo: boolean;
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
      <CabeceraFicha titulo={s.nombre} migas={[
          { title: <Link to="/servicios">Servicios e instituciones</Link> },
          { title: s.nombre },
        ]} />
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {esNuevo(s) && <EtiquetaNuevo />}
        <Tag style={softTagStyle(tipoServicio(s.tipo).tono)}>
          {tipoServicio(s.tipo).nombre}
        </Tag>
      </div>
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
        {s.enlaces?.map((e) => (
          <Button
            key={e.url}
            icon={<LinkOutlined />}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {e.texto}
          </Button>
        ))}
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
