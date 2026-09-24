import { Link } from "react-router";
import { Card, Col, Row, Typography } from "antd";
import type { ReactNode } from "react";
import {
  BankOutlined,
  CameraOutlined,
  MedicineBoxOutlined,
  NotificationOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import { colors } from "../../theme";

type Seccion = {
  icon: ReactNode;
  title: string;
  desc: string;
  to: string;
  color: string;
  bg: string;
};

const SECCIONES: Seccion[] = [
  {
    icon: <ReadOutlined />,
    title: "Noticias",
    desc: "Lo último que pasa en el pueblo",
    to: "/noticias",
    color: colors.musgo,
    bg: colors.musgoFondo,
  },
  {
    icon: <CameraOutlined />,
    title: "Actividades",
    desc: "Lo que se ha hecho, con fotos",
    to: "/actividades",
    color: "#3d6691",
    bg: "#e0eaf2",
  },
  {
    icon: <BankOutlined />,
    title: "Negocios",
    desc: "Directorio del comercio local",
    to: "/negocios",
    color: colors.terracota,
    bg: "#f9eae2",
  },
  {
    icon: <MedicineBoxOutlined />,
    title: "Servicios e instituciones",
    desc: "Médico, comedor, instituciones",
    to: "/servicios",
    color: "#8b6db5",
    bg: "#efe8f7",
  },
];

// El tablón va abajo, en la fila de Pueblos Conectados
const TABLON: Seccion = {
  icon: <NotificationOutlined />,
  title: "Tablón",
  desc: "Anuncios entre vecinos",
  to: "/tablon",
  color: colors.dorado,
  bg: "#fbf3e0",
};

export function Home() {
  return (
    <div>
      <section
        className="vc-hero"
        style={{
          background: colors.blanco,
          borderRadius: 20,
          marginBottom: 40,
          border: `1px solid ${colors.borde}`,
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL}venialbo-conecta.webp`}
          alt="VenialboConecta"
          width={1177}
          height={1134}
        />
        <div style={{ maxWidth: 460 }}>
          <Typography.Title
            level={1}
            style={{
              fontSize: "clamp(1.7rem, 4vw, 2.4rem)",
              fontWeight: 600,
              color: colors.musgo,
              margin: 0,
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}
          >
            Tu portal vecinal
          </Typography.Title>
          <Typography.Text
            style={{
              fontSize: 17,
              color: colors.marronSuave,
              display: "block",
              lineHeight: 1.55,
            }}
          >
            Noticias, actividades, negocios, servicios y un tablón para compartir
            lo que pasa en el pueblo.
          </Typography.Text>
        </div>
      </section>

      <Row gutter={[20, 20]}>
        {SECCIONES.map((s) => (
          <Col key={s.to} xs={12} sm={12} md={6}>
            <TarjetaSeccion seccion={s} />
          </Col>
        ))}
      </Row>

      {/* Segunda fila: el tablón, del mismo tamaño que las de arriba, y Pueblos
          Conectados en lo que queda. En móvil van las dos a medias, como las demás. */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={12} sm={12} md={6}>
          <TarjetaSeccion seccion={TABLON} />
        </Col>
        <Col xs={12} sm={12} md={18}>
          <Link to="/pueblos-conectados" className="vc-card-link">
            <Card
              styles={{ body: { padding: 24 } }}
              style={{ border: `1px solid ${colors.borde}` }}
            >
              <div className="vc-banda">
                <img
                  src={`${import.meta.env.BASE_URL}pueblos-conectados-icono.webp`}
                  alt=""
                  width={300}
                  height={300}
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <Typography.Title
                    level={3}
                    style={{
                      margin: 0,
                      marginBottom: 4,
                      fontSize: 18,
                      color: colors.marronTexto,
                    }}
                  >
                    Pueblos Conectados
                  </Typography.Title>
                  {/* Media tarjeta en móvil no da para la frase entera */}
                  <Typography.Text
                    className="vc-banda-larga"
                    style={{ fontSize: 14, color: colors.marronSuave }}
                  >
                    Un proyecto colaborativo entre las localidades de Venialbo
                    (Zamora) y Aldearrubia (Salamanca).
                  </Typography.Text>
                  <Typography.Text
                    className="vc-banda-corta"
                    style={{ fontSize: 13, color: colors.marronSuave }}
                  >
                    Venialbo y Aldearrubia
                  </Typography.Text>
                </div>
              </div>
            </Card>
          </Link>
        </Col>
      </Row>
    </div>
  );
}

function TarjetaSeccion({ seccion: s }: { seccion: Seccion }) {
  return (
    <Link to={s.to} className="vc-card-link">
      <Card
        styles={{ body: { padding: 24, textAlign: "center" } }}
        style={{ border: `1px solid ${colors.borde}` }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: s.bg,
            color: s.color,
            fontSize: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
          }}
        >
          {s.icon}
        </div>
        <Typography.Title
          level={4}
          style={{
            margin: 0,
            marginBottom: 4,
            fontSize: 18,
            color: colors.marronTexto,
          }}
        >
          {s.title}
        </Typography.Title>
        <Typography.Text style={{ fontSize: 13, color: colors.marronSuave }}>
          {s.desc}
        </Typography.Text>
      </Card>
    </Link>
  );
}
