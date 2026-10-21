-- Las tablas de D1 para saber si los avisos push llegan (ver src/entregas.js). Se
-- aplica con:
--   npx wrangler d1 execute ENTREGAS --remote --file entregas.sql
-- (sin --remote, en la base de pruebas de `npm run dev`).

-- Cada aviso mandado. La hora es la del Worker al apuntarlo, justo antes de mandar
CREATE TABLE IF NOT EXISTS envios (
  id TEXT PRIMARY KEY,
  enviado INTEGER NOT NULL,         -- ms
  titulo TEXT NOT NULL,
  urgente INTEGER NOT NULL DEFAULT 0
);

-- Cada dispositivo de cada envío. `dispositivo` es el sha256 de la dirección de la
-- suscripción, la misma clave que en el KV SUSCRIPCIONES. `aceptado` lo pone la Action
-- cuando el servicio de push lo acepta; `recibido` y `abierto`, el service worker del
-- móvil (ms, hora del Worker). Pueden llegar en cualquier orden.
CREATE TABLE IF NOT EXISTS destinos (
  envio TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  aceptado INTEGER,
  recibido INTEGER,
  abierto INTEGER,
  PRIMARY KEY (envio, dispositivo)
);
