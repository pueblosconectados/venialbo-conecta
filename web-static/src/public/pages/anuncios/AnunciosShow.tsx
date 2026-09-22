import type { ReactNode } from "react";
import { useParams, Link } from "react-router";
import { useOne } from "@refinedev/core";
import {
  Breadcrumb,
  Button,
  Divider,
  Result,
  Spin,
  Tag,
  Typography,
} from "antd";
import { ClockCircleOutlined, FileSearchOutlined } from "@ant-design/icons";
import { formatFecha, imgUrl } from "../../../config";
import { haCaducado } from "../../../providers/staticDataProvider";
import { colors, softTagStyle, type TagTone } from "../../../theme";
import { ContenidoRico } from "../../components/ContenidoRico";
import { ImagenAmpliable } from "../../components/ImagenAmpliable";
import { juegoDeMiniaturas } from "../../../miniaturas";

type Anuncio = {
  id: string;
  tipo: string;
  titulo: string;
  descripcion?: string;
  contacto?: string;
  imagen_url?: string;
  fecha_publicacion: string;
  activo: boolean;
  fecha_caducidad: string;
};

const TIPO_LABEL: Record<string, string> = {
  mascota_perdida: "Mascota perdida",
  compra_venta: "Compra / Venta",
  objeto_perdido: "Objeto perdido",
  otro: "Otro",
};

const TIPO_TONE: Record<string, TagTone> = {
  mascota_perdida: "terracota",
  compra_venta: "musgo",
  objeto_perdido: "azul",
  otro: "gris",
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

  if (haCaducado(a.fecha_caducidad))
    return (
      <NoDisponible
        icono={<ClockCircleOutlined style={{ color: colors.dorado }} />}
        titulo="Anuncio caducado"
        texto={`Este anuncio estuvo disponible hasta el ${formatFecha(a.fecha_caducidad)}.`}
      />
    );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/tablon">Tablón</Link> },
          { title: a.titulo },
        ]}
      />
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
        <Tag style={softTagStyle(TIPO_TONE[a.tipo] ?? "gris")}>
          {TIPO_LABEL[a.tipo] ?? a.tipo}
        </Tag>
        {!a.activo && <Tag style={softTagStyle("rojo")}>Expirado</Tag>}
      </div>
      <Typography.Title level={2} style={{ marginTop: 4 }}>{a.titulo}</Typography.Title>
      <Typography.Text style={{ color: colors.marronSuave }}>
        Publicado el {formatFecha(a.fecha_publicacion)}
      </Typography.Text>
      <Divider style={{ borderColor: colors.borde }} />
      <ContenidoRico texto={a.descripcion} style={{ lineHeight: 1.7, marginBottom: 16 }} />
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
      <div style={{ marginTop: 24 }}>
        <Link to="/tablon" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver al tablón
        </Link>
      </div>
    </div>
  );
}
