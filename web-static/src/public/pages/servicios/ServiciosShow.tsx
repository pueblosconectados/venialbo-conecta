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
import { PhoneOutlined } from "@ant-design/icons";
import { colors, softTagStyle, type TagTone } from "../../../theme";
import { ContenidoRico } from "../../components/ContenidoRico";

type Servicio = {
  id: string;
  nombre: string;
  tipo: string;
  descripcion?: string;
  direccion?: string;
  telefono?: string;
  horario?: string;
  informacion_adicional?: string;
  activo: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  medico: "Médico",
  comedor: "Comedor",
  bibliobus: "Bibliobús",
  venta_ambulante: "Venta ambulante",
  otro: "Otro",
};

const TIPO_TONE: Record<string, TagTone> = {
  medico: "rojo",
  comedor: "terracota",
  bibliobus: "azul",
  venta_ambulante: "musgo",
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

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/servicios">Servicios</Link> },
          { title: s.nombre },
        ]}
      />
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
        {s.informacion_adicional && (
          <Descriptions.Item label="Más información">
            {s.informacion_adicional}
          </Descriptions.Item>
        )}
      </Descriptions>
      {s.telefono && (
        <Space style={{ marginTop: 16 }}>
          <Button
            icon={<PhoneOutlined />}
            type="primary"
            href={`tel:${s.telefono}`}
          >
            Llamar
          </Button>
        </Space>
      )}
      <div style={{ marginTop: 24 }}>
        <Link to="/servicios" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a Servicios
        </Link>
      </div>
    </div>
  );
}
