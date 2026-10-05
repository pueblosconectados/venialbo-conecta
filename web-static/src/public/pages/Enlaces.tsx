import { Link } from "react-router";
import { Alert, Card, Col, Empty, Row, Spin, Typography } from "antd";
import {
  ExportOutlined,
  FacebookFilled,
  GlobalOutlined,
  InstagramFilled,
  TikTokOutlined,
  WhatsAppOutlined,
  XOutlined,
  YoutubeFilled,
} from "@ant-design/icons";
import { useList } from "../../datos";
import { colors } from "../../theme";

type Enlace = {
  id: string;
  nombre: string;
  url: string;
  descripcion?: string | null;
  grupo: string;
};

// En el orden en que salen. Las claves son las del select «Grupo» de .pages.yml:
// si se añade un grupo allí, añadirlo aquí.
const GRUPOS: Record<string, string> = {
  redes: "El pueblo en las redes",
  otros: "Más sobre Venialbo",
};
const ORDEN = Object.keys(GRUPOS);
// Un grupo que no esté en GRUPOS se junta con los «otros»
const grupoDe = (enlace: Enlace) => (enlace.grupo in GRUPOS ? enlace.grupo : "otros");

// El icono sale de la dirección, no de un campo del CMS: uno menos que rellenar y
// ninguno que pueda no cuadrar con el enlace. Colores de marca, como en Pueblos Conectados.
const REDES = [
  { dominio: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, Icono: FacebookFilled, color: "#1877f2" },
  { dominio: /(^|\.)instagram\.com$/, Icono: InstagramFilled, color: "#e4405f" },
  { dominio: /(^|\.)(youtube\.com|youtu\.be)$/, Icono: YoutubeFilled, color: "#ff0000" },
  { dominio: /(^|\.)(x\.com|twitter\.com)$/, Icono: XOutlined, color: "#000000" },
  { dominio: /(^|\.)tiktok\.com$/, Icono: TikTokOutlined, color: "#000000" },
  { dominio: /(^|\.)(whatsapp\.com|wa\.me)$/, Icono: WhatsAppOutlined, color: "#25d366" },
];

// Fuera de las redes (una web cualquiera), detrás de todas
const posicionRed = (url: string) => {
  const i = REDES.findIndex((r) => r.dominio.test(servidor(url)));
  return i === -1 ? REDES.length : i;
};

const servidor = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Lo que se enseña bajo el nombre. Con un @usuario (YouTube, TikTok…) va también,
// porque si no tres canales de YouTube dirían los tres solo «youtube.com».
const direccionCorta = (url: string) => {
  const usuario = url.match(/^https?:\/\/[^/]+\/(@[^/?#]+)/)?.[1];
  return usuario ? `${servidor(url)}/${usuario}` : servidor(url);
};

function Icono({ url }: { url: string }) {
  const red = REDES.find((r) => r.dominio.test(servidor(url)));
  const estilo = { fontSize: 28, color: red?.color ?? colors.musgo, flexShrink: 0 };
  return red ? <red.Icono style={estilo} /> : <GlobalOutlined style={estilo} />;
}

function Tarjeta({ enlace }: { enlace: Enlace }) {
  return (
    <a href={enlace.url} target="_blank" rel="noopener noreferrer" className="vc-card-link">
      <Card styles={{ body: { padding: 16, display: "flex", gap: 14, alignItems: "flex-start" } }}>
        <Icono url={enlace.url} />
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ display: "block", color: colors.marronTexto }}>
            {enlace.nombre}
          </Typography.Text>
          {enlace.descripcion && (
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 13 }}>
              {enlace.descripcion}
            </Typography.Text>
          )}
          <Typography.Text
            style={{
              display: "block",
              marginTop: 4,
              fontSize: 12,
              color: colors.musgo,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {direccionCorta(enlace.url)} <ExportOutlined style={{ fontSize: 11 }} />
          </Typography.Text>
        </div>
      </Card>
    </a>
  );
}

export function EnlacesInteres() {
  const { result, query } = useList<Enlace>({
    resource: "enlaces",
    pagination: { mode: "off" },
  });

  // build-content los deja por nombre; aquí se agrupan, y dentro de cada grupo van
  // juntos los de la misma red (en el orden de REDES; las webs, al final). sort es
  // estable, así que dentro de cada red sigue el orden alfabético.
  const enlaces = [...(result?.data ?? [])].sort(
    (a, b) =>
      ORDEN.indexOf(grupoDe(a)) - ORDEN.indexOf(grupoDe(b)) ||
      posicionRed(a.url) - posicionRed(b.url),
  );
  const grupos = [...new Set(enlaces.map(grupoDe))];

  let cuerpo;
  if (query.isLoading) cuerpo = <Spin style={{ display: "block", margin: "60px auto" }} />;
  else if (query.isError)
    cuerpo = <Alert type="error" message="No se pudieron cargar los enlaces" />;
  else if (enlaces.length === 0)
    cuerpo = <Empty description="Todavía no hay enlaces" style={{ margin: "48px 0" }} />;
  else
    cuerpo = grupos.map((grupo) => (
      <section key={grupo} style={{ marginBottom: 28 }}>
        {/* Con un solo grupo, el título no aporta nada */}
        {grupos.length > 1 && (
          <Typography.Title level={4} style={{ marginBottom: 12 }}>
            {GRUPOS[grupo]}
          </Typography.Title>
        )}
        <Row gutter={[16, 16]}>
          {enlaces
            .filter((e) => grupoDe(e) === grupo)
            .map((e) => (
              <Col key={e.id} xs={24} sm={12}>
                <Tarjeta enlace={e} />
              </Col>
            ))}
        </Row>
      </section>
    ));

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Typography.Title level={2}>Enlaces de interés</Typography.Title>
      <Typography.Paragraph style={{ fontSize: 16, marginBottom: 24 }}>
        Otras páginas donde se habla de Venialbo. Se abren en una pestaña nueva y no son
        nuestras.
      </Typography.Paragraph>

      {cuerpo}

      <div style={{ marginTop: 8 }}>
        <Link to="/" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a la portada
        </Link>
      </div>
    </div>
  );
}
