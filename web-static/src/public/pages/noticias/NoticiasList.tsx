import { useState } from "react";
import { Link } from "react-router";
import { useList } from "@refinedev/core";
import {
  Alert,
  Card,
  Col,
  Empty,
  Pagination,
  Row,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import { StarFilled } from "@ant-design/icons";
import { formatFecha, imgUrl } from "../../../config";
import { colors, softTagStyle, softTagStyleFromHex } from "../../../theme";

type Categoria = {
  id: string;
  nombre: string;
  icono?: string;
};

type NoticiaList = {
  id: string;
  titulo: string;
  imagen_url?: string;
  categoria: { id: string; nombre: string; color?: string };
  fecha_publicacion: string;
  destacada: boolean;
  activa: boolean;
};

const POR_PAGINA_POR_DEFECTO = 12;
const TODAS = "todas";

const OPCIONES_NUMERICAS = [12, 24, 48];

const OPCIONES = [
  ...OPCIONES_NUMERICAS.map((n) => ({ value: n, label: `${n} por página` })),
  { value: TODAS, label: "Todas" },
];

export function NoticiasList() {
  const [page, setPage] = useState(1);
  const [porPagina, setPorPagina] = useState<number | typeof TODAS>(
    POR_PAGINA_POR_DEFECTO,
  );
  const [categoria, setCategoria] = useState<string>("");

  const { result, query } = useList<NoticiaList>({
    resource: "noticias",
    // "off" hace que el data provider devuelva la lista entera sin trocear
    pagination:
      porPagina === TODAS
        ? { mode: "off" }
        : { currentPage: page, pageSize: porPagina, mode: "server" },
    // La noticia trae la categoria entera dentro, de ahi el campo anidado
    filters: categoria
      ? [{ field: "categoria.id", operator: "eq", value: categoria }]
      : [],
  });

  const { result: categorias } = useList<Categoria>({
    resource: "categorias",
    pagination: { mode: "off" },
  });

  const items = result?.data ?? [];
  const total = result?.total ?? 0;

  // La cabecera se pinta siempre, tambien mientras carga: si desapareciera al
  // cambiar de opcion, el desplegable daria un salto justo al usarlo.
  const cabecera = (
    <div className="vc-cabecera-lista">
      <Typography.Title level={2} style={{ margin: 0 }}>Noticias</Typography.Title>
      <Select
        value={categoria}
        onChange={(valor) => {
          setCategoria(valor);
          setPage(1);
        }}
        options={[
          { value: "", label: "Todas las categorías" },
          ...(categorias?.data ?? []).map((c) => ({
            value: c.id,
            label: c.icono ? `${c.icono}  ${c.nombre}` : c.nombre,
          })),
        ]}
        // El ancho lo pone .vc-cabecera-lista: 280 px, o la fila entera en movil
        aria-label="Filtrar noticias por categoría"
      />
    </div>
  );

  if (query.isLoading)
    return (
      <div>
        {cabecera}
        <Spin style={{ display: "block", margin: "60px auto" }} />
      </div>
    );
  if (query.isError)
    return (
      <div>
        {cabecera}
        <Alert type="error" message="No se pudieron cargar las noticias" />
      </div>
    );

  return (
    <div>
      {cabecera}
      {items.length === 0 ? (
        <Empty
          description="No hay noticias en esta categoría"
          style={{ margin: "48px 0" }}
        />
      ) : null}
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
      {/*
        Los dos controles del pie van juntos porque los dos deciden cuanto se ve.
        El desplegable se pinta aunque la paginacion no haga falta: con "Todas"
        elegido no hay paginacion, y si desapareciera con ella no habria forma de
        volver a 12.
      */}
      {total > OPCIONES_NUMERICAS[0] && (
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          {porPagina !== TODAS && total > porPagina && (
            <Pagination
              current={page}
              pageSize={porPagina}
              total={total}
              onChange={setPage}
              showSizeChanger={false}
            />
          )}
          <Select
            value={porPagina}
            onChange={(valor) => {
              setPorPagina(valor);
              // Si estabas en la pagina 4 y pasas a 48 por pagina, esa pagina ya
              // no existe: se vuelve al principio.
              setPage(1);
            }}
            options={OPCIONES}
            style={{ width: 150 }}
            aria-label="Noticias por página"
          />
        </div>
      )}
    </div>
  );
}
