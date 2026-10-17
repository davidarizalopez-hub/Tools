import { useState } from 'react'
import { nombreMes, nombreMesCorto, pesos, pesosCorto, porcentaje } from '../lib/format'

/** Ranking de categorías: barras horizontales de una sola serie, con el valor en la punta. */
export function BarrasHorizontales({ items, maximo = 7 }: { items: { nombre: string; valor: number }[]; maximo?: number }) {
  const visibles = items.slice(0, maximo)
  const resto = items.slice(maximo).reduce((s, i) => s + i.valor, 0)
  if (resto > 0) visibles.push({ nombre: `Otras (${items.length - maximo})`, valor: resto })
  const tope = Math.max(...visibles.map((i) => i.valor), 1)
  const total = items.reduce((s, i) => s + i.valor, 0)
  return (
    <ul className="barras-h">
      {visibles.map((i) => (
        <li key={i.nombre} title={`${i.nombre}: ${pesos(i.valor)} (${porcentaje(i.valor / total)})`}>
          <div className="barras-h-etiqueta">
            <span>{i.nombre}</span>
            <span className="muted">{porcentaje(i.valor / total)}</span>
          </div>
          <div className="barras-h-pista">
            <div className="barras-h-barra" style={{ width: `${(i.valor / tope) * 100}%` }} />
            <span className="barras-h-valor">{pesosCorto(i.valor)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export interface Segmento {
  nombre: string
  valor: number
  /** Variable CSS de la serie, p. ej. "--serie-1". */
  color: string
}

/** Barra apilada (partes de un todo) con leyenda que muestra cada valor. */
export function BarraApilada({ segmentos }: { segmentos: Segmento[] }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0)
  if (total <= 0) return null
  return (
    <div>
      <div className="apilada" role="img" aria-label={segmentos.map((s) => `${s.nombre} ${pesos(s.valor)}`).join(', ')}>
        {segmentos
          .filter((s) => s.valor > 0)
          .map((s) => (
            <div key={s.nombre} style={{ flexGrow: s.valor, background: `var(${s.color})` }} title={`${s.nombre}: ${pesos(s.valor)}`} />
          ))}
      </div>
      <ul className="leyenda">
        {segmentos.map((s) => (
          <li key={s.nombre}>
            <span className="muestra" style={{ background: `var(${s.color})` }} />
            <span>{s.nombre}</span>
            <strong>{pesosCorto(s.valor)}</strong>
            <span className="muted">{porcentaje(s.valor / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ingresos vs. gastos por mes: columnas agrupadas; tocar un mes muestra sus valores. */
export function ColumnasMeses({ serie }: { serie: { mes: string; ingresos: number; gastos: number }[] }) {
  const [activo, setActivo] = useState(serie.length - 1)
  const ancho = 320
  const alto = 150
  const margenIzq = 40
  const margenInf = 20
  const area = alto - margenInf
  const maxDato = Math.max(...serie.flatMap((s) => [s.ingresos, s.gastos]), 1)
  const paso = escalon(maxDato / 3)
  const tope = paso * Math.ceil(maxDato / paso)
  const banda = (ancho - margenIzq) / serie.length
  const barra = Math.min(16, (banda - 12) / 2)
  const y = (v: number) => area - (v / tope) * area
  const sel = serie[activo]

  return (
    <div className="columnas">
      <div className="leyenda leyenda-fila">
        <span>
          <span className="muestra" style={{ background: 'var(--serie-1)' }} />
          Ingresos
        </span>
        <span>
          <span className="muestra" style={{ background: 'var(--serie-2)' }} />
          Gastos
        </span>
      </div>
      <p className="lectura" aria-live="polite">
        <strong>{nombreMes(sel.mes)}</strong> · Ingresos {pesos(sel.ingresos)} · Gastos {pesos(sel.gastos)}
      </p>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="columnas-svg" role="img" aria-label="Ingresos y gastos de los últimos meses">
        {Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso).map((v) => (
          <g key={v}>
            <line x1={margenIzq} x2={ancho} y1={y(v)} y2={y(v)} className={v === 0 ? 'eje' : 'rejilla'} />
            <text x={margenIzq - 6} y={y(v) + 4} className="tick" textAnchor="end">
              {pesosCorto(v).replace('$', '')}
            </text>
          </g>
        ))}
        {serie.map((s, i) => {
          const centro = margenIzq + banda * i + banda / 2
          return (
            <g key={s.mes} onMouseEnter={() => setActivo(i)} onClick={() => setActivo(i)} className={i === activo ? 'grupo-activo' : 'grupo'}>
              <rect x={margenIzq + banda * i} y={0} width={banda} height={alto} fill="transparent" />
              <path d={columna(centro - barra - 1, y(s.ingresos), barra, area - y(s.ingresos))} fill="var(--serie-1)" />
              <path d={columna(centro + 1, y(s.gastos), barra, area - y(s.gastos))} fill="var(--serie-2)" />
              <text x={centro} y={alto - 4} textAnchor="middle" className={`tick ${i === activo ? 'tick-activo' : ''}`}>
                {nombreMesCorto(s.mes)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Columna con las esquinas superiores redondeadas (4px) y la base recta. */
function columna(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/** Redondea hacia arriba a 1, 2 o 5 × 10^n para marcas de eje limpias. */
function escalon(v: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
