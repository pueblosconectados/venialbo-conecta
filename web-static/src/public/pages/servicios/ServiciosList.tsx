import { useState } from "react";
import { esNuevo, useList } from "../../../datos";
import {
  Alert,
  Col,
  Empty,
  Pagination,
  Row,
  Select,
  Spin,
  Typography,
} from "antd";
import { FilterOutlined, PhoneOutlined } from "@ant-design/icons";
import { TarjetaFila } from "../../components/TarjetaFila";
import { textoPlano } from "../../../markdown";
import { TIPOS_SERVICIO, tipoServicio } from "./tipos";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";

type Servicio = {
  id: string;
  novedad_hasta?: string | null;
  nombre: string;
  tipo: string;
  descripcion?: string;
  logo_url?: string;
  direccion?: string;
  telefono?: string;
  activo: boolean;
};

const PAGE_SIZE = 20;

// Los servicios de la página, troceados por tipo (ya vienen ordenados por tipo). Sin
// apartados, un único grupo sin título.
const gruposDe = (servicios: Servicio[], conApartados: boolean) => {
  if (!conApartados) return [{ titulo: null, servicios }];
  const grupos: { titulo: string | null; servicios: Servicio[] }[] = [];
  for (const s of servicios) {
    const titulo = tipoServicio(s.tipo).nombre;
    const ultimo = grupos.at(-1);
    if (ultimo?.titulo === titulo) ultimo.servicios.push(s);
    else grupos.push({ titulo, servicios: [s] });
  }
  return grupos;
};

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

  const conApartados = !tipo && presentes.size > 1;

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
      {/* Con «Todos los tipos», un apartado por tipo, como los grupos de Enlaces. Al
          filtrar por uno, el desplegable ya dice cuál es y sobra el título. */}
      {gruposDe(items, conApartados).map(({ titulo, servicios }) => (
        <section key={titulo ?? "todos"} style={{ marginBottom: 24 }}>
          {titulo && (
            <Typography.Title level={4} style={{ marginBottom: 12 }}>
              {titulo}
            </Typography.Title>
          )}
          <Row gutter={[16, 16]}>
            {servicios.map((s) => (
              <Col key={s.id} xs={24} md={12}>
                <TarjetaFila
                  to={`/servicios/${s.id}`}
                  imagen={s.logo_url}
                  alt={s.nombre}
                  sinImagen={
                    <span style={{ fontSize: 32 }}>{tipoServicio(s.tipo).icono || "📌"}</span>
                  }
                >
                  {/* Sin etiqueta del tipo: ya lo dice el título del apartado o, al
                      filtrar, el desplegable */}
                  {esNuevo(s) && (
                    <div style={{ marginBottom: 6 }}>
                      <EtiquetaNuevo />
                    </div>
                  )}
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    {s.nombre}
                  </Typography.Text>
                  {s.descripcion && (
                    <div className="vc-dos-lineas" style={{ marginBottom: 4 }}>
                      {textoPlano(s.descripcion)}
                    </div>
                  )}
                  {s.telefono && (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      <PhoneOutlined /> {s.telefono}
                    </Typography.Text>
                  )}
                </TarjetaFila>
              </Col>
            ))}
          </Row>
        </section>
      ))}
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
