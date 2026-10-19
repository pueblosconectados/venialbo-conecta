import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Divider, Space, Typography } from "antd";
import { VAPID_PUBLICA } from "../../config";
import { colors } from "../../theme";

// Página de prueba de los avisos push: la fase 0 de NOTIFICACIONES.md. Sirve para saber
// en qué móviles llegan antes de montar el Worker. Enseña la suscripción en pantalla
// para mandársela uno mismo y probar el envío con scripts/enviar-prueba-push.mjs.
//
// Solo se llega desde un enlace discreto al final de /privacidad (la web instalada no
// tiene barra de direcciones). Es el único sitio que registra el service worker. Se
// quita, con su ruta y su enlace, al acabar la fase 0.

const soporta = () => ({
  serviceWorker: "serviceWorker" in navigator,
  pushManager: "PushManager" in window,
  notification: "Notification" in window,
});

const instalada = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// pushManager.subscribe quiere la clave en bytes; en base64url no la entiende Safari
const aBytes = (base64url: string) => {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const permisoActual = () => ("Notification" in window ? Notification.permission : "no disponible");

export function PruebaAvisos() {
  const [permiso, setPermiso] = useState<string>(permisoActual);
  const [suscripcion, setSuscripcion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const s = soporta();
  const todoSoportado = s.serviceWorker && s.pushManager && s.notification;

  // Si ya había suscripción de otra vez, se enseña al entrar
  useEffect(() => {
    if (!todoSoportado) return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => sub && setSuscripcion(JSON.stringify(sub)))
      .catch(() => {});
  }, [todoSoportado]);

  const conControl = async (accion: () => Promise<void>) => {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    } finally {
      setPermiso(permisoActual());
      setOcupado(false);
    }
  };

  // El permiso se pide lo primero, pegado a la pulsación: Safari no lo deja pedir si
  // antes se ha esperado a otra cosa
  const activar = () =>
    conControl(async () => {
      const respuesta = await Notification.requestPermission();
      if (respuesta !== "granted") throw new Error(`Permiso: ${respuesta}`);
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: aBytes(VAPID_PUBLICA),
        }));
      setSuscripcion(JSON.stringify(sub));
    });

  const desactivar = () =>
    conControl(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      setSuscripcion(null);
    });

  // Sin servidor de por medio: comprueba que el móvil enseña avisos de esta web
  const avisoLocal = () =>
    conControl(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Aviso de prueba", {
        body: "Si ves esto, el móvil enseña los avisos de VenialboConecta.",
        icon: "/apple-touch-icon.png",
        data: { url: "/prueba-avisos" },
      });
    });

  const copiar = async () => {
    if (!suscripcion) return;
    try {
      await navigator.clipboard.writeText(suscripcion);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copia la suscripción:", suscripcion);
    }
  };

  const compartir = () =>
    suscripcion &&
    navigator.share({ title: "Suscripción de prueba", text: suscripcion }).catch(() => {});

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <Typography.Title level={2}>Prueba de avisos</Typography.Title>
      <Typography.Text style={{ color: colors.marronSuave }}>
        Página temporal para probar las notificaciones en distintos móviles.
      </Typography.Text>
      <Divider style={{ borderColor: colors.borde }} />

      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Service worker">{s.serviceWorker ? "Sí" : "No"}</Descriptions.Item>
        <Descriptions.Item label="Push">{s.pushManager ? "Sí" : "No"}</Descriptions.Item>
        <Descriptions.Item label="Notificaciones">{s.notification ? "Sí" : "No"}</Descriptions.Item>
        <Descriptions.Item label="Abierta como app">{instalada() ? "Sí" : "No"}</Descriptions.Item>
        <Descriptions.Item label="Permiso">{permiso}</Descriptions.Item>
        <Descriptions.Item label="Navegador">
          <span style={{ fontSize: 12, wordBreak: "break-all" }}>{navigator.userAgent}</span>
        </Descriptions.Item>
      </Descriptions>

      {!todoSoportado && (
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message="Este navegador no admite avisos así"
          description="En iPhone solo funcionan con la web añadida a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y abierta desde ese icono."
        />
      )}

      {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}

      <Space wrap style={{ marginTop: 20 }}>
        <Button type="primary" onClick={activar} loading={ocupado} disabled={!todoSoportado}>
          Activar avisos
        </Button>
        <Button onClick={avisoLocal} disabled={!todoSoportado || permiso !== "granted"}>
          Aviso de prueba local
        </Button>
        <Button danger onClick={desactivar} disabled={!suscripcion}>
          Darse de baja
        </Button>
      </Space>

      {suscripcion && (
        <>
          <Typography.Title level={4} style={{ marginTop: 28 }}>
            Suscripción
          </Typography.Title>
          <Typography.Paragraph style={{ color: colors.marronSuave }}>
            Mándatela (por WhatsApp, por ejemplo) y pégala en el ordenador para probar el
            envío.
          </Typography.Paragraph>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontSize: 12,
              background: colors.cremaOscuro,
              padding: 12,
              borderRadius: 8,
            }}
          >
            {suscripcion}
          </pre>
          <Space wrap>
            <Button onClick={copiar}>{copiado ? "Copiada" : "Copiar"}</Button>
            {typeof navigator.share === "function" && <Button onClick={compartir}>Compartir</Button>}
          </Space>
        </>
      )}
    </div>
  );
}
