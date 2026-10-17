import type { Categoria, Compromiso, Datos, Movimiento, Naturaleza } from './types'
import { mesDe, normalizar, pesos, porcentaje, sumarMeses } from './format'

export interface TotalCategoria {
  categoria_id: string | null
  nombre: string
  naturaleza: Naturaleza | null
  total: number
  cantidad: number
}

export interface ResumenMes {
  mes: string
  ingresos: number
  /** Egresos de consumo: fijos + variables (sin el ahorro). */
  gastos: number
  fijos: number
  variables: number
  ahorro: number
  /** Lo que queda: ingresos - gastos - ahorro. */
  balance: number
  /** (ingresos - gastos) / ingresos: ahorro explícito + lo que sobró. */
  tasaAhorro: number | null
  gastosPorCategoria: TotalCategoria[]
  ingresosPorCategoria: TotalCategoria[]
  cantidad: number
}

const indicePorId = <T extends { id: string }>(lista: T[]) => new Map(lista.map((x) => [x.id, x]))

export const movimientosDelMes = (datos: Datos, mes: string) => datos.movimientos.filter((m) => mesDe(m.fecha) === mes)

function agrupar(movs: Movimiento[], categorias: Map<string, Categoria>): TotalCategoria[] {
  const grupos = new Map<string, TotalCategoria>()
  for (const m of movs) {
    const cat = m.categoria_id ? categorias.get(m.categoria_id) : undefined
    const clave = cat?.id ?? '∅'
    const g = grupos.get(clave) ?? {
      categoria_id: cat?.id ?? null,
      nombre: cat?.nombre ?? 'Sin categoría',
      naturaleza: cat?.naturaleza ?? null,
      total: 0,
      cantidad: 0,
    }
    g.total += m.valor
    g.cantidad += 1
    grupos.set(clave, g)
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total)
}

export function resumenMes(datos: Datos, mes: string): ResumenMes {
  const cats = indicePorId(datos.categorias)
  const movs = movimientosDelMes(datos, mes)
  const egresos = movs.filter((m) => m.tipo === 'egreso')
  const ingresosMovs = movs.filter((m) => m.tipo === 'ingreso')
  const naturaleza = (m: Movimiento) => (m.categoria_id ? cats.get(m.categoria_id)?.naturaleza : null) ?? 'variable'

  let fijos = 0
  let variables = 0
  let ahorro = 0
  for (const m of egresos) {
    const n = naturaleza(m)
    if (n === 'fijo') fijos += m.valor
    else if (n === 'ahorro') ahorro += m.valor
    else variables += m.valor
  }
  const ingresos = ingresosMovs.reduce((s, m) => s + m.valor, 0)
  const gastos = fijos + variables
  return {
    mes,
    ingresos,
    gastos,
    fijos,
    variables,
    ahorro,
    balance: ingresos - gastos - ahorro,
    tasaAhorro: ingresos > 0 ? (ingresos - gastos) / ingresos : null,
    gastosPorCategoria: agrupar(egresos.filter((m) => naturaleza(m) !== 'ahorro'), cats),
    ingresosPorCategoria: agrupar(ingresosMovs, cats),
    cantidad: movs.length,
  }
}

export function serieMeses(datos: Datos, mesFinal: string, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const r = resumenMes(datos, sumarMeses(mesFinal, i - n + 1))
    return { mes: r.mes, ingresos: r.ingresos, gastos: r.gastos + r.ahorro }
  })
}

/** Meses (YYYY-MM) que tienen al menos un movimiento, del más reciente al más antiguo. */
export function mesesConDatos(datos: Datos): string[] {
  return [...new Set(datos.movimientos.map((m) => mesDe(m.fecha)))].sort().reverse()
}

/** Saldo actual de cada medio de pago (en tarjetas de crédito, negativo = deuda). */
export function saldos(datos: Datos): Map<string, number> {
  const s = new Map(datos.medios_pago.map((m) => [m.id, m.saldo_inicial]))
  const mover = (id: string | null, v: number) => {
    if (id && s.has(id)) s.set(id, s.get(id)! + v)
  }
  for (const m of datos.movimientos) {
    if (m.tipo === 'ingreso') mover(m.medio_pago_id, m.valor)
    else if (m.tipo === 'egreso') mover(m.medio_pago_id, -m.valor)
    else {
      mover(m.medio_pago_id, -m.valor)
      mover(m.medio_destino_id, m.valor)
    }
  }
  return s
}

// ---------- Proyección ----------

export interface LineaProyeccion {
  nombre: string
  monto: number
  fuente: 'compromiso' | 'historial'
}

export interface Proyeccion {
  mes: string
  /** Meses usados como referencia. */
  base: string[]
  ingresos: number
  fijos: LineaProyeccion[]
  variables: LineaProyeccion[]
  ahorro: LineaProyeccion[]
  tarjetas: LineaProyeccion[]
  totalFijos: number
  totalVariables: number
  totalAhorro: number
  totalTarjetas: number
  excedente: number
}

export const compromisoVigente = (c: Compromiso) => c.activo && (c.cuotas_total == null || c.cuotas_pagadas < c.cuotas_total)

const suma = (l: LineaProyeccion[]) => l.reduce((s, x) => s + x.monto, 0)

function mediana(valores: number[]) {
  const v = [...valores].sort((a, b) => a - b)
  const k = Math.floor(v.length / 2)
  return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2
}

/** Meses con movimientos anteriores a `mes` (hasta 3, buscando en el último año). */
export function mesesBase(datos: Datos, mes: string): string[] {
  const conDatos = new Set(datos.movimientos.map((m) => mesDe(m.fecha)))
  const base: string[] = []
  for (let i = 1; i <= 12 && base.length < 3; i++) {
    const m = sumarMeses(mes, -i)
    if (conDatos.has(m)) base.push(m)
  }
  return base
}

export function proyectar(datos: Datos, mes: string): Proyeccion {
  const base = mesesBase(datos, mes)
  const resumenes = base.map((m) => resumenMes(datos, m))
  const vigentes = datos.compromisos.filter(compromisoVigente)

  const fijos: LineaProyeccion[] = []
  const variables: LineaProyeccion[] = []
  const ahorro: LineaProyeccion[] = []

  for (const cat of datos.categorias.filter((c) => c.tipo === 'egreso')) {
    const compromisos = vigentes.filter((c) => c.categoria_id === cat.id && c.tipo !== 'tarjeta')
    const destino = cat.naturaleza === 'fijo' ? fijos : cat.naturaleza === 'ahorro' ? ahorro : variables
    if (compromisos.length) {
      destino.push({ nombre: cat.nombre, monto: compromisos.reduce((s, c) => s + c.monto_cuota, 0), fuente: 'compromiso' })
      continue
    }
    const porMes = resumenes.map((r) => {
      if (cat.naturaleza === 'ahorro') {
        return datos.movimientos
          .filter((m) => m.tipo === 'egreso' && m.categoria_id === cat.id && mesDe(m.fecha) === r.mes)
          .reduce((s, m) => s + m.valor, 0)
      }
      return r.gastosPorCategoria.find((g) => g.categoria_id === cat.id)?.total ?? 0
    })
    const conValor = porMes.filter((v) => v > 0)
    if (!conValor.length) continue
    // Un gasto fijo se repite con el mismo valor: tomamos la mediana de los meses en que apareció.
    // Uno variable se promedia sobre todos los meses de referencia (incluidos los meses en cero).
    const monto = cat.naturaleza === 'fijo' ? mediana(conValor) : porMes.reduce((s, v) => s + v, 0) / porMes.length
    destino.push({ nombre: cat.nombre, monto, fuente: 'historial' })
  }

  for (const c of vigentes.filter((c) => !c.categoria_id && c.tipo !== 'tarjeta')) {
    fijos.push({ nombre: c.nombre, monto: c.monto_cuota, fuente: 'compromiso' })
  }
  const tarjetas = vigentes
    .filter((c) => c.tipo === 'tarjeta')
    .map((c): LineaProyeccion => ({ nombre: c.nombre, monto: c.monto_cuota, fuente: 'compromiso' }))

  for (const l of [fijos, variables, ahorro, tarjetas]) l.sort((a, b) => b.monto - a.monto)

  const ingresos = resumenes.length ? resumenes.reduce((s, r) => s + r.ingresos, 0) / resumenes.length : 0
  const totalFijos = suma(fijos)
  const totalVariables = suma(variables)
  const totalAhorro = suma(ahorro)
  return {
    mes,
    base,
    ingresos,
    fijos,
    variables,
    ahorro,
    tarjetas,
    totalFijos,
    totalVariables,
    totalAhorro,
    totalTarjetas: suma(tarjetas),
    excedente: ingresos - totalFijos - totalVariables - totalAhorro,
  }
}

// ---------- Recomendaciones ----------

export interface Consejo {
  nivel: 'bien' | 'atencion' | 'info'
  titulo: string
  detalle: string
}

/** Compras variables por debajo de este valor cuentan como "gastos hormiga". */
export const UMBRAL_HORMIGA = 30_000

export function consejos(datos: Datos, mes: string): Consejo[] {
  const r = resumenMes(datos, mes)
  const lista: Consejo[] = []
  if (r.cantidad === 0) return lista
  const cats = indicePorId(datos.categorias)
  const egresos = movimientosDelMes(datos, mes).filter((m) => m.tipo === 'egreso')

  // 1. ¿Qué se lleva tus ingresos?
  const top = r.gastosPorCategoria.slice(0, 3)
  if (top.length && r.gastos > 0) {
    const t = top.reduce((s, c) => s + c.total, 0)
    lista.push({
      nivel: 'info',
      titulo: '¿Qué se lleva tus ingresos?',
      detalle:
        `${top.map((c) => c.nombre).join(', ')} sumaron ${pesos(t)}: el ${porcentaje(t / r.gastos)} de tus gastos` +
        (r.ingresos > 0 ? ` y el ${porcentaje(t / r.ingresos)} de tus ingresos.` : '.'),
    })
  }

  // 2. Balance del mes
  if (r.ingresos > 0) {
    if (r.gastos + r.ahorro > r.ingresos) {
      lista.push({
        nivel: 'atencion',
        titulo: 'Gastaste más de lo que ingresó',
        detalle: `Los egresos superaron los ingresos por ${pesos(r.gastos + r.ahorro - r.ingresos)}. Revisa si se cubrió con tarjeta de crédito o con ahorros.`,
      })
    }
    // Un préstamo que te hacen no es ingreso propio: lo mostramos aparte.
    const prestamos = r.ingresosPorCategoria.filter((c) => normalizar(c.nombre).startsWith('prestamo')).reduce((s, c) => s + c.total, 0)
    if (prestamos > 0) {
      const propios = r.ingresos - prestamos
      lista.push({
        nivel: 'atencion',
        titulo: `${pesos(prestamos)} de tus ingresos fueron préstamos`,
        detalle:
          `Es plata que tendrás que devolver. Sin ella tus ingresos propios fueron ${pesos(propios)}` +
          (propios > 0 ? ` y tu ahorro real del ${porcentaje(Math.max((propios - r.gastos) / propios, 0))}.` : '.'),
      })
    }
    // 3. Regla 50/30/20
    const tasa = r.tasaAhorro ?? 0
    if (tasa >= 0.2) {
      lista.push({ nivel: 'bien', titulo: `Ahorraste el ${porcentaje(tasa)} de tus ingresos`, detalle: 'Estás por encima de la meta recomendada del 20%. ¡Sigue así!' })
    } else {
      const falta = 0.2 * r.ingresos - (r.ingresos - r.gastos)
      lista.push({
        nivel: 'atencion',
        titulo: `Tu ahorro fue del ${porcentaje(Math.max(tasa, 0))}`,
        detalle: `La meta sugerida es apartar el 20% de lo que ingresa (regla 50/30/20). Para lograrlo este mes te faltaron ${pesos(falta)}.`,
      })
    }
    if (r.fijos / r.ingresos > 0.5) {
      lista.push({
        nivel: 'atencion',
        titulo: `Tus gastos fijos son el ${porcentaje(r.fijos / r.ingresos)} de tus ingresos`,
        detalle: 'Lo recomendado es que no pasen del 50%. Revisa créditos, suscripciones y servicios que puedas renegociar o cancelar.',
      })
    }
  } else {
    lista.push({ nivel: 'info', titulo: 'No hay ingresos registrados este mes', detalle: 'Registra tus ingresos para calcular tu tasa de ahorro y cuánto de tu dinero se va en cada categoría.' })
  }

  // 4. Categorías que subieron frente a tu promedio
  const base = mesesBase(datos, mes)
  if (base.length) {
    const anteriores = base.map((m) => resumenMes(datos, m))
    const subidas = r.gastosPorCategoria
      .map((c) => {
        const prom = anteriores.reduce((s, a) => s + (a.gastosPorCategoria.find((g) => g.categoria_id === c.categoria_id)?.total ?? 0), 0) / anteriores.length
        return { c, prom, dif: c.total - prom }
      })
      .filter((x) => x.prom > 0 && x.dif > 50_000 && x.dif / x.prom > 0.25)
      .sort((a, b) => b.dif - a.dif)
      .slice(0, 2)
    for (const s of subidas) {
      lista.push({
        nivel: 'atencion',
        titulo: `${s.c.nombre} subió ${porcentaje(s.dif / s.prom)}`,
        detalle: `Gastaste ${pesos(s.c.total)} frente a un promedio de ${pesos(s.prom)} en los meses anteriores (${pesos(s.dif)} más).`,
      })
    }
  }

  // 5. Gastos hormiga
  const hormiga = egresos.filter((m) => m.valor < UMBRAL_HORMIGA && (m.categoria_id ? cats.get(m.categoria_id)?.naturaleza : 'variable') === 'variable')
  if (hormiga.length >= 5) {
    const t = hormiga.reduce((s, m) => s + m.valor, 0)
    lista.push({
      nivel: 'info',
      titulo: `${hormiga.length} compras pequeñas sumaron ${pesos(t)}`,
      detalle: `Son "gastos hormiga" (menos de ${pesos(UMBRAL_HORMIGA)} cada uno). Reducirlos a la mitad te dejaría unos ${pesos(t / 2)} más al mes, ${pesos(t * 6)} al año.`,
    })
  }

  // 6. Proveedor donde más se fue la plata
  const porProveedor = new Map<string, { nombre: string; total: number; n: number }>()
  for (const m of egresos) {
    if (!m.proveedor) continue
    const k = normalizar(m.proveedor)
    const p = porProveedor.get(k) ?? { nombre: m.proveedor, total: 0, n: 0 }
    p.total += m.valor
    p.n += 1
    porProveedor.set(k, p)
  }
  const frecuente = [...porProveedor.values()].filter((p) => p.n >= 3).sort((a, b) => b.total - a.total)[0]
  if (frecuente) {
    lista.push({ nivel: 'info', titulo: `${frecuente.nombre}: ${frecuente.n} compras`, detalle: `Le pagaste ${pesos(frecuente.total)} este mes. ¿Vale la pena poner un tope mensual?` })
  }

  // 7. 4x1000
  const gmf = egresos.filter((m) => m.categoria_id && normalizar(cats.get(m.categoria_id)?.nombre ?? '').includes('gravamen'))
  if (gmf.length) {
    lista.push({
      nivel: 'info',
      titulo: 'Pagaste 4x1000',
      detalle: `Fueron ${pesos(gmf.reduce((s, m) => s + m.valor, 0))}. Puedes marcar una cuenta como exenta del GMF en tu banco (hasta unos 350 UVT al mes) para no pagarlo.`,
    })
  }
  return lista
}
