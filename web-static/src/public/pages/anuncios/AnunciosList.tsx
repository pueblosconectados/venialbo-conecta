import { useState } from "react";
import { Link } from "react-router";
import { useList } from "../../../datos";
import {
  Alert,
  Button,
  Card,
  Col,
  Pagination,
  Row,
  Spin,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { FORMULARIOS, formatFecha } from "../../../config";
import { colors, softTagStyle, type TagTone } from "../../../theme";
import { Imagen } from "../../components/Imagen";
import { textoPlano } from "../../../markdown";

type Anuncio = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion?: string;
  imagen_url?: string;
  fecha_publicacion: string;
  activo: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  mascota_perdida: "Mascota perdida",
  compra_venta: "Compra / Venta",
  objeto_perdido: "Objeto perdido",
  otro: "Otro",
};

const TIPO_TONE: Record<string, TagTone> = {
  mascota_perdida: "terracota",
  compra_venta: "musgo",
  objeto_perdido: "azul",
  otro: "gris",
};

const PAGE_SIZE = 12;

export function AnunciosList() {
  const [page, setPage] = useState(1);

  const { result, query } = useList<Anuncio>({
    resource: "anuncios",
    pagination: { currentPage: page, pageSize: PAGE_SIZE, mode: "server" },
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError)
    return <Alert type="error" message="No se pudo cargar el tablón" />;

  const items = result?.data ?? [];
  const total = result?.total ?? 0;

  return (
    <div>
      <div className="vc-cabecera-lista" style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Tablón de anuncios</Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          href={FORMULARIOS.tablon}
          target="_blank"
          rel="noopener noreferrer"
        >
          Publicar un anuncio
        </Button>
      </div>
      <Row gutter={[16, 16]}>
        {items.map((a) => (
          <Col key={a.id} xs={24} sm={12} lg={8}>
            <Link to={`/tablon/${a.id}`} className="vc-card-link">
              <Card
                cover={
                  a.imagen_url ? (
                    <Imagen
                      src={a.imagen_url}
                      alt={a.titulo}
                      sizes="(max-width: 575px) 100vw, (max-width: 991px) 50vw, 33vw"
                      style={{
                        height: 180,
                        objectFit: "cover",
                        borderBottom: `1px solid ${colors.borde}`,
                      }}
                    />
                  ) : undefined
                }
                styles={{ body: { padding: 12 } }}
              >
                <Tag style={{ ...softTagStyle(TIPO_TONE[a.tipo] ?? "gris"), marginBottom: 6 }}>
                  {TIPO_LABEL[a.tipo] ?? a.tipo}
                </Tag>
                <Typography.Text
                  strong
                  style={{ display: "block", marginBottom: 4 }}
                >
                  {a.titulo}
                </Typography.Text>
                {a.descripcion && (
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
                    {textoPlano(a.descripcion)}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {formatFecha(a.fecha_publicacion)}
                </Typography.Text>
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
