import type { Categoria, Cliente, Datos, MedioPago, Movimiento, TipoMedio } from './types'
import { normalizar, nuevoId } from './format'

// Lee el formato del Excel "Debitos_AAAA": una hoja por mes con dos bloques
// (egresos a la izquierda, ingresos a la derecha) y la hoja "Base de datos"
// con las listas de tipos de egreso, tipos de ingreso, clientes y medios de pago.

export type Celda = string | number | boolean | Date | null
export interface Hoja {
  sheet: string
  data: Celda[][]
}

export interface FilaExcel {
  tipo: 'egreso' | 'ingreso'
  fecha: string
  valor: number
  categoria: string | null
  /** Proveedor (egresos) o cliente (ingresos). */
  tercero: string | null
  descripcion: string | null
  cuenta: string | null
  cuotas: number
  comentarios: string | null
  hoja: string
}

export interface LecturaExcel {
  filas: FilaExcel[]
  listas: { egreso: string[]; ingreso: string[]; clientes: string[]; medios: string[] }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const texto = (c: Celda | undefined): string | null => {
  if (c == null) return null
  const t = String(c).trim()
  return t ? t : null
}

function fechaISO(c: Celda | undefined): string | null {
  let d: Date | null = null
  if (c instanceof Date) d = c
  else if (typeof c === 'number' && c > 20000 && c < 80000) d = new Date(Date.UTC(1899, 11, 30) + c * 86_400_000)
  else if (typeof c === 'string') {
    const m = c.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
    else if (/^\d{4}-\d{2}-\d{2}/.test(c)) d = new Date(c.slice(0, 10) + 'T00:00:00Z')
  }
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function numero(c: Celda | undefined): number | null {
  if (typeof c === 'number') return c
  if (typeof c === 'string') {
    const n = Number(c.replace(/[$\s.]/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function leerListas(hoja: Hoja | undefined): LecturaExcel['listas'] {
  const listas: LecturaExcel['listas'] = { egreso: [], ingreso: [], clientes: [], medios: [] }
  if (!hoja) return listas
  const encabezados: Record<string, keyof LecturaExcel['listas']> = {
    egreso: 'egreso',
    ingreso: 'ingreso',
    clientes: 'clientes',
    'medios de pago': 'medios',
  }
  hoja.data.forEach((fila, r) => {
    fila.forEach((c, col) => {
      const clave = encabezados[normalizar(texto(c) ?? '')]
      if (!clave || listas[clave].length) return
      for (let i = r + 1; i < hoja.data.length; i++) {
        const v = texto(hoja.data[i]?.[col])
        if (v) listas[clave].push(v)
      }
    })
  })
  return listas
}

export function leerExcel(hojas: Hoja[]): LecturaExcel {
  const filas: FilaExcel[] = []
  for (const hoja of hojas) {
    if (!MESES.includes(normalizar(hoja.sheet))) continue
    const r = hoja.data.findIndex((fila) => fila.some((c) => normalizar(texto(c) ?? '') === 'fecha'))
    if (r < 0) continue
    const columnasFecha = hoja.data[r].flatMap((c, i) => (normalizar(texto(c) ?? '') === 'fecha' ? [i] : []))
    columnasFecha.slice(0, 2).forEach((col, bloque) => {
      const tipo = bloque === 0 ? 'egreso' : 'ingreso'
      const colComentarios = normalizar(texto(hoja.data[r][col + 4]) ?? '') === 'comentarios' ? col + 4 : -1
      for (let i = r + 1; i < hoja.data.length; i++) {
        const f = hoja.data[i] ?? []
        const fecha = fechaISO(f[col])
        const valor = numero(f[col + 3])
        if (!fecha || !valor || valor <= 0) continue
        const cuotas = numero(f[col + 2])
        filas.push({
          tipo,
          fecha,
          valor,
          categoria: texto(f[col - 3]),
          tercero: texto(f[col - 2]),
          descripcion: texto(f[col - 1]),
          cuenta: texto(f[col + 1]),
          cuotas: cuotas && cuotas >= 1 ? Math.round(cuotas) : 1,
          comentarios: colComentarios >= 0 ? texto(f[colComentarios]) : null,
          hoja: hoja.sheet,
        })
      }
    })
  }
  const base = hojas.find((h) => normalizar(h.sheet) === 'base de datos')
  return { filas, listas: leerListas(base) }
}

// ---------- Plan de importación ----------

/** Nombres del Excel que corresponden a otro nombre en la app. */
const ALIAS_MEDIOS: Record<string, string> = {
  bancolombia: 'bancolombia ahorros',
  'ahorros bancolombia': 'bancolombia ahorros',
  'banco falabella': 'tdc falabella',
}
const ALIAS_CATEGORIAS: Record<string, string> = {
  'gravemen financiero': 'gravamen financiero (4x1000)',
  'gravamen financiero': 'gravamen financiero (4x1000)',
  'interes cesantias': 'intereses cesantias',
}
/** Estas categorías no se importan como egreso/ingreso. */
const ES_PAGO_TARJETA = (n: string) => n.startsWith('pago tarjeta')
const ES_SALDO_ANTERIOR = (n: string) => n.startsWith('saldo mes anterior')

export function adivinarTipoMedio(nombre: string): TipoMedio {
  const n = normalizar(nombre)
  if (/tdc|tarjeta|credito|visa|master/.test(n)) return 'tarjeta_credito'
  if (/nequi|daviplata|paypal|movii|dale|billetera/.test(n)) return 'billetera'
  if (/efectivo|cash/.test(n)) return 'efectivo'
  if (/corriente/.test(n)) return 'corriente'
  return 'ahorros'
}

export interface PlanImportacion {
  medios_pago: MedioPago[]
  categorias: Categoria[]
  clientes: Cliente[]
  movimientos: Movimiento[]
  /** Filas que ya existen en la app (misma fecha, tipo, valor y descripción). */
  duplicados: number
  omitidas: { fila: FilaExcel; motivo: string }[]
}

export const claveMovimiento = (m: { tipo: string; fecha: string; valor: number; descripcion: string | null }) =>
  `${m.tipo}|${m.fecha}|${Math.round(m.valor)}|${normalizar(m.descripcion ?? '')}`

export function planificar(lectura: LecturaExcel, datos: Datos, filas: FilaExcel[] = lectura.filas): PlanImportacion {
  const plan: PlanImportacion = { medios_pago: [], categorias: [], clientes: [], movimientos: [], duplicados: 0, omitidas: [] }

  const medios = new Map(datos.medios_pago.map((m) => [normalizar(m.nombre), m]))
  const cats = new Map(datos.categorias.map((c) => [`${c.tipo}|${normalizar(c.nombre)}`, c]))
  const clientes = new Map(datos.clientes.map((c) => [normalizar(c.nombre), c]))
  // Conteo de los movimientos que ya están en la app, para no duplicarlos si importas el mismo Excel dos veces.
  const existentes = new Map<string, number>()
  for (const m of datos.movimientos) existentes.set(claveMovimiento(m), (existentes.get(claveMovimiento(m)) ?? 0) + 1)

  const medio = (nombre: string | null): MedioPago | null => {
    if (!nombre) return null
    let k = normalizar(nombre)
    k = ALIAS_MEDIOS[k] && medios.has(ALIAS_MEDIOS[k]) ? ALIAS_MEDIOS[k] : k
    let m = medios.get(k)
    if (!m) {
      m = { id: nuevoId(), nombre, tipo: adivinarTipoMedio(nombre), saldo_inicial: 0, activo: true }
      medios.set(k, m)
      plan.medios_pago.push(m)
    }
    return m
  }
  const categoria = (tipo: 'egreso' | 'ingreso', nombre: string | null): Categoria | null => {
    if (!nombre) return null
    let n = normalizar(nombre)
    n = ALIAS_CATEGORIAS[n] ?? n
    if (ES_PAGO_TARJETA(n) || ES_SALDO_ANTERIOR(n)) return null
    const k = `${tipo}|${n}`
    let c = cats.get(k)
    if (!c) {
      c = { id: nuevoId(), nombre, tipo, naturaleza: tipo === 'egreso' ? 'variable' : null, activo: true }
      cats.set(k, c)
      plan.categorias.push(c)
    }
    return c
  }
  const cliente = (nombre: string | null): Cliente | null => {
    if (!nombre) return null
    const k = normalizar(nombre)
    let c = clientes.get(k)
    if (!c) {
      c = { id: nuevoId(), nombre, telefono: null, notas: null, activo: true }
      clientes.set(k, c)
      plan.clientes.push(c)
    }
    return c
  }

  // Primero las listas de la hoja "Base de datos", para que existan aunque no tengan movimientos.
  lectura.listas.medios.forEach(medio)
  lectura.listas.egreso.forEach((n) => categoria('egreso', n))
  lectura.listas.ingreso.forEach((n) => categoria('ingreso', n))
  lectura.listas.clientes.forEach(cliente)

  const tarjetaDestino = () =>
    [...medios.values()].find((m) => m.tipo === 'tarjeta_credito' && normalizar(m.nombre).includes('falabella')) ??
    [...medios.values()].find((m) => m.tipo === 'tarjeta_credito') ??
    null

  for (const f of filas) {
    const nCat = normalizar(f.categoria ?? '')
    if (f.tipo === 'ingreso' && ES_SALDO_ANTERIOR(nCat)) {
      plan.omitidas.push({ fila: f, motivo: 'El saldo del mes anterior la app lo calcula sola' })
      continue
    }
    const base = {
      id: nuevoId(),
      fecha: f.fecha,
      valor: f.valor,
      medio_pago_id: medio(f.cuenta)?.id ?? null,
      medio_destino_id: null as string | null,
      categoria_id: null as string | null,
      cliente_id: null as string | null,
      compromiso_id: null,
      proveedor: null as string | null,
      descripcion: f.descripcion,
      cuotas: f.cuotas,
      comentarios: f.comentarios,
      origen: 'excel' as const,
    }
    let mov: Movimiento
    if (f.tipo === 'egreso' && ES_PAGO_TARJETA(nCat) && tarjetaDestino()) {
      // Pagar la tarjeta es mover plata entre tus cuentas: no es un gasto nuevo
      // (las compras ya se registraron como gasto cuando se hicieron).
      mov = { ...base, tipo: 'transferencia', medio_destino_id: tarjetaDestino()!.id, descripcion: f.descripcion ?? f.categoria, proveedor: f.tercero }
    } else if (f.tipo === 'egreso') {
      mov = { ...base, tipo: 'egreso', categoria_id: categoria('egreso', f.categoria)?.id ?? null, proveedor: f.tercero }
    } else {
      mov = { ...base, tipo: 'ingreso', categoria_id: categoria('ingreso', f.categoria)?.id ?? null, cliente_id: cliente(f.tercero)?.id ?? null }
    }
    const clave = claveMovimiento(mov)
    const previos = existentes.get(clave) ?? 0
    if (previos > 0) {
      existentes.set(clave, previos - 1)
      plan.duplicados += 1
      continue
    }
    plan.movimientos.push(mov)
  }
  return plan
}
