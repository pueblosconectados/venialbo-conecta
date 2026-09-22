# tally — los formularios, definidos aquí y creados con su API

Los tres formularios del backlog (contacto, tablón y alta de negocios) se definen en
`formularios/*.json` y se crean o actualizan en Tally con `crear-formularios.mjs`.

La gracia de hacerlo así y no a mano: el formulario de alta de negocios tiene catorce
campos que deben cuadrar con lo que pide el CMS. Si mañana Negocios gana un campo, se
añade al JSON, se pasa el script y el formulario queda actualizado — sin volver a
pinchar por la interfaz ni acordarse de qué había.

## Uso

```bash
node tally/crear-formularios.mjs --dry        # enseña el JSON que se enviaría
node tally/crear-formularios.mjs              # crea (o actualiza) los tres, en borrador
node tally/crear-formularios.mjs contacto     # solo uno
node tally/crear-formularios.mjs --publicar   # publicados en vez de borrador
```

La segunda ejecución **actualiza** en vez de duplicar, porque `formularios-creados.json`
guarda el identificador que devolvió Tally. Ese fichero sí se commitea: los
identificadores no son secretos y son lo que enlaza cada definición con su formulario.

## Pasar las respuestas al CMS

`importar-negocios.mjs` convierte las respuestas del formulario de alta de negocios en
fichas de `web-static/content/negocios/`:

```bash
node tally/importar-negocios.mjs                 # lista lo que hay sin importar
node tally/importar-negocios.mjs WJdlvAa         # escribe el borrador de esa respuesta
node tally/importar-negocios.mjs --todas         # todas las que falten
node tally/importar-negocios.mjs WJdlvAa --forzar  # reescribe una ficha que ya existía
```

La ficha se escribe **con `"activo": false`**, así que no sale en la web hasta que
alguien la repase en el CMS y marque *Visible en la web*. Esa revisión es el punto de
todo esto: lo manda un vecino, y alguien tiene que leerlo antes de publicarlo con su
teléfono.

Se puede lanzar **sin terminal**, desde el botón *Traer las altas de negocio* de la
barra lateral del CMS, que dispara `.github/workflows/altas-negocio.yml`. El workflow
hace lo mismo y commitea las fichas, así que a los pocos segundos aparecen en la lista
de Negocios, ocultas. Necesita el secreto `TALLY_API_KEY` en el repositorio (Settings →
Secrets and variables → Actions).

Detalles que conviene conocer:

- **La foto no se descarga, a propósito.** Un binario que manda un desconocido, una vez
  commiteado, se queda en el historial de git para siempre: quitarlo obliga a reescribir
  la historia con `push --force` sobre una rama donde el CMS commitea por su cuenta. El
  script deja el enlace, alguien la mira, y si vale se sube desde el CMS.
- **Este repositorio es público, y los registros de Actions también.** Por eso el script
  tiene modo discreto (`--discreto`, automático con `CI=true`): ahí no imprime ni quién
  manda la ficha ni el enlace de la foto, que va firmado y la abre a cualquiera que lo
  lea. En local sí los enseña, que es donde se necesitan.
- **"Quién nos lo manda" no se escribe en la ficha.** El aviso de privacidad dice que eso
  no se publica, así que se enseña por pantalla y ahí se queda.
- **Avisa si el negocio no dejó ninguna forma de contacto**, que para un directorio es la
  ficha que no sirve para nada.
- **No pisa fichas que ya existan** salvo con `--forzar`, por si el nombre coincide con
  uno del directorio.
- `respuestas-importadas.json` lleva la cuenta de lo ya pasado, para no duplicar en la
  siguiente ejecución. Se commitea.
- El mapeo de campos va por la **etiqueta** de la pregunta, que sale de
  `formularios/alta-negocio.json`. Si allí se renombra una etiqueta, el script avisa de
  que esa pregunta no tiene sitio en la ficha en vez de perder el dato en silencio.

## La clave de API

**Nunca va en el repositorio.** El script la busca en este orden:

1. La variable de entorno `TALLY_API_KEY`.
2. El fichero que indique `TALLY_API_KEY_FILE`.
3. `~/.config/tally/api-key`.

Para dejarla en el sitio por defecto, desde una terminal de WSL:

```bash
mkdir -p ~/.config/tally
printf '%s' 'la-clave' > ~/.config/tally/api-key
chmod 600 ~/.config/tally/api-key
```

O, si se prefiere tenerla dentro del proyecto, en `.secretos/`, que está en
`.gitignore` justamente para esto:

```bash
TALLY_API_KEY_FILE=.secretos/tally-api-key node tally/crear-formularios.mjs
```

Dos avisos sobre esa clave, sacados de la documentación de Tally:

- **No tiene permisos limitados.** Va ligada a tu usuario y hereda sus permisos: con
  ella se puede crear, cambiar y **borrar** cualquier cosa de la cuenta. No hay modo
  solo-lectura ni permisos por formulario.
- **No se puede volver a ver** después de crearla, así que si se pierde hay que generar
  otra. Lo razonable es revocarla cuando ya no haga falta.

## El tema: colores, logo e idioma

`tema.json` tiene los colores, el logo y el idioma que comparten los tres formularios, y
el script los manda en cada ejecución. El idioma (`"idioma": "es"`, que viaja como
`settings.language`) cambia los textos que pone Tally por su cuenta: el botón de enviar,
los avisos de campo obligatorio y la pantalla de agradecimiento. **Ese fichero no se escribe a mano.** Es el objeto que
genera el propio editor de Tally al personalizar un formulario, leído después por la
API:

```bash
curl -sS -H "Authorization: Bearer $TALLY_API_KEY"   https://api.tally.so/forms/<id> | python3 -m json.tool | less   # settings.styles
```

El motivo de tanta ceremonia: `settings.styles` no está documentado (el OpenAPI de Tally
dice que es una cadena y en realidad es un objeto) y **se guarda sin validar ninguna
clave**. Con nombres inventados el formulario se guarda tan ricamente y luego la página
pública **se rompe** con un "Oops, something is off!". Así que para cambiar colores:
tocarlo en el panel de Tally, volver a leerlo por API y actualizar `tema.json`.

El logo no va en `settings`, sino en el `payload` del bloque `FORM_TITLE`, como una URL
de `storage.tally.so`. Se sube una vez desde el panel y luego se reutiliza esa misma URL
en los demás formularios.

## Publicar

Al publicar hay que mandar **los bloques y el estado en la misma llamada**. Si el
formulario se creó en borrador y luego se publica con un PATCH de solo estado, los
bloques se quedan como borrador (`hasDraftBlocks: true`) y la página pública devuelve un
500. El script siempre manda el cuerpo entero, así que `--publicar` lo hace bien; el
aviso es por si algún día se toca a mano con curl.

Ojo con lo contrario: lanzar el script **sin** `--publicar` sobre un formulario ya
publicado lo devuelve a borrador.

## El logo de los formularios

`logo-venialbo-conecta.png` y `logo-venialbo-conecta-relleno.png` (600×578, PNG con
transparencia) salen del original `assets-src/Venialbo_Conecta.jpeg`, del mismo sitio
que el logo de la portada, y se regeneran con `assets-src/generar-assets.py`. Se suben
a mano desde el panel de personalización de Tally.

La diferencia entre los dos es la piedra del puente: en el normal queda calada y se ve
el fondo a través, que es lo que conviene sobre el crema del tema; el `-relleno` la
lleva en blanco opaco, para un fondo oscuro o de color.

## Campos

Cada definición es una lista de campos con un tipo nuestro, que el script traduce al
bloque de Tally correspondiente:

| tipo | bloque de Tally |
|---|---|
| `texto` | `INPUT_TEXT` |
| `email` | `INPUT_EMAIL` |
| `telefono` | `INPUT_PHONE_NUMBER` |
| `enlace` | `INPUT_LINK` |
| `parrafo` | `TEXTAREA` |
| `archivo` | `FILE_UPLOAD` |
| `desplegable` | varios `DROPDOWN_OPTION` con el mismo `groupUuid` |

Un campo de tipo `archivo` puede llevar `restricciones`: formatos admitidos, tamaño
máximo y cuántos archivos. Se copian tal cual de lo que escribe el editor de Tally
—igual que el tema— y se llaman así, y no `opciones`, porque eso ya son las opciones de
un desplegable. Hoy: `.jpg`, `.jpeg` y `.png`, 8 MB, y hasta 4 fotos en el tablón.

*Se quitó el `.svg` el 2026-09-22. No era peligroso tal como se usa —la web pinta los
logos con `<img>`, donde un SVG no ejecuta nada—, pero sí lo sería si alguien abriera el
fichero suelto en el navegador. Y no se admite PDF: la web no puede enseñarlo como logo,
así que solo serviría para recibir algo que hay que convertir igualmente.*

Los `uuid` de los bloques no son aleatorios: se derivan del nombre del formulario y de
la clave del campo (uuid v5). Así la segunda ejecución manda los mismos identificadores
y Tally entiende que son las mismas preguntas, en vez de verlas como nuevas y perder el
hilo con las respuestas ya recibidas. Por eso **la `clave` de un campo no se cambia** a
la ligera: cambiarla equivale a borrar la pregunta y crear otra.

## Lo que esto no resuelve

- El **aviso de privacidad** enlazado desde los formularios sigue pendiente.
- El flujo sigue siendo *vecino envía → lo publicamos nosotros en el CMS*. Tally tiene
  webhooks, pero para recibirlos hace falta algo que escuche y la web es estática.
