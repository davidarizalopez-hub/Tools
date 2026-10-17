import { useMemo, useState } from 'react'
import { useDatos } from '../state'
import { Hoja, Segmentado, SelectorMes, Vacio } from '../components/ui'
import { Icono } from '../components/Icono'
import { Registrar } from './Registrar'
import type { Movimiento, TipoMovimiento } from '../lib/types'
import { fechaLarga, mesDe, normalizar, pesos } from '../lib/format'

type Filtro = 'todos' | TipoMovimiento

export function Movimientos({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const { datos, eliminar, aviso } = useDatos()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Movimiento | null>(null)

  const nombre = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of [datos.categorias, datos.medios_pago, datos.clientes]) for (const x of l) m.set(x.id, x.nombre)
    return (id: string | null) => (id ? (m.get(id) ?? '—') : '—')
  }, [datos])

  const lista = useMemo(() => {
    const q = normalizar(busqueda)
    return datos.movimientos
      .filter((m) => mesDe(m.fecha) === mes && (filtro === 'todos' || m.tipo === filtro))
      .filter((m) => {
        if (!q) return true
        const texto = [m.descripcion, m.proveedor, m.comentarios, nombre(m.categoria_id), nombre(m.cliente_id), nombre(m.medio_pago_id), String(m.valor)].join(' ')
        return normalizar(texto).includes(q)
      })
      .sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1))
  }, [datos.movimientos, mes, filtro, busqueda, nombre])

  const porDia = useMemo(() => {
    const g = new Map<string, Movimiento[]>()
    for (const m of lista) g.set(m.fecha, [...(g.get(m.fecha) ?? []), m])
    return [...g.entries()]
  }, [lista])

  const total = (t: TipoMovimiento) => lista.filter((m) => m.tipo === t).reduce((s, m) => s + m.valor, 0)

  async function borrar(m: Movimiento) {
    if (!confirm(`¿Eliminar este movimiento de ${pesos(m.valor)}?`)) return
    await eliminar('movimientos', m.id)
    setEditando(null)
    aviso('Movimiento eliminado')
  }

  return (
    <div className="pantalla">
      <SelectorMes mes={mes} setMes={setMes} />
      <Segmentado
        etiqueta="Filtrar"
        valor={filtro}
        onCambio={setFiltro}
        opciones={[
          { valor: 'todos', etiqueta: 'Todos' },
          { valor: 'egreso', etiqueta: 'Gastos' },
          { valor: 'ingreso', etiqueta: 'Ingresos' },
          { valor: 'transferencia', etiqueta: 'Transf.' },
        ]}
      />
      <label className="buscador">
        <Icono nombre="buscar" tam={18} />
        <input type="search" placeholder="Buscar por descripción, proveedor, cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>

      {lista.length > 0 && (
        <p className="totales-lista">
          {lista.length} movimientos · Ingresos <strong>{pesos(total('ingreso'))}</strong> · Gastos <strong>{pesos(total('egreso'))}</strong>
        </p>
      )}

      {porDia.length === 0 ? (
        <Vacio titulo={busqueda ? 'Nada coincide con tu búsqueda' : 'Sin movimientos en este mes'} />
      ) : (
        porDia.map(([fecha, movs]) => (
          <section key={fecha} className="dia">
            <h3 className="dia-titulo">{fechaLarga(fecha)}</h3>
            <ul className="lista">
              {movs.map((m) => (
                <li key={m.id}>
                  <button className="fila-mov" onClick={() => setEditando(m)}>
                    <div className="fila-mov-texto">
                      <span className="fila-mov-titulo">
                        {m.tipo === 'transferencia' ? `${nombre(m.medio_pago_id)} → ${nombre(m.medio_destino_id)}` : nombre(m.categoria_id)}
                      </span>
                      <span className="fila-mov-detalle">
                        {[m.tipo === 'ingreso' ? (m.cliente_id ? nombre(m.cliente_id) : null) : m.proveedor, m.descripcion].filter(Boolean).join(' · ') || 'Sin descripción'}
                      </span>
                      {m.tipo !== 'transferencia' && (
                        <span className="fila-mov-medio">
                          {nombre(m.medio_pago_id)}
                          {m.cuotas > 1 ? ` · ${m.cuotas} cuotas` : ''}
                        </span>
                      )}
                    </div>
                    <span className={`monto monto-${m.tipo}`}>
                      {m.tipo === 'ingreso' ? '+' : m.tipo === 'egreso' ? '−' : ''}
                      {pesos(m.valor)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editando && (
        <Hoja titulo="Editar movimiento" onCerrar={() => setEditando(null)}>
          <Registrar inicial={editando} onGuardado={() => setEditando(null)} />
          <button className="btn btn-peligro btn-grande" onClick={() => borrar(editando)}>
            Eliminar movimiento
          </button>
        </Hoja>
      )}
    </div>
  )
}
