import { useState } from "react";
import { Link } from "react-router";
import { useList } from "../../../datos";
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
import { CameraOutlined, FilterOutlined, StarFilled } from "@ant-design/icons";
import { Imagen } from "../../components/Imagen";
import { colors, softTagStyle } from "../../../theme";
import {
  CATEGORIAS_ACTIVIDAD,
  categoriaActividad,
  formatFechasActividad,
} from "./categorias";

type ActividadList = {
  id: string;
  titulo: string;
  fecha: string;
  fecha_fin?: string | null;
  categoria: string;
  resumen?: string | null;
  imagen_url?: string | null;
  organiza?: { id: string; nombre: string } | null;
  destacada?: boolean;
  /** Cuántas fotos tiene la galería; lo cuenta build-content.mjs. */
  fotos: number;
};

const POR_PAGINA = 12;

export function ActividadesList() {
  const [page, setPage] = useState(1);
  const [categoria, setCategoria] = useState("");

  // Se trae la lista entera y se trocea aquí: así el filtro puede ofrecer solo las
  // categorías que tienen alguna actividad, en vez de nueve opciones medio vacías.
  const { result, query } = useList<ActividadList>({
    resource: "actividades",
    pagination: { mode: "off" },
  });

  const todas = result?.data ?? [];
  const filtradas = categoria ? todas.filter((a) => a.categoria === categoria) : todas;
  const items = filtradas.slice((page - 1) * POR_PAGINA, page * POR_PAGINA);

  // En el orden de la lista de categorías, no en el de aparición
  const presentes = new Set(todas.map((a) => a.categoria));
  const opciones = [
    { value: "", label: "Todas las categorías" },
    ...Object.entries(CATEGORIAS_ACTIVIDAD)
      .filter(([clave]) => presentes.has(clave))
      .map(([clave, c]) => ({ value: clave, label: `${c.icono}  ${c.nombre}` })),
  ];

  const cabecera = (
    <div className="vc-cabecera-lista">
      <Typography.Title level={2} style={{ margin: 0 }}>Actividades</Typography.Title>
      {/* Con una sola categoría (o ninguna) el filtro no filtraría nada */}
      {opciones.length > 2 && (
        <Select
          value={categoria}
          size="large"
          prefix={<FilterOutlined />}
          className="vc-filtro"
          onChange={(valor) => {
            setCategoria(valor);
            setPage(1);
          }}
          options={opciones}
          aria-label="Filtrar actividades por categoría"
        />
      )}
    </div>
  );

  const intro = (
    <Typography.Paragraph style={{ color: colors.marronSuave, marginTop: -12, marginBottom: 24 }}>
      Lo que se ha hecho en el pueblo: cursos, talleres, excursiones, fiestas… contado
      y con fotos.
    </Typography.Paragraph>
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
        <Alert type="error" message="No se pudieron cargar las actividades" />
      </div>
    );

  return (
    <div>
      {cabecera}
      {intro}
      {items.length === 0 && (
        <Empty
          description={
            todas.length === 0
              ? "Todavía no hay actividades publicadas"
              : "No hay actividades en esta categoría"
          }
          style={{ margin: "48px 0" }}
        />
      )}
      <Row gutter={[16, 16]}>
        {items.map((a) => {
          const cat = categoriaActividad(a.categoria);
          return (
            <Col key={a.id} xs={24} sm={12} lg={8}>
              <Link to={`/actividades/${a.id}`} className="vc-card-link">
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
                  styles={{ body: { padding: 16 } }}
                >
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <Tag style={softTagStyle(cat.tono)}>{cat.nombre}</Tag>
                    {a.destacada && (
                      <Tag icon={<StarFilled />} style={softTagStyle("dorado")}>
                        Destacada
                      </Tag>
                    )}
                  </div>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    {a.titulo}
                  </Typography.Text>
                  {a.resumen && (
                    <Typography.Paragraph
                      ellipsis={{ rows: 2 }}
                      style={{ color: colors.marronSuave, fontSize: 14, marginBottom: 6 }}
                    >
                      {a.resumen}
                    </Typography.Paragraph>
                  )}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatFechasActividad(a.fecha, a.fecha_fin)}
                    {a.fotos > 0 && (
                      <span style={{ whiteSpace: "nowrap" }}>
                        {" · "}
                        <CameraOutlined /> {a.fotos} {a.fotos === 1 ? "foto" : "fotos"}
                      </span>
                    )}
                  </Typography.Text>
                </Card>
              </Link>
            </Col>
          );
        })}
      </Row>
      {filtradas.length > POR_PAGINA && (
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          <Pagination
            current={page}
            pageSize={POR_PAGINA}
            total={filtradas.length}
            onChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
}
