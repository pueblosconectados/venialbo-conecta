import { useState } from "react";
import { esNuevo, useList } from "../../../datos";
import {
  Alert,
  Button,
  Col,
  Pagination,
  Row,
  Spin,
  Tag,
  Typography,
} from "antd";
import { MobileOutlined, PhoneOutlined, PlusOutlined, ShopOutlined } from "@ant-design/icons";
import { FORMULARIOS } from "../../../config";
import { TarjetaFila } from "../../components/TarjetaFila";
import { colors, softTagStyle } from "../../../theme";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";

type Negocio = {
  id: string;
  novedad_hasta?: string | null;
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

  const items = result?.data ?? [];
  const total = result?.total ?? 0;

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
          <Col key={n.id} xs={24} md={12}>
            <TarjetaFila
              to={`/negocios/${n.id}`}
              imagen={n.logo_url}
              alt={n.nombre}
              sinImagen={<ShopOutlined style={{ fontSize: 32, color: colors.musgoClaro }} />}
            >
              {(esNuevo(n) || n.categoria_negocio) && (
                <div style={{ marginBottom: 6 }}>
                  {esNuevo(n) && <EtiquetaNuevo />}{esNuevo(n) && " "}
                  {n.categoria_negocio && (
                    <Tag style={softTagStyle("terracota")}>{n.categoria_negocio}</Tag>
                  )}
                </div>
              )}
              <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                {n.nombre}
              </Typography.Text>
              {n.telefono && (
                <Typography.Text type="secondary" style={{ fontSize: 13, display: "block" }}>
                  <PhoneOutlined /> {n.telefono}
                </Typography.Text>
              )}
              {n.telefono_movil && (
                <Typography.Text type="secondary" style={{ fontSize: 13, display: "block" }}>
                  <MobileOutlined /> {n.telefono_movil}
                </Typography.Text>
              )}
            </TarjetaFila>
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
