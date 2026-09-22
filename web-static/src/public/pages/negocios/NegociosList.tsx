import { useState } from "react";
import { Link } from "react-router";
import { useList } from "@refinedev/core";
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
import { MobileOutlined, PhoneOutlined, PlusOutlined, ShopOutlined } from "@ant-design/icons";
import { FORMULARIOS } from "../../../config";
import { Imagen } from "../../components/Imagen";
import { colors, softTagStyle } from "../../../theme";

type Negocio = {
  id: string;
  nombre: string;
  descripcion?: string;
  telefono?: string;
  telefono_movil?: string;
  logo_url?: string;
  categoria_negocio?: string;
  activo: boolean;
};

const PAGE_SIZE = 12;

export function NegociosList() {
  const [page, setPage] = useState(1);

  const { result, query } = useList<Negocio>({
    resource: "negocios",
    pagination: { currentPage: page, pageSize: PAGE_SIZE, mode: "server" },
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError)
    return (
      <Alert type="error" message="No se pudo cargar el directorio de negocios" />
    );

  const items = result.data ?? [];
  const total = result.total ?? 0;

  return (
    <div>
      <div className="vc-cabecera-lista" style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Directorio de negocios
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          href={FORMULARIOS.negocios}
          target="_blank"
          rel="noopener noreferrer"
        >
          Dar de alta mi negocio
        </Button>
      </div>
      <Row gutter={[16, 16]}>
        {items.map((n) => (
          <Col key={n.id} xs={24} sm={12} lg={8}>
            <Link to={`/negocios/${n.id}`} className="vc-card-link">
              <Card
                cover={
                  n.logo_url ? (
                    <Imagen
                      src={n.logo_url}
                      alt={n.nombre}
                      sizes="(max-width: 575px) 100vw, (max-width: 991px) 50vw, 33vw"
                      style={{
                        height: 180,
                        objectFit: "contain",
                        padding: 16,
                        background: colors.crema,
                        borderBottom: `1px solid ${colors.borde}`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 180,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: colors.musgoFondo,
                        borderBottom: `1px solid ${colors.borde}`,
                      }}
                    >
                      <ShopOutlined style={{ fontSize: 40, color: colors.musgoClaro }} />
                    </div>
                  )
                }
                styles={{ body: { padding: 16 } }}
              >
                {n.categoria_negocio && (
                  <Tag style={{ ...softTagStyle("terracota"), marginBottom: 8 }}>
                    {n.categoria_negocio}
                  </Tag>
                )}
                <Typography.Text
                  strong
                  style={{ display: "block", marginBottom: 4 }}
                >
                  {n.nombre}
                </Typography.Text>
                {n.telefono && (
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 12, display: "block" }}
                  >
                    <PhoneOutlined /> {n.telefono}
                  </Typography.Text>
                )}
                {n.telefono_movil && (
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 12, display: "block" }}
                  >
                    <MobileOutlined /> {n.telefono_movil}
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
