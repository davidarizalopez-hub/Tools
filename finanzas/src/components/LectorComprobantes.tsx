import { useEffect, useMemo, useRef, useState } from 'react'
import { useDatos } from '../state'
import { Hoja } from './ui'
import { Registrar } from '../views/Registrar'
import { aBorradores, buscarDuplicado, construirMovimiento, faltantes, leerComprobante, type Borrador } from '../lib/comprobantes'
import type { Cliente } from '../lib/types'
import { fechaLarga, nuevoId, pesos } from '../lib/format'

interface Archivo {
  id: string
  nombre: string
  estado: 'pendiente' | 'leyendo' | 'listo' | 'error'
  archivo?: File
  error?: string
  observacion?: string | null
  borradores: Borrador[]
}

export interface LeidoPrevio {
  nombre: string
  borradores: Borrador[]
}

/** Lecturas simultáneas: suficientes para avanzar rápido sin chocar con el límite de la API. */
const EN_PARALELO = 2

const ETIQUETA_TIPO = { egreso: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' } as const

/**
 * Lee varios pantallazos o PDFs de comprobantes y muestra los movimientos encontrados
 * para guardarlos, revisarlos uno por uno o descartarlos.
 */
export function LectorComprobantes({ archivos, previos = [] }: { archivos: File[]; previos?: LeidoPrevio[] }) {
  const { datos, agregar, aviso } = useDatos()
  const [items, setItems] = useState<Archivo[]>(() => [
    ...previos.map((p): Archivo => ({ id: nuevoId(), nombre: p.nombre, estado: 'listo', borradores: p.borradores })),
    ...archivos.map((a): Archivo => ({ id: nuevoId(), nombre: a.name, estado: 'pendiente', archivo: a, borradores: [] })),
  ])
  const [estados, setEstados] = useState<Record<string, 'guardado' | 'descartado'>>({})
  const [revisando, setRevisando] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const datosRef = useRef(datos)
  datosRef.current = datos
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    const cola = items.filter((i) => i.estado === 'pendiente')
    const actualizar = (id: string, cambios: Partial<Archivo>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...cambios } : i)))
    const trabajador = async () => {
      for (let item = cola.shift(); item; item = cola.shift()) {
        actualizar(item.id, { estado: 'leyendo' })
        try {
          const lectura = await leerComprobante(item.archivo!, datosRef.current)
          actualizar(item.id, { estado: 'listo', observacion: lectura.observacion, borradores: aBorradores(lectura, datosRef.current) })
        } catch (e) {
          actualizar(item.id, { estado: 'error', error: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    void Promise.all(Array.from({ length: EN_PARALELO }, trabajador))
  }, [items])

  const nombre = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of [datos.categorias, datos.medios_pago]) for (const x of l) m.set(x.id, x.nombre)
    return (id: string | null) => (id ? (m.get(id) ?? '—') : null)
  }, [datos])

  const todos = items.flatMap((i) => i.borradores)
  const pendientes = todos.filter((b) => !estados[b.clave])
  /** Duplicado contra lo ya registrado o contra un borrador anterior del mismo lote que no se descartó. */
  const duplicado = (b: Borrador) => {
    const anteriores = todos.slice(0, todos.indexOf(b)).filter((x) => estados[x.clave] !== 'descartado' && estados[x.clave] !== 'guardado')
    return buscarDuplicado(b, datos.movimientos, anteriores)
  }
  const completos = pendientes.filter((b) => !faltantes(b).length && !b.avisos.length && !duplicado(b))
  const leidos = items.filter((i) => i.estado === 'listo' || i.estado === 'error').length

  async function guardar(lista: Borrador[]) {
    setGuardando(true)
    const clientes: Cliente[] = [...datos.clientes]
    try {
      for (const b of lista) {
        const { movimiento, clienteNuevo } = construirMovimiento(b, clientes)
        if (clienteNuevo) {
          await agregar('clientes', [clienteNuevo])
          clientes.push(clienteNuevo)
        }
        await agregar('movimientos', [movimiento])
        setEstados((e) => ({ ...e, [b.clave]: 'guardado' }))
      }
      aviso(lista.length === 1 ? 'Movimiento guardado' : `${lista.length} movimientos guardados`)
    } catch {
      // el aviso de error ya se mostró
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="pantalla-seccion">
      <p className="sub">
        Leídos {leidos} de {items.length} archivos · {todos.length} movimientos encontrados · {Object.values(estados).filter((e) => e === 'guardado').length} guardados
      </p>
      {completos.length > 1 && (
        <button className="btn btn-primario btn-grande" disabled={guardando} onClick={() => guardar(completos)}>
          Guardar los {completos.length} completos
        </button>
      )}

      {items.map((item) => (
        <section key={item.id} className="tarjeta lector-archivo">
          <p className="lector-nombre">
            {item.nombre}
            <span className="muted">
              {' · '}
              {item.estado === 'pendiente' ? 'en espera' : item.estado === 'leyendo' ? 'leyendo…' : item.estado === 'error' ? 'error' : `${item.borradores.length} movimiento(s)`}
            </span>
          </p>
          {item.error && <p className="mensaje negativo">{item.error}</p>}
          {item.estado === 'listo' && !item.borradores.length && <p className="ayuda">No encontré un pago en este archivo.</p>}
          {item.observacion && <p className="ayuda">{item.observacion}</p>}

          {item.borradores.map((b) => {
            const estado = estados[b.clave]
            const falta = faltantes(b)
            const dup = estado ? null : duplicado(b)
            return (
              <div key={b.clave} className={`borrador ${estado ? 'borrador-cerrado' : ''}`}>
                <div className="borrador-cabecera">
                  <strong>{ETIQUETA_TIPO[b.tipo]}</strong>
                  <strong className={`monto monto-${b.tipo}`}>{pesos(b.valor)}</strong>
                </div>
                <p className="borrador-detalle">
                  {[fechaLarga(b.fecha), b.tipo === 'transferencia' ? `${nombre(b.medio_pago_id) ?? '?'} → ${nombre(b.medio_destino_id) ?? '?'}` : nombre(b.medio_pago_id), nombre(b.categoria_id)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="borrador-detalle muted">{[b.tercero, b.descripcion].filter(Boolean).join(' · ')}</p>
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
                      <button className="btn-texto" onClick={() => setEstados(({ [b.clave]: _, ...resto }) => resto)}>
                        Deshacer
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn" onClick={() => setRevisando(b)}>
                        Revisar
                      </button>
                      <button className="btn btn-primario" disabled={guardando || falta.length > 0} onClick={() => guardar([b])}>
                        Guardar
                      </button>
                      <button className="btn-texto" onClick={() => setEstados((e) => ({ ...e, [b.clave]: 'descartado' }))}>
                        Descartar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {revisando && (
        <Hoja titulo="Revisar movimiento" onCerrar={() => setRevisando(null)}>
          <Registrar
            borrador={revisando}
            onGuardado={() => {
              setEstados((e) => ({ ...e, [revisando.clave]: 'guardado' }))
              setRevisando(null)
            }}
          />
        </Hoja>
      )}
    </div>
  )
}
