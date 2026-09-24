import { Link } from "react-router";
import { Card, Col, Row, Typography } from "antd";
import type { ReactNode } from "react";
import {
  BankOutlined,
  CameraOutlined,
  CompassOutlined,
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

// Arriba lo que cambia y se consulta a menudo; abajo, lo que es más de directorio.
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
    icon: <NotificationOutlined />,
    title: "Tablón",
    desc: "Anuncios entre vecinos",
    to: "/tablon",
    color: colors.dorado,
    bg: "#fbf3e0",
  },
  {
    icon: <CompassOutlined />,
    title: "Descubre Venialbo",
    desc: "Qué ver y rutas",
    to: "/descubre",
    color: colors.terracotaOscuro,
    bg: "#f9eae2",
  },
];

// Abajo, junto a Pueblos Conectados
const DIRECTORIO: Seccion[] = [
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
            Todo Venialbo en un sitio: lo que pasa y lo que se ha hecho, qué ver
            y por dónde pasear, sus negocios y servicios, y un tablón para los
            vecinos.
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

      {/* Segunda fila: Negocios y Servicios del mismo tamaño que las de arriba, y
          Pueblos Conectados en la mitad que queda. En móvil, Pueblos Conectados baja
          sola a una fila entera. */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        {DIRECTORIO.map((s) => (
          <Col key={s.to} xs={12} sm={12} md={6}>
            <TarjetaSeccion seccion={s} />
          </Col>
        ))}
        <Col xs={24} sm={24} md={12}>
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
                  <Typography.Text style={{ fontSize: 14, color: colors.marronSuave }}>
                    Un proyecto colaborativo entre las localidades de Venialbo
                    (Zamora) y Aldearrubia (Salamanca).
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
