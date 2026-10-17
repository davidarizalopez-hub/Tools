import { useMemo, useState, type ChangeEvent } from 'react'
import { useDatos } from '../state'
import { Segmentado } from '../components/ui'
import { Catalogos } from './Catalogos'
import { supabase } from '../lib/db'
import { leerExcel, planificar, type Hoja as HojaExcel, type LecturaExcel } from '../lib/importExcel'
import { TABLAS, type Datos } from '../lib/types'
import { hoy, pesos } from '../lib/format'

type Seccion = 'catalogos' | 'importar' | 'cuenta'

export function Ajustes({ email }: { email: string | null }) {
  const [seccion, setSeccion] = useState<Seccion>('catalogos')
  return (
    <div className="pantalla">
      <h1 className="titulo-pantalla">Ajustes</h1>
      <Segmentado
        etiqueta="Sección"
        valor={seccion}
        onCambio={setSeccion}
        opciones={[
          { valor: 'catalogos', etiqueta: 'Catálogos' },
          { valor: 'importar', etiqueta: 'Importar' },
          { valor: 'cuenta', etiqueta: 'Cuenta' },
        ]}
      />
      {seccion === 'catalogos' && <Catalogos />}
      {seccion === 'importar' && <Importar />}
      {seccion === 'cuenta' && <Cuenta email={email} />}
    </div>
  )
}

function Importar() {
  const { datos, agregar, aviso } = useDatos()
  const [lectura, setLectura] = useState<LecturaExcel | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [anios, setAnios] = useState<Set<string>>(new Set())
  const [estado, setEstado] = useState<string | null>(null)

  const conteoAnios = useMemo(() => {
    const c = new Map<string, number>()
    for (const f of lectura?.filas ?? []) c.set(f.fecha.slice(0, 4), (c.get(f.fecha.slice(0, 4)) ?? 0) + 1)
    return [...c.entries()].sort()
  }, [lectura])

  const plan = useMemo(
    () => (lectura ? planificar(lectura, datos, lectura.filas.filter((f) => anios.has(f.fecha.slice(0, 4)))) : null),
    [lectura, datos, anios],
  )

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setEstado('Leyendo el archivo…')
    try {
      const { default: leerXlsx } = await import('read-excel-file/browser')
      const hojas = (await leerXlsx(archivo)) as HojaExcel[]
      const l = leerExcel(hojas)
      // Por defecto solo se marcan los años cercanos al más reciente del archivo;
      // así una fecha mal digitada (p. ej. 2002 en vez de 2025) no se cuela.
      const maximo = Math.max(...l.filas.map((f) => Number(f.fecha.slice(0, 4))))
      setAnios(new Set(l.filas.map((f) => f.fecha.slice(0, 4)).filter((a) => Number(a) >= maximo - 1)))
      setLectura(l)
      setNombreArchivo(archivo.name)
      setEstado(l.filas.length ? null : 'No encontré movimientos. ¿Es el Excel con hojas por mes (Enero, Febrero…)?')
    } catch (err) {
      setEstado(`No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function importar() {
    if (!plan) return
    try {
      setEstado('Creando catálogos…')
      await agregar('medios_pago', plan.medios_pago)
      await agregar('categorias', plan.categorias)
      await agregar('clientes', plan.clientes)
      setEstado(`Guardando ${plan.movimientos.length} movimientos…`)
      await agregar('movimientos', plan.movimientos)
      aviso(`Importados ${plan.movimientos.length} movimientos`)
      setLectura(null)
      setEstado(null)
    } catch {
      setEstado('La importación se interrumpió. Puedes volver a intentarlo: lo que ya se guardó no se duplica.')
    }
  }

  const porTipo = (t: string) => plan?.movimientos.filter((m) => m.tipo === t) ?? []
  const totalTipo = (t: string) => porTipo(t).reduce((s, m) => s + m.valor, 0)

  return (
    <section className="pantalla-seccion">
      <div className="tarjeta">
        <h2>Importar tu Excel</h2>
        <p className="sub">
          Sube el archivo de débitos (el que tiene una hoja por mes y la hoja "Base de datos"). Se crean los tipos de egreso, de ingreso, clientes y medios de pago que
          falten. Si lo subes otra vez, no se duplica lo que ya está.
        </p>
        <label className="btn btn-primario btn-grande btn-archivo">
          Elegir archivo .xlsx
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={elegir} />
        </label>
        {estado && <p className="mensaje">{estado}</p>}
      </div>

      {lectura && plan && lectura.filas.length > 0 && (
        <div className="tarjeta">
          <h2>{nombreArchivo}</h2>
          <fieldset className="grupo">
            <legend>Años a importar</legend>
            {conteoAnios.map(([a, n]) => (
              <label key={a} className="check">
                <input
                  type="checkbox"
                  checked={anios.has(a)}
                  onChange={(e) => {
                    const s = new Set(anios)
                    if (e.target.checked) s.add(a)
                    else s.delete(a)
                    setAnios(s)
                  }}
                />
                <span>
                  {a}: {n} filas
                </span>
              </label>
            ))}
          </fieldset>
          <ul className="lista-simple">
            <li>
              <span>Gastos</span>
              <span>
                {porTipo('egreso').length} · {pesos(totalTipo('egreso'))}
              </span>
            </li>
            <li>
              <span>Ingresos</span>
              <span>
                {porTipo('ingreso').length} · {pesos(totalTipo('ingreso'))}
              </span>
            </li>
            {porTipo('transferencia').length > 0 && (
              <li>
                <span>Pagos de tarjeta (como transferencia)</span>
                <span>{porTipo('transferencia').length}</span>
              </li>
            )}
            {plan.duplicados > 0 && (
              <li>
                <span>Ya estaban en la app (se omiten)</span>
                <span>{plan.duplicados}</span>
              </li>
            )}
            {plan.omitidas.length > 0 && (
              <li>
                <span>"Saldo mes anterior" (se omite, la app lo calcula)</span>
                <span>{plan.omitidas.length}</span>
              </li>
            )}
          </ul>
          <Nuevos titulo="Tipos de egreso nuevos" nombres={plan.categorias.filter((c) => c.tipo === 'egreso').map((c) => c.nombre)} />
          <Nuevos titulo="Tipos de ingreso nuevos" nombres={plan.categorias.filter((c) => c.tipo === 'ingreso').map((c) => c.nombre)} />
          <Nuevos titulo="Clientes nuevos" nombres={plan.clientes.map((c) => c.nombre)} />
          <Nuevos titulo="Medios de pago nuevos" nombres={plan.medios_pago.map((m) => m.nombre)} />
          <p className="ayuda">Los tipos de egreso nuevos quedan como "variables"; puedes cambiarlos a fijos en Catálogos.</p>
          <button className="btn btn-primario btn-grande" onClick={importar} disabled={!plan.movimientos.length && !plan.clientes.length && !plan.categorias.length}>
            Importar {plan.movimientos.length} movimientos
          </button>
        </div>
      )}
    </section>
  )
}

function Nuevos({ titulo, nombres }: { titulo: string; nombres: string[] }) {
  if (!nombres.length) return null
  return (
    <details className="desglose">
      <summary>
        <span>{titulo}</span>
        <strong>{nombres.length}</strong>
      </summary>
      <p className="ayuda">{nombres.join(', ')}</p>
    </details>
  )
}

function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

function Cuenta({ email }: { email: string | null }) {
  const { datos, modo, agregar, aviso } = useDatos()

  function exportarJSON() {
    descargar(`finanzas-respaldo-${hoy()}.json`, JSON.stringify({ version: 1, ...datos }, null, 2), 'application/json')
  }

  function exportarCSV() {
    const nombre = new Map<string, string>()
    for (const l of [datos.categorias, datos.medios_pago, datos.clientes]) for (const x of l) nombre.set(x.id, x.nombre)
    const n = (id: string | null) => (id ? (nombre.get(id) ?? '') : '')
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const filas = [
      ['Fecha', 'Tipo', 'Tipo de egreso/ingreso', 'Proveedor/Cliente', 'Descripción', 'Medio de pago', 'Destino', 'Cuotas', 'Valor', 'Comentarios'],
      ...[...datos.movimientos]
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((m) => [m.fecha, m.tipo, n(m.categoria_id), m.tipo === 'ingreso' ? n(m.cliente_id) : m.proveedor, m.descripcion, n(m.medio_pago_id), n(m.medio_destino_id), m.cuotas, m.valor, m.comentarios]),
    ]
    descargar(`movimientos-${hoy()}.csv`, '﻿' + filas.map((f) => f.map(celda).join(';')).join('\n'), 'text/csv')
  }

  async function restaurar(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    try {
      const respaldo = JSON.parse(await archivo.text()) as Partial<Datos>
      let total = 0
      // Solo se agregan las filas que no existen (por id), en orden para respetar las referencias.
      for (const tabla of TABLAS) {
        const existentes = new Set((datos[tabla] as { id: string }[]).map((f) => f.id))
        const nuevas = ((respaldo[tabla] ?? []) as { id: string }[]).filter((f) => f.id && !existentes.has(f.id))
        await agregar(tabla, nuevas as never)
        total += nuevas.length
      }
      aviso(total ? `Restauradas ${total} filas` : 'El respaldo no tenía nada nuevo')
    } catch (err) {
      aviso(`Respaldo inválido: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <section className="pantalla-seccion">
      <div className="tarjeta">
        <h2>Dónde se guardan tus datos</h2>
        {modo === 'nube' ? (
          <p className="sub">En la nube (Supabase), con tu cuenta {email}. Puedes entrar desde cualquier celular o computador.</p>
        ) : (
          <p className="sub">
            <strong>Modo local:</strong> los datos están solo en este navegador. Conecta Supabase (ver la guía) para tenerlos en la nube; luego usa "Restaurar respaldo" para
            pasarlos.
          </p>
        )}
        <p className="sub">
          {datos.movimientos.length} movimientos · {datos.clientes.length} clientes · {datos.compromisos.length} compromisos
        </p>
        {supabase && (
          <button className="btn" onClick={() => supabase!.auth.signOut()}>
            Cerrar sesión
          </button>
        )}
      </div>
      <div className="tarjeta">
        <h2>Respaldo</h2>
        <div className="acciones">
          <button className="btn" onClick={exportarJSON}>
            Descargar respaldo (.json)
          </button>
          <button className="btn" onClick={exportarCSV}>
            Exportar movimientos (.csv para Excel)
          </button>
          <label className="btn btn-archivo">
            Restaurar respaldo
            <input type="file" accept="application/json,.json" onChange={restaurar} />
          </label>
        </div>
      </div>
    </section>
  )
}
