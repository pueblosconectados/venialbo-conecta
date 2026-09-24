import { useParams, Link } from "react-router";
import { useOne } from "../../../datos";
import { Alert, Button, Divider, Spin, Tag, Typography } from "antd";
import { DownloadOutlined, EnvironmentOutlined, ExportOutlined } from "@ant-design/icons";
import { imgUrl } from "../../../config";
import { CabeceraFicha } from "../../components/CabeceraFicha";
import { ContenidoRico } from "../../components/ContenidoRico";
import { Galeria, type Foto } from "../../components/Galeria";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { Mapa } from "../../components/Mapa";
import { juegoDeMiniaturas } from "../../../miniaturas";
import { colors, softTagStyle } from "../../../theme";
import { datosRuta, dificultadRuta, modalidadRuta, type DatosRuta } from "./rutas";

type RutaDetail = DatosRuta & {
  id: string;
  nombre: string;
  modalidad: string;
  dificultad?: string | null;
  resumen?: string | null;
  imagen_url?: string | null;
  contenido?: string | null;
  galeria?: Foto[];
  salida?: string | null;
  // build-content.mjs las saca de "coordenadas_salida"
  latitud?: number | null;
  longitud?: number | null;
  // build-content.mjs cambia las rutas de fichero por {id, nombre}
  lugares?: { id: string; nombre: string }[];
  wikiloc_url?: string | null;
  gpx?: string | null;
  recomendaciones?: string | null;
};

const tituloSeccion = (texto: string) => (
  <Typography.Title level={4} style={{ margin: "28px 0 12px" }}>
    {texto}
  </Typography.Title>
);

// Como en lugares y actividades, cada bloque se pinta solo si tiene algo dentro.
export function RutasShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<RutaDetail>({ resource: "rutas", id });

  if (query.isLoading) return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result) return <Alert type="error" message="Ruta no encontrada" />;

  const r = result;
  const modalidad = modalidadRuta(r.modalidad);
  const dificultad = dificultadRuta(r.dificultad);
  const datos = datosRuta(r);
  const hayMapa = typeof r.latitud === "number" && typeof r.longitud === "number";
  const lugares = r.lugares ?? [];

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <CabeceraFicha titulo={r.nombre} migas={[{ title: <Link to="/descubre">Descubre Venialbo</Link> }, { title: r.nombre }]} />
      {r.imagen_url && (
        <ImagenAmpliable
          src={imgUrl(r.imagen_url)}
          srcSet={juegoDeMiniaturas(r.imagen_url)}
          sizes="(max-width: 832px) 100vw, 800px"
          alt={r.nombre}
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
        <Tag style={softTagStyle(modalidad.tono)}>
          {modalidad.icono} {modalidad.nombre}
        </Tag>
        {dificultad && (
          <Tag style={softTagStyle(dificultad.tono)}>Dificultad {dificultad.nombre.toLowerCase()}</Tag>
        )}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{r.nombre}</Typography.Title>

      {datos.length > 0 && (
        <div className="vc-datos-ruta">
          {datos.map((d) => (
            <div key={d.etiqueta}>
              <span>{d.etiqueta}</span>
              <strong>{d.valor}</strong>
            </div>
          ))}
        </div>
      )}
      <Divider style={{ borderColor: colors.borde }} />

      {r.contenido ? (
        <ContenidoRico texto={r.contenido} />
      ) : (
        r.resumen && <Typography.Paragraph style={{ fontSize: 16 }}>{r.resumen}</Typography.Paragraph>
      )}

      {lugares.length > 0 && (
        <>
          {tituloSeccion("Por dónde pasa")}
          <ol className="vc-paradas">
            {lugares.map((l) => (
              <li key={l.id}>
                <Link to={`/descubre/lugares/${l.id}`}>{l.nombre}</Link>
              </li>
            ))}
          </ol>
        </>
      )}

      {r.recomendaciones && (
        <>
          {tituloSeccion("Recomendaciones")}
          {/* Es un campo de texto sin formato: se respetan los saltos de línea */}
          <Typography.Paragraph style={{ whiteSpace: "pre-line" }}>
            {r.recomendaciones}
          </Typography.Paragraph>
        </>
      )}

      {(r.salida || hayMapa) && (
        <>
          {tituloSeccion("Punto de salida")}
          {r.salida && (
            <Typography.Paragraph style={{ color: colors.marronSuave }}>
              <EnvironmentOutlined /> {r.salida}
            </Typography.Paragraph>
          )}
          {hayMapa && <Mapa latitud={r.latitud!} longitud={r.longitud!} nombre={`salida de ${r.nombre}`} />}
        </>
      )}

      {(r.wikiloc_url || r.gpx) && (
        <>
          {tituloSeccion("El trazado")}
          <Typography.Paragraph style={{ color: colors.marronSuave }}>
            {r.wikiloc_url
              ? "En Wikiloc se ve el recorrido entero sobre el mapa y se puede seguir desde el móvil."
              : "Para seguir la ruta con el GPS o con una aplicación de mapas del móvil."}
          </Typography.Paragraph>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {r.wikiloc_url && (
              <Button
                type="primary"
                icon={<ExportOutlined />}
                href={r.wikiloc_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver en Wikiloc
              </Button>
            )}
            {r.gpx && (
              <Button icon={<DownloadOutlined />} href={imgUrl(r.gpx)} download>
                Descargar el GPX
              </Button>
            )}
          </div>
        </>
      )}

      {r.galeria && r.galeria.length > 0 && (
        <>
          {tituloSeccion("Fotos")}
          <Galeria fotos={r.galeria} titulo={r.nombre} />
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
