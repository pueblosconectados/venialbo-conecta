# web-static — VenialboConecta en GitHub Pages

Web pública del pueblo, sin backend. El contenido vive en el repo y se edita con
[Pages CMS](https://app.pagescms.org).

```
content/<recurso>/<slug>.json   ← lo que edita Pages CMS (configurado en /.pages.yml)
public/media/imagenes/          ← imágenes subidas desde Pages CMS
scripts/build-content.mjs       → genera public/data/ (no versionado) al compilar
```

## Editar contenido

1. Entrar en https://app.pagescms.org con la cuenta de GitHub y abrir el repo `venialbo-conecta` (rama `main`).
2. Crear o editar noticias, negocios, servicios, anuncios o categorías y pulsar **Save**.
3. Cada guardado es un commit en `main`; la GitHub Action `web-static-pages.yml` compila
   y publica la web en 1-2 minutos (pestaña **Actions** del repo para ver el progreso).

Para ocultar algo sin borrarlo, desmarcar **Visible en la web**. Los anuncios desaparecen
solos pasada su fecha de caducidad.

## Desarrollo local

```bash
npm install
npm run dev                    # regenera public/data y arranca Vite
npm run build && npm run preview   # http://localhost:4173/
```

La ruta base es `/`, porque la web se publica en el dominio propio https://venialboconecta.es
(el fichero `public/CNAME` mantiene el dominio en cada despliegue).
Para publicar en la subruta de GitHub Pages: `BASE_PATH=/venialbo-conecta/ npm run build`.
