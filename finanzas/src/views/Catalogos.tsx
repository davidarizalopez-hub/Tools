import { useMemo, useState, type FormEvent } from 'react'
import { useDatos } from '../state'
import { CampoValor, Hoja, Segmentado } from '../components/ui'
import { ETIQUETA_NATURALEZA, ETIQUETA_TIPO_MEDIO, type Categoria, type Cliente, type MedioPago, type Naturaleza, type TipoMedio } from '../lib/types'
import { conMiles, leerValor, normalizar, nuevoId } from '../lib/format'

export type Catalogo = 'egreso' | 'ingreso' | 'clientes' | 'medios'

const PESTANAS: { valor: Catalogo; etiqueta: string }[] = [
  { valor: 'egreso', etiqueta: 'Egresos' },
  { valor: 'ingreso', etiqueta: 'Ingresos' },
  { valor: 'clientes', etiqueta: 'Clientes' },
  { valor: 'medios', etiqueta: 'Medios' },
]

const TITULOS: Record<Catalogo, string> = {
  egreso: 'Tipos de egreso',
  ingreso: 'Tipos de ingreso',
  clientes: 'Clientes',
  medios: 'Medios de pago',
}

interface Item {
  id: string
  nombre: string
  activo: boolean
  detalle: string
  usos: number
}

export function Catalogos() {
  const { datos } = useDatos()
  const [catalogo, setCatalogo] = useState<Catalogo>('egreso')
  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null)

  const usos = useMemo(() => {
    const u = new Map<string, number>()
    const sumar = (id: string | null) => id && u.set(id, (u.get(id) ?? 0) + 1)
    for (const m of datos.movimientos) [m.categoria_id, m.cliente_id, m.medio_pago_id, m.medio_destino_id].forEach(sumar)
    for (const c of datos.compromisos) [c.categoria_id, c.medio_pago_id].forEach(sumar)
    return u
  }, [datos.movimientos, datos.compromisos])

  const items: Item[] = useMemo(() => {
    const u = (id: string) => usos.get(id) ?? 0
    if (catalogo === 'clientes') return datos.clientes.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo, detalle: c.telefono ?? '', usos: u(c.id) }))
    if (catalogo === 'medios')
      return datos.medios_pago.map((m) => ({ id: m.id, nombre: m.nombre, activo: m.activo, detalle: ETIQUETA_TIPO_MEDIO[m.tipo], usos: u(m.id) }))
    return datos.categorias
      .filter((c) => c.tipo === catalogo)
      .map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo, detalle: c.naturaleza ? ETIQUETA_NATURALEZA[c.naturaleza] : '', usos: u(c.id) }))
  }, [catalogo, datos, usos])

  const q = normalizar(filtro)
  const visibles = items
    .filter((i) => !q || normalizar(i.nombre).includes(q))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <section className="pantalla-seccion">
      <Segmentado
        etiqueta="Catálogo"
        opciones={PESTANAS}
        valor={catalogo}
        onCambio={(c) => {
          setCatalogo(c)
          setFiltro('')
        }}
      />
      <div className="fila-campos">
        <input className="buscador-simple" type="search" placeholder={`Buscar en ${TITULOS[catalogo].toLowerCase()}…`} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>
          Agregar
        </button>
      </div>
      <p className="sub">
        {items.filter((i) => i.activo).length} activos · toca uno para editarlo
      </p>
      <ul className="lista tarjeta">
        {visibles.map((i) => (
          <li key={i.id}>
            <button className={`fila-catalogo ${i.activo ? '' : 'inactivo'}`} onClick={() => setEditando(i.id)}>
              <span>
                {i.nombre}
                {!i.activo && <small className="muted"> · archivado</small>}
              </span>
              <span className="muted">
                {i.detalle}
                {i.usos ? ` · ${i.usos} mov.` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {editando && (
        <Hoja titulo={`${editando === 'nuevo' ? 'Agregar a' : 'Editar en'} ${TITULOS[catalogo].toLowerCase()}`} onCerrar={() => setEditando(null)}>
          <EditorItem catalogo={catalogo} id={editando === 'nuevo' ? null : editando} usos={editando === 'nuevo' ? 0 : (usos.get(editando) ?? 0)} onListo={() => setEditando(null)} />
        </Hoja>
      )}
    </section>
  )
}

const OPCIONES_NATURALEZA = Object.entries(ETIQUETA_NATURALEZA).map(([valor, etiqueta]) => ({ valor: valor as Naturaleza, etiqueta }))

function EditorItem({ catalogo, id, usos, onListo }: { catalogo: Catalogo; id: string | null; usos: number; onListo: () => void }) {
  const { datos, agregar, actualizar, eliminar, aviso } = useDatos()
  const tabla = catalogo === 'clientes' ? 'clientes' : catalogo === 'medios' ? 'medios_pago' : 'categorias'
  const actual = id ? (datos[tabla] as { id: string }[]).find((x) => x.id === id) : undefined
  const cat = actual as Categoria | undefined
  const cli = actual as Cliente | undefined
  const med = actual as MedioPago | undefined

  const [nombre, setNombre] = useState((actual as { nombre?: string } | undefined)?.nombre ?? '')
  const [activo, setActivo] = useState((actual as { activo?: boolean } | undefined)?.activo ?? true)
  const [naturaleza, setNaturaleza] = useState<Naturaleza>(cat?.naturaleza ?? 'variable')
  const [telefono, setTelefono] = useState(cli?.telefono ?? '')
  const [notas, setNotas] = useState(cli?.notas ?? '')
  const [tipoMedio, setTipoMedio] = useState<TipoMedio>(med?.tipo ?? 'ahorros')
  const [saldo, setSaldo] = useState(med ? conMiles(Math.abs(med.saldo_inicial)) : '')

  const repetido = (n: string) => {
    const lista: { id: string; nombre: string }[] =
      catalogo === 'clientes' ? datos.clientes : catalogo === 'medios' ? datos.medios_pago : datos.categorias.filter((c) => c.tipo === catalogo)
    return lista.some((x) => x.id !== id && normalizar(x.nombre) === normalizar(n))
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return aviso('Escribe el nombre')
    if (repetido(n)) return aviso(`Ya existe "${n}"`)
    if (catalogo === 'clientes') {
      const fila = { nombre: n, activo, telefono: telefono.trim() || null, notas: notas.trim() || null }
      if (id) await actualizar('clientes', id, fila)
      else await agregar('clientes', [{ id: nuevoId(), ...fila }])
    } else if (catalogo === 'medios') {
      // En una tarjeta de crédito el valor escrito es deuda: se guarda como saldo negativo.
      const s = leerValor(saldo) * (tipoMedio === 'tarjeta_credito' ? -1 : 1)
      const fila = { nombre: n, activo, tipo: tipoMedio, saldo_inicial: s }
      if (id) await actualizar('medios_pago', id, fila)
      else await agregar('medios_pago', [{ id: nuevoId(), ...fila }])
    } else {
      const fila = { nombre: n, activo, tipo: catalogo, naturaleza: catalogo === 'egreso' ? naturaleza : null }
      if (id) await actualizar('categorias', id, fila)
      else await agregar('categorias', [{ id: nuevoId(), ...fila }])
    }
    aviso('Guardado')
    onListo()
  }

  async function borrar() {
    if (!id || !confirm(`¿Eliminar "${nombre}"?`)) return
    await eliminar(tabla, id)
    aviso('Eliminado')
    onListo()
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <label className="campo">
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!id} required />
      </label>

      {catalogo === 'egreso' && (
        <fieldset className="grupo">
          <legend>¿Qué tipo de gasto es?</legend>
          <Segmentado etiqueta="Naturaleza" opciones={OPCIONES_NATURALEZA} valor={naturaleza} onCambio={setNaturaleza} />
          <p className="ayuda">
            <b>Fijo</b>: se repite cada mes (arriendo, créditos, servicios). <b>Variable</b>: cambia según lo que consumas. <b>Ahorro</b>: plata que apartas; no cuenta como
            gasto.
          </p>
        </fieldset>
      )}

      {catalogo === 'clientes' && (
        <>
          <label className="campo">
            <span>Teléfono</span>
            <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label className="campo">
            <span>Notas</span>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: plan personalizado, paga los 5" />
          </label>
        </>
      )}

      {catalogo === 'medios' && (
        <>
          <label className="campo">
            <span>Tipo</span>
            <select value={tipoMedio} onChange={(e) => setTipoMedio(e.target.value as TipoMedio)}>
              {Object.entries(ETIQUETA_TIPO_MEDIO).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <CampoValor etiqueta={tipoMedio === 'tarjeta_credito' ? 'Deuda al empezar a usar la app' : 'Saldo al empezar a usar la app'} valor={saldo} onCambio={setSaldo} />
          <p className="ayuda">
            Con este valor y tus movimientos, la app calcula cuánto tienes{tipoMedio === 'tarjeta_credito' ? ' (o debes)' : ''} en cada medio de pago.
          </p>
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        <span>Activo (si lo desmarcas se archiva: no aparece al registrar, pero se conserva el historial)</span>
      </label>

      <button className="btn btn-primario btn-grande">Guardar</button>
      {id &&
        (usos === 0 ? (
          <button type="button" className="btn btn-peligro btn-grande" onClick={borrar}>
            Eliminar
          </button>
        ) : (
          <p className="ayuda">Tiene {usos} movimientos o compromisos asociados, por eso no se puede eliminar. Puedes archivarlo desmarcando "Activo".</p>
        ))}
    </form>
  )
}
