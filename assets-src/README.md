# assets-src — originales de los que salen los iconos de la web

Los ficheros de `web-static/public/` están **generados**. Aquí viven los
originales y el script que los produce, para poder rehacerlos sin partir de cero.

| Original | Genera en `web-static/public/` |
|---|---|
| `Venialbo_Conecta.jpeg` (1254×1254) | `venialbo-conecta.webp` (logo de la portada), `favicon.png` y `apple-touch-icon.png` (solo el icono: la casa, el wifi y el puente, sin las letras) |
| `Puente.png` (639×298, ya transparente) | `puente.webp` (al lado del nombre en la cabecera) |
| `Logo_Pueblos.jpeg` (827×827) | nada. Era el favicon hasta que se cambió por el icono de Venialbo; se guarda por si hace falta volver |
| `Logo_Pueblos_conectados.jpeg` (1254×1254) | `pueblos-conectados.webp` (lockup entero, cabecera de su página) y `pueblos-conectados-icono.webp` (solo el icono, tarjeta de la portada) |

Los originales son JPEG con fondo blanco; el script lo recorta, lo vuelve
transparente y escala a los tamaños que toca. No edites a mano lo que hay en
`public/`: se sobrescribe en la siguiente ejecución.

## Regenerar

Pillow no está instalado en el sistema (ni ImageMagick, ni nada equivalente),
así que hace falta un venv propio:

```bash
cd assets-src/
python3 -m venv .venv-assets
.venv-assets/bin/pip install Pillow
.venv-assets/bin/python generar-assets.py
```

Si sustituyes un original, recalcula su recorte con `medir_bbox()` del script y
actualiza la constante `BBOX_*` correspondiente.

## Notas

- **El puente del logo queda calado.** En el original está dibujado con
  contornos dorados y la piedra rellena de blanco; al quitar el fondo, ese
  relleno se va con él. Sobre la tarjeta blanca de la portada no se nota, pero
  sobre un fondo de color el fondo se verá a través de las piedras. El favicon
  sí lo recupera, con `rellenar_interior()`: pinta de blanco opaco el hueco que
  el dibujo deja encerrado, porque a 32 px y en una pestaña de tema oscuro el
  puente calado se convertía en un borrón. Los arcos siguen calados, que es lo
  suyo. El logo de la portada se deja como está.
- **El logo no se puede vectorizar automáticamente.** Se intentó con vtracer:
  salen 1,5 MB y ~1500 trazados, porque los degradados y la textura del puente
  no son formas geométricas. Si algún día hace falta un SVG de verdad, hay que
  redibujarlo a mano.
- **WebP con transparencia** no funciona en Safari anterior a 14 (2020). Si eso
  llega a importar, hay que envolver la imagen de la portada en un `<picture>`
  con un PNG de respaldo.
