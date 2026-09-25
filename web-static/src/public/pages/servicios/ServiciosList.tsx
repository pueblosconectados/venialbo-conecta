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
import { FilterOutlined, PhoneOutlined } from "@ant-design/icons";
import { Imagen } from "../../components/Imagen";
import { colors, softTagStyle } from "../../../theme";
import { textoPlano } from "../../../markdown";
import { TIPOS_SERVICIO, tipoServicio } from "./tipos";

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

const PAGE_SIZE = 20;

const ORDEN = Object.keys(TIPOS_SERVICIO);
// Un tipo que no esté en TIPOS_SERVICIO va al final
const posicion = (tipo: string) =>
  ORDEN.includes(tipo) ? ORDEN.indexOf(tipo) : ORDEN.length;

export function ServiciosList() {
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState("");

  // Se trae la lista entera y se trocea aquí: así el filtro puede ofrecer solo los
  // tipos que tienen algún servicio, en vez de opciones que no llevan a nada.
  const { result, query } = useList<Servicio>({
    resource: "servicios",
    pagination: { mode: "off" },
  });

  // build-content los agrupa por la clave del tipo, que va por orden alfabético; aquí
  // se reordenan como el desplegable. sort es estable: dentro de cada tipo sigue el nombre.
  const todos = [...(result?.data ?? [])].sort((a, b) => posicion(a.tipo) - posicion(b.tipo));
  const filtrados = tipo ? todos.filter((s) => s.tipo === tipo) : todos;
  const items = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const total = filtrados.length;

  // En el orden de TIPOS_SERVICIO, no en el de aparición
  const presentes = new Set(todos.map((s) => s.tipo));
  const opciones = [
    { value: "", label: "Todos los tipos" },
    ...Object.entries(TIPOS_SERVICIO)
      .filter(([clave]) => presentes.has(clave))
      .map(([clave, t]) => ({ value: clave, label: `${t.icono}  ${t.nombre}` })),
  ];

  // La cabecera se pinta siempre, también mientras carga: si desapareciera al
  // cambiar de opción, el desplegable daría un salto justo al usarlo.
  const cabecera = (
    <div className="vc-cabecera-lista">
      <Typography.Title level={2} style={{ margin: 0 }}>
        Servicios e instituciones
      </Typography.Title>
      {/* Con un solo tipo (o ninguno) el filtro no filtraría nada */}
      {opciones.length > 2 && (
        <Select
          value={tipo}
          size="large"
          prefix={<FilterOutlined />}
          className="vc-filtro"
          onChange={(valor) => {
            setTipo(valor);
            setPage(1);
          }}
          options={opciones}
          aria-label="Filtrar servicios por tipo"
        />
      )}
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
        <Alert type="error" message="No se pudieron cargar los servicios" />
      </div>
    );

  return (
    <div>
      {cabecera}
      {items.length === 0 && (
        <Empty
          description={
            todos.length === 0
              ? "Todavía no hay servicios publicados"
              : "No hay servicios de este tipo"
          }
          style={{ margin: "48px 0" }}
        />
      )}
      <Row gutter={[16, 16]}>
        {items.map((s) => (
          <Col key={s.id} xs={24} sm={12} lg={8}>
            <Link to={`/servicios/${s.id}`} className="vc-card-link">
              <Card
                cover={
                  s.logo_url ? (
                    <Imagen
                      src={s.logo_url}
                      alt={s.nombre}
                      sizes="(max-width: 575px) 100vw, (max-width: 991px) 50vw, 33vw"
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
                <Tag style={{ ...softTagStyle(tipoServicio(s.tipo).tono), marginBottom: 8 }}>
                  {tipoServicio(s.tipo).nombre}
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
