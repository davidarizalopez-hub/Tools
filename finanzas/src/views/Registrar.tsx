import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useDatos } from '../state'
import { CampoValor, Chips, Hoja, Segmentado } from '../components/ui'
import { LectorComprobantes, type LeidoPrevio } from '../components/LectorComprobantes'
import { aBorradores, buscarDuplicado, leerComprobante, type Borrador } from '../lib/comprobantes'
import type { Cliente, Compromiso, Movimiento, TipoMovimiento } from '../lib/types'
import { conMiles, hoy, leerValor, normalizar, nuevoId, pesos } from '../lib/format'

const TIPOS: { valor: TipoMovimiento; etiqueta: string }[] = [
  { valor: 'egreso', etiqueta: 'Gasto' },
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
]

const VISIBLES = 9

/** Ordena por cuántas veces se ha usado cada id en los movimientos. */
function porUso<T extends { id: string }>(lista: T[], usos: Map<string, number>) {
  return [...lista].sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0))
}

/**
 * Formulario de movimiento. Sin `inicial` ni `borrador` registra uno nuevo; con `inicial`
 * edita uno existente; con `borrador` registra uno nuevo prellenado desde un comprobante.
 */
export function Registrar({ inicial, borrador, onGuardado }: { inicial?: Movimiento; borrador?: Borrador; onGuardado: () => void }) {
  const { datos, modo, agregar, actualizar, aviso } = useDatos()
  const editando = !!inicial

  const [tipo, setTipo] = useState<TipoMovimiento>(inicial?.tipo ?? borrador?.tipo ?? 'egreso')
  const [valor, setValor] = useState(inicial ? conMiles(inicial.valor) : borrador ? conMiles(borrador.valor) : '')
  const [categoriaId, setCategoriaId] = useState<string | null>(inicial?.categoria_id ?? borrador?.categoria_id ?? null)
  const [medioId, setMedioId] = useState<string | null>(inicial?.medio_pago_id ?? borrador?.medio_pago_id ?? null)
  const [destinoId, setDestinoId] = useState<string | null>(inicial?.medio_destino_id ?? borrador?.medio_destino_id ?? null)
  const [fecha, setFecha] = useState(inicial?.fecha ?? borrador?.fecha ?? hoy())
  const [tercero, setTercero] = useState(
    inicial
      ? inicial.tipo === 'ingreso'
        ? (datos.clientes.find((c) => c.id === inicial.cliente_id)?.nombre ?? '')
        : (inicial.proveedor ?? '')
      : (borrador?.tercero ?? ''),
  )
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? borrador?.descripcion ?? '')
  const [cuotas, setCuotas] = useState(String(inicial?.cuotas ?? 1))
  const [comentarios, setComentarios] = useState(inicial?.comentarios ?? borrador?.comentarios ?? '')
  const [origen, setOrigen] = useState<Movimiento['origen']>(inicial?.origen ?? (borrador ? 'pantallazo' : 'manual'))
  const [alertas, setAlertas] = useState<string[]>(() => (borrador ? alertasDe(borrador, datos.movimientos) : []))
  const [leyendo, setLeyendo] = useState(false)
  const [lote, setLote] = useState<{ archivos: File[]; previos: LeidoPrevio[] } | null>(null)
  const [crearCompromiso, setCrearCompromiso] = useState(true)
  const [verTodas, setVerTodas] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const usos = useMemo(() => {
    const u = new Map<string, number>()
    for (const m of datos.movimientos) {
      for (const id of [m.categoria_id, m.medio_pago_id]) if (id) u.set(id, (u.get(id) ?? 0) + 1)
    }
    return u
  }, [datos.movimientos])

  const categorias = useMemo(
    () => porUso(datos.categorias.filter((c) => c.tipo === tipo && (c.activo || c.id === categoriaId)), usos),
    [datos.categorias, tipo, categoriaId, usos],
  )
  const medios = useMemo(
    () => porUso(datos.medios_pago.filter((m) => m.activo || m.id === medioId || m.id === destinoId), usos),
    [datos.medios_pago, medioId, destinoId, usos],
  )
  const proveedores = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const m of datos.movimientos) if (m.proveedor) vistos.set(normalizar(m.proveedor), m.proveedor)
    return [...vistos.values()].sort()
  }, [datos.movimientos])

  const visibles = verTodas ? categorias : categorias.slice(0, VISIBLES)
  if (categoriaId && !visibles.some((c) => c.id === categoriaId)) {
    const sel = categorias.find((c) => c.id === categoriaId)
    if (sel) visibles.push(sel)
  }

  const medio = datos.medios_pago.find((m) => m.id === medioId)
  const esTarjeta = tipo === 'egreso' && medio?.tipo === 'tarjeta_credito'
  const nCuotas = Math.max(1, Math.round(Number(cuotas) || 1))
  const monto = leerValor(valor)

  function aplicar(b: Borrador) {
    setTipo(b.tipo)
    setValor(conMiles(b.valor))
    setCategoriaId(b.categoria_id)
    setMedioId(b.medio_pago_id)
    setDestinoId(b.medio_destino_id)
    setFecha(b.fecha)
    setTercero(b.tercero)
    setDescripcion(b.descripcion)
    setComentarios(b.comentarios)
    setOrigen('pantallazo')
    setAlertas(alertasDe(b, datos.movimientos))
  }

  async function elegirComprobantes(e: ChangeEvent<HTMLInputElement>) {
    const archivos = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!archivos.length) return
    if (archivos.length > 1) return setLote({ archivos, previos: [] })
    setLeyendo(true)
    try {
      const borradores = aBorradores(await leerComprobante(archivos[0], datos), datos)
      if (!borradores.length) aviso('No encontré un pago en ese archivo')
      else if (borradores.length === 1) aplicar(borradores[0])
      else setLote({ archivos: [], previos: [{ nombre: archivos[0].name, borradores }] })
    } catch (err) {
      aviso(err instanceof Error ? err.message : String(err))
    } finally {
      setLeyendo(false)
    }
  }

  function cambiarTipo(t: TipoMovimiento) {
    setTipo(t)
    setCategoriaId(null)
    setTercero('')
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (monto <= 0) return aviso('Escribe el valor')
    if (!medioId) return aviso(tipo === 'transferencia' ? 'Elige la cuenta de origen' : 'Elige el medio de pago')
    if (tipo === 'transferencia' && (!destinoId || destinoId === medioId)) return aviso('Elige una cuenta de destino distinta')
    if (tipo !== 'transferencia' && !categoriaId) return aviso(tipo === 'egreso' ? 'Elige el tipo de egreso' : 'Elige el tipo de ingreso')

    setGuardando(true)
    try {
      let clienteId: string | null = null
      if (tipo === 'ingreso' && tercero.trim()) {
        const existente = datos.clientes.find((c) => normalizar(c.nombre) === normalizar(tercero))
        if (existente) clienteId = existente.id
        else {
          const nuevo: Cliente = { id: nuevoId(), nombre: tercero.trim(), telefono: null, notas: null, activo: true }
          await agregar('clientes', [nuevo])
          clienteId = nuevo.id
        }
      }
      const mov: Movimiento = {
        id: inicial?.id ?? nuevoId(),
        tipo,
        fecha,
        valor: monto,
        medio_pago_id: medioId,
        medio_destino_id: tipo === 'transferencia' ? destinoId : null,
        categoria_id: tipo === 'transferencia' ? null : categoriaId,
        cliente_id: clienteId,
        compromiso_id: inicial?.compromiso_id ?? null,
        proveedor: tipo === 'ingreso' ? null : tercero.trim() || null,
        descripcion: descripcion.trim() || null,
        cuotas: esTarjeta ? nCuotas : 1,
        comentarios: comentarios.trim() || null,
        origen,
      }

      if (editando) {
        const { id, ...cambios } = mov
        await actualizar('movimientos', id, cambios)
        aviso('Movimiento actualizado')
      } else {
        await agregar('movimientos', [mov])
        if (esTarjeta && nCuotas > 1 && crearCompromiso) {
          const c: Compromiso = {
            id: nuevoId(),
            nombre: `${descripcion.trim() || tercero.trim() || 'Compra'} (${nCuotas} cuotas)`,
            tipo: 'tarjeta',
            medio_pago_id: medioId,
            categoria_id: categoriaId,
            monto_cuota: Math.round(monto / nCuotas),
            dia_pago: null,
            cuotas_total: nCuotas,
            cuotas_pagadas: 0,
            saldo_pendiente: monto,
            activo: true,
            notas: 'Creado al registrar la compra. El valor de la cuota no incluye intereses.',
          }
          await agregar('compromisos', [c])
        }
        aviso(`${TIPOS.find((t) => t.valor === tipo)!.etiqueta} de ${pesos(monto)} guardado`)
        setValor('')
        setDescripcion('')
        setTercero('')
        setComentarios('')
        setCuotas('1')
        setCategoriaId(null)
        setOrigen('manual')
        setAlertas([])
      }
      onGuardado()
    } catch {
      // el aviso de error ya se mostró
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <form className="formulario" onSubmit={guardar}>
        {!editando && !borrador && (
          <div className="cabecera-registrar">
            <h1 className="titulo-pantalla">Registrar</h1>
            {modo === 'nube' && (
              <label className={`btn btn-archivo ${leyendo ? 'ocupado' : ''}`}>
                {leyendo ? 'Leyendo…' : '📷 Leer comprobante'}
                <input type="file" accept="image/*,application/pdf" multiple disabled={leyendo} onChange={elegirComprobantes} />
              </label>
            )}
          </div>
        )}
        {alertas.length > 0 && (
          <ul className="etiquetas">
            {alertas.map((a) => (
              <li key={a} className="etiqueta-alerta">
                {a}
              </li>
            ))}
          </ul>
        )}
        <Segmentado etiqueta="Tipo de movimiento" opciones={TIPOS} valor={tipo} onCambio={cambiarTipo} />

        <CampoValor etiqueta="Valor" valor={valor} onCambio={setValor} grande autoFocus={!editando && !borrador} />

        {tipo !== 'transferencia' && (
          <fieldset className="grupo">
            <legend>{tipo === 'egreso' ? 'Tipo de egreso' : 'Tipo de ingreso'}</legend>
            <Chips etiqueta="Categoría" opciones={visibles.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} valor={categoriaId} onCambio={setCategoriaId} />
            {categorias.length > VISIBLES && (
              <button type="button" className="btn-texto" onClick={() => setVerTodas(!verTodas)}>
                {verTodas ? 'Ver menos' : `Ver todas (${categorias.length})`}
              </button>
            )}
          </fieldset>
        )}

        <fieldset className="grupo">
          <legend>{tipo === 'transferencia' ? 'Desde' : tipo === 'egreso' ? 'Pagué con' : 'Recibí en'}</legend>
          <Chips etiqueta="Medio de pago" opciones={medios.map((m) => ({ valor: m.id, etiqueta: m.nombre }))} valor={medioId} onCambio={setMedioId} />
        </fieldset>

        {tipo === 'transferencia' && (
          <fieldset className="grupo">
            <legend>Hacia</legend>
            <Chips
              etiqueta="Cuenta de destino"
              opciones={medios.filter((m) => m.id !== medioId).map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
              valor={destinoId}
              onCambio={setDestinoId}
            />
            <p className="ayuda">Úsala para mover plata entre tus cuentas o pagar la tarjeta de crédito. No cuenta como gasto.</p>
          </fieldset>
        )}

        {esTarjeta && (
          <div className="fila-campos">
            <label className="campo">
              <span>Cuotas</span>
              <input type="number" inputMode="numeric" min={1} max={48} value={cuotas} onChange={(e) => setCuotas(e.target.value)} />
            </label>
            {nCuotas > 1 && !editando && (
              <label className="check">
                <input type="checkbox" checked={crearCompromiso} onChange={(e) => setCrearCompromiso(e.target.checked)} />
                <span>
                  Crear compromiso de {nCuotas} cuotas de {pesos(monto / nCuotas)}
                </span>
              </label>
            )}
          </div>
        )}

        <div className="fila-campos">
          <label className="campo">
            <span>Fecha</span>
            <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} required />
          </label>
          <label className="campo">
            <span>{tipo === 'ingreso' ? 'Cliente' : 'Proveedor'}</span>
            <input
              list={tipo === 'ingreso' ? 'lista-clientes' : 'lista-proveedores'}
              value={tercero}
              onChange={(e) => setTercero(e.target.value)}
              placeholder={tipo === 'ingreso' ? 'Quién te pagó' : 'Dónde pagaste'}
            />
          </label>
        </div>
        <datalist id="lista-clientes">
          {datos.clientes.filter((c) => c.activo).map((c) => (
            <option key={c.id} value={c.nombre} />
          ))}
        </datalist>
        <datalist id="lista-proveedores">
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <label className="campo">
          <span>Descripción</span>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: mercado de la semana" />
        </label>
        <label className="campo">
          <span>Comentarios (opcional)</span>
          <input value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </label>

        <button className="btn btn-primario btn-grande" disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
        </button>
      </form>

      {lote && (
        // Fuera del <form>: los botones del lector no deben enviar este formulario.
        <Hoja titulo="Comprobantes" onCerrar={() => setLote(null)}>
          <LectorComprobantes archivos={lote.archivos} previos={lote.previos} />
        </Hoja>
      )}
    </>
  )
}

function alertasDe(b: Borrador, movimientos: Movimiento[]): string[] {
  const dup = buscarDuplicado(b, movimientos, [])
  return [...(dup ? [`⚠ Posible duplicado: ${dup}`] : []), ...b.avisos]
}
