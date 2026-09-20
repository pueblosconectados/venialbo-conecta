import { Link } from "react-router";
import { Button, Divider, Space, Typography } from "antd";
import { FacebookFilled, InstagramFilled } from "@ant-design/icons";
import { colors, fonts } from "../../theme";

const REDES = {
  // Enlaces a las redes sociales oficiales del proyecto.
  instagram: "https://www.instagram.com/pueblosconectados.cyldigital",
  facebook: "https://www.facebook.com/61594090958025/",
};

// Colores de marca oficiales, para que los botones se reconozcan de un vistazo.
const MARCA = {
  instagram: "#e4405f",
  facebook: "#1877f2",
};

const parrafo = { fontSize: 16, lineHeight: 1.7 };

// index.css quita el subrayado a todos los enlaces, que va bien en el menu y en
// las tarjetas. Dentro de un parrafo hace falta recuperarlo para que se
// distingan del texto corrido sin depender solo del color.
const enlace = {
  color: colors.musgo,
  fontWeight: 600,
  textDecoration: "underline",
};

export function PueblosConectados() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <img
          src={`${import.meta.env.BASE_URL}pueblos-conectados.webp`}
          alt="Pueblos Conectados — conectando personas, impulsando pueblos"
          width={794}
          height={954}
          style={{ width: "100%", maxWidth: 280, height: "auto" }}
        />
      </div>

      <Typography.Paragraph style={parrafo}>
        <strong>Pueblos Conectados</strong> es un proyecto colaborativo entre las
        localidades de{" "}
        <a
          href="https://es.wikipedia.org/wiki/Venialbo"
          target="_blank"
          rel="noopener noreferrer"
          style={enlace}
        >
          Venialbo
        </a>{" "}
        (Zamora) y{" "}
        <a
          href="https://es.wikipedia.org/wiki/Aldearrubia"
          target="_blank"
          rel="noopener noreferrer"
          style={enlace}
        >
          Aldearrubia
        </a>{" "}
        (Salamanca).
      </Typography.Paragraph>

      <Typography.Paragraph style={parrafo}>
        Nace como parte del concurso{" "}
        <a
          href="https://www.cyldigital.es/iniciativas-destacadas/concurso-innovacyl-digital"
          target="_blank"
          rel="noopener noreferrer"
          style={enlace}
        >
          InnovaCyL Digital
        </a>
        , de Castilla y León Digital, con el propósito de impulsar el desarrollo
        local mediante recursos y herramientas digitales que fortalezcan la
        conexión entre las personas.
      </Typography.Paragraph>

      <div
        style={{
          borderLeft: `3px solid ${colors.musgo}`,
          paddingLeft: 20,
          margin: "28px 0",
        }}
      >
        <Typography.Text
          style={{
            fontFamily: fonts.serif,
            fontSize: 21,
            lineHeight: 1.4,
            color: colors.musgo,
            display: "block",
          }}
        >
          Nosotros ponemos la red, vosotros ponéis la vida.
        </Typography.Text>
      </div>

      <Typography.Paragraph style={parrafo}>
        Nuestras cuentas en redes sociales son el escaparate del proyecto: las
        actividades de los dos pueblos, el día a día de sus vecinos y contenido
        visual de ambas localidades.
      </Typography.Paragraph>

      <Divider style={{ borderColor: colors.borde }} />

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Únete a la comunidad
      </Typography.Title>
      <Typography.Paragraph style={{ ...parrafo, marginBottom: 20 }}>
        Síguenos para no perderte nada de lo que pasa en Venialbo y Aldearrubia.
      </Typography.Paragraph>
      <Space wrap>
        <Button
          size="large"
          icon={<InstagramFilled style={{ color: MARCA.instagram }} />}
          href={REDES.instagram}
          target="_blank"
          rel="noopener noreferrer"
        >
          Instagram
        </Button>
        <Button
          size="large"
          icon={<FacebookFilled style={{ color: MARCA.facebook }} />}
          href={REDES.facebook}
          target="_blank"
          rel="noopener noreferrer"
        >
          Facebook
        </Button>
      </Space>

      <div style={{ marginTop: 32 }}>
        <Link to="/" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a la portada
        </Link>
      </div>
    </div>
  );
}
