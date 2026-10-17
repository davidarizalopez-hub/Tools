import { useMemo, useState } from 'react'
import { useDatos } from '../state'
import { SelectorMes, Vacio } from '../components/ui'
import { BarraApilada, BarrasHorizontales, ColumnasMeses } from '../components/Graficos'
import { consejos, mesesConDatos, proyectar, resumenMes, saldos, serieMeses, type LineaProyeccion } from '../lib/stats'
import { hoy, mesDe, nombreMes, pesos, pesosCorto, porcentaje, sumarMeses } from '../lib/format'
import { ETIQUETA_TIPO_MEDIO } from '../lib/types'

type Destino = 'registrar' | 'movimientos' | 'compromisos' | 'ajustes'

export function Inicio({ mes, setMes, irA }: { mes: string; setMes: (m: string) => void; irA: (p: Destino) => void }) {
  const { datos } = useDatos()
  const r = useMemo(() => resumenMes(datos, mes), [datos, mes])
  const anterior = useMemo(() => resumenMes(datos, sumarMeses(mes, -1)), [datos, mes])
  const serie = useMemo(() => serieMeses(datos, mes, 6), [datos, mes])
  const siguiente = sumarMeses(mes, 1)
  const proy = useMemo(() => proyectar(datos, siguiente), [datos, siguiente])
  const tips = useMemo(() => consejos(datos, mes), [datos, mes])
  const saldosActuales = useMemo(() => saldos(datos), [datos])
  const ultimoConDatos = mesesConDatos(datos)[0]

  return (
    <div className="pantalla">
      <SelectorMes mes={mes} setMes={setMes} />

      {r.cantidad === 0 ? (
        <Vacio titulo={`No hay movimientos en ${nombreMes(mes)}`}>
          <button className="btn btn-primario" onClick={() => irA('registrar')}>
            Registrar el primero
          </button>
          {ultimoConDatos && ultimoConDatos !== mes && (
            <button className="btn" onClick={() => setMes(ultimoConDatos)}>
              Ver {nombreMes(ultimoConDatos)}
            </button>
          )}
          {!datos.movimientos.length && (
            <button className="btn-texto" onClick={() => irA('ajustes')}>
              ¿Tienes tu Excel? Impórtalo en Ajustes
            </button>
          )}
        </Vacio>
      ) : (
        <>
          <section className="tarjeta">
            <p className="etiqueta">Te quedó este mes</p>
            <p className={`hero ${r.balance < 0 ? 'negativo' : ''}`}>{pesos(r.balance)}</p>
            <div className="tiles">
              <Tile etiqueta="Ingresos" valor={r.ingresos} antes={anterior.ingresos} subirEsBueno />
              <Tile etiqueta="Gastos" valor={r.gastos} antes={anterior.gastos} />
              <div className="tile">
                <span className="etiqueta">Tasa de ahorro</span>
                <span className="tile-valor">{r.tasaAhorro == null ? '—' : porcentaje(r.tasaAhorro)}</span>
                <span className="tile-delta muted">meta 20%</span>
              </div>
            </div>
          </section>

          {r.gastosPorCategoria.length > 0 && (
            <section className="tarjeta">
              <h2>¿En qué se fue tu dinero?</h2>
              <p className="sub">Gastos por tipo de egreso · {pesos(r.gastos)}</p>
              <BarrasHorizontales items={r.gastosPorCategoria.map((c) => ({ nombre: c.nombre, valor: c.total }))} />
            </section>
          )}

          <section className="tarjeta">
            <h2>Fijos, variables y ahorro</h2>
            <BarraApilada
              segmentos={[
                { nombre: 'Fijos', valor: r.fijos, color: '--serie-1' },
                { nombre: 'Variables', valor: r.variables, color: '--serie-2' },
                { nombre: 'Ahorro', valor: r.ahorro, color: '--serie-3' },
              ]}
            />
          </section>

          {tips.length > 0 && (
            <section className="tarjeta">
              <h2>Lo que te dicen tus números</h2>
              <ul className="consejos">
                {tips.map((t) => (
                  <li key={t.titulo} className={`consejo consejo-${t.nivel}`}>
                    <span className="consejo-marca" aria-hidden="true">
                      {t.nivel === 'bien' ? '✓' : t.nivel === 'atencion' ? '!' : 'i'}
                    </span>
                    <div>
                      <strong>{t.titulo}</strong>
                      <p>{t.detalle}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.ingresosPorCategoria.length > 0 && (
            <section className="tarjeta">
              <h2>De dónde vino tu plata</h2>
              <p className="sub">Ingresos por tipo · {pesos(r.ingresos)}</p>
              <BarrasHorizontales items={r.ingresosPorCategoria.map((c) => ({ nombre: c.nombre, valor: c.total }))} maximo={5} />
            </section>
          )}
        </>
      )}

      {datos.movimientos.length > 0 && (
        <section className="tarjeta">
          <h2>Últimos 6 meses</h2>
          <ColumnasMeses key={mes} serie={serie} />
        </section>
      )}

      <section className="tarjeta">
        <h2>Proyección de {nombreMes(siguiente)}</h2>
        {proy.base.length === 0 && !proy.fijos.length && !proy.tarjetas.length ? (
          <p className="sub">Cuando tengas al menos un mes registrado, aquí verás cuánto te costará el mes siguiente.</p>
        ) : (
          <>
            <p className="sub">
              {proy.base.length ? `Según ${proy.base.map((m) => nombreMes(m, false).toLowerCase()).join(', ')} y tus compromisos` : 'Según tus compromisos'}
            </p>
            <div className="tiles">
              <div className="tile">
                <span className="etiqueta">Gastos fijos</span>
                <span className="tile-valor">{pesosCorto(proy.totalFijos)}</span>
              </div>
              <div className="tile">
                <span className="etiqueta">Variables</span>
                <span className="tile-valor">{pesosCorto(proy.totalVariables)}</span>
              </div>
              <div className="tile">
                <span className="etiqueta">Ingreso esperado</span>
                <span className="tile-valor">{pesosCorto(proy.ingresos)}</span>
              </div>
            </div>
            <p className={`excedente ${proy.excedente < 0 ? 'negativo' : ''}`}>
              {proy.excedente >= 0 ? `Te sobrarían unos ${pesos(proy.excedente)}` : `Te faltarían unos ${pesos(-proy.excedente)}`}
            </p>
            <Desglose titulo="Fijos" lineas={proy.fijos} />
            <Desglose titulo="Variables" lineas={proy.variables} />
            <Desglose titulo="Ahorro" lineas={proy.ahorro} />
            <Desglose titulo="Cuotas de tarjeta por pagar" lineas={proy.tarjetas} nota="Ya se contaron como gasto el mes en que compraste." />
          </>
        )}
      </section>

      {datos.medios_pago.some((m) => m.activo) && (
        <section className="tarjeta">
          <h2>Saldos</h2>
          <p className="sub">Saldo inicial + movimientos registrados hasta hoy ({nombreMes(mesDe(hoy()))})</p>
          <ul className="lista-simple">
            {datos.medios_pago
              .filter((m) => m.activo)
              .map((m) => {
                const s = saldosActuales.get(m.id) ?? 0
                return (
                  <li key={m.id}>
                    <span>
                      {m.nombre}
                      <small className="muted"> · {ETIQUETA_TIPO_MEDIO[m.tipo]}</small>
                    </span>
                    <span className={s < 0 ? 'negativo' : ''}>
                      {m.tipo === 'tarjeta_credito' && s < 0 ? `Debes ${pesos(-s)}` : pesos(s)}
                    </span>
                  </li>
                )
              })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ etiqueta, valor, antes, subirEsBueno = false }: { etiqueta: string; valor: number; antes: number; subirEsBueno?: boolean }) {
  const cambio = antes > 0 ? (valor - antes) / antes : null
  const bueno = cambio != null && (cambio > 0) === subirEsBueno
  return (
    <div className="tile">
      <span className="etiqueta">{etiqueta}</span>
      <span className="tile-valor">{pesosCorto(valor)}</span>
      {cambio != null && Math.abs(cambio) >= 0.005 ? (
        <span className={`tile-delta ${bueno ? 'delta-bien' : 'delta-mal'}`}>
          {cambio > 0 ? '▲' : '▼'} {porcentaje(Math.abs(cambio))} vs mes anterior
        </span>
      ) : (
        <span className="tile-delta muted">—</span>
      )}
    </div>
  )
}

function Desglose({ titulo, lineas, nota }: { titulo: string; lineas: LineaProyeccion[]; nota?: string }) {
  const [abierto, setAbierto] = useState(false)
  if (!lineas.length) return null
  const total = lineas.reduce((s, l) => s + l.monto, 0)
  return (
    <details className="desglose" open={abierto} onToggle={(e) => setAbierto(e.currentTarget.open)}>
      <summary>
        <span>{titulo}</span>
        <strong>{pesos(total)}</strong>
      </summary>
      {nota && <p className="ayuda">{nota}</p>}
      <ul className="lista-simple">
        {lineas.map((l) => (
          <li key={l.nombre}>
            <span>
              {l.nombre}
              {l.fuente === 'compromiso' && <small className="muted"> · compromiso</small>}
            </span>
            <span>{pesos(l.monto)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
