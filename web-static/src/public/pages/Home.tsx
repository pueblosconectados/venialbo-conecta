import { Link } from "react-router";
import { Card, Col, Row, Typography } from "antd";
import {
  BankOutlined,
  MedicineBoxOutlined,
  NotificationOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import { colors } from "../../theme";

const SECCIONES = [
  {
    icon: <ReadOutlined />,
    title: "Noticias",
    desc: "Lo último que pasa en el pueblo",
    to: "/noticias",
    color: colors.musgo,
    bg: colors.musgoFondo,
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
    title: "Servicios",
    desc: "Médico, comedor, bibliobús",
    to: "/servicios",
    color: "#8b6db5",
    bg: "#efe8f7",
  },
  {
    icon: <NotificationOutlined />,
    title: "Tablón",
    desc: "Anuncios entre vecinos",
    to: "/tablon",
    color: colors.dorado,
    bg: "#fbf3e0",
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
            Noticias, negocios, servicios y un tablón para compartir lo que pasa
            en el pueblo.
          </Typography.Text>
        </div>
      </section>

      <Row gutter={[20, 20]}>
        {SECCIONES.map((s) => (
          <Col key={s.to} xs={12} sm={12} md={6}>
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
                <Typography.Text
                  style={{ fontSize: 13, color: colors.marronSuave }}
                >
                  {s.desc}
                </Typography.Text>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Link
        to="/pueblos-conectados"
        className="vc-card-link"
        style={{ marginTop: 20 }}
      >
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
                  marginBottom: 6,
                  fontSize: 20,
                  color: colors.marronTexto,
                }}
              >
                Pueblos Conectados
              </Typography.Title>
              <Typography.Text
                style={{ fontSize: 14, color: colors.marronSuave }}
              >
                Un proyecto colaborativo entre las localidades de Venialbo
                (Zamora) y Aldearrubia (Salamanca).
              </Typography.Text>
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}
