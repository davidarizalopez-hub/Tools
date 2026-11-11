import { useMemo, useState } from 'react'
import { useDatos } from '../state'
import { Chips, Hoja } from './ui'
import {
  cuentaExenta,
  gmfAnotado,
  gmfDelMes,
  mesesParaAnalizar,
  pagaGMF,
  recomendarExenta,
  TARIFA_GMF,
  topeBajoMonto,
  topeExenta,
  type Recomendacion,
} from '../lib/gmf'
import { nombreMes, pesos, pesosCorto } from '../lib/format'

/** Respuesta "Ninguna" o "No sé" a la pregunta por la cuenta exenta (solo en este dispositivo). */
const CLAVE = 'finanzas:gmf-pregunta'
function leerRespuesta(): string | null {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}
function guardarRespuesta(v: string) {
  try {
    localStorage.setItem(CLAVE, v)
  } catch {
    // sin almacenamiento la pregunta vuelve a salir; no pasa nada
  }
}

/** Marca una cuenta como la exenta del 4x1000 (y desmarca la anterior); null = ninguna. */
function useMarcarExenta() {
  const { datos, actualizar, aviso } = useDatos()
  return async (id: string | null) => {
    try {
      for (const m of datos.medios_pago.filter((x) => x.exenta_gmf && x.id !== id)) await actualizar('medios_pago', m.id, { exenta_gmf: false })
      if (id) await actualizar('medios_pago', id, { exenta_gmf: true })
      const nombre = datos.medios_pago.find((m) => m.id === id)?.nombre
      aviso(nombre ? `${nombre} quedó como tu cuenta exenta` : 'Quedó sin cuenta exenta')
    } catch {
      // el aviso de error ya se mostró
    }
  }
}

/** Tarjeta de Inicio: el 4x1000 que se va sin que lo veas, y qué cuenta conviene tener exenta. */
export function GastosOcultos({ mes }: { mes: string }) {
  const { datos } = useDatos()
  const g = useMemo(() => gmfDelMes(datos, mes), [datos, mes])
  const meses = useMemo(() => mesesParaAnalizar(datos, mes), [datos, mes])
  const rec = useMemo(() => recomendarExenta(datos, meses), [datos, meses])
  const anotado = gmfAnotado(datos, mes)
  const exenta = cuentaExenta(datos)
  const marcar = useMarcarExenta()
  const [respuesta, setRespuesta] = useState(leerRespuesta)
  const [detalle, setDetalle] = useState(false)

  if (!g.cuentas.length && !anotado) return null
  const cuentas = datos.medios_pago.filter((m) => m.activo && pagaGMF(m))

  function responder(v: string) {
    if (v === 'ninguna' || v === 'no-se') {
      guardarRespuesta(v)
      setRespuesta(v)
      if (v === 'ninguna') void marcar(null)
    } else void marcar(v)
  }

  return (
    <section className="tarjeta">
      <h2>Gastos ocultos</h2>
      <p className="sub">El 4x1000 que te cobra el banco cada vez que sale plata de tus cuentas. Es un cálculo con tus movimientos: no se suma a tus gastos.</p>
      <div className="gmf-cifra">
        <span className="etiqueta">4x1000 de {nombreMes(mes, false).toLowerCase()}</span>
        <strong>{pesos(g.total)}</strong>
        {anotado > 0 && <span className="muted">Anotaste {pesos(anotado)} como gasto</span>}
      </div>
      {g.cuentas.length > 0 && (
        <ul className="lista-simple">
          {g.cuentas.map((c) => (
            <li key={c.medio.id}>
              <span>
                {c.medio.nombre}
                <small className="muted">
                  {' '}
                  · salieron {pesosCorto(c.debitos)}
                  {c.tope > 0 && (c.medio.id === exenta?.id ? ' · exenta' : ' · bajo monto')}
                </small>
              </span>
              <span>{pesos(c.gmf)}</span>
            </li>
          ))}
        </ul>
      )}

      {!exenta && !respuesta ? (
        <div className="pregunta-gmf">
          <strong>¿Cuál de tus cuentas tienes marcada en el banco como exenta del 4x1000?</strong>
          <Chips
            etiqueta="Cuenta exenta"
            opciones={[...cuentas.map((m) => ({ valor: m.id, etiqueta: m.nombre })), { valor: 'ninguna', etiqueta: 'Ninguna' }, { valor: 'no-se', etiqueta: 'No sé' }]}
            valor={null}
            onCambio={responder}
          />
        </div>
      ) : (
        !exenta &&
        respuesta === 'no-se' && (
          <p className="ayuda">
            Para saberlo, revisa el extracto o la app de cada banco: la cuenta exenta no muestra cobros de "GMF" o "Gravamen". Cuando lo sepas, márcala en el detalle.
          </p>
        )
      )}

      {rec && <ConsejoExenta rec={rec} onMarcar={marcar} />}

      <button className="btn-texto" onClick={() => setDetalle(true)}>
        Cómo se calcula y cómo pagar menos
      </button>
      {detalle && (
        <Hoja titulo="El 4x1000" onCerrar={() => setDetalle(false)}>
          <DetalleGmf mes={mes} rec={rec} onMarcar={marcar} />
        </Hoja>
      )}
    </section>
  )
}

function ConsejoExenta({ rec, onMarcar }: { rec: Recomendacion; onMarcar: (id: string | null) => void }) {
  const { mejor, actual, ahorroAnual, excesos } = rec
  const n = rec.meses.length
  const periodo = n === 1 ? 'tu último mes con movimientos' : `tus ${n} meses con movimientos del último año`
  // Con pocos meses el cálculo al año es grueso: se avisa.
  const pocos = n < 3 ? ' Con tan pocos meses registrados es un cálculo aproximado: mejora a medida que registres más.' : ''
  return (
    <>
      {mejor.medio && !mejor.actual && ahorroAnual >= 1000 ? (
        <div className="consejo consejo-atencion">
          <span className="consejo-marca" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Te conviene que la exenta sea {mejor.medio.nombre}</strong>
            <p>
              Según {periodo}, pagarías unos {pesos(mejor.anual)} de 4x1000 al año en vez de {pesos(actual.anual)}: te ahorras unos {pesos(ahorroAnual)}. Pídelo en tu banco
              (solo puedes tener una cuenta exenta) y luego avísale a la app.{pocos}
            </p>
            <button className="btn" onClick={() => onMarcar(mejor.medio!.id)}>
              Ya la marqué en el banco
            </button>
          </div>
        </div>
      ) : (
        actual.medio &&
        mejor.actual && (
          <p className="estado-pagado">
            ✓ {actual.medio.nombre} es la cuenta que más te conviene tener exenta. Con ella pagas unos {pesos(actual.anual)} al año.{pocos}
          </p>
        )
      )}
      {excesos.length > 0 && actual.medio && (
        <p className="ayuda">
          En {excesos.map((e) => nombreMes(e.mes, false).toLowerCase()).join(', ')} salieron de {actual.medio.nombre} más de {pesosCorto(excesos[0].tope)}: lo que pasó del tope
          pagó 4x1000.
        </p>
      )}
    </>
  )
}

function DetalleGmf({ mes, rec, onMarcar }: { mes: string; rec: Recomendacion | null; onMarcar: (id: string | null) => void }) {
  const { datos } = useDatos()
  const exenta = cuentaExenta(datos)
  const cuentas = datos.medios_pago.filter((m) => m.activo && pagaGMF(m))
  const porMes = useMemo(() => (rec?.meses ?? []).map((m) => gmfDelMes(datos, m)), [datos, rec])

  return (
    <div className="pantalla-seccion">
      <section>
        <h3>Tu cuenta exenta</h3>
        <Chips
          etiqueta="Cuenta exenta"
          opciones={[...cuentas.map((m) => ({ valor: m.id, etiqueta: m.nombre })), { valor: 'ninguna', etiqueta: 'Ninguna' }]}
          valor={exenta?.id ?? 'ninguna'}
          onCambio={(v) => onMarcar(v === 'ninguna' ? null : v)}
        />
        <p className="ayuda">Márcala aquí igual que la tienes en el banco. Cambiarla aquí no la cambia en el banco.</p>
      </section>

      {rec && (
        <section>
          <h3>¿Cuál te conviene?</h3>
          <p className="ayuda">
            Lo que pagarías al año según tus movimientos de {rec.meses.length === 1 ? nombreMes(rec.meses[0]) : `${nombreMes(rec.meses.at(-1)!)} a ${nombreMes(rec.meses[0])}`}.
          </p>
          <ul className="lista-simple">
            {rec.escenarios.map((e) => (
              <li key={e.medio?.id ?? 'ninguna'}>
                <span>
                  {e.medio ? `Si la exenta es ${e.medio.nombre}` : 'Sin cuenta exenta'}
                  {e === rec.mejor && <small className="etiqueta-recomendada"> Recomendada</small>}
                  {e.actual && e.medio && <small className="muted"> · la tuya</small>}
                </span>
                <span>{pesos(e.anual)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {porMes.length > 0 && (
        <section>
          <h3>Mes a mes</h3>
          <ul className="lista-simple">
            {porMes.map((m) => (
              <li key={m.mes}>
                <span>
                  {nombreMes(m.mes)}
                  <small className="muted"> · salieron {pesosCorto(m.cuentas.reduce((s, c) => s + c.debitos, 0))}</small>
                </span>
                <span>{pesos(m.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Cómo funciona</h3>
        <ul className="lista-puntos">
          <li>
            Cada pago, retiro o transferencia que sale de una cuenta de ahorros, corriente o billetera paga {TARIFA_GMF * 1000} por cada mil ({pesos(TARIFA_GMF * 1_000_000)} por
            cada millón).
          </li>
          <li>
            La cuenta que marques como exenta en el banco no paga por los primeros {pesos(topeExenta(mes))} que salgan cada mes (350 UVT). Solo puedes tener una en todos los
            bancos.
          </li>
          <li>Nequi y Daviplata, como depósitos de bajo monto, no pagan por los primeros {pesos(topeBajoMonto(mes))} al mes (65 UVT).</li>
          <li>Las compras con tarjeta de crédito no pagan 4x1000; pagar la tarjeta desde una cuenta, sí.</li>
          <li>Las transferencias entre cuentas tuyas del mismo banco no pagan. La app no lo distingue, así que el cálculo puede quedar un poco alto.</li>
        </ul>
      </section>

      <section>
        <h3>Cómo pagar menos</h3>
        <ul className="lista-puntos">
          <li>Ten exenta la cuenta por la que más plata sale: normalmente, a la que te llega el sueldo.</li>
          <li>Paga la tarjeta de crédito, los créditos y los servicios desde la cuenta exenta.</li>
          <li>Evita pasar plata de una cuenta a otra: cada salida de una cuenta que no es exenta paga 4x1000.</li>
          <li>El 50 % del 4x1000 que pagas se puede restar en la declaración de renta. Pide el certificado a tu banco.</li>
        </ul>
      </section>
    </div>
  )
}
