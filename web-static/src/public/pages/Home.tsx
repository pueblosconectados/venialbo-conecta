import { Link } from "react-router";
import { Card, Col, Row, Typography } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import {
  BankOutlined,
  CameraOutlined,
  CompassOutlined,
  LinkOutlined,
  MedicineBoxOutlined,
  NotificationOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import { colors } from "../../theme";
import { esNuevo, listar, type ConNovedad } from "../../datos";
import { EtiquetaNuevo } from "../components/EtiquetaNuevo";

type Seccion = {
  // Un icono dentro del círculo de color, o una imagen que lo sustituye
  icon?: ReactNode;
  imagen?: string;
  title: string;
  desc: string;
  to: string;
  color: string;
  bg: string;
  // De dónde sale el «¡Nuevo!» de la tarjeta: si alguno de estos tiene algo nuevo
  recursos?: string[];
};

// Arriba lo que cambia y se consulta a menudo; abajo, lo que es más de directorio.
const SECCIONES: Seccion[] = [
  {
    icon: <ReadOutlined />,
    title: "Noticias",
    desc: "Lo último que pasa en el pueblo",
    to: "/noticias",
    recursos: ["noticias"],
    color: colors.musgo,
    bg: colors.musgoFondo,
  },
  {
    icon: <CameraOutlined />,
    title: "Actividades",
    desc: "Lo que se ha hecho, con fotos",
    to: "/actividades",
    recursos: ["actividades"],
    color: "#3d6691",
    bg: "#e0eaf2",
  },
  {
    icon: <NotificationOutlined />,
    title: "Tablón",
    desc: "Anuncios entre vecinos",
    to: "/tablon",
    recursos: ["anuncios"],
    color: colors.dorado,
    bg: "#fbf3e0",
  },
  {
    icon: <CompassOutlined />,
    title: "Descubre Venialbo",
    desc: "Qué ver y rutas",
    to: "/descubre",
    recursos: ["lugares", "rutas"],
    color: colors.terracotaOscuro,
    bg: "#f9eae2",
  },
];

// Abajo, lo que es más de directorio y lo que lleva fuera del pueblo
const DIRECTORIO: Seccion[] = [
  {
    icon: <BankOutlined />,
    title: "Negocios",
    desc: "Directorio del comercio local",
    to: "/negocios",
    recursos: ["negocios"],
    color: colors.terracota,
    bg: "#f9eae2",
  },
  {
    icon: <MedicineBoxOutlined />,
    title: "Servicios e instituciones",
    desc: "Médico, comedor, instituciones",
    to: "/servicios",
    recursos: ["servicios"],
    color: "#8b6db5",
    bg: "#efe8f7",
  },
  {
    icon: <LinkOutlined />,
    title: "Enlaces de interés",
    desc: "El pueblo en las redes y más",
    to: "/enlaces",
    color: "#2f7d78",
    bg: "#e0f0ee",
  },
  {
    imagen: "pueblos-conectados-icono.webp",
    title: "Pueblos Conectados",
    desc: "Venialbo y Aldearrubia, conectados",
    to: "/pueblos-conectados",
    color: colors.musgo,
    bg: colors.musgoFondo,
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

      {/* Segunda fila, del mismo tamaño que la primera: cuatro en escritorio, dos y
          dos en móvil. */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        {DIRECTORIO.map((s) => (
          <Col key={s.to} xs={12} sm={12} md={6}>
            <TarjetaSeccion seccion={s} />
          </Col>
        ))}
      </Row>
    </div>
  );
}

// ¿Hay algo nuevo en la sección? Los listados son JSON pequeños y quedan en caché, así
// que al entrar luego en la sección ya están cargados. Si falla, simplemente no sale.
function useHayNovedad(recursos: string[] = []): boolean {
  const [hay, setHay] = useState(false);
  const clave = recursos.join(",");
  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    Promise.all(
      clave.split(",").map((r) => listar<ConNovedad>(r, { pagination: { mode: "off" } })),
    )
      .then((listas) => {
        if (vigente) setHay(listas.some((l) => l.data.some(esNuevo)));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [clave]);
  return hay;
}

function TarjetaSeccion({ seccion: s }: { seccion: Seccion }) {
  const nuevo = useHayNovedad(s.recursos);
  return (
    <Link to={s.to} className="vc-card-link">
      <Card
        styles={{ body: { padding: 24, textAlign: "center" } }}
        style={{ border: `1px solid ${colors.borde}` }}
      >
        {nuevo && <EtiquetaNuevo posicion="pestana" />}
        {s.imagen ? (
          <img
            src={`${import.meta.env.BASE_URL}${s.imagen}`}
            alt=""
            width={60}
            height={60}
            loading="lazy"
            decoding="async"
            style={{ display: "block", margin: "0 auto 14px" }}
          />
        ) : (
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
        )}
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
