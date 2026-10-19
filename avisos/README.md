# avisos — las notificaciones push de la web

El plan completo está en `NOTIFICACIONES.md` (local, gitignoreado). Aquí vive lo que
hace falta fuera de la web estática:

- `worker/` — el Cloudflare Worker que guarda las suscripciones (fase 2).
- `enviar.mjs` — el envío automático, que lanza `.github/workflows/avisos.yml` (fase 3).
- `aviso-a-mano.mjs` — un aviso suelto a todos los suscritos, con confirmación:
  `node avisos/aviso-a-mano.mjs "Título" "Texto" [/ruta] [--urgente]`.

La clave privada VAPID está en `.secretos/vapid.json`; la pública, en
`web-static/src/config.ts`. **No se pueden cambiar** sin perder a todos los suscriptores.

## El Worker

| Ruta | Quién la llama | Qué hace |
|---|---|---|
| `POST /suscribir` | La web | Guarda la suscripción |
| `POST /baja` | La web | La borra |
| `GET /suscripciones` | La Action, con `Authorization: Bearer <TOKEN>` | Devuelve la lista |
| `POST /borrar` | La Action, con el token | Quita las que den `404`/`410`: `{"endpoints": [...]}` |

Solo acepta direcciones de los servicios de push conocidos (Google, Mozilla, Apple y
Windows), cuerpos de menos de 4 KB y, para suscribir y dar de baja, peticiones desde
los orígenes de `ORIGENES` en `wrangler.toml`. No guarda IPs ni registros.

### En local

```bash
cd avisos/worker
npm install
npm run dev          # http://127.0.0.1:8787, con un KV de pruebas en .wrangler/
```

El token de pruebas está en `.dev.vars` (gitignoreado): `TOKEN=token-de-pruebas-local`.

### Publicado

En **https://venialbo-avisos.venialboconecta.workers.dev** desde el 2026-10-19, en la
cuenta de Cloudflare de David (subdominio `venialboconecta.workers.dev`). El token de
la Action está en `.secretos/token-avisos`. Para volver a publicar tras un cambio:
`npm run deploy`.

### Cómo se publicó (una vez)

```bash
cd avisos/worker
npx wrangler login                                  # abre el navegador
npx wrangler kv namespace create SUSCRIPCIONES      # copia el id a wrangler.toml
openssl rand -hex 32 > ../../.secretos/token-avisos # el token de la Action
npx wrangler secret put TOKEN < ../../.secretos/token-avisos
npm run deploy                                      # → venialbo-avisos.<cuenta>.workers.dev
```

El mismo token va luego como secreto de GitHub para la Action (fase 3).
