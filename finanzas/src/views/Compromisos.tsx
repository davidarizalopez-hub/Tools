import { useState, type FormEvent } from 'react'
import { useDatos } from '../state'
import { CampoValor, Chips, Hoja, Vacio } from '../components/ui'
import { compromisoVigente } from '../lib/stats'
import { ETIQUETA_TIPO_COMPROMISO, type Compromiso, type Movimiento, type TipoCompromiso } from '../lib/types'
import { conMiles, hoy, leerValor, mesDe, nuevoId, pesos, pesosCorto } from '../lib/format'

export function Compromisos() {
  const { datos } = useDatos()
  const [editando, setEditando] = useState<Compromiso | 'nuevo' | null>(null)
  const [pagando, setPagando] = useState<Compromiso | null>(null)
  const [verTerminados, setVerTerminados] = useState(false)

  const mesActual = mesDe(hoy())
  const pagadoEsteMes = (c: Compromiso) => datos.movimientos.some((m) => m.compromiso_id === c.id && mesDe(m.fecha) === mesActual)
  const vigentes = datos.compromisos.filter(compromisoVigente).sort((a, b) => (a.dia_pago ?? 32) - (b.dia_pago ?? 32))
  const terminados = datos.compromisos.filter((c) => !compromisoVigente(c))
  const totalMes = vigentes.reduce((s, c) => s + c.monto_cuota, 0)
  const pendienteMes = vigentes.filter((c) => !pagadoEsteMes(c)).reduce((s, c) => s + c.monto_cuota, 0)
  const deudaTotal = vigentes.reduce((s, c) => s + (c.saldo_pendiente ?? 0), 0)

  return (
    <div className="pantalla">
      <h1 className="titulo-pantalla">Compromisos</h1>
      <section className="tarjeta">
        <div className="tiles">
          <div className="tile">
            <span className="etiqueta">Cada mes</span>
            <span className="tile-valor">{pesosCorto(totalMes)}</span>
          </div>
          <div className="tile">
            <span className="etiqueta">Falta pagar este mes</span>
            <span className="tile-valor">{pesosCorto(pendienteMes)}</span>
          </div>
          <div className="tile">
            <span className="etiqueta">Deuda pendiente</span>
            <span className="tile-valor">{pesosCorto(deudaTotal)}</span>
          </div>
        </div>
      </section>

      <button className="btn btn-primario btn-grande" onClick={() => setEditando('nuevo')}>
        Nuevo compromiso
      </button>

      {vigentes.length === 0 ? (
        <Vacio titulo="No tienes compromisos activos">
          <p className="muted">Agrega aquí tus créditos, cuotas de tarjeta, arriendo, suscripciones y servicios. Se usan para proyectar tus gastos fijos.</p>
        </Vacio>
      ) : (
        <ul className="lista-tarjetas">
          {vigentes.map((c) => (
            <TarjetaCompromiso key={c.id} c={c} pagado={pagadoEsteMes(c)} onPagar={() => setPagando(c)} onEditar={() => setEditando(c)} />
          ))}
        </ul>
      )}

      {terminados.length > 0 && (
        <button className="btn-texto" onClick={() => setVerTerminados(!verTerminados)}>
          {verTerminados ? 'Ocultar' : 'Ver'} terminados o pausados ({terminados.length})
        </button>
      )}
      {verTerminados && (
        <ul className="lista-tarjetas">
          {terminados.map((c) => (
            <TarjetaCompromiso key={c.id} c={c} pagado={false} onEditar={() => setEditando(c)} />
          ))}
        </ul>
      )}

      {editando && (
        <Hoja titulo={editando === 'nuevo' ? 'Nuevo compromiso' : 'Editar compromiso'} onCerrar={() => setEditando(null)}>
          <FormCompromiso inicial={editando === 'nuevo' ? undefined : editando} onListo={() => setEditando(null)} />
        </Hoja>
      )}
      {pagando && (
        <Hoja titulo={`Pagar: ${pagando.nombre}`} onCerrar={() => setPagando(null)}>
          <FormPago c={pagando} onListo={() => setPagando(null)} />
        </Hoja>
      )}
    </div>
  )
}

function TarjetaCompromiso({ c, pagado, onPagar, onEditar }: { c: Compromiso; pagado: boolean; onPagar?: () => void; onEditar: () => void }) {
  const progreso = c.cuotas_total ? c.cuotas_pagadas / c.cuotas_total : null
  return (
    <li className="tarjeta compromiso">
      <div className="compromiso-cabecera">
        <div>
          <strong>{c.nombre}</strong>
          <p className="muted">
            {ETIQUETA_TIPO_COMPROMISO[c.tipo]}
            {c.dia_pago ? ` · se paga el día ${c.dia_pago}` : ''}
          </p>
        </div>
        <span className="compromiso-monto">{pesos(c.monto_cuota)}</span>
      </div>
      {progreso != null && (
        <div className="medidor" role="meter" aria-valuemin={0} aria-valuemax={c.cuotas_total!} aria-valuenow={c.cuotas_pagadas} aria-label="Cuotas pagadas">
          <div style={{ width: `${progreso * 100}%` }} />
        </div>
      )}
      <p className="muted compromiso-detalle">
        {c.cuotas_total ? `Cuota ${c.cuotas_pagadas} de ${c.cuotas_total}` : 'Sin fecha de fin'}
        {c.saldo_pendiente != null ? ` · Saldo ${pesos(c.saldo_pendiente)}` : ''}
      </p>
      <div className="acciones">
        {onPagar &&
          (pagado ? (
            <span className="estado-pagado">✓ Pagado este mes</span>
          ) : (
            <button className="btn btn-primario" onClick={onPagar}>
              Registrar pago
            </button>
          ))}
        <button className="btn" onClick={onEditar}>
          Editar
        </button>
      </div>
    </li>
  )
}

const TIPOS_COMPROMISO = Object.entries(ETIQUETA_TIPO_COMPROMISO).map(([valor, etiqueta]) => ({ valor: valor as TipoCompromiso, etiqueta }))

function FormCompromiso({ inicial, onListo }: { inicial?: Compromiso; onListo: () => void }) {
  const { datos, agregar, actualizar, eliminar, aviso } = useDatos()
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoCompromiso>(inicial?.tipo ?? 'credito')
  const [monto, setMonto] = useState(inicial ? conMiles(inicial.monto_cuota) : '')
  const [dia, setDia] = useState(inicial?.dia_pago ? String(inicial.dia_pago) : '')
  const [cuotasTotal, setCuotasTotal] = useState(inicial?.cuotas_total ? String(inicial.cuotas_total) : '')
  const [cuotasPagadas, setCuotasPagadas] = useState(String(inicial?.cuotas_pagadas ?? 0))
  const [saldo, setSaldo] = useState(inicial?.saldo_pendiente != null ? conMiles(inicial.saldo_pendiente) : '')
  const [medioId, setMedioId] = useState<string | null>(inicial?.medio_pago_id ?? null)
  const [categoriaId, setCategoriaId] = useState<string>(inicial?.categoria_id ?? '')
  const [activo, setActivo] = useState(inicial?.activo ?? true)
  const [notas, setNotas] = useState(inicial?.notas ?? '')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return aviso('Ponle un nombre')
    if (leerValor(monto) <= 0) return aviso('Escribe el valor de la cuota')
    const fila: Omit<Compromiso, 'id'> = {
      nombre: nombre.trim(),
      tipo,
      monto_cuota: leerValor(monto),
      dia_pago: dia ? Math.min(31, Math.max(1, Number(dia))) : null,
      cuotas_total: cuotasTotal ? Math.max(1, Number(cuotasTotal)) : null,
      cuotas_pagadas: Math.max(0, Number(cuotasPagadas) || 0),
      saldo_pendiente: saldo ? leerValor(saldo) : null,
      medio_pago_id: medioId,
      categoria_id: categoriaId || null,
      activo,
      notas: notas.trim() || null,
    }
    if (inicial) await actualizar('compromisos', inicial.id, fila)
    else await agregar('compromisos', [{ id: nuevoId(), ...fila }])
    aviso('Compromiso guardado')
    onListo()
  }

  async function borrar() {
    if (!inicial || !confirm('¿Eliminar este compromiso? Los pagos ya registrados se conservan.')) return
    await eliminar('compromisos', inicial.id)
    onListo()
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      <label className="campo">
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Crédito Davivienda" required />
      </label>
      <fieldset className="grupo">
        <legend>Tipo</legend>
        <Chips etiqueta="Tipo de compromiso" opciones={TIPOS_COMPROMISO} valor={tipo} onCambio={setTipo} />
      </fieldset>
      <div className="fila-campos">
        <CampoValor etiqueta="Valor de la cuota" valor={monto} onCambio={setMonto} />
        <label className="campo">
          <span>Día de pago</span>
          <input type="number" inputMode="numeric" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} placeholder="1-31" />
        </label>
      </div>
      <div className="fila-campos">
        <label className="campo">
          <span>Total de cuotas</span>
          <input type="number" inputMode="numeric" min={1} value={cuotasTotal} onChange={(e) => setCuotasTotal(e.target.value)} placeholder="Vacío = sin fin" />
        </label>
        <label className="campo">
          <span>Cuotas pagadas</span>
          <input type="number" inputMode="numeric" min={0} value={cuotasPagadas} onChange={(e) => setCuotasPagadas(e.target.value)} />
        </label>
      </div>
      <CampoValor etiqueta="Saldo pendiente (opcional)" valor={saldo} onCambio={setSaldo} />
      <label className="campo">
        <span>Tipo de egreso al pagar</span>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">— Ninguno —</option>
          {datos.categorias
            .filter((c) => c.tipo === 'egreso' && (c.activo || c.id === categoriaId))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </select>
      </label>
      <fieldset className="grupo">
        <legend>{tipo === 'tarjeta' ? 'Tarjeta' : 'Se paga normalmente con'}</legend>
        <Chips
          etiqueta="Medio de pago"
          opciones={datos.medios_pago.filter((m) => m.activo || m.id === medioId).map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
          valor={medioId}
          onCambio={setMedioId}
        />
      </fieldset>
      <label className="campo">
        <span>Notas</span>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        <span>Activo</span>
      </label>
      <button className="btn btn-primario btn-grande">Guardar</button>
      {inicial && (
        <button type="button" className="btn btn-peligro btn-grande" onClick={borrar}>
          Eliminar compromiso
        </button>
      )}
    </form>
  )
}

/**
 * Registra el pago de una cuota. Si es cuota de tarjeta se guarda como transferencia
 * hacia la tarjeta (la compra ya se contó como gasto); si no, como egreso.
 */
function FormPago({ c, onListo }: { c: Compromiso; onListo: () => void }) {
  const { datos, agregar, actualizar, aviso } = useDatos()
  const esTarjeta = c.tipo === 'tarjeta'
  const [monto, setMonto] = useState(conMiles(c.monto_cuota))
  const [fecha, setFecha] = useState(hoy())
  const [medioId, setMedioId] = useState<string | null>(esTarjeta ? null : c.medio_pago_id)
  const origenes = datos.medios_pago.filter((m) => m.activo && !(esTarjeta && m.id === c.medio_pago_id))

  async function pagar(e: FormEvent) {
    e.preventDefault()
    const valor = leerValor(monto)
    if (valor <= 0) return aviso('Escribe el valor pagado')
    if (!medioId) return aviso('Elige con qué pagaste')
    if (esTarjeta && !c.medio_pago_id) return aviso('Edita el compromiso y elige a qué tarjeta corresponde')
    const mov: Movimiento = {
      id: nuevoId(),
      tipo: esTarjeta ? 'transferencia' : 'egreso',
      fecha,
      valor,
      medio_pago_id: medioId,
      medio_destino_id: esTarjeta ? c.medio_pago_id : null,
      categoria_id: esTarjeta ? null : c.categoria_id,
      cliente_id: null,
      compromiso_id: c.id,
      proveedor: null,
      descripcion: c.cuotas_total ? `${c.nombre} · cuota ${c.cuotas_pagadas + 1} de ${c.cuotas_total}` : c.nombre,
      cuotas: 1,
      comentarios: null,
      origen: 'manual',
    }
    await agregar('movimientos', [mov])
    await actualizar('compromisos', c.id, {
      cuotas_pagadas: c.cuotas_pagadas + 1,
      saldo_pendiente: c.saldo_pendiente != null ? Math.max(0, c.saldo_pendiente - valor) : null,
    })
    aviso('Pago registrado')
    onListo()
  }

  return (
    <form className="formulario" onSubmit={pagar}>
      <CampoValor etiqueta="Valor pagado" valor={monto} onCambio={setMonto} grande />
      <label className="campo">
        <span>Fecha</span>
        <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <fieldset className="grupo">
        <legend>Pagué con</legend>
        <Chips etiqueta="Medio de pago" opciones={origenes.map((m) => ({ valor: m.id, etiqueta: m.nombre }))} valor={medioId} onCambio={setMedioId} />
      </fieldset>
      {esTarjeta && <p className="ayuda">Se guarda como transferencia hacia la tarjeta: la compra ya contó como gasto cuando la hiciste.</p>}
      {!esTarjeta && !c.categoria_id && <p className="ayuda">Este compromiso no tiene tipo de egreso; edítalo para que el pago aparezca bien en tus estadísticas.</p>}
      <button className="btn btn-primario btn-grande">Registrar pago</button>
    </form>
  )
}
