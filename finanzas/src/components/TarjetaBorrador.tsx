import { useMemo, type ReactNode } from 'react'
import { useDatos } from '../state'
import { faltantes, type Borrador } from '../lib/comprobantes'
import { fechaLarga, pesos } from '../lib/format'

const ETIQUETA_TIPO = { egreso: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' } as const

/** Nombre de una categoría o medio de pago a partir de su id. */
export function useNombres() {
  const { datos } = useDatos()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const l of [datos.categorias, datos.medios_pago]) for (const x of l) m.set(x.id, x.nombre)
    return (id: string | null) => (id ? (m.get(id) ?? '—') : null)
  }, [datos])
}

/**
 * Un movimiento propuesto (de un pantallazo o de un correo) con sus avisos y las acciones
 * Revisar, Guardar y Descartar. Cuando ya se guardó o descartó, muestra el estado.
 */
export function TarjetaBorrador(props: {
  b: Borrador
  estado?: 'guardado' | 'descartado'
  duplicado: string | null
  ocupado: boolean
  /** Texto de la fuente (por ejemplo, el correo del banco) para comparar. */
  extracto?: ReactNode
  onRevisar: () => void
  onGuardar: () => void
  onDescartar: () => void
  onDeshacer?: () => void
}) {
  const { b, estado, duplicado: dup, ocupado } = props
  const nombre = useNombres()
  const falta = faltantes(b)
  const cuenta = b.tipo === 'transferencia' ? `${nombre(b.medio_pago_id) ?? '?'} → ${nombre(b.medio_destino_id) ?? '?'}` : nombre(b.medio_pago_id)

  return (
    <div className={`borrador ${estado ? 'borrador-cerrado' : ''}`}>
      <div className="borrador-cabecera">
        <strong>{ETIQUETA_TIPO[b.tipo]}</strong>
        <strong className={`monto monto-${b.tipo}`}>{pesos(b.valor)}</strong>
      </div>
      <p className="borrador-detalle">{[fechaLarga(b.fecha), cuenta, nombre(b.categoria_id)].filter(Boolean).join(' · ')}</p>
      <p className="borrador-detalle muted">{[b.tercero, b.descripcion].filter(Boolean).join(' · ')}</p>
      {props.extracto && !estado && <p className="borrador-extracto">{props.extracto}</p>}
      {!estado && (dup || falta.length > 0 || b.avisos.length > 0) && (
        <ul className="etiquetas">
          {dup && <li className="etiqueta-alerta">⚠ Posible duplicado: {dup}</li>}
          {falta.length > 0 && <li className="etiqueta-alerta">Falta: {falta.join(', ')}</li>}
          {b.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="acciones">
        {estado === 'guardado' ? (
          <span className="estado-pagado">✓ Guardado</span>
        ) : estado === 'descartado' ? (
          <>
            <span className="muted">Descartado</span>
            {props.onDeshacer && (
              <button className="btn-texto" disabled={ocupado} onClick={props.onDeshacer}>
                Deshacer
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn" disabled={ocupado} onClick={props.onRevisar}>
              Revisar
            </button>
            <button className="btn btn-primario" disabled={ocupado || falta.length > 0} onClick={props.onGuardar}>
              Guardar
            </button>
            <button className="btn-texto" disabled={ocupado} onClick={props.onDescartar}>
              Descartar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
