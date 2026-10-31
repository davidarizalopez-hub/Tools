"""Genera las 5 propuestas de logo (SVG) y la página para elegir una."""
import math, pathlib

AQUI = pathlib.Path(__file__).parent

def lerp(a, b, t):
    return '#' + ''.join(f'{round(int(a[i:i+2],16)*(1-t)+int(b[i:i+2],16)*t):02x}' for i in (1, 3, 5))

# ---------- 1. Espiral áurea ----------
def espiral(p):
    s = 3.2
    radios = [1, 1, 2, 3, 5, 8, 13]
    x, y, d = 0.0, 0.0, (1.0, 0.0)
    arcos = []
    for r in radios:
        r *= s
        izq = (d[1], -d[0])
        ex, ey = x + r * d[0] + r * izq[0], y + r * d[1] + r * izq[1]
        arcos.append((x, y, ex, ey, r, x + r * izq[0], y + r * izq[1]))
        x, y, d = ex, ey, izq
    puntos = []
    for (x0, y0, x1, y1, r, cx, cy) in arcos:
        a0, a1 = math.atan2(y0 - cy, x0 - cx), math.atan2(y1 - cy, x1 - cx)
        delta = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi  # el cuarto de vuelta, con su signo
        for k in range(21):
            ang = a0 + delta * k / 20
            puntos.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    minx = min(x for x, _ in puntos) - 6; maxx = max(x for x, _ in puntos) + 6
    miny = min(y for _, y in puntos) - 6; maxy = max(y for _, y in puntos) + 6
    esc = 92 / max(maxx - minx, maxy - miny)
    ox = 60 - (minx + maxx) / 2 * esc
    oy = 60 - (miny + maxy) / 2 * esc
    partes = []
    n = len(arcos)
    for i, (x0, y0, x1, y1, r, _cx, _cy) in enumerate(arcos):
        t = i / (n - 1)
        partes.append(
            f'<path d="M{x0*esc+ox:.2f},{y0*esc+oy:.2f} A{r*esc:.2f},{r*esc:.2f} 0 0 0 {x1*esc+ox:.2f},{y1*esc+oy:.2f}" '
            f'fill="none" stroke="{lerp(p["a"], p["b"], t)}" stroke-width="{3 + 9*t:.1f}" stroke-linecap="round"/>')
    x1, y1 = arcos[-1][2] * esc + ox, arcos[-1][3] * esc + oy
    partes.append(f'<circle cx="{x1:.2f}" cy="{y1:.2f}" r="9" fill="{p["b"]}"/><circle cx="{x1:.2f}" cy="{y1:.2f}" r="4.2" fill="none" stroke="{p["fondo"]}" stroke-width="1.6"/>')
    # Girada para que la espiral termine arriba a la derecha: crece hacia arriba.
    return '<g transform="rotate(180 60 60)">' + ''.join(partes) + '</g>'

# ---------- 2. Brote ----------
def brote(p):
    hoja = 'M0,0 C6,-12 22,-16 34,-12 C26,-2 12,4 0,0 Z'
    return (
        f'<circle cx="60" cy="78" r="27" fill="{p["c"]}"/>'
        f'<circle cx="60" cy="78" r="20" fill="none" stroke="{p["fondo"]}" stroke-width="2.4" opacity=".35"/>'
        f'<path d="M47,70 A15,15 0 0 1 60,62" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".7"/>'
        f'<path d="M60,58 C60,46 61,38 64,28" fill="none" stroke="{p["a"]}" stroke-width="5" stroke-linecap="round"/>'
        f'<path d="{hoja}" transform="translate(62,40) rotate(-28)" fill="{p["b"]}"/>'
        f'<path d="{hoja}" transform="translate(60,48) scale(-0.82,0.82) rotate(-24)" fill="{p["a"]}"/>'
        f'<circle cx="84" cy="26" r="3" fill="{p["c"]}"/><circle cx="92" cy="40" r="2" fill="{p["b"]}"/>'
    )

# ---------- 3. Bucle ----------
def bucle(p):
    a = 44
    pts = []
    t0, t1 = 0.25, 3 * math.pi / 2
    for i in range(161):
        t = t0 + (t1 - t0) * i / 160
        den = 1 + math.sin(t) ** 2
        pts.append((56 + a * math.cos(t) / den, 66 + a * math.sin(t) * math.cos(t) / den))
    cx, cy = pts[-1]
    largo = 34
    fx, fy = cx + largo * math.cos(-math.pi / 4), cy + largo * math.sin(-math.pi / 4)
    d = 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts) + f' L{fx:.2f},{fy:.2f}'
    punta = f'M{fx-17:.2f},{fy:.2f} L{fx:.2f},{fy:.2f} L{fx:.2f},{fy+17:.2f}'
    chispa = 'M0,-9 C1,-2 2,-1 9,0 C2,1 1,2 0,9 C-1,2 -2,1 -9,0 C-2,-1 -1,-2 0,-9 Z'
    return (
        f'<defs><linearGradient id="g-bucle" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{p["a"]}"/><stop offset="1" stop-color="{p["b"]}"/></linearGradient></defs>'
        f'<path d="{d}" fill="none" stroke="url(#g-bucle)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{punta}" fill="none" stroke="{p["b"]}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{chispa}" transform="translate({fx-30:.1f},{fy+4:.1f}) scale(1.15)" fill="{p["c"]}"/>'
    )

# ---------- 4. Pulso ----------
def pulso(p):
    barras = [(24, 76, 20), (46, 60, 36), (68, 44, 52)]
    s = ''.join(f'<rect x="{x}" y="{y}" width="16" height="{h}" rx="5" fill="{lerp(p["a"], p["b"], i/2)}"/>' for i, (x, y, h) in enumerate(barras))
    return (
        s +
        f'<path d="M32,68 L54,52 L76,36 L94,22" fill="none" stroke="{p["tinta"]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
        + ''.join(f'<circle cx="{x}" cy="{y}" r="4.5" fill="{p["tinta"]}"/>' for x, y in [(32, 68), (54, 52), (76, 36)])
        + f'<circle cx="94" cy="22" r="11" fill="{p["c"]}" opacity=".28"/><circle cx="94" cy="22" r="6.5" fill="{p["c"]}"/>'
    )

# ---------- 5. Gema ----------
def gema(p):
    A, B, C, D, E = (34, 30), (86, 30), (104, 52), (60, 100), (16, 52)
    t1, t2 = (50, 30), (70, 30)
    m1, m2, m3 = (40, 52), (60, 52), (80, 52)
    def tri(pts, color):
        return f'<polygon points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="{color}"/>'
    caras = [
        tri([A, t1, m1], p['b']), tri([A, m1, E], p['a']),
        tri([t1, t2, m2], p['c']), tri([t1, m2, m1], p['b']), tri([t2, m3, m2], p['b']),
        tri([t2, B, m3], p['c']), tri([B, C, m3], p['b']),
        tri([E, m1, D], p['a']), tri([m1, m2, D], p['d']), tri([m2, m3, D], p['a']), tri([m3, C, D], p['d']),
    ]
    contorno = f'<polygon points="34,30 86,30 104,52 60,100 16,52" fill="none" stroke="{p["fondo"]}" stroke-width="1.4" stroke-linejoin="round" opacity=".35"/>'
    flecha = f'<path d="M48,74 L60,62 L72,74" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>'
    chispa = 'M0,-7 C.8,-1.6 1.6,-.8 7,0 C1.6,.8 .8,1.6 0,7 C-.8,1.6 -1.6,.8 -7,0 C-1.6,-.8 -.8,-1.6 0,-7 Z'
    return ''.join(caras) + contorno + flecha + f'<path d="{chispa}" transform="translate(98,24)" fill="{p["c"]}"/>'

LOGOS = [
    dict(id='espiral', nombre='Espiral áurea', fn=espiral,
         idea='La espiral de Fibonacci crece en la misma proporción en cada vuelta: así se ve el mejoramiento continuo. Cada tramo es más grueso y pasa del verde al dorado, como el ahorro que se acumula, y remata en una moneda.',
         paleta=dict(fondo='#14123b', a='#19c37d', b='#f5c542', c='#f5c542', tinta='#ffffff', claro='#ecfbf3'),
         nombres=dict(fondo='Noche índigo', a='Esmeralda', b='Oro')),
    dict(id='brote', nombre='Brote', fn=brote,
         idea='Una moneda de la que nace una planta: la plata bien cuidada crece sola. Es el concepto más cálido y fácil de entender de un vistazo, incluso en tamaño pequeño.',
         paleta=dict(fondo='#0f3d2e', a='#2bd48a', b='#c6f45b', c='#ffc83d', tinta='#ffffff', claro='#effcf4'),
         nombres=dict(fondo='Bosque', a='Menta', b='Lima', c='Oro')),
    dict(id='bucle', nombre='Bucle infinito', fn=bucle,
         idea='El símbolo de infinito es el ciclo de registrar, medir y mejorar. Uno de sus lazos se rompe y sale disparado hacia arriba, y la chispa representa la parte inteligente que te da los consejos.',
         paleta=dict(fondo='#1b1036', a='#7c5cff', b='#ff4fa3', c='#ffc93c', tinta='#ffffff', claro='#f4f0ff'),
         nombres=dict(fondo='Uva', a='Violeta', b='Fucsia', c='Oro')),
    dict(id='pulso', nombre='Pulso', fn=pulso,
         idea='Barras que suben unidas por una línea, como un gráfico vivo que termina en un punto dorado que brilla: el control de tus números y la predicción del siguiente mes.',
         paleta=dict(fondo='#0a1a3f', a='#2f6bff', b='#22d3ee', c='#ffc83d', tinta='#ffffff', claro='#eef4ff'),
         nombres=dict(fondo='Azul noche', a='Azul eléctrico', b='Aguamarina', c='Oro')),
    dict(id='gema', nombre='Gema', fn=gema,
         idea='Una gema facetada representa el valor y la abundancia. Sus caras dibujan una flecha hacia arriba en el centro: cada decisión bien tomada pule tus finanzas.',
         paleta=dict(fondo='#0f2a3d', a='#ff6b5a', b='#ffa94d', c='#ffd166', d='#e2553f', tinta='#ffffff', claro='#fff4ec'),
         nombres=dict(fondo='Petróleo', a='Coral', b='Mandarina', c='Oro')),
]

def svg(logo, fondo=True, tam=None):
    p = logo['paleta']
    dentro = logo['fn'](p).replace('g-bucle', f'g-bucle-{id(dentro_contador)}-{next(contador)}')
    caja = f'<rect width="120" height="120" rx="27" fill="{p["fondo"]}"/>' if fondo else ''
    escala = '<g transform="translate(60 60) scale(.82) translate(-60 -60)">' if fondo else '<g>'
    atr = f' width="{tam}" height="{tam}"' if tam else ''
    return f'<svg viewBox="0 0 120 120"{atr} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Logo {logo["nombre"]}">{caja}{escala}{dentro}</g></svg>'

import itertools
contador = itertools.count()
dentro_contador = object()

if __name__ == '__main__':
    for l in LOGOS:
        (AQUI / f'logo-{l["id"]}.svg').write_text(svg(l))
    print('ok')


def muestras(l):
    p, n = l['paleta'], l['nombres']
    return ''.join(
        f'<li><span class="chip-color" style="background:{p[k]}"></span><span>{nombre}</span><code>{p[k]}</code></li>'
        for k, nombre in n.items())


def maqueta(l):
    p = l['paleta']
    barras = ''.join(f'<span style="height:{h}%;background:{c}"></span>' for h, c in [(38, p['a']), (62, p['b']), (84, p['c'])])
    return f'''
    <div class="maqueta" style="--m-fondo:{p['fondo']};--m-a:{p['a']};--m-b:{p['b']};--m-c:{p['c']};--m-claro:{p['claro']}">
      <div class="m-hero">
        <div class="m-marca">{svg(l, tam=26)}<span>Mis Finanzas</span></div>
        <p class="m-etiqueta">Te quedó en octubre</p>
        <p class="m-cifra">$ 3.799.110</p>
        <span class="m-pastilla">▲ ahorraste 24%</span>
      </div>
      <div class="m-cuerpo">
        <div class="m-barras">{barras}</div>
        <span class="m-boton">Registrar gasto</span>
      </div>
    </div>'''


def pagina():
    tira = ''.join(f'<a class="tira-item" href="#{l["id"]}">{svg(l, tam=64)}<span>{i}. {l["nombre"]}</span></a>' for i, l in enumerate(LOGOS, 1))
    tarjetas = ''.join(f'''
  <article class="propuesta" id="{l['id']}">
    <header class="prop-cabecera">
      <span class="prop-numero">{i}</span>
      <div>
        <h2>{l['nombre']}</h2>
        <p class="idea">{l['idea']}</p>
      </div>
    </header>
    <div class="prop-cuerpo">
      <figure class="icono-grande">{svg(l, tam=168)}<figcaption>Ícono de la app</figcaption></figure>
      <div class="usos">
        <figure class="inicio-celular" style="--fondo-celular:linear-gradient(160deg,{l['paleta']['claro']},#d9dde8)">
          <div class="celular-iconos">
            <span class="hueco"></span><span class="hueco"></span>
            <span class="app">{svg(l, tam=52)}<small>Finanzas</small></span>
            <span class="hueco"></span>
          </div>
          <figcaption>En la pantalla de inicio</figcaption>
        </figure>
        <figure class="pestana">
          <div class="pestana-barra">{svg(l, tam=16)}<span>Mis Finanzas</span></div>
          <figcaption>En la pestaña del navegador</figcaption>
        </figure>
        <ul class="paleta">{muestras(l)}</ul>
      </div>
      <figure class="figura-maqueta">{maqueta(l)}<figcaption>Así se vería la app</figcaption></figure>
    </div>
  </article>''' for i, l in enumerate(LOGOS, 1))

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Logo Mis Finanzas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
<style>
/* Plan: página neutra que no compite con los logos; cada propuesta en su propia franja,
   con el ícono grande a la izquierda y sus usos reales (inicio, pestaña, app) al lado. */
:root {{
  --fondo: #f6f6f3;
  --superficie: #ffffff;
  --tinta: #16151d;
  --tinta-2: #55535f;
  --borde: rgba(22, 21, 29, .1);
  --acento: #3b2fd6;
  --display: "Bricolage Grotesque", "Avenir Next", system-ui, sans-serif;
  --cuerpo: "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --fondo: #111116; --superficie: #1a1a21; --tinta: #f1f0f5; --tinta-2: #b4b2c0;
    --borde: rgba(255, 255, 255, .1); --acento: #a99dff; color-scheme: dark;
  }}
}}
:root[data-theme="dark"] {{
  --fondo: #111116; --superficie: #1a1a21; --tinta: #f1f0f5; --tinta-2: #b4b2c0;
  --borde: rgba(255, 255, 255, .1); --acento: #a99dff; color-scheme: dark;
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--fondo); color: var(--tinta); font: 16px/1.5 var(--cuerpo); }}
main {{ max-width: 1080px; margin: 0 auto; padding: 40px 20px 64px; display: flex; flex-direction: column; gap: 28px; }}
h1, h2 {{ font-family: var(--display); margin: 0; text-wrap: balance; letter-spacing: -.01em; }}
h1 {{ font-size: clamp(2rem, 5vw, 3rem); font-weight: 800; line-height: 1.05; }}
.intro {{ color: var(--tinta-2); max-width: 62ch; margin: 10px 0 0; font-size: 1.05rem; }}
.tira {{ display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }}
.tira-item {{ display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 8px; border-radius: 16px;
  background: var(--superficie); border: 1px solid var(--borde); color: var(--tinta); text-decoration: none; font-weight: 600; font-size: .9rem; text-align: center; }}
.tira-item:hover, .tira-item:focus-visible {{ border-color: var(--acento); outline: none; }}
.propuesta {{ background: var(--superficie); border: 1px solid var(--borde); border-radius: 24px; padding: 24px; display: flex; flex-direction: column; gap: 20px; scroll-margin-top: 16px; }}
.prop-cabecera {{ display: flex; gap: 16px; align-items: flex-start; }}
.prop-numero {{ font-family: var(--display); font-weight: 800; font-size: 2.6rem; line-height: .9; color: var(--acento); min-width: 1.2ch; }}
h2 {{ font-size: 1.6rem; font-weight: 800; }}
.idea {{ margin: 6px 0 0; color: var(--tinta-2); max-width: 65ch; }}
.prop-cuerpo {{ display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 24px; align-items: start; }}
figure {{ margin: 0; display: flex; flex-direction: column; gap: 8px; }}
figcaption {{ font-size: .8rem; color: var(--tinta-2); }}
.icono-grande svg {{ filter: drop-shadow(0 10px 24px rgba(0, 0, 0, .18)); }}
.usos {{ display: flex; flex-direction: column; gap: 16px; }}
.inicio-celular .celular-iconos {{ display: flex; gap: 14px; padding: 16px; border-radius: 18px; background: var(--fondo-celular); width: max-content; max-width: 100%; }}
.hueco {{ width: 52px; height: 52px; border-radius: 13px; background: rgba(255, 255, 255, .55); }}
.app {{ display: flex; flex-direction: column; align-items: center; gap: 4px; }}
.app small {{ font-size: .7rem; color: #2a2a33; }}
.pestana-barra {{ display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px 10px 0 0; background: var(--fondo); border: 1px solid var(--borde); border-bottom: 0; font-size: .85rem; width: max-content; }}
.paleta {{ list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: .85rem; }}
.paleta li {{ display: flex; align-items: center; gap: 6px; }}
.chip-color {{ width: 18px; height: 18px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12); }}
.paleta code {{ color: var(--tinta-2); font-size: .75rem; }}
.maqueta {{ width: 230px; border-radius: 26px; overflow: hidden; background: var(--m-claro); border: 1px solid var(--borde); box-shadow: 0 12px 30px rgba(0, 0, 0, .12); }}
.m-hero {{ background: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--m-a) 45%, transparent), transparent 60%), var(--m-fondo); color: #fff; padding: 16px; display: flex; flex-direction: column; gap: 4px; }}
.m-marca {{ display: flex; align-items: center; gap: 8px; font-family: var(--display); font-weight: 800; font-size: .95rem; margin-bottom: 10px; }}
.m-etiqueta {{ margin: 0; font-size: .72rem; opacity: .75; }}
.m-cifra {{ margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.55rem; line-height: 1.1; }}
.m-pastilla {{ align-self: flex-start; margin-top: 6px; font-size: .7rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--m-c); color: var(--m-fondo); }}
.m-cuerpo {{ padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 14px; }}
.m-barras {{ height: 64px; display: flex; align-items: flex-end; gap: 10px; }}
.m-barras span {{ flex: 1; border-radius: 6px 6px 2px 2px; }}
.m-boton {{ text-align: center; padding: 10px; border-radius: 12px; background: var(--m-fondo); color: #fff; font-weight: 600; font-size: .85rem; }}
.cierre {{ color: var(--tinta-2); max-width: 65ch; }}
.cierre strong {{ color: var(--tinta); }}
@media (max-width: 860px) {{
  .prop-cuerpo {{ grid-template-columns: 1fr; }}
  .tira {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
}}
@media (max-width: 420px) {{
  .tira {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .icono-grande svg {{ width: 132px; height: 132px; }}
}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Elige el logo de Mis Finanzas</h1>
    <p class="intro">Cinco propuestas sobre la misma idea: tener el control de tu plata, mejorar mes a mes y que la app te ayude a pensar. Todas combinan colores juveniles con dorado, el color de la abundancia. Cada una se muestra como ícono, en la pantalla de inicio, en la pestaña del navegador y aplicada a la app.</p>
  </header>
  <nav class="tira" aria-label="Las cinco propuestas">{tira}</nav>
  {tarjetas}
  <p class="cierre"><strong>¿Cuál te gusta?</strong> Dime el número. También puedes mezclar, por ejemplo el símbolo de una con los colores de otra. Con la que elijas cambio el ícono de la app, sus colores y el estilo de las pantallas.</p>
</main>
</body>
</html>'''


if __name__ == '__main__':
    (AQUI / 'propuestas-logo.html').write_text(pagina())
    print('pagina ok')
