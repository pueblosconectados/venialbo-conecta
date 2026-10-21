import type { ReactNode } from "react";
import { useParams, Link } from "react-router";
import { esNuevo, useOne } from "../../../datos";
import { EtiquetaNuevo } from "../../components/EtiquetaNuevo";
import {
  Button,
  Divider,
  Result,
  Spin,
  Tag,
  Typography,
} from "antd";
import { ClockCircleOutlined, ExportOutlined, FileSearchOutlined } from "@ant-design/icons";
import { FORMULARIOS, formatFecha, imgUrl } from "../../../config";
import { haCaducado } from "../../../datos";
import { colors, softTagStyle } from "../../../theme";
import { CabeceraFicha } from "../../components/CabeceraFicha";
import { ContenidoRico } from "../../components/ContenidoRico";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { Galeria, type Foto } from "../../components/Galeria";
import { Documentos, type Documento } from "../../components/Documentos";
import { juegoDeMiniaturas } from "../../../miniaturas";
import {
  CASAS,
  INFORMACION,
  TIPO_LABEL,
  TIPO_TONE,
  cifrasCasa,
  nombrePlataforma,
  selloVendida,
  type DatosCasa,
} from "./tipos";

type Anuncio = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion?: string;
  contacto?: string;
  imagen_url?: string;
  galeria?: Foto[];
  documentos?: Documento[];
  fecha_publicacion: string;
  activo: boolean;
  fecha_caducidad?: string | null;
  casa?: DatosCasa | null;
};

// Un anuncio caducado se quita del tablón, pero el enlace puede seguir circulando por
// WhatsApp: en vez de enseñarlo, se avisa de que ya no está y se ofrece volver al tablón.
function NoDisponible({
  icono,
  titulo,
  texto,
}: {
  icono: ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <Result
      // La ilustración que antd pone en el status 404 es azul y desentona con la
      // paleta del pueblo, así que se sustituye por un icono de la casa.
      icon={icono}
      title={titulo}
      subTitle={texto}
      extra={
        <Link to="/tablon">
          <Button type="primary">Ver el tablón</Button>
        </Link>
      }
    />
  );
}

export function AnunciosShow() {
  const { id } = useParams<{ id: string }>();
  const { result, query } = useOne<Anuncio>({
    resource: "anuncios",
    id,
  });

  if (query.isLoading)
    return <Spin style={{ display: "block", margin: "60px auto" }} />;
  if (query.isError || !result)
    return (
      <NoDisponible
        icono={<FileSearchOutlined style={{ color: colors.marronSuave }} />}
        titulo="Anuncio no encontrado"
        texto="Puede que se haya retirado del tablón."
      />
    );

  const a = result;
  const esCasa = CASAS.has(a.tipo);
  const cifras = esCasa ? cifrasCasa(a.tipo, a.casa) : [];
  const vendida = esCasa && Boolean(a.casa?.vendida);

  // Sin fecha (Información que no caduca) no hay nada que comprobar
  if (a.fecha_caducidad && haCaducado(a.fecha_caducidad))
    return (
      <NoDisponible
        icono={<ClockCircleOutlined style={{ color: colors.dorado }} />}
        titulo="Anuncio caducado"
        texto={`Este anuncio estuvo disponible hasta el ${formatFecha(a.fecha_caducidad)}.`}
      />
    );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <CabeceraFicha titulo={a.titulo} migas={[
          { title: <Link to="/tablon">Tablón</Link> },
          { title: a.titulo },
        ]} />
      {a.imagen_url && (
        <ImagenAmpliable
          src={imgUrl(a.imagen_url)}
          srcSet={juegoDeMiniaturas(a.imagen_url)}
          sizes="(max-width: 832px) 100vw, 800px"
          alt={a.titulo}
          wrapperStyle={{ display: "block", width: "100%", marginBottom: 24 }}
          style={{
            width: "100%",
            maxHeight: 360,
            objectFit: "cover",
            borderRadius: 14,
            border: `1px solid ${colors.borde}`,
          }}
        />
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {esNuevo(a) && <EtiquetaNuevo />}
        <Tag style={softTagStyle(TIPO_TONE[a.tipo] ?? "gris")}>
          {TIPO_LABEL[a.tipo] ?? a.tipo}
        </Tag>
        {vendida && <Tag style={softTagStyle("rojo")}>{selloVendida(a.tipo)}</Tag>}
        {!a.activo && <Tag style={softTagStyle("rojo")}>Expirado</Tag>}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{a.titulo}</Typography.Title>
      <Typography.Text style={{ color: colors.marronSuave }}>
        Publicado el {formatFecha(a.fecha_publicacion)}
      </Typography.Text>
      {cifras.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {cifras.map((c) => (
            <span
              key={c}
              style={{
                padding: "6px 12px",
                background: colors.musgoFondo,
                border: `1px solid ${colors.borde}`,
                borderRadius: 10,
                fontWeight: 500,
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <Divider style={{ borderColor: colors.borde }} />
      <ContenidoRico texto={a.descripcion} style={{ lineHeight: 1.7, marginBottom: 16 }} />
      <Documentos documentos={a.documentos} />
      {a.galeria && a.galeria.length > 0 && (
        <>
          <Typography.Title level={4} style={{ margin: "28px 0 12px" }}>
            Más fotos
          </Typography.Title>
          <Galeria fotos={a.galeria} titulo={a.titulo} />
        </>
      )}
      {/* Mucha gente ya tiene la casa en Idealista o en Facebook, con más fotos: el
          enlace va tal cual, sin copiar nada de allí */}
      {esCasa && a.casa?.enlace && (
        <Button
          icon={<ExportOutlined />}
          href={a.casa.enlace}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginTop: 16 }}
        >
          Ver el anuncio en {nombrePlataforma(a.casa.enlace)}
        </Button>
      )}
      {a.contacto && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: colors.musgoFondo,
            border: `1px solid ${colors.borde}`,
            borderRadius: 10,
          }}
        >
          <Typography.Text strong>Contacto: </Typography.Text>
          <Typography.Text>{a.contacto}</Typography.Text>
        </div>
      )}
      {/* Quien publicó el anuncio no puede quitarlo (no hay cuentas): lo pide por el
          formulario de contacto, que lleva el anuncio en el campo oculto "anuncio" para
          que en el correo se sepa cuál es. Lo retira a mano quien lleve el CMS. Los de
          Información los ponemos nosotros: ahí no hay nadie que tenga que pedirlo. Una
          casa no se quita al momento: se marca como vendida y sale así una semana
          (DIAS_VENDIDA en build-content.mjs), y conviene que el dueño lo sepa. */}
      {esCasa && (
        <Typography.Paragraph style={{ marginTop: 24, marginBottom: 0, color: colors.marronSuave }}>
          ¿Ya está {selloVendida(a.tipo).toLowerCase()}?{" "}
          <a
            href={`${FORMULARIOS.contacto}?anuncio=${encodeURIComponent(`${a.titulo} (${a.id})`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: colors.musgo, fontWeight: 500 }}
          >
            Avísanos
          </a>{" "}
          y la marcamos como {selloVendida(a.tipo).toLowerCase()}: se queda una semana con
          ese cartel y después se quita sola.
        </Typography.Paragraph>
      )}
      {a.tipo !== INFORMACION && !esCasa && (
        <Typography.Paragraph style={{ marginTop: 24, marginBottom: 0, color: colors.marronSuave }}>
          ¿Ya no hace falta este anuncio?{" "}
          <a
            href={`${FORMULARIOS.contacto}?anuncio=${encodeURIComponent(`${a.titulo} (${a.id})`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: colors.musgo, fontWeight: 500 }}
          >
            Pide que lo quitemos del tablón
          </a>
        </Typography.Paragraph>
      )}
      <div style={{ marginTop: 24 }}>
        <Link to="/tablon" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver al tablón
        </Link>
      </div>
    </div>
  );
}
