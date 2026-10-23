import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Alert, Col, Input, Row, Spin, Typography } from "antd";
import {
  CalendarOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  PushpinOutlined,
  ReadOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useList } from "../../datos";
import { buscar, palabrasDeConsulta, type Entrada } from "../../buscador";
import { colors } from "../../theme";
import { TarjetaFila } from "../components/TarjetaFila";

// Cada tipo: cómo se llama el grupo, dónde está su ficha y el icono si no hay foto
const TIPOS: Record<string, { nombre: string; ruta: string; icono: ReactNode }> = {
  negocios: { nombre: "Negocios", ruta: "/negocios/", icono: <ShopOutlined /> },
  servicios: { nombre: "Servicios e instituciones", ruta: "/servicios/", icono: <TeamOutlined /> },
  anuncios: { nombre: "Tablón", ruta: "/tablon/", icono: <PushpinOutlined /> },
  noticias: { nombre: "Noticias", ruta: "/noticias/", icono: <ReadOutlined /> },
  actividades: { nombre: "Actividades", ruta: "/actividades/", icono: <CalendarOutlined /> },
  lugares: { nombre: "Lugares", ruta: "/descubre/lugares/", icono: <EnvironmentOutlined /> },
  rutas: { nombre: "Rutas", ruta: "/descubre/rutas/", icono: <CompassOutlined /> },
};

const EJEMPLOS = ["bar", "médico", "casa", "fiestas", "ruta"];

// La consulta va en la dirección (?q=), para poder compartirla y volver atrás a los
// mismos resultados. Se busca mientras se escribe: el índice es pequeño y ya está en
// el navegador.
export function Buscar() {
  const [params, setParams] = useSearchParams();
  const consulta = params.get("q") ?? "";
  const cambiar = (q: string) =>
    setParams(q ? { q } : {}, { replace: true });

  const { result, query } = useList<Entrada>({
    resource: "buscador",
    pagination: { mode: "off" },
  });

  const encontrados = buscar(result?.data ?? [], consulta);
  // Agrupados por tipo; los grupos, en el orden en que sale su primer resultado
  const grupos = new Map<string, Entrada[]>();
  for (const e of encontrados) {
    if (TIPOS[e.recurso]) grupos.set(e.recurso, [...(grupos.get(e.recurso) ?? []), e]);
  }
  const hayConsulta = palabrasDeConsulta(consulta).length > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Typography.Title level={2} style={{ marginTop: 0 }}>Buscar</Typography.Title>
      <Input
        size="large"
        allowClear
        autoFocus
        prefix={<SearchOutlined style={{ color: colors.marronSuave }} />}
        placeholder="Un negocio, un servicio, un anuncio, una noticia…"
        value={consulta}
        onChange={(ev) => cambiar(ev.target.value)}
        aria-label="Qué buscas"
        style={{ marginBottom: 24 }}
      />

      {query.isLoading ? (
        <Spin style={{ display: "block", margin: "40px auto" }} />
      ) : query.isError ? (
        <Alert type="error" message="No se pudo cargar el buscador" />
      ) : !hayConsulta ? (
        <Typography.Paragraph style={{ color: colors.marronSuave }}>
          Prueba con:{" "}
          {EJEMPLOS.map((q, i) => (
            <span key={q}>
              {i > 0 && " · "}
              <Typography.Link onClick={() => cambiar(q)}>{q}</Typography.Link>
            </span>
          ))}
        </Typography.Paragraph>
      ) : encontrados.length === 0 ? (
        <Typography.Paragraph style={{ color: colors.marronSuave }}>
          No hay nada con «{consulta.trim()}». Prueba con menos palabras o con otra parecida.
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph style={{ color: colors.marronSuave }}>
            {encontrados.length === 1 ? "1 resultado" : `${encontrados.length} resultados`}
          </Typography.Paragraph>
          {[...grupos].map(([recurso, entradas]) => (
            <section key={recurso} style={{ marginBottom: 28 }}>
              <Typography.Title level={4} style={{ margin: "0 0 12px" }}>
                {TIPOS[recurso].nombre}
              </Typography.Title>
              <Row gutter={[16, 16]}>
                {entradas.map((e) => (
                  <Col key={e.id} xs={24} md={12}>
                    <TarjetaFila
                      to={`${TIPOS[recurso].ruta}${e.id}`}
                      imagen={e.imagen}
                      alt={e.titulo}
                      sinImagen={<span style={{ fontSize: 28, color: colors.musgo }}>{TIPOS[recurso].icono}</span>}
                    >
                      <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                        {e.titulo}
                      </Typography.Text>
                      {e.resumen && (
                        <Typography.Text style={{ color: colors.marronSuave, fontSize: 13 }}>
                          {e.resumen}
                        </Typography.Text>
                      )}
                    </TarjetaFila>
                  </Col>
                ))}
              </Row>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
