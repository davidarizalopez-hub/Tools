import { useMemo, useState, type KeyboardEvent } from 'react'
import { useDatos } from '../state'
import { Chips, Hoja } from './ui'
import { Icono } from './Icono'
import { ETIQUETA_NATURALEZA, type Categoria, type TipoCategoria } from '../lib/types'
import { normalizar, nuevoId } from '../lib/format'

const MAS_USADOS = 5

const alfabetico = (a: Categoria, b: Categoria) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
const inicial = (c: Categoria) => normalizar(c.nombre).charAt(0).toUpperCase()

/**
 * Elegir el tipo de egreso o de ingreso: los 5 más usados quedan a un toque y el resto
 * se busca en una lista alfabética, donde también se puede crear uno nuevo.
 */
export function SelectorCategoria(props: {
  tipo: TipoCategoria
  categorias: Categoria[]
  usos: Map<string, number>
  valor: string | null
  onCambio: (id: string) => void
}) {
  const { tipo, categorias, usos, valor, onCambio } = props
  const [abierto, setAbierto] = useState(false)

  const masUsados = useMemo(
    () =>
      categorias
        .filter((c) => (usos.get(c.id) ?? 0) > 0)
        .sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0) || alfabetico(a, b))
        .slice(0, MAS_USADOS),
    [categorias, usos],
  )
  // El elegido siempre se ve, aunque no esté entre los más usados.
  const elegido = categorias.find((c) => c.id === valor)
  const atajos = elegido && !masUsados.includes(elegido) ? [elegido, ...masUsados] : masUsados

  return (
    <>
      {atajos.length > 0 && (
        <Chips etiqueta={tipo === 'egreso' ? 'Tipos de egreso más usados' : 'Tipos de ingreso más usados'} opciones={atajos.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} valor={valor} onCambio={onCambio} />
      )}
      <button type="button" className="campo-buscar" onClick={() => setAbierto(true)}>
        <Icono nombre="buscar" tam={18} />
        <span>{atajos.length ? `Buscar en todos (${categorias.length})` : `Elegir entre ${categorias.length}`}</span>
      </button>
      {abierto && (
        <ListaCategorias
          tipo={tipo}
          categorias={categorias}
          masUsados={masUsados}
          valor={valor}
          onElegir={(id) => {
            onCambio(id)
            setAbierto(false)
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  )
}

function ListaCategorias(props: {
  tipo: TipoCategoria
  categorias: Categoria[]
  masUsados: Categoria[]
  valor: string | null
  onElegir: (id: string) => void
  onCerrar: () => void
}) {
  const { tipo, categorias, masUsados, valor, onElegir, onCerrar } = props
  const { datos, agregar, aviso } = useDatos()
  const [busqueda, setBusqueda] = useState('')
  const q = normalizar(busqueda)

  const ordenadas = useMemo(() => [...categorias].sort(alfabetico), [categorias])
  const resultados = q ? ordenadas.filter((c) => normalizar(c.nombre).includes(q)) : ordenadas
  const existe = datos.categorias.some((c) => c.tipo === tipo && normalizar(c.nombre) === q)
  // Crear solo se ofrece cuando la búsqueda no encuentra nada, para no confundir con los que ya existen.
  const puedeCrear = busqueda.trim().length >= 3 && !existe && !resultados.length

  // Agrupa por letra inicial para recorrer la lista como un directorio.
  const porLetra = useMemo(() => {
    const grupos = new Map<string, Categoria[]>()
    for (const c of resultados) grupos.set(inicial(c), [...(grupos.get(inicial(c)) ?? []), c])
    return [...grupos.entries()]
  }, [resultados])

  async function crear() {
    const nombre = busqueda.trim()
    const nueva: Categoria = { id: nuevoId(), nombre, tipo, naturaleza: tipo === 'egreso' ? 'variable' : null, activo: true }
    try {
      await agregar('categorias', [nueva])
      aviso(`Creado "${nombre}"`)
      onElegir(nueva.id)
    } catch {
      // el aviso de error ya se mostró
    }
  }

  function alPresionar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (resultados.length) onElegir(resultados[0].id)
    else if (puedeCrear) void crear()
  }

  const fila = (c: Categoria) => (
    <li key={c.id}>
      <button type="button" className="opcion-lista" aria-pressed={c.id === valor} onClick={() => onElegir(c.id)}>
        <span>{c.nombre}</span>
        <span className="muted">
          {c.naturaleza ? ETIQUETA_NATURALEZA[c.naturaleza] : ''}
          {c.id === valor ? ' ✓' : ''}
        </span>
      </button>
    </li>
  )

  return (
    <Hoja titulo={tipo === 'egreso' ? 'Tipo de egreso' : 'Tipo de ingreso'} onCerrar={onCerrar}>
      <label className="buscador buscador-fijo">
        <Icono nombre="buscar" tam={18} />
        <input
          id="buscar-categoria"
          type="search"
          placeholder="Escribe para buscar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={alPresionar}
          // En computador el cursor queda listo para escribir; en el celular no se abre el teclado sin pedirlo.
          autoFocus={window.matchMedia('(pointer: fine)').matches}
          aria-label="Buscar tipo"
        />
      </label>

      {!q && masUsados.length > 0 && (
        <section>
          <h3 className="letra">Más usados</h3>
          <ul className="lista">{masUsados.map(fila)}</ul>
        </section>
      )}

      {porLetra.map(([letra, lista]) => (
        <section key={letra}>
          <h3 className="letra">{letra}</h3>
          <ul className="lista">{lista.map(fila)}</ul>
        </section>
      ))}

      {q && !resultados.length && <p className="ayuda">No hay ningún tipo que contenga "{busqueda.trim()}".</p>}
      {puedeCrear && (
        <button type="button" className="btn btn-grande" onClick={crear}>
          + Crear "{busqueda.trim()}"
        </button>
      )}
      {puedeCrear && tipo === 'egreso' && <p className="ayuda">Se crea como gasto variable; puedes cambiarlo a fijo en Ajustes → Catálogos.</p>}
    </Hoja>
  )
}
