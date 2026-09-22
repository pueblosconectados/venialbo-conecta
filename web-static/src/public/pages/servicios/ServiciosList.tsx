import { useState } from "react";
import { Link } from "react-router";
import { useList } from "@refinedev/core";
import {
  Alert,
  Card,
  Col,
  Pagination,
  Row,
  Spin,
  Tag,
  Typography,
} from "antd";
import { PhoneOutlined } from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { colors, softTagStyle, type TagTone } from "../../../theme";
import { textoPlano } from "../../../markdown";

type Servicio = {
  id: string;
  nombre: string;
  tipo: string;
  descripcion?: string;
  logo_url?: string;
  direccion?: string;
  telefono?: string;
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

const PAGE_SIZE = 20;

export function ServiciosList() {
  const [page, setPage] = useState(1);

  const { result, query } = useList<Servicio>({
    resource: "servicios",
    pagination: { currentPage: page, pageSize: PAGE_SIZE, mode: "server" },
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError)
    return (
      <Alert type="error" message="No se pudieron cargar los servicios" />
    );

  const items = result.data ?? [];
  const total = result.total ?? 0;

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 24 }}>
        Servicios e instituciones
      </Typography.Title>
      <Row gutter={[16, 16]}>
        {items.map((s) => (
          <Col key={s.id} xs={24} sm={12} lg={8}>
            <Link to={`/servicios/${s.id}`} className="vc-card-link">
              <Card
                cover={
                  s.logo_url ? (
                    <img
                      src={imgUrl(s.logo_url)}
                      alt={s.nombre}
                      loading="lazy"
                      decoding="async"
                      style={{
                        height: 180,
                        objectFit: "contain",
                        padding: 16,
                        background: colors.crema,
                        borderBottom: `1px solid ${colors.borde}`,
                      }}
                    />
                  ) : undefined
                }
                styles={{ body: { padding: 16 } }}
              >
                <Tag style={{ ...softTagStyle(TIPO_TONE[s.tipo] ?? "gris"), marginBottom: 8 }}>
                  {TIPO_LABEL[s.tipo] ?? s.tipo}
                </Tag>
                <Typography.Text
                  strong
                  style={{ display: "block", marginBottom: 4 }}
                >
                  {s.nombre}
                </Typography.Text>
                {s.descripcion && (
                  <Typography.Text
                    type="secondary"
                    style={{
                      fontSize: 12,
                      display: "block",
                      marginBottom: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {textoPlano(s.descripcion)}
                  </Typography.Text>
                )}
                {s.telefono && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <PhoneOutlined /> {s.telefono}
                  </Typography.Text>
                )}
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
      {total > PAGE_SIZE && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
}
