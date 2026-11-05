import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useDatos } from '../state'
import { Chips, Hoja, Vacio } from '../components/ui'
import { Icono } from '../components/Icono'
import { TarjetaBorrador } from '../components/TarjetaBorrador'
import { Registrar } from './Registrar'
import { cerrarPendientes, prepararRevision, type EstadoPendiente, type Pendiente, type Revision } from '../lib/bandeja'
import { construirMovimiento } from '../lib/comprobantes'
import type { Cliente, Movimiento } from '../lib/types'
import { nombreMes, nombreMesCorto, pesos } from '../lib/format'

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Bandeja "Por revisar": los movimientos encontrados en los correos, mes por mes. Nada entra a
 * las estadísticas hasta que el usuario lo guarda; lo que no sirve se descarta.
 */
export function Bandeja(props: { pendientes: Pendiente[]; setPendientes: Dispatch<SetStateAction<Pendiente[]>>; onVolver: () => void }) {
  const { pendientes, setPendientes, onVolver } = props
  const { datos, agregar, aviso } = useDatos()
  const revisiones = useMemo(() => prepararRevision(pendientes, datos), [pendientes, datos])
  const [mesElegido, setMesElegido] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [revisando, setRevisando] = useState<Revision | null>(null)

  const meses = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of revisiones) m.set(r.mes, (m.get(r.mes) ?? 0) + (r.pendiente.estado === 'pendiente' ? 1 : 0))
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [revisiones])
  const abiertosTotal = revisiones.filter((r) => r.pendiente.estado === 'pendiente').length
  const primeroAbierto = meses.find(([, n]) => n > 0)?.[0] ?? meses[0]?.[0] ?? null
  const mes = mesElegido && meses.some(([m]) => m === mesElegido) ? mesElegido : primeroAbierto
  const delMes = revisiones.filter((r) => r.mes === mes)
  const abiertos = delMes.filter((r) => r.pendiente.estado === 'pendiente')
  const listos = abiertos.filter((r) => r.listo)
  const repetidos = abiertos.filter((r) => r.registrado)
  const siguiente = meses.find(([m, n]) => mes && m > mes && n > 0)?.[0]

  function marcar(ids: string[], estado: EstadoPendiente, movimientos?: Map<string, string>) {
    const conjunto = new Set(ids)
    setPendientes((l) => l.map((p) => (conjunto.has(p.id) ? { ...p, estado, movimiento_id: movimientos?.get(p.id) ?? null } : p)))
  }

  async function cambiar(lista: Revision[], estado: EstadoPendiente) {
    setOcupado(true)
    try {
      await cerrarPendientes(lista.map((r) => ({ id: r.pendiente.id })), estado)
      marcar(lista.map((r) => r.pendiente.id), estado)
      if (lista.length > 1) aviso(`${lista.length} descartados`)
    } catch (e) {
      aviso(`No se pudo actualizar la bandeja: ${mensaje(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function guardar(lista: Revision[]) {
    setOcupado(true)
    try {
      const clientes: Cliente[] = [...datos.clientes]
      const nuevos: Cliente[] = []
      const hechos = lista.map((r) => {
        const { movimiento, clienteNuevo } = construirMovimiento(r.borrador, clientes)
        if (clienteNuevo) {
          clientes.push(clienteNuevo)
          nuevos.push(clienteNuevo)
        }
        return { id: r.pendiente.id, movimiento }
      })
      await agregar('clientes', nuevos)
      await agregar(
        'movimientos',
        hechos.map((h) => h.movimiento),
      )
      await cerrarPendientes(
        hechos.map((h) => ({ id: h.id, movimiento_id: h.movimiento.id })),
        'guardado',
      )
      marcar(
        hechos.map((h) => h.id),
        'guardado',
        new Map(hechos.map((h) => [h.id, h.movimiento.id])),
      )
      aviso(lista.length === 1 ? 'Movimiento guardado' : `${lista.length} movimientos guardados`)
    } catch (e) {
      aviso(`No se pudo guardar: ${mensaje(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function revisado(r: Revision, movimiento: Movimiento) {
    setRevisando(null)
    try {
      await cerrarPendientes([{ id: r.pendiente.id, movimiento_id: movimiento.id }], 'guardado')
      marcar([r.pendiente.id], 'guardado', new Map([[r.pendiente.id, movimiento.id]]))
    } catch (e) {
      aviso(`Se guardó el movimiento, pero no se pudo sacar de la bandeja: ${mensaje(e)}`)
    }
  }

  return (
    <div className="pantalla">
      <div className="cabecera-bandeja">
        <button className="btn-icono" aria-label="Volver a Inicio" onClick={onVolver}>
          <Icono nombre="izquierda" />
        </button>
        <h1 className="titulo-pantalla">Por revisar</h1>
      </div>

      {!revisiones.length ? (
        <Vacio titulo="No tienes movimientos por revisar">
          <button className="btn" onClick={onVolver}>
            Volver a Inicio
          </button>
        </Vacio>
      ) : (
        <>
          <p className="sub">
            {abiertosTotal
              ? `${abiertosTotal} movimientos encontrados en tus correos. Nada entra a tus cuentas hasta que lo guardes.`
              : '¡Revisaste todo! Ya no quedan movimientos pendientes.'}
          </p>
          <Chips
            etiqueta="Mes"
            opciones={meses.map(([m, n]) => ({ valor: m, etiqueta: `${nombreMesCorto(m)} · ${n || '✓'}` }))}
            valor={mes}
            onCambio={setMesElegido}
          />

          {mes && (
            <section className="tarjeta lector-archivo">
              <div className="borrador-cabecera">
                <h2>{nombreMes(mes)}</h2>
                <span className="muted">{abiertos.length ? `${abiertos.length} por revisar` : 'Revisado'}</span>
              </div>
              {abiertos.length > 0 && (
                <p className="ayuda">
                  Gastos {pesos(sumar(abiertos, 'egreso'))} · Ingresos {pesos(sumar(abiertos, 'ingreso'))} sin revisar. Las transferencias entre tus cuentas y
                  los pagos de la tarjeta no cuentan como gasto.
                </p>
              )}
              {(listos.length > 1 || repetidos.length > 0) && (
                <div className="acciones">
                  {listos.length > 1 && (
                    <button className="btn btn-primario" disabled={ocupado} onClick={() => guardar(listos)}>
                      Guardar los {listos.length} listos
                    </button>
                  )}
                  {repetidos.length > 0 && (
                    <button className="btn" disabled={ocupado} onClick={() => cambiar(repetidos, 'descartado')}>
                      Descartar {repetidos.length} que ya registraste
                    </button>
                  )}
                </div>
              )}

              {delMes.map((r) => {
                const estado = r.pendiente.estado === 'pendiente' ? undefined : r.pendiente.estado
                return (
                  <TarjetaBorrador
                    key={r.pendiente.id}
                    b={r.borrador}
                    estado={estado}
                    duplicado={r.duplicado}
                    ocupado={ocupado}
                    extracto={<Extracto p={r.pendiente} />}
                    onRevisar={() => setRevisando(r)}
                    onGuardar={() => guardar([r])}
                    onDescartar={() => cambiar([r], 'descartado')}
                    onDeshacer={() => cambiar([r], 'pendiente')}
                  />
                )
              })}

              {!abiertos.length && siguiente && (
                <button className="btn btn-grande" onClick={() => setMesElegido(siguiente)}>
                  Seguir con {nombreMes(siguiente)}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {revisando && (
        <Hoja titulo="Revisar movimiento" onCerrar={() => setRevisando(null)}>
          <p className="borrador-extracto">
            <Extracto p={revisando.pendiente} />
          </p>
          <Registrar key={revisando.pendiente.id} borrador={revisando.borrador} onGuardado={(m) => revisado(revisando, m)} />
        </Hoja>
      )}
    </div>
  )
}

function Extracto({ p }: { p: Pendiente }) {
  if (!p.datos.extracto) return null
  return (
    <>
      <span aria-hidden="true">✉️ </span>
      {p.remitente && <strong>{p.remitente}: </strong>}
      {p.datos.extracto}
    </>
  )
}

function sumar(lista: Revision[], tipo: 'egreso' | 'ingreso') {
  return lista.filter((r) => r.borrador.tipo === tipo).reduce((s, r) => s + r.borrador.valor, 0)
}
