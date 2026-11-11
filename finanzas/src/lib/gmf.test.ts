import { describe, expect, it } from 'vitest'
import { debitosDelMes, gmfAnotado, gmfDelMes, mesesParaAnalizar, recomendarExenta, topeBajoMonto, topeExenta, uvtDe } from './gmf'
import { datosVacios, type Categoria, type Datos, type MedioPago, type Movimiento } from './types'

const medio = (id: string, tipo: MedioPago['tipo'], exenta = false): MedioPago => ({ id, nombre: id, tipo, saldo_inicial: 0, activo: true, exenta_gmf: exenta })
const cat = (id: string, nombre: string): Categoria => ({ id, nombre, tipo: 'egreso', naturaleza: 'variable', activo: true })

let n = 0
const mov = (m: Partial<Movimiento>): Movimiento => ({
  id: `m${++n}`,
  tipo: 'egreso',
  fecha: '2026-10-10',
  valor: 1_000_000,
  medio_pago_id: 'banco',
  medio_destino_id: null,
  categoria_id: 'comida',
  cliente_id: null,
  compromiso_id: null,
  proveedor: null,
  descripcion: null,
  cuotas: 1,
  comentarios: null,
  origen: 'manual',
  ...m,
})

const datos = (movimientos: Movimiento[], exenta: string | null = null): Datos => ({
  ...datosVacios(),
  medios_pago: [medio('banco', 'ahorros', exenta === 'banco'), medio('nomina', 'ahorros', exenta === 'nomina'), medio('nequi', 'billetera', exenta === 'nequi'), medio('tdc', 'tarjeta_credito'), medio('efectivo', 'efectivo')],
  categorias: [cat('comida', 'Comida'), cat('gmf', 'Gravamen financiero (4x1000)')],
  movimientos,
})

describe('UVT y topes', () => {
  it('usa la UVT de 2026 y la más reciente para años sin valor', () => {
    expect(uvtDe('2026-03')).toBe(52_374)
    expect(uvtDe('2025-12')).toBe(49_799)
    expect(uvtDe('2027-01')).toBe(52_374)
    expect(uvtDe('2020-01')).toBe(47_065)
    expect(topeExenta('2026-01')).toBe(18_330_900)
    expect(topeBajoMonto('2026-01')).toBe(3_404_310)
  })
})

describe('debitosDelMes', () => {
  it('suma gastos y transferencias que salen de cuentas; no ingresos, tarjeta ni el 4x1000 anotado', () => {
    const d = debitosDelMes(
      datos([
        mov({}),
        mov({ tipo: 'transferencia', valor: 500_000, categoria_id: null, medio_destino_id: 'tdc' }),
        mov({ tipo: 'ingreso', valor: 9_000_000, categoria_id: null }),
        mov({ medio_pago_id: 'tdc', valor: 300_000 }),
        mov({ medio_pago_id: 'efectivo', valor: 20_000 }),
        mov({ categoria_id: 'gmf', valor: 6_000 }),
        mov({ fecha: '2026-09-30', valor: 777 }),
      ]),
      '2026-10',
    )
    expect([...d.entries()]).toEqual([['banco', 1_500_000]])
  })
})

describe('gmfDelMes', () => {
  it('cobra 0,4 % en cuentas no exentas', () => {
    const r = gmfDelMes(datos([mov({ valor: 2_000_000 })]), '2026-10')
    expect(r.total).toBe(8_000)
    expect(r.cuentas[0]).toMatchObject({ debitos: 2_000_000, tope: 0, gmf: 8_000 })
  })

  it('la cuenta exenta solo paga lo que pasa de 350 UVT', () => {
    expect(gmfDelMes(datos([mov({ valor: 2_000_000 })], 'banco'), '2026-10').total).toBe(0)
    expect(gmfDelMes(datos([mov({ valor: 20_000_000 })], 'banco'), '2026-10').total).toBe(Math.round((20_000_000 - 18_330_900) * 0.004))
  })

  it('las billeteras de bajo monto no pagan los primeros 65 UVT', () => {
    expect(gmfDelMes(datos([mov({ medio_pago_id: 'nequi', valor: 3_000_000 })]), '2026-10').total).toBe(0)
    expect(gmfDelMes(datos([mov({ medio_pago_id: 'nequi', valor: 4_000_000 })]), '2026-10').total).toBe(Math.round((4_000_000 - 3_404_310) * 0.004))
  })

  it('cuenta el 4x1000 que el usuario anotó como gasto', () => {
    expect(gmfAnotado(datos([mov({ categoria_id: 'gmf', valor: 6_000 }), mov({})]), '2026-10')).toBe(6_000)
  })
})

describe('recomendarExenta', () => {
  const movs = [
    mov({ medio_pago_id: 'nomina', valor: 7_000_000, fecha: '2026-09-15' }),
    mov({ medio_pago_id: 'banco', valor: 3_000_000, fecha: '2026-09-20' }),
    mov({ medio_pago_id: 'nomina', valor: 6_000_000 }),
    mov({ medio_pago_id: 'banco', valor: 4_000_000 }),
  ]

  it('recomienda la cuenta por la que sale más plata y calcula el ahorro anual', () => {
    const r = recomendarExenta(datos(movs, 'banco'), ['2026-10', '2026-09'])!
    expect(r.mejor.medio?.id).toBe('nomina')
    expect(r.actual.medio?.id).toBe('banco')
    // Con banco exenta paga la nómina: 13 M × 0,4 % = 52.000 en 2 meses → 312.000 al año
    expect(r.actual).toMatchObject({ total: 52_000, anual: 312_000 })
    // Con nómina exenta paga banco: 7 M × 0,4 % = 28.000 en 2 meses → 168.000 al año
    expect(r.mejor).toMatchObject({ total: 28_000, anual: 168_000 })
    expect(r.ahorroAnual).toBe(144_000)
    expect(r.escenarios.at(-1)!.medio).toBeNull()
  })

  it('ante un empate se queda con la cuenta marcada', () => {
    const r = recomendarExenta(datos([mov({ medio_pago_id: 'banco', valor: 100_000 })], 'nomina'), ['2026-10'])!
    expect(r.mejor.medio?.id).toBe('banco')
    const empate = recomendarExenta(datos([mov({ medio_pago_id: 'tdc', valor: 100_000 })], 'nomina'), ['2026-10'])
    expect(empate).toBeNull()
  })

  it('avisa los meses en que la cuenta exenta pasó el tope', () => {
    const r = recomendarExenta(datos([mov({ valor: 19_000_000 })], 'banco'), ['2026-10'])!
    expect(r.excesos).toEqual([{ mes: '2026-10', debitos: 19_000_000, tope: 18_330_900 }])
  })
})

describe('mesesParaAnalizar', () => {
  it('toma solo los meses con movimientos del último año, sin pasar del mes elegido', () => {
    const movs = ['2025-01-05', '2025-02-05', '2025-11-30', '2025-12-01', '2026-10-05', '2026-11-01', '2026-12-01'].map((fecha) => mov({ fecha }))
    expect(mesesParaAnalizar(datos(movs), '2026-11')).toEqual(['2026-11', '2026-10', '2025-12'])
  })
})
