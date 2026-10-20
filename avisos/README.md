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
| `POST /tally` | Tally, firmado | Reenvía la respuesta de un formulario a Telegram (ver `tally/README.md`) |
| `GET /resumen` | A mano, con el token | El resumen semanal de visitas. Solo lo enseña; `?enviar` lo manda al grupo y `?en-curso` usa lo que va de semana |

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

Para el aviso de los formularios por Telegram (`/tally`), tres secretos más:

```bash
openssl rand -hex 32 > ../../.secretos/tally-webhook-secret
npx wrangler secret put TALLY_SIGNING_SECRET < ../../.secretos/tally-webhook-secret
npx wrangler secret put TELEGRAM_TOKEN      # el del bot de news-rastreator
npx wrangler secret put TELEGRAM_CHAT_ID    # el grupo; en los grupos es negativo
npm run deploy
node ../../tally/crear-webhooks.mjs         # con TALLY_API_KEY_FILE=../../.secretos/api-key
```

## El resumen semanal de visitas

Los lunes a las 9:00 (hora de Madrid) el Worker manda al grupo de Telegram cómo fue la
semana anterior, de lunes a domingo: visitas y páginas vistas comparadas con la semana
de antes, las 5 páginas más vistas con su título, de dónde llegan, móvil u ordenador,
el día con más visitas y la hora punta, las visitas desde fuera de España y cuántos
dispositivos tienen los avisos activados. Si la web va lenta, lo avisa: cuando en el
móvil la mitad de las cargas pasa de 3 s, o cuando una página sale en «malo» en al menos
una de cada cuatro cargas según los Core Web Vitals de Google. Si va bien, no dice nada. Está en `worker/src/resumen.js`.

- **Los datos** salen de Cloudflare Web Analytics por su API GraphQL (el dataset
  `rumPageloadEventsAdaptiveGroups`, que Cloudflare no documenta del todo). El token,
  con solo *Account → Account Analytics → Read*, va como secreto `CF_ANALYTICS_TOKEN` y
  en `.secretos/cf-analytics-token`. La cuenta y el `CF_SITE_TAG` van en
  `wrangler.toml`. El siteTag **no es** el token del script de la web: se saca de la API
  agrupando por `siteTag` y `requestHost`.
- **La hora**: el cron salta a las 7:00 y a las 8:00 UTC, y el Worker solo sigue con el
  que cae a las 9:00 en Madrid. Así no hay que tocarlo con el cambio de hora.
- **Para probarlo** sin esperar al lunes:

  ```bash
  T=$(cat .secretos/token-avisos)
  curl -H "Authorization: Bearer $T" "https://venialbo-avisos.venialboconecta.workers.dev/resumen?en-curso"          # lo enseña
  curl -H "Authorization: Bearer $T" "https://venialbo-avisos.venialboconecta.workers.dev/resumen?en-curso&enviar"   # lo manda
  ```

- **Las cifras son aproximadas**: quien lleva bloqueador no cuenta. WhatsApp y muchas
  apps no dicen de dónde viene la visita, así que eso sale como «Directo, WhatsApp u
  otras apps».
