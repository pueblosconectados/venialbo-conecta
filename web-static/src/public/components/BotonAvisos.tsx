import { useState } from "react";
import { Link } from "react-router";
import { Button, Modal, Typography } from "antd";
import { BellOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useAvisos, useEsBrave, type EstadoAvisos } from "../../avisos";
import { colors } from "../../theme";

// El botón «Avisarme de novedades»: en el pie de todas las páginas (BotonAvisos) y en una
// franja de la portada las primeras semanas (TarjetaAvisos). La lógica está en avisos.ts.

// Hasta cuándo sale la franja de la portada, para darlo a conocer. Pasada la fecha, el
// botón sigue en el pie.
const TARJETA_HASTA = "2026-12-31";

const PRIVACIDAD = (
  <>
    No guardamos nada que diga quién eres, y te das de baja con el mismo botón.{" "}
    <Link to="/privacidad#avisos" style={{ color: "inherit", textDecoration: "underline" }}>
      Más en Privacidad
    </Link>
    .
  </>
);

// Lo que se explica cuando no se puede activar con un toque
function Ayuda({ estado, onClose }: { estado: EstadoAvisos | null; onClose: () => void }) {
  const brave = useEsBrave();
  return (
    <Modal
      open={estado !== null}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Entendido</Button>}
      title={estado === "bloqueados" ? "Los avisos están bloqueados" : "Avisos en el iPhone"}
    >
      {estado === "bloqueados" && brave ? (
        <div className="vc-md">
          <p>
            Brave bloquea los avisos de las webs por su cuenta, aunque hayas dicho que sí.
            Para permitirlos:
          </p>
          <ol>
            <li>
              Mantén pulsado el icono de <strong>Brave</strong>, toca{" "}
              <em>Información de la aplicación</em> (o la «i») y activa las{" "}
              <em>Notificaciones</em>.
            </li>
            <li>
              En Brave, entra en <em>Configuración → Configuración de sitios →
              Notificaciones</em> y quita <strong>venialboconecta.es</strong> de los sitios
              bloqueados.
            </li>
            <li>Vuelve aquí y pulsa «Avisarme de novedades».</li>
          </ol>
          <p>
            En Brave los avisos pueden llegar en silencio. Cuando te llegue uno, mantenlo
            pulsado y elige <em>Predeterminado</em> para que suene.
          </p>
        </div>
      ) : estado === "bloqueados" ? (
        <div className="vc-md">
          <p>
            En algún momento se dijo que no a los avisos de esta web, y el móvil ya no
            deja volver a preguntar. Se pueden activar a mano:
          </p>
          <ul>
            <li>
              <strong>Si la tienes en la pantalla de inicio:</strong> mantén pulsado su
              icono, toca <em>Información de la aplicación</em> (o la «i») y activa las{" "}
              <em>Notificaciones</em>.
            </li>
            <li>
              <strong>En el navegador:</strong> toca el icono que hay a la izquierda de la
              dirección de la web, entra en <em>Permisos</em> y permite las{" "}
              <em>Notificaciones</em>.
            </li>
          </ul>
          <p>Después vuelve aquí y pulsa «Avisarme de novedades».</p>
        </div>
      ) : (
        <div className="vc-md">
          <p>
            En el iPhone, los avisos solo funcionan con la web añadida a la pantalla de
            inicio:
          </p>
          <ol>
            <li>
              Abre esta web en <strong>Safari</strong>.
            </li>
            <li>
              Toca el botón de <strong>Compartir</strong> (el cuadrado con la flecha hacia
              arriba).
            </li>
            <li>
              Elige <strong>Añadir a pantalla de inicio</strong>.
            </li>
            <li>Abre la web desde ese icono nuevo y pulsa «Avisarme de novedades».</li>
          </ol>
          <p>
            Si ya la tenías en la pantalla de inicio de antes, quítala y vuelve a añadirla.
            Hace falta un iPhone con iOS 16.4 o posterior.
          </p>
        </div>
      )}
    </Modal>
  );
}

// En el pie: una sola línea, que cambia según el estado
export function BotonAvisos() {
  const { estado, ocupado, error, activar, desactivar } = useAvisos();
  const [ayuda, setAyuda] = useState<EstadoAvisos | null>(null);

  if (estado === "cargando" || estado === "no-disponible") return null;

  const enlace = { color: colors.musgo, fontWeight: 500, fontSize: 13 };

  return (
    <div style={{ marginBottom: 12 }}>
      {estado === "desactivados" && (
        <>
          <Button icon={<BellOutlined />} onClick={activar} loading={ocupado}>
            Avisarme de novedades
          </Button>
          <Typography.Text
            style={{ display: "block", marginTop: 6, fontSize: 12, color: colors.marronSuave }}
          >
            {PRIVACIDAD}
          </Typography.Text>
        </>
      )}
      {estado === "activados" && (
        <Typography.Text style={{ fontSize: 13, color: colors.marronSuave }}>
          <BellOutlined style={{ color: colors.musgo }} /> Avisos activados ·{" "}
          <Button type="link" size="small" onClick={desactivar} loading={ocupado} style={{ ...enlace, padding: 0 }}>
            Desactivar
          </Button>
        </Typography.Text>
      )}
      {(estado === "bloqueados" || estado === "iphone-sin-instalar") && (
        <Button type="link" size="small" icon={<BellOutlined />} onClick={() => setAyuda(estado)} style={enlace}>
          {estado === "bloqueados" ? "Avisos bloqueados en este navegador" : "Avisos en el iPhone"}
        </Button>
      )}
      {error && (
        <Typography.Text type="danger" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
          {error}
        </Typography.Text>
      )}
      <Ayuda estado={ayuda} onClose={() => setAyuda(null)} />
    </div>
  );
}

// En la portada: solo a quien todavía puede activarlos, y hasta TARJETA_HASTA
export function TarjetaAvisos() {
  const { estado, ocupado, error, activar } = useAvisos();
  const [ayuda, setAyuda] = useState<EstadoAvisos | null>(null);
  // Se recuerda que se acaban de activar para dar las gracias, en vez de desaparecer
  const [recien, setRecien] = useState(false);

  if (new Date() > new Date(`${TARJETA_HASTA}T23:59:59`)) return null;
  if (recien && estado === "activados") {
    return (
      <div className="vc-aviso-push">
        <span className="vc-aviso-push-icono" aria-hidden>
          <CheckCircleOutlined />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <Typography.Text strong style={{ display: "block", fontSize: 16, color: "inherit" }}>
            ¡Avisos activados!
          </Typography.Text>
          <Typography.Text style={{ fontSize: 14, color: "inherit", opacity: 0.85 }}>
            Te llegarán al móvil aunque no tengas la web abierta.
          </Typography.Text>
        </span>
      </div>
    );
  }
  if (estado !== "desactivados" && estado !== "iphone-sin-instalar") return null;

  const pulsar =
    estado === "iphone-sin-instalar"
      ? () => setAyuda(estado)
      : async () => {
          await activar();
          setRecien(true);
        };

  return (
    <div className="vc-aviso-push">
      <span className="vc-aviso-push-icono" aria-hidden>
        <BellOutlined />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong style={{ display: "block", fontSize: 16, color: "inherit" }}>
          Recibe los avisos del pueblo en el móvil
        </Typography.Text>
        <Typography.Text style={{ fontSize: 14, color: "inherit", opacity: 0.85 }}>
          Cortes de agua, cambios de horario, actividades, noticias y anuncios del tablón.
        </Typography.Text>
        <Typography.Text style={{ display: "block", marginTop: 4, fontSize: 12, color: "inherit", opacity: 0.75 }}>
          {PRIVACIDAD}
        </Typography.Text>
        {error && (
          <Typography.Text type="danger" style={{ display: "block", marginTop: 4, fontSize: 13 }}>
            {error}
          </Typography.Text>
        )}
      </span>
      <Button type="primary" className="vc-aviso-push-boton" onClick={pulsar} loading={ocupado}>
        {estado === "iphone-sin-instalar" ? "Cómo activarlos" : "Avisarme"}
      </Button>
      <Ayuda estado={ayuda} onClose={() => setAyuda(null)} />
    </div>
  );
}
