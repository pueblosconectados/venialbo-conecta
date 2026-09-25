"""Genera los assets de web-static/public a partir de los JPEG de esta carpeta.

Quita el fondo blanco de los originales y produce:

    favicon.png           32x32, transparente, solo el icono de Venialbo
    apple-touch-icon.png  180x180, opaco (iOS ignora el alfa)
    venialbo-conecta.webp logo de la portada, resolucion completa
    puente.webp           solo el puente, para la cabecera

Y, fuera de public/, en tally/:

    logo-venialbo-conecta.png         el logo entero, para usos varios
    logo-venialbo-conecta-circulo.png el icono para los formularios de Tally

Uso (necesita Pillow, que no esta instalado en el sistema):

    python3 -m venv .venv-assets
    .venv-assets/bin/pip install Pillow
    .venv-assets/bin/python generar-assets.py
"""

import math
from collections import deque
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
PUB = AQUI.parent / "web-static" / "public"

# Contenido real de cada original, medido ignorando el ruido del JPEG. Si se
# cambia un original hay que volver a medirlo (ver medir_bbox() al final).
BBOX_ICONO = (97, 126, 733, 685)  # Logo_Pueblos.jpeg, 827x827 (ya no se usa)
BBOX_LOGO = (49, 79, 1210, 1197)  # Venialbo_Conecta.jpeg, 1254x1254
# Del mismo original, solo la parte de arriba: la casa, el wifi y el puente,
# sin "VENIALBO CONECTA". El texto empieza en y=825, y entre medias hay una
# franja en blanco de 22 filas que marca el corte.
BBOX_LOGO_ICONO = (155, 79, 1107, 803)
# Solo el puente, para la cabecera de la web. En el recorte asoman la esquina de
# la casa (arriba a la izquierda) y el borde del punto del wifi (arriba); se
# quitan con quitar_conectado() desde un punto de cada uno, relativo al recorte.
BBOX_PUENTE = (475, 511, 1106, 805)
SEMILLAS_SOBRANTES = ((10, 9), (144, 0))
# Logo_Pueblos_conectados.jpeg (1254x1254) se usa de dos formas: el lockup
# entero en su pagina y solo el icono en la tarjeta de portada y el menu.
BBOX_CONECTADOS = (244, 127, 1022, 1065)
BBOX_CONECTADOS_ICONO = (316, 127, 952, 686)

# Rampa de opacidad: por debajo de LO es fondo (el blanco del JPEG no es 255
# puro y trae ruido de compresion), por encima de HI es icono solido. Entre
# medias queda el antialias del borde.
LO, HI = 14, 48


def sin_fondo(ruta, bbox, margen=0):
    """Abre un JPEG, recorta al contenido y devuelve un RGBA sin el blanco."""
    src = Image.open(ruta).convert("RGB")
    x0, y0, x1, y1 = bbox
    recorte = src.crop((x0 - margen, y0 - margen, x1 + margen, y1 + margen))

    ancho, alto = recorte.size
    px = recorte.load()
    rgba = Image.new("RGBA", recorte.size)
    out = rgba.load()

    for y in range(alto):
        for x in range(ancho):
            r, g, b = px[x, y]
            # Distancia al blanco: el canal mas oscuro marca cuanto color hay.
            d = 255 - min(r, g, b)
            if d <= LO:
                out[x, y] = (0, 0, 0, 0)
                continue
            a = 255 if d >= HI else round((d - LO) / (HI - LO) * 255)
            if a < 255:
                # El pixel viene mezclado con el blanco del fondo. Deshacer la
                # mezcla evita el halo claro al ponerlo sobre un fondo oscuro.
                f = a / 255
                r, g, b = (
                    min(255, max(0, round((c - 255 * (1 - f)) / f))) for c in (r, g, b)
                )
            out[x, y] = (r, g, b, a)

    return rgba


def cuadrar(rgba, aire=1.12):
    """Centra la imagen en un lienzo cuadrado transparente con algo de aire."""
    lado = round(max(rgba.size) * aire)
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lienzo.paste(rgba, ((lado - rgba.width) // 2, (lado - rgba.height) // 2))
    return lienzo


def encajar_en_circulo(rgba, lado=800, holgura=0.94):
    """Centra la imagen en un cuadrado de modo que quepa dentro del circulo inscrito.

    Tally pinta el logo de un formulario a 100x100 con object-fit: cover y
    border-radius: 50%, o sea recortado en circulo, y sus ajustes de logo son de pago.
    Lo unico que controlamos es la imagen, asi que se encoge hasta que su diagonal cabe
    en el diametro: lo que entra, entra entero.
    """
    diagonal = math.hypot(*rgba.size)
    k = (lado * holgura) / diagonal
    chico = rgba.resize((round(rgba.width * k), round(rgba.height * k)), Image.LANCZOS)
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lienzo.paste(chico, ((lado - chico.width) // 2, (lado - chico.height) // 2))
    return lienzo


def rellenar_interior(rgba):
    """Devuelve el icono con el blanco que estaba encerrado hecho opaco.

    La piedra del puente esta dibujada con contornos dorados y relleno blanco,
    asi que al quitar el fondo se va con el. A 32 px eso deja el puente como un
    borron oscuro en las pestanas de tema oscuro. El blanco que toca el borde
    del lienzo es fondo de verdad; el que queda encerrado por el dibujo es
    relleno, y se recupera pintandolo de blanco opaco. Los huecos de los arcos
    llegan hasta abajo, conectan con el exterior y siguen calados, que es lo
    que toca: por un arco se ve el otro lado.
    """
    ancho, alto = rgba.size
    px = rgba.load()
    fuera = bytearray(ancho * alto)
    cola = deque()

    def sembrar(x, y):
        if not fuera[y * ancho + x] and px[x, y][3] == 0:
            fuera[y * ancho + x] = 1
            cola.append((x, y))

    for x in range(ancho):
        sembrar(x, 0)
        sembrar(x, alto - 1)
    for y in range(alto):
        sembrar(0, y)
        sembrar(ancho - 1, y)

    while cola:
        x, y = cola.popleft()
        if x > 0:
            sembrar(x - 1, y)
        if x < ancho - 1:
            sembrar(x + 1, y)
        if y > 0:
            sembrar(x, y - 1)
        if y < alto - 1:
            sembrar(x, y + 1)

    for y in range(alto):
        for x in range(ancho):
            if px[x, y][3] == 0 and not fuera[y * ancho + x]:
                px[x, y] = (255, 255, 255, 255)

    return rgba


def quitar_conectado(rgba, semillas):
    """Vuelve transparentes las manchas opacas que contienen las semillas.

    El recorte del puente arrastra un trozo de la casa y otro del punto del
    wifi. Ninguno toca un trazo del puente, asi que basta con borrar todo lo que
    este unido a un punto de cada uno.
    """
    ancho, alto = rgba.size
    px = rgba.load()
    cola = deque(semillas)
    visto = set(semillas)
    while cola:
        x, y = cola.popleft()
        px[x, y] = (0, 0, 0, 0)
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= n[0] < ancho and 0 <= n[1] < alto and n not in visto and px[n][3]:
                visto.add(n)
                cola.append(n)
    return rgba


def medir_bbox(ruta):
    """Ayuda para recalcular el BBOX si se sustituye un original."""
    from PIL import ImageChops

    im = Image.open(ruta).convert("RGB")
    blanco = Image.new("RGB", im.size, (255, 255, 255))
    mascara = ImageChops.difference(im, blanco).convert("L")
    return mascara.point(lambda p: 255 if p > 18 else 0).getbbox()


def main():
    # Favicon: la casa, el wifi y el puente del logo de Venialbo, sin las
    # letras, que a 32px no se leerian. Se cuadra sin aire (aire=1.0) porque el
    # icono es apaisado y ya deja de sobra margen arriba y abajo.
    # rellenar_interior() modifica la imagen que recibe, de ahi la copia: el favicon
    # lleva la piedra del puente rellena y el logo de Tally la lleva calada.
    icono_crudo = sin_fondo(AQUI / "Venialbo_Conecta.jpeg", BBOX_LOGO_ICONO)
    icono = cuadrar(rellenar_interior(icono_crudo.copy()), aire=1.0)
    icono.resize((32, 32), Image.LANCZOS).save(PUB / "favicon.png", optimize=True)

    # iOS ignora el canal alfa y compone sobre negro, asi que el
    # apple-touch-icon se entrega ya opaco sobre el blanco del diseno original.
    touch = Image.new("RGB", icono.size, (255, 255, 255))
    touch.paste(icono, mask=icono.split()[3])
    touch.resize((180, 180), Image.LANCZOS).save(
        PUB / "apple-touch-icon.png", optimize=True
    )

    # Logo de portada: se muestra a 210px, pero se deja a resolucion completa
    # para que aguante el zoom del navegador. WebP con alfa comprime los
    # degradados mucho mejor que PNG (162 KB frente a 655 KB) sin diferencia
    # visible en los bordes.
    logo = sin_fondo(AQUI / "Venialbo_Conecta.jpeg", BBOX_LOGO, margen=8)
    logo.save(PUB / "venialbo-conecta.webp", "WEBP", quality=88, method=6)

    # El mismo logo en PNG para subirlo a servicios de fuera (los formularios de
    # Tally), que no admiten WebP con transparencia de forma fiable. 600 px de ancho
    # sobra: en un formulario se ve a 150 px como mucho, y asi el fichero no engorda.
    tally = AQUI.parent / "tally"
    if tally.is_dir():
        ancho = 600
        chico = logo.resize((ancho, round(logo.height * ancho / logo.width)), Image.LANCZOS)
        chico.save(tally / "logo-venialbo-conecta.png", optimize=True)
        # El que se sube a Tally: solo el icono, encajado en el circulo con el que
        # recorta los logos. Con el logotipo entero se comia las letras. Va calado,
        # como en la web: el fondo crema del formulario se ve a traves del puente.
        encajar_en_circulo(icono_crudo).save(
            tally / "logo-venialbo-conecta-circulo.png", optimize=True
        )

    # El puente solo, al lado de "VenialboConecta" en la cabecera. Se ve a 28 px
    # de alto; se genera al triple para pantallas de alta densidad. Va calado: la
    # cabecera es blanca y no se nota.
    puente = quitar_conectado(
        sin_fondo(AQUI / "Venialbo_Conecta.jpeg", BBOX_PUENTE), SEMILLAS_SOBRANTES
    )
    alto = 84
    puente = puente.resize((round(puente.width * alto / puente.height), alto), Image.LANCZOS)
    puente.save(PUB / "puente.webp", "WEBP", quality=90, method=6)

    # Pueblos Conectados: el icono suelto para la tarjeta de la portada (se ve
    # a ~96px, 300 basta de sobra) y el lockup entero para su propia pagina.
    icono_pc = cuadrar(
        sin_fondo(AQUI / "Logo_Pueblos_conectados.jpeg", BBOX_CONECTADOS_ICONO)
    )
    icono_pc.thumbnail((300, 300), Image.LANCZOS)
    icono_pc.save(PUB / "pueblos-conectados-icono.webp", "WEBP", quality=90, method=6)

    lockup = sin_fondo(AQUI / "Logo_Pueblos_conectados.jpeg", BBOX_CONECTADOS, margen=8)
    lockup.save(PUB / "pueblos-conectados.webp", "WEBP", quality=88, method=6)

    print("favicon.png 32x32")
    print("apple-touch-icon.png 180x180")
    print(f"venialbo-conecta.webp {logo.width}x{logo.height}")
    if (AQUI.parent / "tally").is_dir():
        print("tally/logo-venialbo-conecta.png 600 px y logo-...-circulo.png 800x800")
    print(f"puente.webp {puente.width}x{puente.height}")
    print(f"pueblos-conectados-icono.webp {icono_pc.width}x{icono_pc.height}")
    print(f"pueblos-conectados.webp {lockup.width}x{lockup.height}")


if __name__ == "__main__":
    main()
