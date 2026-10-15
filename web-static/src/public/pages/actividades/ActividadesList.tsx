import { lazy, Suspense, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { esNuevo, useList } from "../../../datos";
import {
  Alert,
  Card,
  Col,
  Empty,
  Pagination,
  Row,
  Segmented,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  CameraOutlined,
  FilterOutlined,
  StarFilled,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Imagen } from "../../components/Imagen";
import { colors, softTagStyle } from "../../../theme";
import {
  CATEGORIAS_ACTIVIDAD,
  categoriaActividad,
  formatFechasActividad,
  yaCelebrada,
} from "./categorias";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";

// El calendario se carga solo cuando alguien lo abre: la lista sigue siendo lo primero
const CalendarioActividades = lazy(() =>
  import("./CalendarioActividades").then((m) => ({ default: m.CalendarioActividades })),
);

type Vista = "lista" | "calendario";
// La vista va en la URL (?vista=calendario) para poder compartir el enlace, y se
// recuerda en el navegador para la próxima visita. Si el almacenamiento falla
// (navegación privada), se queda en la lista.
const CLAVE_VISTA = "vc-actividades-vista";
const vistaGuardada = (): Vista => {
  try {
    return localStorage.getItem(CLAVE_VISTA) === "calendario" ? "calendario" : "lista";
  } catch {
    return "lista";
  }
};

type ActividadList = {
  id: string;
  novedad_hasta?: string | null;
  titulo: string;
  fecha: string;
  fecha_fin?: string | null;
  hora?: string | null;
  hora_fin?: string | null;
  categoria: string;
  resumen?: string | null;
  imagen_url?: string | null;
  organiza?: { id: string; nombre: string } | null;
  destacada?: boolean;
  /** Cuántas fotos tiene la galería; lo cuenta build-content.mjs. */
  fotos: number;
};

const POR_PAGINA = 12;

const tituloSeccion = (texto: string) => (
  <Typography.Title level={3} style={{ margin: "0 0 16px" }}>
    {texto}
  </Typography.Title>
);

export function ActividadesList() {
  const [page, setPage] = useState(1);
  const [categoria, setCategoria] = useState("");
  const [params, setParams] = useSearchParams();
  const enUrl = params.get("vista");
  const vista: Vista =
    enUrl === "calendario" || enUrl === "lista" ? enUrl : vistaGuardada();
  const cambiarVista = (v: Vista) => {
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      // Sin almacenamiento, la vista vale solo para esta visita
    }
    setParams(
      (p) => {
        p.set("vista", v);
        return p;
      },
      { replace: true },
    );
  };

  // Se trae la lista entera y se trocea aquí: así el filtro puede ofrecer solo las
  // categorías que tienen alguna actividad, en vez de nueve opciones medio vacías.
  const { result, query } = useList<ActividadList>({
    resource: "actividades",
    pagination: { mode: "off" },
  });

  const todas = result?.data ?? [];
  const filtradas = categoria ? todas.filter((a) => a.categoria === categoria) : todas;
  // El build las ordena de la más reciente a la más antigua: así quedan las celebradas,
  // y las próximas se dan la vuelta para que salga primero la que antes llega.
  const proximas = filtradas.filter((a) => !yaCelebrada(a)).reverse();
  const celebradas = filtradas.filter(yaCelebrada);
  const items = celebradas.slice((page - 1) * POR_PAGINA, page * POR_PAGINA);

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
      <div className="vc-controles-lista">
        <Segmented<Vista>
          className="vc-vista"
          value={vista}
          size="large"
          onChange={cambiarVista}
          options={[
            { value: "lista", label: "Lista", icon: <UnorderedListOutlined /> },
            { value: "calendario", label: "Calendario", icon: <CalendarOutlined /> },
          ]}
          aria-label="Ver como lista o como calendario"
        />
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
    </div>
  );

  const intro = (
    <Typography.Paragraph style={{ color: colors.marronSuave, marginTop: -12, marginBottom: 24 }}>
      Cursos, talleres, excursiones y fiestas que se preparan en el pueblo.{" "}
      {vista === "calendario"
        ? "Elige un día para ver lo que hay; desde ahí se llega a cada actividad."
        : "Las que ya se han celebrado quedan más abajo, con sus fotos."}
    </Typography.Paragraph>
  );

  const tarjeta = (a: ActividadList) => {
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
              {esNuevo(a) && <EtiquetaNuevo posicion="esquina" />}
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
                {formatFechasActividad(a.fecha, a.fecha_fin, a.hora, a.hora_fin)}
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
  };

  const fila = (lista: ActividadList[]) => (
    <Row gutter={[16, 16]}>{lista.map(tarjeta)}</Row>
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

  if (vista === "calendario")
    return (
      <div>
        {cabecera}
        {intro}
        <Suspense fallback={<Spin style={{ display: "block", margin: "60px auto" }} />}>
          <CalendarioActividades actividades={filtradas} />
        </Suspense>
      </div>
    );

  return (
    <div>
      {cabecera}
      {intro}
      {filtradas.length === 0 && (
        <Empty
          description={
            todas.length === 0
              ? "Todavía no hay actividades publicadas"
              : "No hay actividades en esta categoría"
          }
          style={{ margin: "48px 0" }}
        />
      )}
      {filtradas.length > 0 && (
        <>
          {tituloSeccion("Próximas")}
          {proximas.length > 0 ? (
            fila(proximas)
          ) : (
            <Typography.Paragraph style={{ color: colors.marronSuave }}>
              Ahora mismo no hay ninguna anunciada.
            </Typography.Paragraph>
          )}
        </>
      )}
      {celebradas.length > 0 && (
        <div style={{ marginTop: 36 }}>
          {tituloSeccion("Ya celebradas")}
          {fila(items)}
        </div>
      )}
      {celebradas.length > POR_PAGINA && (
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          <Pagination
            current={page}
            pageSize={POR_PAGINA}
            total={celebradas.length}
            onChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
}
