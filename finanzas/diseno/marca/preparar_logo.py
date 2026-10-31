"""Prepara el logo final "Bucle infinito" a partir del SVG generado con Higgsfield (Recraft V4.1).

Ajustes: sin esquinas blancas ni restos sueltos, símbolo más grande, flecha y chispa en dorado.
Genera public/icon.svg (ícono redondeado), public/logo-simbolo.svg (solo el símbolo) y
diseno/marca/icono-completo.svg / icono-maskable.svg (fondo completo, para los PNG de la app).
"""
import pathlib, re

AQUI = pathlib.Path(__file__).parent
PUBLICO = AQUI.parent.parent / 'public'
ORIGEN = AQUI.parent / 'higgsfield' / '3-bucle.svg'

FONDO = '#1b1036'
ORO = ('#ffd766', '#ffb01f')

svg = re.sub(r'<metadata>.*?</metadata>', '', ORIGEN.read_text(), flags=re.S)
caminos = re.findall(r'<path[^>]*>(?:</path>)?', svg)
gradientes = re.search(r'<defs>(.*?)</defs>', svg, flags=re.S).group(1)

# 0 fondo · 1-4 esquinas blancas · 5 lazo violeta · 6 curva inferior · 7 y 8 tramos rosados
# 9 borde suelto · 10 punta de la flecha · 11 chispa · 12-16 puntos sueltos
simbolo = [caminos[i] for i in (5, 6, 7, 8, 10, 11)]
simbolo[4] = simbolo[4].replace('url(#Gradient1)', 'url(#oro)')
simbolo[5] = re.sub(r'fill="[^"]*"', 'fill="url(#oro)"', simbolo[5])

oro = (f'<linearGradient id="oro" gradientUnits="userSpaceOnUse" x1="1260" y1="1080" x2="1550" y2="730">'
       f'<stop offset="0" stop-color="{ORO[1]}"/><stop offset="1" stop-color="{ORO[0]}"/></linearGradient>')
defs = f'<defs>{gradientes}{oro}</defs>'

# Caja del símbolo en el original: x 517-1555, y 725-1308
CX, CY = (517 + 1555) / 2, (725 + 1308) / 2


def grupo(ancho):
    escala = ancho / (1555 - 517)
    return f'<g transform="translate(1024 1024) scale({escala:.4f}) translate({-CX} {-CY})">{"".join(simbolo)}</g>'


def archivo(cuerpo, viewbox='0 0 2048 2048'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}">{defs}{cuerpo}</svg>\n'


redondeado = f'<rect width="2048" height="2048" rx="460" fill="{FONDO}"/>' + grupo(1500)
(PUBLICO / 'icon.svg').write_text(archivo(redondeado))
(AQUI / 'icono-completo.svg').write_text(archivo(f'<rect width="2048" height="2048" fill="{FONDO}"/>' + grupo(1500)))
# Maskable: Android recorta hasta un círculo del 80 %, así que el símbolo va más pequeño.
(AQUI / 'icono-maskable.svg').write_text(archivo(f'<rect width="2048" height="2048" fill="{FONDO}"/>' + grupo(1250)))
# Solo el símbolo, recortado a su caja, para el encabezado de la app.
(PUBLICO / 'logo-simbolo.svg').write_text(archivo(grupo(1500), viewbox='274 588 1500 872'))
print('ok')
