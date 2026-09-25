import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useList } from "../../../datos";
import { Alert, Card, Col, Empty, Row, Select, Spin, Tag, Typography } from "antd";
import { EnvironmentOutlined, FilterOutlined } from "@ant-design/icons";
import { Imagen } from "../../components/Imagen";
import { colors, softTagStyle, type TagTone } from "../../../theme";
import { TIPOS_LUGAR, tipoLugar } from "./lugares";
import {
  MODALIDADES,
  datosRuta,
  dificultadRuta,
  modalidadRuta,
  type DatosRuta,
} from "./rutas";

type LugarList = {
  id: string;
  nombre: string;
  tipo: string;
  resumen?: string | null;
  imagen_url?: string | null;
  direccion?: string | null;
};

type RutaList = DatosRuta & {
  id: string;
  nombre: string;
  modalidad: string;
  dificultad?: string | null;
  resumen?: string | null;
  imagen_url?: string | null;
};

// La portada de Descubre Venialbo: "Qué ver" (los lugares) y debajo "Rutas".
export function Descubre() {
  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 8 }}>
        Descubre Venialbo
      </Typography.Title>
      <Typography.Paragraph style={{ color: colors.marronSuave, marginBottom: 32 }}>
        Qué ver en el pueblo y rutas para recorrerlo. Para quien viene de fuera, y para
        quien es de aquí y le apetece dar un paseo.
      </Typography.Paragraph>
      <QueVer />
      <Rutas />
    </div>
  );
}

function QueVer() {
  const [tipo, setTipo] = useState("");
  const { result, query } = useList<LugarList>({
    resource: "lugares",
    pagination: { mode: "off" },
  });
  const todos = result?.data ?? [];
  const lugares = tipo ? todos.filter((l) => l.tipo === tipo) : todos;

  return (
    <section>
      <CabeceraBloque
        titulo="Qué ver"
        valor={tipo}
        onChange={setTipo}
        todas="Todos los tipos"
        opciones={opcionesPresentes(TIPOS_LUGAR, todos.map((l) => l.tipo))}
        etiqueta="Filtrar lugares por tipo"
      />
      {query.isLoading ? (
        <Spin style={{ display: "block", margin: "60px auto" }} />
      ) : query.isError ? (
        <Alert type="error" message="No se pudieron cargar los lugares" />
      ) : todos.length === 0 ? (
        <Empty description="Todavía no hay lugares publicados" style={{ margin: "48px 0" }} />
      ) : (
        <Row gutter={[16, 16]}>
          {lugares.map((l) => {
            const t = tipoLugar(l.tipo);
            return (
              <Tarjeta
                key={l.id}
                a={`/descubre/lugares/${l.id}`}
                imagen={l.imagen_url}
                nombre={l.nombre}
                etiquetas={[{ texto: t.nombre, tono: t.tono }]}
                resumen={l.resumen}
                pie={l.direccion && (<><EnvironmentOutlined /> {l.direccion}</>)}
              />
            );
          })}
        </Row>
      )}
    </section>
  );
}

// Mientras no haya ninguna ruta, el bloque no sale: dos "todavía no hay" seguidos
// dejarían la página con cara de obra.
function Rutas() {
  const [modalidad, setModalidad] = useState("");
  const { result, query } = useList<RutaList>({
    resource: "rutas",
    pagination: { mode: "off" },
  });
  const todas = result?.data ?? [];
  if (query.isLoading || query.isError || todas.length === 0) return null;
  const rutas = modalidad ? todas.filter((r) => r.modalidad === modalidad) : todas;

  return (
    <section style={{ marginTop: 48 }}>
      <CabeceraBloque
        titulo="Rutas"
        valor={modalidad}
        onChange={setModalidad}
        todas="A pie, en bici y en coche"
        opciones={opcionesPresentes(MODALIDADES, todas.map((r) => r.modalidad))}
        etiqueta="Filtrar rutas por cómo se hacen"
      />
      <Row gutter={[16, 16]}>
        {rutas.map((r) => {
          const m = modalidadRuta(r.modalidad);
          const d = dificultadRuta(r.dificultad);
          return (
            <Tarjeta
              key={r.id}
              a={`/descubre/rutas/${r.id}`}
              imagen={r.imagen_url}
              nombre={r.nombre}
              etiquetas={[
                { texto: `${m.icono} ${m.nombre}`, tono: m.tono },
                ...(d ? [{ texto: d.nombre, tono: d.tono }] : []),
              ]}
              resumen={r.resumen}
              pie={datosRuta(r).map((x) => x.valor).join(" · ")}
            />
          );
        })}
      </Row>
    </section>
  );
}

// Las opciones del filtro: solo las que tienen algo, en el orden de la lista.
const opcionesPresentes = (
  lista: Record<string, { nombre: string; icono: string }>,
  claves: string[],
) => {
  const hay = new Set(claves);
  return Object.entries(lista)
    .filter(([clave]) => hay.has(clave))
    .map(([clave, e]) => ({ value: clave, label: e.icono ? `${e.icono}  ${e.nombre}` : e.nombre }));
};

function CabeceraBloque(props: {
  titulo: string;
  valor: string;
  onChange: (valor: string) => void;
  todas: string;
  opciones: { value: string; label: string }[];
  etiqueta: string;
}) {
  return (
    <div className="vc-cabecera-lista">
      <Typography.Title level={3} style={{ margin: 0 }}>{props.titulo}</Typography.Title>
      {/* Con una sola opción (o ninguna) el filtro no filtraría nada */}
      {props.opciones.length > 1 && (
        <Select
          value={props.valor}
          size="large"
          prefix={<FilterOutlined />}
          className="vc-filtro"
          onChange={props.onChange}
          options={[{ value: "", label: props.todas }, ...props.opciones]}
          aria-label={props.etiqueta}
        />
      )}
    </div>
  );
}

function Tarjeta(props: {
  a: string;
  imagen?: string | null;
  nombre: string;
  etiquetas: { texto: string; tono: TagTone }[];
  resumen?: string | null;
  pie?: ReactNode;
}) {
  return (
    <Col xs={24} sm={12} lg={8}>
      <Link to={props.a} className="vc-card-link">
        <Card
          cover={
            props.imagen ? (
              <Imagen
                src={props.imagen}
                alt={props.nombre}
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
            {props.etiquetas.map((e) => (
              <Tag key={e.texto} style={softTagStyle(e.tono)}>{e.texto}</Tag>
            ))}
          </div>
          <Typography.Text strong style={{ display: "block", marginBottom: 4 }}>
            {props.nombre}
          </Typography.Text>
          {props.resumen && (
            <Typography.Paragraph
              ellipsis={{ rows: 2 }}
              style={{ color: colors.marronSuave, fontSize: 14, marginBottom: 6 }}
            >
              {props.resumen}
            </Typography.Paragraph>
          )}
          {props.pie && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {props.pie}
            </Typography.Text>
          )}
        </Card>
      </Link>
    </Col>
  );
}
