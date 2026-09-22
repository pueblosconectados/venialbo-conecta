# VenialboConecta — plan del proyecto

> Actualizado el 22 de septiembre de 2026. La versión anterior de este documento
> planificaba una app Android con backend propio; se conserva íntegra en la etiqueta
> `archivo-app-backend-2026-09`:
>
> ```bash
> git show archivo-app-backend-2026-09:planificacion-app-pueblo.md
> ```

## 1. Qué es y para quién

La web del pueblo de **Venialbo (Zamora)**, en **venialboconecta.es**: un sitio donde
cualquier vecino se entera de lo que pasa, encuentra un negocio o sabe cuándo pasa el
bibliobús, **sin registrarse ni instalar nada**.

Dos criterios mandan sobre todo lo demás:

- **Que lo pueda usar una persona de 70 años desde el móvil.** Nada de cuentas, ni apps,
  ni pasos de más. Si algo exige iniciar sesión para funcionar, se busca otra forma.
- **Que se mantenga solo.** Sin servidores que actualizar ni facturas que renovar: el
  proyecto tiene que poder estar meses sin que nadie lo toque y seguir funcionando.

## 2. Cómo está montado

| Pieza | Qué hace |
| --- | --- |
| React 19 + Vite + Ant Design 5 | La web |
| GitHub Pages | La sirve, con dominio propio |
| GitHub Actions | Compila y publica en cada cambio |
| Pages CMS | El editor de contenido, en el navegador |
| Tally | Los formularios que rellenan los vecinos |

No hay servidor, ni base de datos, ni usuarios. El contenido son ficheros JSON en el
repositorio; cada guardado en el CMS es un commit que dispara la publicación.

**Coste:** 0 € al año salvo el dominio.

## 3. Las secciones

| Sección | Qué contiene | Quién la rellena |
| --- | --- | --- |
| **Noticias** | Lo que pasa en el pueblo, por categorías, con imagen y PDF adjuntos | El CMS |
| **Negocios** | Directorio del comercio local: contacto, horario, redes | El CMS, con altas por formulario |
| **Servicios e instituciones** | Médico, comedor, bibliobús, asociaciones, Ayuntamiento | El CMS |
| **Tablón** | Anuncios vecinales, con caducidad | El CMS, con envíos por formulario |
| **Avisos de portada** | Una banda arriba para lo urgente, con caducidad obligatoria | El CMS |
| **Pueblos Conectados** | El proyecto del que forma parte | Fijo en el código |
| **Privacidad** | Qué datos se recogen y cómo pedir que se borren | Fijo en el código |

**Categorías de noticias (12):** Asociaciones, Avisos urgentes, Ayuntamiento, Cultura,
Curiosidades, Deportes, Fiestas, Infantil / Colegio, Medio Ambiente, Obras, Otras,
Religión.

## 4. El contenido, por dentro

Cada colección de `.pages.yml` es una carpeta de `web-static/content/` con un JSON por
entrada:

| Colección | Campos |
| --- | --- |
| `noticias` | titulo, fecha_publicacion, categoria, destacada, activa, imagen_url, contenido, documentos |
| `negocios` | nombre, categoria_negocio, descripcion, logo_url, direccion, telefono, telefono_movil, email, web_url, redes_sociales, horario, activo |
| `servicios` | nombre, tipo, descripcion, logo_url, direccion, telefono, email, web_url, redes_sociales, horario, informacion_adicional, activo |
| `anuncios` | titulo, tipo, descripcion, contacto, imagen_url, fecha_publicacion, fecha_caducidad, activo |
| `avisos` | titulo, nivel, noticia, fecha_caducidad, activo |
| `categorias` | nombre, icono, color |

Dos reglas que se repiten en todas: **`activo`/`activa`** oculta sin borrar, y
**`fecha_caducidad`** hace que el anuncio o el aviso desaparezca solo, también si se
entra por enlace directo.

## 5. Cómo llega algo a la web

1. **Lo que publicamos nosotros:** se escribe en el CMS y se guarda. En dos minutos está
   online.
2. **Lo que mandan los vecinos:** rellenan un formulario de Tally; llega un aviso por
   correo; desde el CMS un botón trae la ficha **oculta**; se repasa y se hace visible.
   **Nada se publica sin que lo lea una persona**, y las fotos se suben a mano después de
   mirarlas.

## 6. Qué está hecho

El proyecto nació como app Android con backend FastAPI y llegó a tener ocho fases
completadas. En septiembre de 2026 el producto pasó a ser la web estática, porque cumple
los dos criterios del punto 1 mucho mejor: sin instalación para el vecino y sin
servidores que mantener.

Sobre la web, a 22 de septiembre de 2026:

- Noticias con categorías, filtro, paginación, imágenes ampliables y PDF adjuntos.
- Directorios de negocios y de servicios e instituciones.
- Tablón de anuncios con caducidad y banda de avisos en portada.
- Tres formularios (contacto, tablón, alta de negocios) creados y mantenidos por API,
  con su aviso de privacidad, y dos botones en el CMS para traer lo que llega.
- Dominio propio, sin analítica ni cookies de seguimiento.
- Imágenes y JavaScript optimizados: el listado de Noticias pasó de 1.692 KB a 129 KB de
  fotos en un móvil, y el JavaScript de 455 KB a 339 KB.

El detalle de cada decisión, con su porqué, está en `MEJORAS.md` (local, no se sube).

## 7. Qué podría venir

Nada de esto está comprometido; son las ideas que quedaron sobre la mesa.

| Idea | Estado |
| --- | --- |
| Información turística y rutas, con códigos QR | Estaba planificada para la app; en la web sería una sección más |
| Encuestas vecinales | Necesita recoger respuestas: iría por Tally, como los formularios |
| Sección Senior, webcam de eventos, coche compartido | Ideas antiguas, sin decidir |
| Prerender: pintar el HTML al compilar | Es lo único que quitaría la espera en blanco inicial. Cambio de arquitectura |
| Aligerar Ant Design | Es el 70% del JavaScript. Hay que medir antes de tocar |

## 8. Dónde está lo demás

- **`MEJORAS.md`** — el backlog, cerrado, con el motivo de cada decisión y las trampas
  encontradas por el camino. Local, no se sube.
- **`PRESENTACION.md`** — chuleta técnica para explicar el proyecto. Local.
- **`tally/README.md`** — cómo se crean y mantienen los formularios.
- **`assets-src/README.md`** — cómo se regeneran los logos y el favicon.
- **Etiqueta `archivo-app-backend-2026-09`** — la app Android, el backend FastAPI y el
  frontend con Refine, completos y con su historial.
