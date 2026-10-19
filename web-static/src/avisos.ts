import { useEffect, useState } from "react";
import { AVISOS_URL, VAPID_PUBLICA } from "./config";

// Los avisos push (fase 2 de NOTIFICACIONES.md): saber en qué estado está este
// navegador, suscribirlo y darlo de baja. La suscripción se guarda en el Worker de
// avisos/worker/; el aviso lo enseña public/sw.js.
//
// Lo usan a la vez el pie y la tarjeta de portada. Cuando uno cambia algo avisa con un
// evento y el otro vuelve a mirar, para que no digan cosas distintas.

export type EstadoAvisos =
  | "cargando"
  | "no-disponible" // navegador sin push
  | "iphone-sin-instalar" // iPhone en una pestaña: hay que añadirla a la pantalla de inicio
  | "desactivados"
  | "activados"
  | "bloqueados"; // la persona dijo que no, o los quitó en los ajustes

const EVENTO = "vc-avisos";

// Mientras no exista el envío automático (fase 3), el botón solo lo ven los navegadores
// que han pasado por /prueba-avisos: si no, la gente se apuntaría y no le llegaría nada.
// Para abrirlo a todo el mundo, ABIERTO = true (y quitar la página de prueba).
const ABIERTO = false;
const PROBADOR = "vc-avisos-probador";

export const marcarProbador = () => {
  try {
    localStorage.setItem(PROBADOR, "1");
  } catch {
    // Sin almacenamiento (navegación privada): este navegador no verá el botón
  }
};

const esProbador = () => {
  try {
    return localStorage.getItem(PROBADOR) === "1";
  } catch {
    return false;
  }
};

const esIphone = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // El iPad se hace pasar por un Mac, pero tiene pantalla táctil
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

const instalada = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const hayPush = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// pushManager.subscribe quiere la clave en bytes; en base64url no la entiende Safari
const aBytes = (base64url: string) => {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const suscripcionActual = async () => {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
};

const leerEstado = async (): Promise<EstadoAvisos> => {
  if (!ABIERTO && !esProbador()) return "no-disponible";
  if (!hayPush()) return esIphone() && !instalada() ? "iphone-sin-instalar" : "no-disponible";
  if (Notification.permission === "denied") return "bloqueados";
  if (Notification.permission !== "granted") return "desactivados";
  return (await suscripcionActual()) ? "activados" : "desactivados";
};

const alWorker = async (ruta: "suscribir" | "baja", cuerpo: unknown) => {
  const r = await fetch(`${AVISOS_URL}/${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`El servidor de avisos ha respondido ${r.status}`);
};

// El permiso se pide lo primero, pegado a la pulsación: Safari no deja pedirlo si antes
// se ha esperado a otra cosa
const activar = async () => {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: aBytes(VAPID_PUBLICA),
    }));
  try {
    await alWorker("suscribir", sub);
  } catch (e) {
    // Si el Worker no la ha guardado, no puede quedar como activada: no llegaría nada
    await sub.unsubscribe();
    throw e;
  }
};

// Primero se borra del Worker; si eso falla se quita igual del navegador, y el Worker
// la borrará en el siguiente envío, cuando el servicio de push diga que ya no existe
const desactivar = async () => {
  const sub = await suscripcionActual();
  if (!sub) return;
  await alWorker("baja", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
};

export function useAvisos() {
  const [estado, setEstado] = useState<EstadoAvisos>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const mirar = () =>
      leerEstado()
        .then((e) => vigente && setEstado(e))
        .catch(() => vigente && setEstado("no-disponible"));
    mirar();
    window.addEventListener(EVENTO, mirar);
    return () => {
      vigente = false;
      window.removeEventListener(EVENTO, mirar);
    };
  }, []);

  const conControl = (accion: () => Promise<void>) => async () => {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch {
      setError("Algo ha fallado con los avisos. Prueba otra vez dentro de un rato.");
    } finally {
      setOcupado(false);
      window.dispatchEvent(new Event(EVENTO));
    }
  };

  return {
    estado,
    ocupado,
    error,
    activar: conControl(activar),
    desactivar: conControl(desactivar),
  };
}
