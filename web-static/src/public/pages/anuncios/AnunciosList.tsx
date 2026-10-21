import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { esNuevo, useList } from "../../../datos";
import {
  Alert,
  Button,
  Card,
  Col,
  Pagination,
  Row,
  Segmented,
  Spin,
  Tag,
  Typography,
} from "antd";
import { HomeOutlined, InfoCircleOutlined, PaperClipOutlined, PlusOutlined } from "@ant-design/icons";
import { FORMULARIOS, formatFecha } from "../../../config";
import { colors, softTagStyle } from "../../../theme";
import { Imagen } from "../../components/Imagen";
import { TarjetaFila } from "../../components/TarjetaFila";
import { textoPlano } from "../../../markdown";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";
import {
  CASAS,
  INFORMACION,
  TIPO_LABEL,
  TIPO_TONE,
  cifrasCasa,
  selloVendida,
  type Apartado,
  type DatosCasa,
} from "./tipos";

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
  casa?: DatosCasa | null;
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

// La tarjeta de una casa: como la de un anuncio, pero con el precio y los metros a la
// vista, que es lo primero que se mira, y el sello si ya está vendida o alquilada.
function TarjetaCasa({ a }: { a: Anuncio }) {
  const cifras = cifrasCasa(a.tipo, a.casa);
  const vendida = Boolean(a.casa?.vendida);
  return (
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
                filter: vendida ? "grayscale(0.6)" : undefined,
              }}
            />
          ) : undefined
        }
        styles={{ body: { padding: 12 } }}
      >
        {esNuevo(a) && !vendida && <EtiquetaNuevo posicion="esquina" />}
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <Tag style={softTagStyle(TIPO_TONE[a.tipo] ?? "gris")}>{TIPO_LABEL[a.tipo] ?? a.tipo}</Tag>
          {vendida && <Tag style={softTagStyle("rojo")}>{selloVendida(a.tipo)}</Tag>}
        </div>
        <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
          {a.titulo}
        </Typography.Text>
        {cifras.length > 0 && (
          <Typography.Text style={{ display: "block", marginBottom: 4, color: colors.marronSuave }}>
            {cifras.join(" · ")}
          </Typography.Text>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {formatFecha(a.fecha_publicacion)}
        </Typography.Text>
      </Card>
    </Link>
  );
}

// El número de cada pestaña, en pequeño junto al nombre
const Pestana = ({ nombre, n }: { nombre: string; n: number }) => (
  <span>
    {nombre} <span style={{ opacity: 0.7, fontSize: 12 }}>{n}</span>
  </span>
);

// Tres apartados: Información (horarios y avisos que la gente tiene que poder
// consultar, puestos por nosotros), las casas en venta y alquiler, que no caducan
// hasta que se venden, y los anuncios de los vecinos. Se cargan todos de una vez y se
// reparten aquí; solo los de vecinos se paginan, que son los que se acumulan.
// Van en pestañas, una a la vista: en el móvil, con los tres seguidos, las casas
// quedaban a mucho scroll. La pestaña va en la dirección para poder pasar el enlace.
// Información no sale si no hay nada; Casas y Vecinos sí, por su botón de publicar
// (cada uno lleva a su formulario).
export function AnunciosList() {
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();

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
  // Las vendidas, al final: siguen unos días con el sello, pero ya no son lo que se busca
  const casas = todos
    .filter((a) => CASAS.has(a.tipo))
    .sort((x, y) => Number(Boolean(x.casa?.vendida)) - Number(Boolean(y.casa?.vendida)));
  const vecinos = todos.filter((a) => a.tipo !== INFORMACION && !CASAS.has(a.tipo));
  const total = vecinos.length;
  const items = vecinos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hayInformacion = informacion.length > 0;
  const pedido = params.get("ver");
  // Sin «?ver=», o con uno que no vale, la primera pestaña que haya
  const ver: Apartado =
    pedido === "casas" || pedido === "vecinos" || (pedido === "informacion" && hayInformacion)
      ? pedido
      : hayInformacion
        ? "informacion"
        : "casas";
  const cambiar = (v: Apartado) =>
    setParams(
      (p) => {
        p.set("ver", v);
        return p;
      },
      { replace: true },
    );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Tablón</Typography.Title>
        <Typography.Text style={{ color: colors.marronSuave }}>
          La información útil del pueblo y los anuncios entre vecinos.
        </Typography.Text>
      </div>

      <Segmented<Apartado>
        className="vc-vista"
        block
        value={ver}
        onChange={cambiar}
        style={{ marginBottom: 24 }}
        options={[
          ...(hayInformacion
            ? [{ value: "informacion" as const, label: <Pestana nombre="Información" n={informacion.length} /> }]
            : []),
          { value: "casas", label: <Pestana nombre="Casas" n={casas.length} /> },
          { value: "vecinos", label: <Pestana nombre="Vecinos" n={vecinos.length} /> },
        ]}
        aria-label="Apartado del tablón"
      />

      {ver === "informacion" && (
        <section>
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

      {ver === "casas" && (
        <section>
          <div className="vc-cabecera-lista" style={{ marginBottom: 4 }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              <HomeOutlined style={{ color: colors.terracota, marginRight: 8 }} />
              Casas en venta y alquiler
            </Typography.Title>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              href={FORMULARIOS.casas}
              target="_blank"
              rel="noopener noreferrer"
            >
              Publicar una casa
            </Button>
          </div>
          <Typography.Paragraph style={{ color: colors.marronSuave }}>
            Siguen aquí hasta que se venden o se alquilan.
          </Typography.Paragraph>
          {casas.length === 0 && (
            <Typography.Paragraph style={{ color: colors.marronSuave }}>
              Ahora mismo no hay ninguna. Si vendes o alquilas una casa en el pueblo, publícala.
            </Typography.Paragraph>
          )}
          <Row gutter={[16, 16]}>
            {casas.map((a) => (
              <Col key={a.id} xs={24} sm={12} lg={8}>
                <TarjetaCasa a={a} />
              </Col>
            ))}
          </Row>
        </section>
      )}

      {ver === "vecinos" && (
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
      )}
    </div>
  );
}
