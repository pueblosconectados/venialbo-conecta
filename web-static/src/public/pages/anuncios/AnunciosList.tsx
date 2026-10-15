import { useState } from "react";
import { Link } from "react-router";
import { esNuevo, useList } from "../../../datos";
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
import { InfoCircleOutlined, PaperClipOutlined, PlusOutlined } from "@ant-design/icons";
import { FORMULARIOS, formatFecha } from "../../../config";
import { colors, softTagStyle } from "../../../theme";
import { Imagen } from "../../components/Imagen";
import { TarjetaFila } from "../../components/TarjetaFila";
import { textoPlano } from "../../../markdown";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";
import { INFORMACION, TIPO_LABEL, TIPO_TONE } from "./tipos";

type Anuncio = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion?: string;
  imagen_url?: string;
  fecha_publicacion: string;
  activo: boolean;
  /** Cuántos PDF lleva; lo añade build-content.mjs. */
  adjuntos?: number;
};

const PAGE_SIZE = 12;

const tituloApartado = { margin: "0 0 4px" } as const;

// El clip junto a la fecha: que se vea sin entrar que dentro hay un PDF.
const Adjuntos = ({ n }: { n?: number }) =>
  n ? (
    <span style={{ marginLeft: 10, whiteSpace: "nowrap" }}>
      <PaperClipOutlined /> {n === 1 ? "1 documento" : `${n} documentos`}
    </span>
  ) : null;

// Dos apartados: arriba Información (horarios y avisos que la gente tiene que poder
// consultar, puestos por nosotros) y debajo los anuncios de los vecinos. Se cargan
// todos de una vez y se reparten aquí; solo los de vecinos se paginan, que son los
// que se acumulan. Información no sale si no hay nada; Vecinos sí, por el botón de
// publicar.
export function AnunciosList() {
  const [page, setPage] = useState(1);

  const { result, query } = useList<Anuncio>({
    resource: "anuncios",
    pagination: { mode: "off" },
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError)
    return <Alert type="error" message="No se pudo cargar el tablón" />;

  const todos = result?.data ?? [];
  const informacion = todos.filter((a) => a.tipo === INFORMACION);
  const vecinos = todos.filter((a) => a.tipo !== INFORMACION);
  const total = vecinos.length;
  const items = vecinos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Tablón</Typography.Title>
        <Typography.Text style={{ color: colors.marronSuave }}>
          La información útil del pueblo y los anuncios entre vecinos.
        </Typography.Text>
      </div>

      {informacion.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <Typography.Title level={3} style={tituloApartado}>Información</Typography.Title>
          <Typography.Paragraph style={{ color: colors.marronSuave }}>
            Horarios y avisos que conviene tener a mano.
          </Typography.Paragraph>
          <Row gutter={[16, 16]}>
            {informacion.map((a) => (
              <Col key={a.id} xs={24} md={12}>
                <TarjetaFila
                  to={`/tablon/${a.id}`}
                  imagen={a.imagen_url}
                  alt={a.titulo}
                  sinImagen={
                    <InfoCircleOutlined style={{ fontSize: 28, color: colors.dorado }} />
                  }
                >
                  {esNuevo(a) && (
                    <div style={{ marginBottom: 6 }}>
                      <EtiquetaNuevo />
                    </div>
                  )}
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    {a.titulo}
                  </Typography.Text>
                  {a.descripcion && (
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ fontSize: 13, marginBottom: 4 }}
                    >
                      {textoPlano(a.descripcion)}
                    </Typography.Paragraph>
                  )}
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {formatFecha(a.fecha_publicacion)}
                    <Adjuntos n={a.adjuntos} />
                  </Typography.Text>
                </TarjetaFila>
              </Col>
            ))}
          </Row>
        </section>
      )}

      <section>
        <div className="vc-cabecera-lista" style={{ marginBottom: 16 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>Anuncios de vecinos</Typography.Title>
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
        {total === 0 && (
          <Typography.Paragraph style={{ color: colors.marronSuave }}>
            Ahora mismo no hay anuncios. Si tienes algo que contar al pueblo, publícalo.
          </Typography.Paragraph>
        )}
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
                  {esNuevo(a) && <EtiquetaNuevo posicion="esquina" />}
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
                    <Adjuntos n={a.adjuntos} />
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
      </section>
    </div>
  );
}
