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
| `GET /vigilancia` | A mano, con el token | Lo que vería ahora la vigilancia de GitHub y de la web, sin avisar ni guardar nada |
| `POST /telegram` | Telegram, con su clave | Los comandos del grupo y los botones «📥 Traer» |
| `GET /revision` | A mano, con el token | Lo oculto sin revisar y el recordatorio que saldría, sin mandarlo |

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
- **La hora**: el cron del Worker salta cada 5 minutos (ver la vigilancia, abajo) y el
  resumen solo sale en el de las 9:00 en punto de un lunes en Madrid. Así no hay que
  tocarlo con el cambio de hora.
- **Para probarlo** sin esperar al lunes:

  ```bash
  T=$(cat .secretos/token-avisos)
  curl -H "Authorization: Bearer $T" "https://venialbo-avisos.venialboconecta.workers.dev/resumen?en-curso"          # lo enseña
  curl -H "Authorization: Bearer $T" "https://venialbo-avisos.venialboconecta.workers.dev/resumen?en-curso&enviar"   # lo manda
  ```

- **Las cifras son aproximadas**: quien lleva bloqueador no cuenta. WhatsApp y muchas
  apps no dicen de dónde viene la visita, así que eso sale como «Directo, WhatsApp u
  otras apps».

## La vigilancia de GitHub y de la web

Cada 5 minutos el Worker mira en githubstatus.com si funcionan **GitHub Pages**, que
sirve la web, y **GitHub Actions**, que publica cada guardado del CMS. También pide
`https://venialboconecta.es/` para ver si responde. Avisa al grupo de Telegram solo
cuando algo **cambia**: al caer (🟡 lento, 🟠 caída parcial, 🔴 caída total, con el
título del incidente), si empeora o mejora, y al volver (🟢, con cuánto ha durado).
Mientras dura, no repite. Está en `worker/src/vigilancia.js`.

- **La web** solo da aviso tras 2 fallos seguidos (10 minutos), para no saltar por un
  corte suelto. Esto detecta lo que githubstatus no sabe: el dominio, el DNS o el
  certificado.
- **El estado** de la vez anterior va en el KV `ESTADO`, aparte de `SUSCRIPCIONES`:
  el resumen cuenta todas las claves de ese KV como suscriptores y el envío push las
  recorre. Solo se escribe cuando cambia algo.
- **Si githubstatus no contesta**, esa vuelta no se compara nada. **Si Telegram
  falla**, no se guarda el estado y se vuelve a intentar a los 5 minutos.
- **Un solo cron** (`*/5 * * * *`) para todo, porque el plan gratuito da pocos por
  cuenta. Son 288 ejecuciones al día, muy lejos del límite.
- **Si cae Cloudflare**, cae también el Worker que avisa. Ese caso no está cubierto.

Para ver qué vería ahora, sin avisar ni guardar:

```bash
curl -H "Authorization: Bearer $(cat .secretos/token-avisos)" https://venialbo-avisos.venialboconecta.workers.dev/vigilancia
```

## Los comandos del bot

Escribiendo en el grupo de Telegram, el bot contesta. Está en `worker/src/comandos.js`.

Van en dos grupos: los que solo consultan y los que **hacen algo** (en el menú, al
final y con ⚡ delante; en `/ayuda`, en su propio apartado). Ahora el único que hace
algo es `/republicar`.

| Comando | Qué contesta |
|---|---|
| `/estado` | Si GitHub Pages, Actions y la web funcionan ahora |
| `/visitas` | El resumen de lo que va de semana |
| `/pendientes` | Lo que ha llegado por Tally y aún no está en el CMS, con botones «📥 Traer», y lo que está en el CMS oculto sin revisar, con un botón para abrir cada ficha |
| `/republicar` | Vuelve a lanzar la publicación de la web, para cuando ha fallado por algo pasajero |
| `/avisos` | Cuántos dispositivos tienen las push activadas |
| `/chatid` | El id del chat donde se escribe |
| `/ayuda` | La lista |

- **Seguridad**: el bot es público. Telegram manda en cada llamada la cabecera
  `X-Telegram-Bot-Api-Secret-Token`, que el Worker compara con `TELEGRAM_WEBHOOK_SECRET`
  (también en `.secretos/telegram-webhook-secret`), y solo se contesta en el chat de
  `TELEGRAM_CHAT_ID`. La excepción es `/chatid`, que solo dice el id de donde se escribe.
- **Los botones «📥 Traer»** lanzan la Action de traer al CMS, la misma del botón de
  Pages CMS, y avisan al grupo de quién lo ha pedido.
- **Con el webhook puesto, `getUpdates` deja de funcionar** (error 409). Para sacar un
  chat_id, `/chatid`.
- **Para configurarlo** (el webhook y el menú que sale al escribir `/`, solo en el
  grupo), desde una terminal propia, con el token del bot:

  ```bash
  read -rsp "Token: " TELEGRAM_TOKEN; echo; export TELEGRAM_TOKEN
  read -rp "Chat: " TELEGRAM_CHAT_ID; export TELEGRAM_CHAT_ID
  node avisos/telegram-config.mjs --dry      # lo que haría
  node avisos/telegram-config.mjs            # lo configura
  node avisos/telegram-config.mjs --quitar   # lo quita (vuelve getUpdates)
  ```

  Si se añade un comando, se vuelve a pasar el script para que salga en el menú.

## Traer al CMS sin pulsar nada

Cuando llega una alta de negocio o un anuncio por Tally, el Worker lanza la Action de
traerlo (`altas-negocio.yml` o `anuncios-tablon.yml`) antes de avisar, y el mensaje dice
que ya va de camino, oculto. Si GitHub no la acepta, el mensaje lo dice y lleva un botón
«📥 Traer al CMS» para reintentarlo. Lanzarla de más no duplica nada: trae solo lo
pendiente, y su `concurrency` evita que dos a la vez se pisen. Está en
`worker/src/github.js`.

Necesita `GITHUB_TOKEN` en el Worker: un token de grano fino de la organización
`pueblosconectados`, solo para `venialbo-conecta`, con **Actions: Read and write** (lanzar
los workflows) y **Contents: Read** (leer `tally/respuestas-importadas.json` para
`/pendientes`). `/pendientes` necesita además `TALLY_API_KEY`.

## Avisar si falla una Action

En la misma vuelta del cron (cada 5 minutos), el Worker mira las últimas ejecuciones de
los workflows del repositorio y avisa al grupo cuando uno falla («🔴 Ha fallado
«Publicar la web»», con el título del commit y lo que deja de pasar mientras tanto) y
cuando ese mismo workflow vuelve a salir bien («🟢 … vuelve a funcionar», con cuánto ha
durado). Mientras sigue fallando no repite. Está en `worker/src/publicaciones.js`.

- **Por qué desde aquí** y no con un paso `if: failure()` en cada workflow: no hay que
  llevar los secretos de Telegram a GitHub, y vale para cualquier workflow, también los
  que se añadan.
- **Las canceladas no cuentan**: las produce la `concurrency` cuando un guardado nuevo
  deja vieja la publicación anterior.
- **Si GitHub rechaza el token** (caducado o sin permisos), avisa una vez con el enlace
  para crear otro, y otra cuando vuelve a aceptarlo. Es el mismo `GITHUB_TOKEN` que trae
  solos los formularios, así que este aviso cubre las dos cosas.
- **El estado** va en el KV `ESTADO`, clave `publicaciones`. La primera vez no avisa de
  lo antiguo: empieza a mirar desde ese momento.
- **`/estado`** dice también qué workflows están fallando ahora, con un botón a cada uno.
- **«🔁 Reintentar»**: el aviso de fallo lleva este botón, que lanza el workflow de nuevo
  sobre `main` (como `/republicar` para la web). No repite la ejecución fallida, porque
  esa publicaría su commit, quizá ya viejo, y podría pisar uno más nuevo. Si el
  reintento también falla, se avisa otra vez («sigue fallando después de reintentarlo»);
  sin reintento de por medio, no se repite.

## Recordatorio de lo oculto sin revisar

Las altas y los anuncios que llegan por Tally entran en el CMS ocultos, y alguien tiene
que repasarlos. Cada día a las 10:00 (hora de Madrid), si alguno lleva más de 2 días
así, el Worker lo recuerda en el grupo, con un botón que abre cada ficha en Pages CMS.
Si no hay nada, no escribe. Está en `worker/src/revision.js`.

- **«Sin revisar»** es: oculta (`"activo": false`) y con el último commit todavía de
  `github-actions[bot]`, la Action que la trajo. Si alguien la abre en el CMS y la
  guarda, aunque la deje oculta, ya no sale: la ha ocultado a propósito. Las noticias y
  demás ocultas no se miran; son borradores de los admin.
- **Se lee con la API GraphQL de GitHub**: una llamada trae todas las fichas con su
  contenido y otra el último commit de las ocultas. Por REST sería una petición por
  fichero, y el plan gratuito de Workers da 50 por ejecución. Usa el `GITHUB_TOKEN`
  (*Contents: Read*).
