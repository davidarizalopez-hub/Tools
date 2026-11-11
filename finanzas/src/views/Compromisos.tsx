import { useState, type FormEvent } from 'react'
import { useDatos } from '../state'
import { CampoValor, Chips, Hoja, Segmentado, Vacio } from '../components/ui'
import { compromisoVigente } from '../lib/stats'
import { consultarCredito, debeConsultar, interesMensual, mvAEa, tieneTasa, type AnalisisCredito, type OpcionCredito } from '../lib/creditos'
import { ETIQUETA_TIPO_COMPROMISO, type Compromiso, type Movimiento, type TipoCompromiso } from '../lib/types'
import { conMiles, hoy, leerValor, mesDe, nuevoId, pesos, pesosCorto } from '../lib/format'

const fmtTasa = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
/** Solo enlaces web: el texto viene de una búsqueda en internet. */
const enlaceSeguro = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

export function Compromisos() {
  const { datos, modo, actualizar, aviso } = useDatos()
  const [editando, setEditando] = useState<Compromiso | 'nuevo' | null>(null)
  const [pagando, setPagando] = useState<Compromiso | null>(null)
  const [verTerminados, setVerTerminados] = useState(false)
  const [consultando, setConsultando] = useState<ReadonlySet<string>>(new Set())
  const [viendo, setViendo] = useState<string | null>(null)
  const nube = modo === 'nube'

  /** Compara el crédito con el mercado de este mes y guarda el análisis en el compromiso. */
  async function consultar(c: Compromiso) {
    setConsultando((s) => new Set(s).add(c.id))
    try {
      const analisis = await consultarCredito(c)
      await actualizar('compromisos', c.id, { analisis, analizado_en: new Date().toISOString() })
      aviso(analisis.hay_mejor_opcion ? `💡 Hay una opción mejor para ${c.nombre}` : `Listo el análisis de ${c.nombre}`)
      setViendo(c.id)
    } catch (e) {
      aviso(`No se pudo consultar el mercado: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConsultando((s) => {
        const n = new Set(s)
        n.delete(c.id)
        return n
      })
    }
  }

  function guardado(c?: Compromiso, anterior?: Compromiso) {
    setEditando(null)
    if (c && nube && debeConsultar(c, anterior)) void consultar(c)
  }

  const tarjeta = (c: Compromiso, pagado: boolean, onPagar?: () => void) => (
    <TarjetaCompromiso
      key={c.id}
      c={c}
      pagado={pagado}
      onPagar={onPagar}
      onEditar={() => setEditando(c)}
      consultando={consultando.has(c.id)}
      onVerAnalisis={() => setViendo(c.id)}
      onConsultar={nube ? () => consultar(c) : undefined}
    />
  )
  const enAnalisis = viendo ? datos.compromisos.find((c) => c.id === viendo) : undefined

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
          {vigentes.map((c) => tarjeta(c, pagadoEsteMes(c), () => setPagando(c)))}
        </ul>
      )}

      {terminados.length > 0 && (
        <button className="btn-texto" onClick={() => setVerTerminados(!verTerminados)}>
          {verTerminados ? 'Ocultar' : 'Ver'} terminados o pausados ({terminados.length})
        </button>
      )}
      {verTerminados && (
        <ul className="lista-tarjetas">
          {terminados.map((c) => tarjeta(c, false))}
        </ul>
      )}

      {editando && (
        <Hoja titulo={editando === 'nuevo' ? 'Nuevo compromiso' : 'Editar compromiso'} onCerrar={() => setEditando(null)}>
          <FormCompromiso inicial={editando === 'nuevo' ? undefined : editando} onListo={guardado} />
        </Hoja>
      )}
      {pagando && (
        <Hoja titulo={`Pagar: ${pagando.nombre}`} onCerrar={() => setPagando(null)}>
          <FormPago c={pagando} onListo={() => setPagando(null)} />
        </Hoja>
      )}
      {enAnalisis && (
        <Hoja titulo={`Tasas: ${enAnalisis.nombre}`} onCerrar={() => setViendo(null)}>
          <DetalleAnalisis c={enAnalisis} consultando={consultando.has(enAnalisis.id)} onConsultar={nube ? () => consultar(enAnalisis) : undefined} />
        </Hoja>
      )}
    </div>
  )
}

function TarjetaCompromiso(props: {
  c: Compromiso
  pagado: boolean
  onPagar?: () => void
  onEditar: () => void
  consultando: boolean
  onVerAnalisis: () => void
  onConsultar?: () => void
}) {
  const { c, pagado, onPagar, onEditar } = props
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
        {c.tasa_ea != null ? ` · Tasa ${fmtTasa(c.tasa_ea)} E.A.` : ''}
        {c.tasa_ea != null && c.saldo_pendiente ? ` · unos ${pesos(interesMensual(c.saldo_pendiente, c.tasa_ea))} de interés al mes` : ''}
      </p>
      {tieneTasa(c.tipo) && <LineaAnalisis c={c} consultando={props.consultando} onVer={props.onVerAnalisis} onConsultar={props.onConsultar} />}
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

/** Una línea en la tarjeta con el resultado de la última consulta del mercado. */
function LineaAnalisis({ c, consultando, onVer, onConsultar }: { c: Compromiso; consultando: boolean; onVer: () => void; onConsultar?: () => void }) {
  if (consultando) return <p className="compromiso-analisis">🔎 Consultando las tasas del mercado… puede tardar un minuto.</p>
  const a = c.analisis
  if (!a || !c.analizado_en) {
    return onConsultar ? (
      <button className="btn-texto" onClick={onConsultar}>
        Comparar con las tasas del mercado
      </button>
    ) : null
  }
  const mejor = a.hay_mejor_opcion ? a.opciones[0] : undefined
  const texto = mejor
    ? `💡 Opción mejor: ${resumenOpcion(mejor)}`
    : a.tasa_actual_ea == null
      ? `🔎 Mercado revisado el ${fechaCorta(c.analizado_en)}: agrega tu tasa para comparar`
      : `✓ Revisado el ${fechaCorta(c.analizado_en)}: no hay una opción claramente mejor`
  return (
    <button className={`compromiso-analisis ${mejor ? 'compromiso-analisis-mejor' : ''}`} onClick={onVer}>
      <span>{texto}</span>
      <span className="compromiso-analisis-ver">Ver</span>
    </button>
  )
}

const resumenOpcion = (o: OpcionCredito) =>
  [`${o.entidad}${o.tasa_ea != null ? ` al ${fmtTasa(o.tasa_ea)} E.A.` : ''}`, o.ahorro_mensual ? `ahorras unos ${pesosCorto(o.ahorro_mensual)} al mes` : null].filter(Boolean).join(' · ')

/** Detalle del análisis: tasas de referencia del mes, opciones, siguiente paso y fuentes. */
function DetalleAnalisis({ c, consultando, onConsultar }: { c: Compromiso; consultando: boolean; onConsultar?: () => void }) {
  const a: AnalisisCredito | null | undefined = c.analisis
  const tuTasa = a?.tasa_actual_ea ?? c.tasa_ea ?? null
  return (
    <div className="pantalla-seccion">
      {a ? (
        <>
          <p className={a.hay_mejor_opcion ? 'consejo-resumen consejo-resumen-mejor' : 'consejo-resumen'}>{a.resumen}</p>
          <div className="tiles">
            <div className="tile">
              <span className="etiqueta">Tu tasa</span>
              <span className="tile-valor">{tuTasa != null ? fmtTasa(tuTasa) : '—'}</span>
            </div>
            <div className="tile">
              <span className="etiqueta">Usura del mes</span>
              <span className="tile-valor">{a.usura_ea != null ? fmtTasa(a.usura_ea) : '—'}</span>
            </div>
            <div className="tile">
              <span className="etiqueta">Interés corriente</span>
              <span className="tile-valor">{a.ibc_ea != null ? fmtTasa(a.ibc_ea) : '—'}</span>
            </div>
          </div>
          {a.opciones.length > 0 && (
            <section>
              <h3>Opciones que encontré</h3>
              <ul className="lista-opciones">
                {a.opciones.map((o, i) => {
                  const enlace = enlaceSeguro(o.enlace)
                  return (
                    <li key={i}>
                      <div className="borrador-cabecera">
                        <strong>{o.entidad}</strong>
                        <strong>{o.tasa_ea != null ? `${fmtTasa(o.tasa_ea)} E.A.` : ''}</strong>
                      </div>
                      <p className="muted">
                        {o.producto}
                        {o.ahorro_mensual ? ` · ahorras unos ${pesos(o.ahorro_mensual)} al mes` : ''}
                      </p>
                      {o.requisitos && <p className="ayuda">{o.requisitos}</p>}
                      {enlace && (
                        <a href={enlace} target="_blank" rel="noopener noreferrer">
                          Ver la oferta
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          <section>
            <h3>Siguiente paso</h3>
            <p>{a.siguiente_paso}</p>
          </section>
          {a.fuentes.some((f) => enlaceSeguro(f.url)) && (
            <section>
              <h3>Fuentes</h3>
              <ul className="lista-puntos">
                {a.fuentes
                  .filter((f) => enlaceSeguro(f.url))
                  .map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer">
                        {f.titulo || f.url}
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          <p className="ayuda">
            Tasas de {a.mes}
            {c.analizado_en ? `, consultadas el ${fechaCorta(c.analizado_en)}` : ''}. Es una referencia: confirma las condiciones con el banco antes de cambiarte.
          </p>
        </>
      ) : (
        <p className="ayuda">Todavía no se ha comparado este compromiso con el mercado.</p>
      )}
      {onConsultar && (
        <button className="btn btn-grande" disabled={consultando} onClick={onConsultar}>
          {consultando ? 'Consultando… puede tardar un minuto' : a ? 'Consultar de nuevo' : 'Comparar con el mercado'}
        </button>
      )}
    </div>
  )
}

const TIPOS_COMPROMISO = Object.entries(ETIQUETA_TIPO_COMPROMISO).map(([valor, etiqueta]) => ({ valor: valor as TipoCompromiso, etiqueta }))

const TIPOS_TASA = [
  { valor: 'ea' as const, etiqueta: 'E.A.' },
  { valor: 'mv' as const, etiqueta: 'M.V.' },
]

/** "24,5" → 24.5; vacío o inválido → null. */
function leerTasa(texto: string): number | null {
  const n = Number.parseFloat(texto.replace(/\s|%/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function FormCompromiso({ inicial, onListo }: { inicial?: Compromiso; onListo: (guardado?: Compromiso, anterior?: Compromiso) => void }) {
  const { datos, modo, agregar, actualizar, eliminar, aviso } = useDatos()
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
  const [entidad, setEntidad] = useState(inicial?.entidad ?? '')
  const [tasa, setTasa] = useState(inicial?.tasa_ea != null ? String(Math.round(inicial.tasa_ea * 100) / 100).replace('.', ',') : '')
  const [tipoTasa, setTipoTasa] = useState<'ea' | 'mv'>('ea')
  // Si no toca la tasa, se conserva tal cual (con todos sus decimales) y no cuenta como cambio.
  const [tasaTocada, setTasaTocada] = useState(false)

  const conTasa = tieneTasa(tipo)
  const tasaEscrita = leerTasa(tasa)
  const tasaEa = tasaEscrita == null ? null : tipoTasa === 'mv' ? mvAEa(tasaEscrita) : tasaEscrita
  const saldoNum = saldo ? leerValor(saldo) : 0

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return aviso('Ponle un nombre')
    if (leerValor(monto) <= 0) return aviso('Escribe el valor de la cuota')
    if (conTasa && tasa.trim() && tasaEa == null) return aviso('Escribe la tasa como un número, por ejemplo 24,5')
    if (tasaEa != null && tasaEa >= 200) return aviso('Esa tasa es demasiado alta: revisa si es E.A. o M.V.')
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
      entidad: conTasa ? entidad.trim() || null : null,
      tasa_ea: !conTasa ? null : inicial && !tasaTocada ? (inicial.tasa_ea ?? null) : tasaEa != null ? Math.round(tasaEa * 10_000) / 10_000 : null,
    }
    let guardado: Compromiso
    try {
      if (inicial) {
        await actualizar('compromisos', inicial.id, fila)
        guardado = { ...inicial, ...fila }
      } else {
        guardado = { id: nuevoId(), ...fila }
        await agregar('compromisos', [guardado])
      }
    } catch {
      return // el aviso de error ya se mostró
    }
    aviso('Compromiso guardado')
    onListo(guardado, inicial)
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
      {conTasa && (
        <fieldset className="grupo">
          <legend>Tasa de interés</legend>
          <label className="campo">
            <span>Banco o entidad</span>
            <input value={entidad} onChange={(e) => setEntidad(e.target.value)} placeholder="Ej: Davivienda" />
          </label>
          <div className="fila-campos">
            <label className="campo">
              <span>Tasa (%)</span>
              <input
                inputMode="decimal"
                value={tasa}
                onChange={(e) => {
                  setTasa(e.target.value)
                  setTasaTocada(true)
                }}
                placeholder={tipoTasa === 'mv' ? 'Ej: 1,9' : 'Ej: 24,5'}
              />
            </label>
            <div className="campo">
              <span>Tipo de tasa</span>
              <Segmentado
                etiqueta="Tipo de tasa"
                opciones={TIPOS_TASA}
                valor={tipoTasa}
                onCambio={(v) => {
                  setTipoTasa(v)
                  setTasaTocada(true)
                }}
              />
            </div>
          </div>
          <p className="ayuda">
            {tasaEa != null
              ? `${tipoTasa === 'mv' ? `Equivale a ${fmtTasa(tasaEa)} efectivo anual. ` : ''}${saldoNum > 0 ? `Pagas unos ${pesos(interesMensual(saldoNum, tasaEa))} de interés al mes.` : ''}`
              : 'La encuentras en el extracto o en la app del banco. E.A. es efectiva anual; M.V., mes vencido.'}
          </p>
          {modo === 'nube' && <p className="ayuda">Al guardar, la app compara este {tipo === 'tarjeta' ? 'producto' : 'crédito'} con las tasas del mercado de este mes y te dice si hay una opción mejor.</p>}
        </fieldset>
      )}
      <label className="campo">
        <span>Tipo de egreso al pagar</span>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">— Ninguno —</option>
          {datos.categorias
            .filter((c) => c.tipo === 'egreso' && (c.activo || c.id === categoriaId))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
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
