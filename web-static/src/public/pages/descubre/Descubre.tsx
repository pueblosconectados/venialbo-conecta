import { useState } from "react";
import { Link } from "react-router";
import { useList } from "../../../datos";
import { Alert, Card, Col, Empty, Row, Select, Spin, Tag, Typography } from "antd";
import { EnvironmentOutlined, FilterOutlined } from "@ant-design/icons";
import { Imagen } from "../../components/Imagen";
import { colors, softTagStyle } from "../../../theme";
import { TIPOS_LUGAR, tipoLugar } from "./lugares";

type LugarList = {
  id: string;
  nombre: string;
  tipo: string;
  resumen?: string | null;
  imagen_url?: string | null;
  direccion?: string | null;
};

// La portada de Descubre Venialbo. Por ahora solo tiene "Qué ver" (los lugares); en la
// fase 3 del punto 13 se le añade debajo el bloque de Rutas.
export function Descubre() {
  const [tipo, setTipo] = useState("");

  const { result, query } = useList<LugarList>({
    resource: "lugares",
    pagination: { mode: "off" },
  });

  const todos = result?.data ?? [];
  const lugares = tipo ? todos.filter((l) => l.tipo === tipo) : todos;

  // Solo los tipos que tienen algún lugar, en el orden de la lista
  const presentes = new Set(todos.map((l) => l.tipo));
  const opciones = [
    { value: "", label: "Todos los tipos" },
    ...Object.entries(TIPOS_LUGAR)
      .filter(([clave]) => presentes.has(clave))
      .map(([clave, t]) => ({ value: clave, label: `${t.icono}  ${t.nombre}` })),
  ];

  let queVer;
  if (query.isLoading) queVer = <Spin style={{ display: "block", margin: "60px auto" }} />;
  else if (query.isError) queVer = <Alert type="error" message="No se pudieron cargar los lugares" />;
  else if (todos.length === 0)
    queVer = <Empty description="Todavía no hay lugares publicados" style={{ margin: "48px 0" }} />;
  else
    queVer = (
      <Row gutter={[16, 16]}>
        {lugares.map((l) => {
          const t = tipoLugar(l.tipo);
          return (
            <Col key={l.id} xs={24} sm={12} lg={8}>
              <Link to={`/descubre/lugares/${l.id}`} className="vc-card-link">
                <Card
                  cover={
                    l.imagen_url ? (
                      <Imagen
                        src={l.imagen_url}
                        alt={l.nombre}
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
                  <Tag style={{ ...softTagStyle(t.tono), marginBottom: 6 }}>{t.nombre}</Tag>
                  <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
                    {l.nombre}
                  </Typography.Text>
                  {l.resumen && (
                    <Typography.Paragraph
                      ellipsis={{ rows: 2 }}
                      style={{ color: colors.marronSuave, fontSize: 14, marginBottom: 6 }}
                    >
                      {l.resumen}
                    </Typography.Paragraph>
                  )}
                  {l.direccion && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      <EnvironmentOutlined /> {l.direccion}
                    </Typography.Text>
                  )}
                </Card>
              </Link>
            </Col>
          );
        })}
      </Row>
    );

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 8 }}>
        Descubre Venialbo
      </Typography.Title>
      <Typography.Paragraph style={{ color: colors.marronSuave, marginBottom: 32 }}>
        Qué ver en el pueblo, dónde está y cómo visitarlo. Para quien viene de fuera, y
        para quien es de aquí y le apetece dar un paseo.
      </Typography.Paragraph>

      <div className="vc-cabecera-lista">
        <Typography.Title level={3} style={{ margin: 0 }}>Qué ver</Typography.Title>
        {/* Con un solo tipo (o ninguno) el filtro no filtraría nada */}
        {opciones.length > 2 && (
          <Select
            value={tipo}
            size="large"
            prefix={<FilterOutlined />}
            className={tipo ? "vc-filtro vc-filtro-activo" : "vc-filtro"}
            onChange={setTipo}
            options={opciones}
            aria-label="Filtrar lugares por tipo"
          />
        )}
      </div>
      {queVer}
    </div>
  );
}
