import type { Datos, MedioPago } from './types'
import { mesDe, normalizar, sumarMeses } from './format'

/**
 * Gravamen a los Movimientos Financieros (4x1000), Estatuto Tributario arts. 871 y 879.
 * - Cada retiro, pago o transferencia desde una cuenta de ahorros, corriente o billetera paga 0,4 %.
 * - La cuenta que el usuario marca como exenta en su banco no paga por los primeros 350 UVT del mes.
 * - Los depósitos de bajo monto (Nequi, Daviplata) no pagan por los primeros 65 UVT del mes.
 * - Las compras con tarjeta de crédito no pagan; pagar la tarjeta desde una cuenta, sí.
 */
export const TARIFA_GMF = 0.004
export const TOPE_EXENTA_UVT = 350
export const TOPE_BAJO_MONTO_UVT = 65

/** Valor de la UVT por año (DIAN). 2026: Resolución 000238 del 15 de diciembre de 2025. */
export const UVT: Record<number, number> = { 2024: 47_065, 2025: 49_799, 2026: 52_374 }

/** UVT del año del mes; si aún no está en la tabla, usa la más reciente. */
export function uvtDe(mes: string): number {
  const anio = Number(mes.slice(0, 4))
  const anios = Object.keys(UVT)
    .map(Number)
    .sort((a, b) => a - b)
  return UVT[anios.filter((a) => a <= anio).at(-1) ?? anios[0]]
}

export const topeExenta = (mes: string) => TOPE_EXENTA_UVT * uvtDe(mes)
export const topeBajoMonto = (mes: string) => TOPE_BAJO_MONTO_UVT * uvtDe(mes)

/** Medios de pago cuyos retiros pagan 4x1000 (no la tarjeta de crédito ni el efectivo). */
export const pagaGMF = (m: Pick<MedioPago, 'tipo'>) => m.tipo === 'ahorros' || m.tipo === 'corriente' || m.tipo === 'billetera'

/** Tipo de egreso donde el usuario anota el 4x1000 que le cobran. */
export const esCategoriaGMF = (nombre: string) => /gravamen|4 ?x ?1\.?000|\bgmf\b/.test(normalizar(nombre))

export const cuentaExenta = (datos: Datos) => datos.medios_pago.find((m) => m.exenta_gmf && pagaGMF(m)) ?? null

/** Lo que salió de cada cuenta en el mes: gastos pagados desde ella y transferencias hacia otras. */
export function debitosDelMes(datos: Datos, mes: string): Map<string, number> {
  const anotado = new Set(datos.categorias.filter((c) => esCategoriaGMF(c.nombre)).map((c) => c.id))
  const cuentas = new Set(datos.medios_pago.filter(pagaGMF).map((m) => m.id))
  const d = new Map<string, number>()
  for (const m of datos.movimientos) {
    if (m.tipo === 'ingreso' || !m.medio_pago_id || !cuentas.has(m.medio_pago_id) || mesDe(m.fecha) !== mes) continue
    // El 4x1000 que ya anotó no vuelve a pagar 4x1000.
    if (m.categoria_id && anotado.has(m.categoria_id)) continue
    d.set(m.medio_pago_id, (d.get(m.medio_pago_id) ?? 0) + m.valor)
  }
  return d
}

export interface GmfCuenta {
  medio: MedioPago
  /** Lo que salió de la cuenta en el mes. */
  debitos: number
  /** Parte exenta: 350 UVT en la cuenta marcada, 65 UVT en billeteras de bajo monto, 0 en las demás. */
  tope: number
  gravable: number
  gmf: number
}

export interface GmfMes {
  mes: string
  cuentas: GmfCuenta[]
  total: number
}

function calcular(datos: Datos, mes: string, debitos: Map<string, number>, exentaId: string | null): GmfMes {
  const cuentas = datos.medios_pago
    .filter((m) => debitos.has(m.id))
    .map((medio) => {
      const d = debitos.get(medio.id)!
      const tope = medio.id === exentaId ? topeExenta(mes) : medio.tipo === 'billetera' ? topeBajoMonto(mes) : 0
      const gravable = Math.max(0, d - tope)
      return { medio, debitos: d, tope, gravable, gmf: Math.round(gravable * TARIFA_GMF) }
    })
    .sort((a, b) => b.gmf - a.gmf || b.debitos - a.debitos)
  return { mes, cuentas, total: cuentas.reduce((s, c) => s + c.gmf, 0) }
}

/** 4x1000 estimado del mes por cuenta. Por defecto, con la cuenta que el usuario marcó como exenta. */
export function gmfDelMes(datos: Datos, mes: string, exentaId: string | null = cuentaExenta(datos)?.id ?? null): GmfMes {
  return calcular(datos, mes, debitosDelMes(datos, mes), exentaId)
}

/** 4x1000 que el usuario anotó como gasto en el mes. */
export function gmfAnotado(datos: Datos, mes: string): number {
  const anotado = new Set(datos.categorias.filter((c) => esCategoriaGMF(c.nombre)).map((c) => c.id))
  return datos.movimientos.filter((m) => m.tipo === 'egreso' && m.categoria_id && anotado.has(m.categoria_id) && mesDe(m.fecha) === mes).reduce((s, m) => s + m.valor, 0)
}

export interface Escenario {
  /** Cuenta marcada como exenta en este escenario; null = ninguna. */
  medio: MedioPago | null
  /** 4x1000 de todos los meses analizados. */
  total: number
  /** Llevado a un año. */
  anual: number
  actual: boolean
}

export interface Recomendacion {
  meses: string[]
  /** Del más barato al más caro. */
  escenarios: Escenario[]
  actual: Escenario
  mejor: Escenario
  ahorroAnual: number
  /** Meses en que la cuenta exenta pasó el tope de 350 UVT. */
  excesos: { mes: string; debitos: number; tope: number }[]
}

/**
 * Simula marcar como exenta cada una de las cuentas y compara cuánto 4x1000 se habría pagado
 * en los meses dados. Ante un empate, se queda con la cuenta que ya está marcada.
 */
export function recomendarExenta(datos: Datos, meses: string[]): Recomendacion | null {
  if (!meses.length) return null
  const actualId = cuentaExenta(datos)?.id ?? null
  const debitos = meses.map((mes) => ({ mes, d: debitosDelMes(datos, mes) }))
  if (debitos.every(({ d }) => d.size === 0)) return null
  // Solo se comparan las cuentas por las que salió plata (y la que ya está marcada).
  const conMovimiento = new Set(debitos.flatMap(({ d }) => [...d.keys()]))
  const candidatos: (MedioPago | null)[] = [null, ...datos.medios_pago.filter((m) => pagaGMF(m) && (conMovimiento.has(m.id) || m.id === actualId))]
  const escenarios = candidatos
    .map((medio) => {
      const id = medio?.id ?? null
      const total = debitos.reduce((s, { mes, d }) => s + calcular(datos, mes, d, id).total, 0)
      return { medio, total, anual: Math.round((total * 12) / meses.length), actual: id === actualId }
    })
    .sort((a, b) => a.total - b.total || Number(b.actual) - Number(a.actual))
  const actual = escenarios.find((e) => e.actual)!
  const mejor = escenarios[0]
  const excesos = actualId
    ? debitos.filter(({ mes, d }) => (d.get(actualId) ?? 0) > topeExenta(mes)).map(({ mes, d }) => ({ mes, debitos: d.get(actualId)!, tope: topeExenta(mes) }))
    : []
  return { meses, escenarios, actual, mejor, ahorroAnual: actual.anual - mejor.anual, excesos }
}

/**
 * Los meses con movimientos del último año (los 12 meses que terminan en `hasta`). Los meses más
 * viejos no cuentan: lo que se movía hace dos años no dice cuál cuenta conviene hoy.
 */
export function mesesParaAnalizar(datos: Datos, hasta: string): string[] {
  const desde = sumarMeses(hasta, -11)
  return [...new Set(datos.movimientos.map((m) => mesDe(m.fecha)))]
    .filter((m) => m >= desde && m <= hasta)
    .sort()
    .reverse()
}
