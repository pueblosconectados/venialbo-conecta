// Service worker de los avisos (ver NOTIFICACIONES.md). Hace solo dos cosas: enseñar la
// notificación cuando llega una push y abrir su página al tocarla.
//
// No cachea nada ni tiene manejador fetch, a propósito: un service worker que cachea
// mal deja a la gente viendo una versión vieja de la web y es difícil de arreglar a
// distancia. Si un día hay que quitarlo, se sustituye este fichero por uno que llame a
// self.registration.unregister() al activarse.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Lo que manda el envío: { titulo, cuerpo, url }. Safari retira el permiso a las webs
// que reciben una push y no enseñan nada, así que siempre se enseña algo.
self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { cuerpo: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "VenialboConecta", {
      body: datos.cuerpo || "",
      icon: "/apple-touch-icon.png",
      // El de la barra de notificaciones. Android lo pinta en blanco y solo mira la
      // silueta: sin él, Chrome pone su campana
      badge: "/icono-aviso.png",
      data: { url: datos.url || "/" },
    }),
  );
});

// Al tocarla: si la web ya está abierta se lleva allí; si no, se abre
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const ventana of ventanas) {
        try {
          await ventana.focus();
          await ventana.navigate(url);
          return;
        } catch {
          // Una ventana que no controla este service worker no se deja mover: se abre otra
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
