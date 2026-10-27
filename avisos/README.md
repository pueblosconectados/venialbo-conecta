# avisos — las notificaciones push de la web

El plan completo está en `NOTIFICACIONES.md` (local, gitignoreado). Aquí vive lo que
hace falta fuera de la web estática:

- `worker/` — el Cloudflare Worker que guarda las suscripciones (fase 2).
- `enviar.mjs` — el envío automático, que lanza `.github/workflows/avisos.yml` (fase 3).
- `erratas.mjs` — la revisión de ortografía de lo guardado en el CMS, que lanza
  `.github/workflows/erratas.yml` y manda las posibles faltas al grupo de Telegram.
  Las palabras que no debe señalar van en `erratas-palabras.txt`. Para probar:
  `node avisos/erratas.mjs --todo --dry` (todo el contenido) o
  `node avisos/erratas.mjs <desde> <hasta> --dry` (lo cambiado entre dos commits).
- `aviso-a-mano.mjs` — un aviso suelto a todos los suscritos, con confirmación:
  `node avisos/aviso-a-mano.mjs "Título" "Texto" [/ruta] [--urgente]`. Desde el grupo de
  Telegram es `/avisar` (ver más abajo).

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
| `POST /envios` | La Action, con el token | Apunta un envío push y a qué dispositivos lo aceptó el servicio de push (ver «Si los avisos llegan») |
| `POST /erratas` | La Action, con el token | Manda al grupo las posibles faltas de lo último guardado (ver `erratas.mjs`). Los botones solo pueden llevar al CMS |
| `POST /recibido` | El service worker de la web | Dice que un aviso ha llegado al móvil, o que lo han tocado |

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

## Si los avisos llegan

El servicio de push (Google, Apple…) solo dice que ha **aceptado** el aviso. Lo que pasa
después en el móvil no se sabía: Android aplaza los de prioridad normal mientras el
móvil está en reposo, algunos fabricantes matan Chrome para ahorrar batería y hay quien
tiene las notificaciones bloqueadas. Ahora se mide. Está en `worker/src/entregas.js`.

- **Cómo**: cada envío lleva un `id` (`entregas.mjs`, lo usan `enviar.mjs` y
  `aviso-a-mano.mjs`). Antes de mandar, la Action lo apunta en el Worker (`POST /envios`)
  y al terminar dice a qué dispositivos lo aceptó el servicio de push. El service
  worker de la web (`web-static/public/sw.js`) llama a `POST /recibido` al recibirlo y
  al tocarlo. Las horas son todas del Worker, no del móvil.
- **`/avisos`** en el grupo enseña los últimos 5: a cuántos llegó de los aceptados,
  cuánto tardó (la mitad, 9 de cada 10 y el último) y cuántos lo abrieron. También
  cuántos dispositivos no han recibido **ninguno** de sus últimos 3 o más.
- **Cómo leerlo**: si los de prioridad normal tardan horas y los urgentes no, es Android
  aplazándolos. Si un dispositivo no recibe nada nunca, es ese móvil (notificaciones
  bloqueadas, ahorro de batería, Chrome desinstalado sin darse de baja). Mientras no
  pasen 12 horas (el TTL), lo que falta aún puede llegar.
- **Los primeros días cuenta de menos**: cada móvil tiene que actualizar su service
  worker, y lo hace al entrar en la web o, como mucho, tras recibir un aviso si hace más
  de 24 h que no lo mira.
- **En D1** (`ENTREGAS`, base `venialbo-entregas`), no en KV: KV da 1000 escrituras al
  día en el plan gratuito y no vale para contar desde muchos móviles a la vez. Las
  tablas están en `worker/entregas.sql`. Se borra lo de más de 90 días cada día a las
  10:00.
- **Privacidad**: el dispositivo es el sha256 de su suscripción, la misma clave que ya
  tiene en `SUSCRIPCIONES`; no se guarda nada más. Solo cuentan los dispositivos que
  la Action dio por aceptados, así que un `/recibido` inventado no suma.

Cómo se creó (una vez):

```bash
cd avisos/worker
npx wrangler d1 create venialbo-entregas            # copia el id a wrangler.toml
npx wrangler d1 execute ENTREGAS --remote --file entregas.sql
npm run deploy
```

En local, `npx wrangler d1 execute ENTREGAS --local --file entregas.sql` antes de
`npm run dev`.

## El texto para difundir por WhatsApp y Facebook

Cuando `enviar.mjs` avisa de algo nuevo, al grupo de los admin le llega un mensaje por
novedad con el texto listo para compartir (`difusion.mjs`, que pasa por `POST /difundir`
del Worker, `worker/src/difusion.js`):

- **«📲 Enviar por WhatsApp»** abre WhatsApp (`wa.me/?text=`) con el texto ya escrito: el
  título en negrita, la fecha si es una actividad, dos líneas y el enlace, que saca la
  vista previa con foto (`paginas-compartir.mjs`).
- **«📋 Copiar para Facebook»** copia la versión sin marcas y con `#Venialbo #Zamora`. Va
  en un botón `copy_text` de Telegram, que admite 256 caracteres: se recorta el resumen
  (y si no basta, el título).

Va a la vez que el push, con su mismo horario (de 22:00 a 9:00 espera), pero uno por
novedad aunque el push las junte. Si falla, el push ya está mandado y apuntado: no se
repite. Para sacarlo a mano de algo ya publicado:

```bash
node avisos/difusion.mjs noticias/<id> [actividades/<id>…] [--dry]
```

## «Esta semana en Venialbo»

Los viernes a las 10:00 llega al grupo un resumen para reenviar al grupo del pueblo, con
«📲 Enviar por WhatsApp» (`wa.me` con el texto escrito). `/semana` lo enseña cuando se
quiera. Está en `worker/src/semana.js` y sale de lo publicado (`data/*.json`, sin token):

- **Agenda** de los próximos 7 días, de viernes a jueves (el viernes siguiente ya va en
  el siguiente resumen): cada día que caen las actividades que se repiten, las de varios
  días una vez («Hasta el mar 10» si ya habían empezado), y las fechas señaladas (las
  anuales, cada año).
- **Avisos** de portada vigentes, y **fotos** de lo celebrado esta semana.
- **Noticias, tablón y casas** publicados en los últimos 7 días.

Sin un enlace por cosa (WhatsApp solo saca la vista previa del primero): uno por
apartado. Si la dirección de `wa.me` pasa de 4.000 caracteres, no lleva el botón y dice
que se copie el mensaje. Si no hay nada, no escribe.

```bash
curl -H "Authorization: Bearer $(cat .secretos/token-avisos)" https://venialbo-avisos.venialboconecta.workers.dev/semana
# …/semana?enviar lo manda al grupo
```

## Avisar desde Telegram (`/avisar`)

Para lo urgente (un corte de agua, una calle cortada), sin abrir el ordenador:

```
/avisar Corte de agua | Mañana de 9 a 14 no habrá agua en la calle Mayor
/avisar Corte de agua | Mañana… | /tablon/2026-10-28-corte-de-agua
```

También vale el título en la primera línea y el texto en la siguiente. La tercera parte
es la página que abre al tocarlo (de la web; sin ella, la portada). Título hasta 60
caracteres y texto hasta 200: en el móvil no se ve más.

- El bot enseña cómo llegará y a cuántos, con «✅ Enviar a N» y «❌ Cancelar». El borrador
  vale una hora (KV `ESTADO`, `aviso:<id>`) y se borra al pulsar: dos toques no mandan
  dos avisos.
- «Enviar» lanza `.github/workflows/aviso.yml`, que lo manda con `aviso-a-mano.mjs
  --urgente --si --contar` y al terminar llama a `POST /aviso-enviado` para decir en el
  grupo a cuántos ha llegado. El Worker no tiene la clave privada de las push: la tiene
  la Action (`VAPID_PRIVADA`), como en los avisos automáticos.
- Los inputs del workflow son el texto del aviso, que va a todo el pueblo: no hay nada
  que esconder en la página pública de la ejecución. Entran por variables de entorno.
- Si la Action falla, avisa `publicaciones.js`, sin «Reintentar»: se vuelve a escribir
  `/avisar`.
- Está en `worker/src/avisar.js`.

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
| `/caducan` | Los anuncios y avisos que desaparecen de la web en los próximos 7 días, con un botón para cambiar su fecha en el CMS |
| `/cambios` | Los últimos 5 guardados en el CMS: qué ficha, quién y cuándo (➕ creado, ✏️ cambiado, 🗑 borrado) |
| `/buscar <texto>` | Busca en todo lo que se ve en la web: el teléfono de un negocio, el contacto de un anuncio… con botones a la ficha en la web y en el CMS |
| `/avisar Título \| Texto` | Un aviso push a todos los móviles, para lo urgente. Enseña cómo llegará y pide confirmación (ver *Avisar desde Telegram*) |
| `/republicar` | Vuelve a lanzar la publicación de la web, para cuando ha fallado por algo pasajero |
| `/avisos` | Cuántos dispositivos tienen las push activadas, y si les llegaron los últimos 5 avisos y cuánto tardaron |
| `/semana` | «Esta semana en Venialbo», el resumen para reenviar al grupo del pueblo, con el botón de WhatsApp |
| `/repaso` | Las fichas sin revisar desde hace 6 meses, las cojas y los enlaces rotos, con botones para darlas por buenas |
| `/renovaciones` | Cuándo caducan el token de GitHub, el de Cloudflare y lo apuntado a mano (el dominio), con botón para renovar lo que está cerca |
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
traerlo (`altas-negocio.yml`, `anuncios-tablon.yml` o `casas.yml`) antes de avisar, y el mensaje dice
que ya va de camino, oculto. Si GitHub no la acepta, el mensaje lo dice y lleva un botón
«📥 Traer al CMS» para reintentarlo. Lanzarla de más no duplica nada: trae solo lo
pendiente, y su `concurrency` evita que dos a la vez se pisen. Está en
`worker/src/github.js`.

Necesita `GITHUB_TOKEN` en el Worker: un token de grano fino de la organización
`pueblosconectados`, solo para `venialbo-conecta`, con **Actions: Read and write** (lanzar
los workflows) y **Contents: Read** (leer `tally/respuestas-importadas.json` para
`/pendientes`). `/pendientes` necesita además `TALLY_API_KEY`.

## Publicar, descartar y subir las fotos desde Telegram

El aviso de lo que llega por Tally (altas, anuncios y casas) lleva «✅ Publicar» y
«🗑 Descartar», y si trae fotos, el Worker las manda al grupo como álbum debajo, con
«📷 Subir estas fotos» y «🚫 No subirlas». El recordatorio de lo oculto y `/pendientes`
llevan también publicar y descartar. Está en `worker/src/fichas.js`; el detalle, en
`tally/README.md` (*Desde Telegram*).

- Cada botón lanza `ficha-tally.yml` con `{ accion, formulario, respuesta }`, y la Action
  cuenta al terminar lo que ha hecho en `POST /fichas`. Si falla, avisa
  `publicaciones.js`, sin «Reintentar» (necesita sus inputs).
- Las fotos se bajan de Tally en el Worker y se suben a Telegram como archivo
  (`sendMediaGroup`, multipart): la dirección firmada no sale de aquí. Se apunta en el
  KV `ESTADO`, clave `fotos:<respuesta>` (90 días), qué mensajes son el álbum, para que
  «No subirlas» pueda borrarlo.
- Lo que hay en los botones es `<acción>:<letra del formulario>:<id de la respuesta>`;
  la ficha la busca la Action en `tally/fichas-importadas.json`. El recordatorio lo lee
  por la API para saber qué ficha es de qué respuesta (`leerFichasTally`).

### La vista previa

El aviso de Tally, el resultado de subir fotos (si la ficha sigue oculta) y el
recordatorio de lo oculto llevan «👀 Ver cómo queda», a `/borrador/<clave>` en la web:
la ficha pintada como se verá al publicarla. La clave es un HMAC con `BORRADORES_CLAVE`,
el mismo que hace la build (`web-static/scripts/build-content.mjs`), de
`tally:<respuesta>` si se sabe de qué respuesta de Tally salió la ficha (así hay enlace
desde el primer aviso, antes de que la ficha exista) o si no de `ficha:<carpeta>/<id>`.
Está en `enlaceBorrador` (`worker/src/fichas.js`). Funciona en cuanto la Action trae la
ficha y se publica la web, unos minutos después del aviso.

```bash
npx wrangler secret put BORRADORES_CLAVE < ../../.secretos/borradores-clave
```

La misma clave va como secreto `BORRADORES_CLAVE` del repositorio en GitHub, para la
build. **Si se cambia**, cambian todos los enlaces de vista previa (los viejos dejan de
ir); no se pierde nada más.

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

## Lo que caduca

Los anuncios del tablón y los avisos desaparecen solos de la web al pasar su fecha de
caducidad. `/caducan` lista lo que se va en los próximos 7 días, y cada día a las 10:00
el Worker avisa en el grupo de lo que se ve **por última vez mañana**, para que dé
tiempo a renovarlo. Cada uno lleva un botón a su pantalla de edición en el CMS. Si no
hay nada, no escribe. Está en `worker/src/caducidad.js`.

- **Los datos** salen de la web publicada (`data/anuncios.json` y `data/avisos.json`),
  que ya lleva la fecha calculada, también la de los anuncios de vecinos sin fecha (30
  días, `caducidadDe` en `build-content.mjs`). No hace falta token.
- **La fecha es el último día que se ve**: `haCaducado` (en `web-static/src/datos.ts`)
  lo deja hasta las 23:59 de ese día.

## El repaso del contenido

Para que el contenido no envejezca. El primer lunes de cada mes a las 10:00 el Worker
manda al grupo dos listas, si tienen algo, y `/repaso` las enseña cuando se quiera,
junto con los enlaces rotos. Está en `worker/src/repaso.js`.

- **Fichas sin revisar**: negocios y servicios que nadie ha guardado en 6 meses (por el
  último commit del fichero, con GraphQL como `revision.js`). Son los que tienen
  teléfonos y horarios. «✅ Sigue igual» la da por revisada otros 6 meses sin hacer un
  commit: se apunta en el KV `ESTADO`, clave `repaso`.
- **Fichas cojas**: publicadas pero sin algo que deberían tener (`FALTAS` en
  `repaso.js`): negocios sin foto, teléfono, dirección, horario o descripción; servicios
  sin foto, sin ninguna forma de contacto o sin descripción (no se les pide horario ni
  dirección: el bibliobús no tiene); lugares sin foto, coordenadas o texto; rutas sin
  foto, punto de salida, GPX ni Wikiloc, duración o descripción; actividades sin foto o
  texto, o celebradas hace entre 3 y 45 días sin fotos ni vídeo (las que se repiten, no);
  noticias de los últimos 30 días sin foto. «👌 Así está bien» la quita mientras le falte
  lo mismo; si le falta otra cosa, vuelve a salir.
- **Los botones** llevan una huella de la ruta del fichero (la ruta entera no cabe en
  los 64 bytes de `callback_data`) y el Worker vuelve a leer las fichas para saber cuál
  es. Quien lo pulsa queda dicho en el grupo.

## Los enlaces rotos

Cada lunes a las 6:23 UTC la Action `enlaces.yml` comprueba los enlaces de lo que se ve
en la web (`avisos/enlaces.mjs`; en local, `node avisos/enlaces.mjs --dry`) y manda los
que fallan a `POST /enlaces`. El Worker avisa al grupo de los que fallan **dos semanas
seguidas**, con un botón a cada ficha en el CMS, y una vez más cuando dejan de fallar.
Está en `worker/src/enlaces.js`; el estado, en el KV `ESTADO`, clave `enlaces`.

- **Qué se mira**: las direcciones de los campos y las de dentro del texto, de las
  fichas visibles y sin caducar; los archivos propios (`/media/…`), que estén en el repo
  (`git ls-files`, sin bajar las imágenes); y los vídeos de YouTube por su oEmbed, porque
  la página de un vídeo borrado da 200 igual.
- **Qué no** (comprobado el 2026-10-27): Facebook contesta 400 a cualquier robot,
  Instagram 200 a todo (la pantalla de entrar) y Wikiloc tiene la protección de
  Cloudflare. Se saltan, igual que cualquier web que pida el «Just a moment…».
- **Las redirecciones se siguen a mano, guardando las cookies**: la sede electrónica
  (`venialbo.sedelectronica.es`) entra en bucle sin ellas.
- Con el contenido de hoy: 175 enlaces, 145 bien, 30 sin poder comprobar, en 7 s.

## Lo que hay que renovar

Cada día a las 10:00 el Worker mira cuándo caducan sus tokens y avisa en el grupo
cuando a uno le quedan **15 días** y otra vez cuando le quedan **3**, con lo que hay que
hacer y un botón a donde se renueva. Cuando la fecha cambia (se ha renovado), lo dice
una vez. `/renovaciones` lo lista todo. Está en `worker/src/renovaciones.js`.

- **GitHub** da la caducidad del token de grano fino en la cabecera
  `github-authentication-token-expiration` de cualquier respuesta; sin cabecera, no
  caduca. Antes solo se sabía cuando ya lo rechazaba (eso lo sigue avisando
  `publicaciones.js`), y para entonces la importación de Tally ya había dejado de ir.
- **Cloudflare** la da en `expires_on` de `/user/tokens/verify`. El
  `CF_ANALYTICS_TOKEN` de ahora no caduca, pero si se cambia por uno que sí, se verá.
- **Lo demás, a mano**: la variable `RENOVACIONES` de `wrangler.toml`, una lista JSON
  `[{ "nombre", "fecha": "AAAA-MM-DD", "enlace" }]`. Es para el dominio (los `.es` no
  tienen RDAP, no se puede preguntar). Al renovar, se cambia la fecha y se despliega.
- **El estado** va en el KV `ESTADO`, clave `renovaciones`: el último umbral avisado
  para cada fecha, para no repetir.

## Los últimos cambios

`/cambios` lista los últimos 5 guardados en el CMS, para coordinarse y no pisarse. Sale
de los commits de `main` que hace Pages CMS, que llevan el nombre de quien edita y un
mensaje `Create|Update|Delete <ruta> (via Pages CMS)`. Está en `worker/src/cambios.js`.

- **Se juntan los guardados seguidos de la misma ficha**, aunque sean de varias personas
  («MJ-Venialbo y David Hernando»), y las tandas de fotos de una misma persona («4
  archivos subidos»). Manda la acción más nueva: si se borró, sale como borrada; si se
  creó y luego se cambió, como creada.
- **El título** es el actual de la ficha (una consulta GraphQL para todas); si ya no
  existe, sale del nombre del fichero.
- Los commits de las Actions y los de código no cuentan.

## Buscar

`/buscar <texto>` busca en los listados que publica la web (`data/<recurso>.json`:
negocios, servicios, tablón, noticias, actividades, lugares, rutas y avisos), así que
encuentra lo mismo que vería un vecino: lo oculto y lo caducado no sale. No hace falta
token. Está en `worker/src/buscar.js`.

- Sin distinguir mayúsculas ni tildes, y **por el principio de las palabras**: «toca»
  encuentra «Bar El Toca» y «tocar», pero no algo que lo lleve en medio. Con varias
  palabras, tienen que estar todas. Primero las que coinciden en el título.
- De cada resultado enseña lo útil: teléfonos y correo de negocios y servicios, el
  contacto de los anuncios, la fecha de las actividades, y la de publicación de anuncios
  y noticias (para distinguir los que se llaman igual). Hasta 5, con botones a la web y
  al CMS.
