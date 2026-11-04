import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icono } from './Icono'
import { conMiles, hoy, mesDe, nombreMes, sumarMeses } from '../lib/format'

export function SelectorMes({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const actual = mesDe(hoy())
  return (
    <div className="selector-mes">
      <button className="btn-icono" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}>
        <Icono nombre="izquierda" />
      </button>
      <label className="selector-mes-titulo">
        <span>{nombreMes(mes)}</span>
        <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Elegir mes" />
      </label>
      <button className="btn-icono" aria-label="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))} disabled={mes >= sumarMeses(actual, 1)}>
        <Icono nombre="derecha" />
      </button>
    </div>
  )
}

/** Hojas abiertas, de la más antigua a la de encima: Escape cierra solo la de encima. */
const hojasAbiertas: { current: () => void }[] = []

/** Panel que sube desde abajo, para formularios y detalles. Puede abrirse una encima de otra. */
export function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    hojasAbiertas.push(cerrar)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && hojasAbiertas.at(-1) === cerrar && cerrar.current()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      hojasAbiertas.splice(hojasAbiertas.indexOf(cerrar), 1)
      document.removeEventListener('keydown', esc)
      if (!hojasAbiertas.length) document.body.style.overflow = ''
    }
  }, [])

  return createPortal(
    <div className="hoja-fondo" onClick={onCerrar}>
      <section className="hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <header className="hoja-cabecera">
          <h2>{titulo}</h2>
          <button className="btn-icono" aria-label="Cerrar" onClick={onCerrar}>
            <Icono nombre="cerrar" />
          </button>
        </header>
        <div className="hoja-cuerpo">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

export function Chips<T extends string>(props: {
  opciones: { valor: T; etiqueta: string }[]
  valor: T | null
  onCambio: (v: T) => void
  etiqueta: string
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={props.etiqueta}>
      {props.opciones.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={props.valor === o.valor} className="chip" onClick={() => props.onCambio(o.valor)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

export function Segmentado<T extends string>(props: { opciones: { valor: T; etiqueta: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <div className="segmentado" role="tablist" aria-label={props.etiqueta}>
      {props.opciones.map((o) => (
        <button key={o.valor} type="button" role="tab" aria-selected={props.valor === o.valor} onClick={() => props.onCambio(o.valor)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

/** Campo de dinero: muestra separador de miles mientras escribes. */
export function CampoValor(props: { valor: string; onCambio: (v: string) => void; grande?: boolean; etiqueta: string; autoFocus?: boolean }) {
  return (
    <label className={`campo ${props.grande ? 'campo-valor-grande' : ''}`}>
      <span>{props.etiqueta}</span>
      <div className="campo-valor">
        <span aria-hidden="true">$</span>
        <input
          inputMode="numeric"
          autoFocus={props.autoFocus}
          placeholder="0"
          value={props.valor}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, '').slice(0, 13)
            props.onCambio(digitos ? conMiles(Number(digitos)) : '')
          }}
        />
      </div>
    </label>
  )
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <p className="vacio-titulo">{titulo}</p>
      {children}
    </div>
  )
}
