import { describe, expect, it } from 'vitest'
import { consejos, proyectar, resumenMes, saldos } from './stats'
import { datosIniciales } from './seed'
import { datosVacios, type Datos, type Movimiento } from './types'

function armar() {
  const d: Datos = { ...datosVacios(), ...datosIniciales() }
  const cat = (n: string) => d.categorias.find((c) => c.nombre === n)!.id
  const medio = (n: string) => d.medios_pago.find((m) => m.nombre === n)!.id
  let i = 0
  const mov = (tipo: Movimiento['tipo'], fecha: string, valor: number, extra: Partial<Movimiento> = {}): Movimiento => ({
    id: `m${i++}`,
    tipo,
    fecha,
    valor,
    medio_pago_id: medio('Bancolombia Ahorros'),
    medio_destino_id: null,
    categoria_id: null,
    cliente_id: null,
    compromiso_id: null,
    proveedor: null,
    descripcion: null,
    cuotas: 1,
    comentarios: null,
    origen: 'manual',
    ...extra,
  })
  for (const mes of ['2025-01', '2025-02', '2025-03']) {
    d.movimientos.push(
      mov('ingreso', `${mes}-15`, 4_000_000, { categoria_id: cat('Nómina') }),
      mov('egreso', `${mes}-05`, 1_200_000, { categoria_id: cat('Arriendo') }),
      mov('egreso', `${mes}-08`, 300_000, { categoria_id: cat('Ahorro') }),
    )
  }
  d.movimientos.push(
    mov('egreso', '2025-01-10', 400_000, { categoria_id: cat('Mercado') }),
    mov('egreso', '2025-02-10', 500_000, { categoria_id: cat('Mercado') }),
    mov('egreso', '2025-03-10', 1_200_000, { categoria_id: cat('Mercado'), medio_pago_id: medio('TdC Falabella') }),
    mov('transferencia', '2025-03-20', 1_000_000, { medio_destino_id: medio('TdC Falabella') }),
    mov('ingreso', '2025-03-25', 2_000_000, { categoria_id: cat('Préstamo') }),
  )
  return { d, cat, medio }
}

describe('resumenMes', () => {
  it('separa fijos, variables y ahorro, y no cuenta transferencias como gasto', () => {
    const { d } = armar()
    const r = resumenMes(d, '2025-03')
    expect(r).toMatchObject({ ingresos: 6_000_000, fijos: 1_200_000, variables: 1_200_000, ahorro: 300_000, gastos: 2_400_000, balance: 3_300_000 })
    expect(r.gastosPorCategoria.map((c) => c.nombre)).toEqual(['Arriendo', 'Mercado'])
    expect(r.tasaAhorro).toBeCloseTo(0.6)
  })
})

describe('saldos', () => {
  it('suma ingresos, resta egresos y mueve las transferencias entre cuentas', () => {
    const { d, medio } = armar()
    const s = saldos(d)
    expect(s.get(medio('TdC Falabella'))).toBe(-200_000)
    expect(s.get(medio('Bancolombia Ahorros'))).toBe(12_000_000 + 2_000_000 - 3 * 1_500_000 - 900_000 - 1_000_000)
  })
})

describe('proyectar', () => {
  it('usa la mediana para fijos, el promedio para variables y los compromisos cuando existen', () => {
    const { d, cat } = armar()
    let p = proyectar(d, '2025-04')
    expect(p.base).toEqual(['2025-03', '2025-02', '2025-01'])
    expect(p.fijos).toEqual([{ nombre: 'Arriendo', monto: 1_200_000, fuente: 'historial' }])
    expect(p.variables[0]).toMatchObject({ nombre: 'Mercado', monto: 700_000 })
    expect(p.totalAhorro).toBe(300_000)

    d.compromisos.push({
      id: 'c1', nombre: 'Arriendo apto', tipo: 'servicio', medio_pago_id: null, categoria_id: cat('Arriendo'), monto_cuota: 1_300_000,
      dia_pago: 5, cuotas_total: null, cuotas_pagadas: 0, saldo_pendiente: null, activo: true, notas: null,
    })
    p = proyectar(d, '2025-04')
    expect(p.fijos).toEqual([{ nombre: 'Arriendo', monto: 1_300_000, fuente: 'compromiso' }])
  })
})

describe('consejos', () => {
  it('advierte la subida de una categoría y los ingresos que fueron préstamos', () => {
    const { d } = armar()
    const titulos = consejos(d, '2025-03').map((c) => c.titulo)
    expect(titulos).toContain('Mercado subió 167%')
    expect(titulos.some((t) => t.includes('fueron préstamos'))).toBe(true)
  })
})
