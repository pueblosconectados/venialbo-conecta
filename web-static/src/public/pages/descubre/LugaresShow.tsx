import { useParams, Link } from "react-router";
import { useOne } from "../../../datos";
import { Alert, Divider, Spin, Tag, Typography } from "antd";
import { EnvironmentOutlined } from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { CabeceraFicha } from "../../components/CabeceraFicha";
import { ContenidoRico } from "../../components/ContenidoRico";
import { Galeria, type Foto } from "../../components/Galeria";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { Mapa } from "../../components/Mapa";
import { juegoDeMiniaturas } from "../../../miniaturas";
import { colors, softTagStyle } from "../../../theme";
import { tipoLugar, visitableLugar } from "./lugares";

type LugarDetail = {
  id: string;
  nombre: string;
  tipo: string;
  resumen?: string | null;
  imagen_url?: string | null;
  contenido?: string | null;
  galeria?: Foto[];
  direccion?: string | null;
  // build-content.mjs las saca del campo "coordenadas" del CMS
  latitud?: number | null;
  longitud?: number | null;
  visitable?: string | null;
  como_visitar?: string | null;
  accesible?: boolean;
  // Las rutas que lo incluyen en "Por dónde pasa"; las pone build-content.mjs
  rutas?: { id: string; nombre: string }[];
};

const tituloSeccion = (texto: string) => (
  <Typography.Title level={4} style={{ margin: "28px 0 12px" }}>
    {texto}
  </Typography.Title>
);

// Como en actividades, cada bloque se pinta solo si tiene algo dentro.
export function LugaresShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<LugarDetail>({ resource: "lugares", id });

  if (query.isLoading) return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result) return <Alert type="error" message="Lugar no encontrado" />;

  const l = result;
  const t = tipoLugar(l.tipo);
  const visita = visitableLugar(l.visitable);
  const hayMapa = typeof l.latitud === "number" && typeof l.longitud === "number";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <CabeceraFicha titulo={l.nombre} migas={[{ title: <Link to="/descubre">Descubre Venialbo</Link> }, { title: l.nombre }]} />
      {l.imagen_url && (
        <ImagenAmpliable
          src={imgUrl(l.imagen_url)}
          srcSet={juegoDeMiniaturas(l.imagen_url)}
          sizes="(max-width: 832px) 100vw, 800px"
          alt={l.nombre}
          wrapperStyle={{ display: "block", width: "100%", marginBottom: 24 }}
          style={{
            width: "100%",
            maxHeight: 400,
            objectFit: "cover",
            borderRadius: 14,
            border: `1px solid ${colors.borde}`,
          }}
        />
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Tag style={softTagStyle(t.tono)}>{t.nombre}</Tag>
        {l.accesible && <Tag style={softTagStyle("azul")}>♿ Accesible</Tag>}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{l.nombre}</Typography.Title>
      {l.direccion && (
        <Typography.Text style={{ color: colors.marronSuave, display: "block" }}>
          <EnvironmentOutlined /> {l.direccion}
        </Typography.Text>
      )}
      <Divider style={{ borderColor: colors.borde }} />

      {l.contenido ? (
        <ContenidoRico texto={l.contenido} />
      ) : (
        l.resumen && <Typography.Paragraph style={{ fontSize: 16 }}>{l.resumen}</Typography.Paragraph>
      )}

      {(visita || l.como_visitar) && (
        <>
          {tituloSeccion("Cómo visitarlo")}
          <div
            style={{
              padding: "14px 16px",
              background: colors.blanco,
              border: `1px solid ${colors.borde}`,
              borderRadius: 12,
            }}
          >
            {visita && (
              <Tag style={{ ...softTagStyle(visita.tono), fontSize: 13 }}>
                {visita.icono} {visita.nombre}
              </Tag>
            )}
            {l.como_visitar && (
              // Es un campo de texto sin formato: se respetan los saltos de línea
              <Typography.Paragraph
                style={{ whiteSpace: "pre-line", margin: visita ? "10px 0 0" : 0 }}
              >
                {l.como_visitar}
              </Typography.Paragraph>
            )}
          </div>
        </>
      )}

      {hayMapa && (
        <>
          {tituloSeccion("Dónde está")}
          <Mapa latitud={l.latitud!} longitud={l.longitud!} nombre={l.nombre} />
        </>
      )}

      {l.rutas && l.rutas.length > 0 && (
        <>
          {tituloSeccion("Rutas que pasan por aquí")}
          <ul className="vc-paradas vc-paradas-sueltas">
            {l.rutas.map((r) => (
              <li key={r.id}>
                <Link to={`/descubre/rutas/${r.id}`}>{r.nombre}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {l.galeria && l.galeria.length > 0 && (
        <>
          {tituloSeccion("Fotos")}
          <Galeria fotos={l.galeria} titulo={l.nombre} />
        </>
      )}

      <div style={{ marginTop: 28 }}>
        <Link to="/descubre" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a Descubre Venialbo
        </Link>
      </div>
    </div>
  );
}
