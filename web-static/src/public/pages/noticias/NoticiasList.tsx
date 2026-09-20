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
import { StarFilled } from "@ant-design/icons";
import { formatFecha, imgUrl } from "../../../config";
import { colors, softTagStyle, softTagStyleFromHex } from "../../../theme";

type NoticiaList = {
  id: string;
  titulo: string;
  imagen_url?: string;
  categoria: { id: string; nombre: string; color?: string };
  fecha_publicacion: string;
  destacada: boolean;
  activa: boolean;
};

const PAGE_SIZE = 12;

export function NoticiasList() {
  const [page, setPage] = useState(1);

  const { result, query } = useList<NoticiaList>({
    resource: "noticias",
    pagination: { currentPage: page, pageSize: PAGE_SIZE, mode: "server" },
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError)
    return <Alert type="error" message="No se pudieron cargar las noticias" />;

  const items = result.data ?? [];
  const total = result.total ?? 0;

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 24 }}>Noticias</Typography.Title>
      <Row gutter={[16, 16]}>
        {items.map((n) => (
          <Col key={n.id} xs={24} sm={12} lg={8}>
            <Link to={`/noticias/${n.id}`} className="vc-card-link">
              <Card
                cover={
                  n.imagen_url ? (
                    <img
                      src={imgUrl(n.imagen_url)}
                      alt={n.titulo}
                      loading="lazy"
                      decoding="async"
                      style={{
                        height: 180,
                        objectFit: "cover",
                        borderBottom: `1px solid ${colors.borde}`,
                      }}
                    />
                  ) : undefined
                }
                styles={{ body: { padding: 16 } }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  <Tag style={softTagStyleFromHex(n.categoria.color ?? "#487824")}>
                    {n.categoria.nombre}
                  </Tag>
                  {n.destacada && (
                    <Tag icon={<StarFilled />} style={softTagStyle("dorado")}>
                      Destacada
                    </Tag>
                  )}
                </div>
                <Typography.Text
                  strong
                  style={{ display: "block", marginBottom: 4 }}
                >
                  {n.titulo}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatFecha(n.fecha_publicacion)}
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
