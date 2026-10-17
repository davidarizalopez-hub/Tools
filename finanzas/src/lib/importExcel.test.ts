import { describe, expect, it } from 'vitest'
import { leerExcel, planificar, type Celda, type Hoja } from './importExcel'
import { datosIniciales } from './seed'
import { datosVacios, type Datos } from './types'

const fecha = (d: string) => new Date(d + 'T00:00:00Z')
const fila = (egreso: Celda[], ingreso: Celda[] = []) => [null, ...egreso, ...(egreso.length ? [] : Array(7).fill(null)), null, ...ingreso]
const ENCABEZADO = [null, 'Concepto', 'Proveedor', 'Concepto', 'Fecha', 'Cuenta', 'No. Cuotas', 'Valor', null, 'Concepto', 'Locación', 'Concepto', 'Fecha', 'Cuenta', 'No. Cuotas', 'Valor', 'Comentarios']

const libro: Hoja[] = [
  { sheet: 'TD', data: [['Fecha', '(Todas)']] },
  {
    sheet: 'Base de datos',
    data: [
      [null, null, null, null, null, null, null, null],
      [null, 'Egreso', null, 'Ingreso', null, 'Clientes', null, 'Medios de Pago'],
      [null, 'Mercado', null, 'Nomina', null, 'Cliente Uno', null, 'Ahorros Bancolombia'],
      [null, 'Mascotas', null, 'Asesorías', null, 'Cliente Dos', null, 'Billetera Nueva'],
    ],
  },
  {
    sheet: 'Febrero',
    data: [
      ENCABEZADO,
      fila(['Mercado', 'Tienda', 'Verduras', fecha('2025-02-01'), 'TdC Falabella', 1, 150000], ['Nomina', 'Empresa', 'Febrero', fecha('2025-02-15'), 'Bancolombia', 1, 3000000, 'quincena']),
      fila(['Gravemen Financiero', 'Banco', '4x1000', fecha('2025-02-02'), 'Ahorros Bancolombia', 1, 4000], ['Saldo mes anterior', null, null, fecha('2025-02-01'), 'Bancolombia', 1, 500000]),
      fila(['Pago tarjeta de credito', 'Banco Falabella', 'Pago enero', fecha('2025-02-10'), 'Ahorros Bancolombia', 1, 800000], ['Asesorías', 'Cliente Nuevo', 'Plan', 45700, 'Nequi', 1, 200000]),
      fila(['Snacks', 'Tienda', 'Galletas', fecha('2025-02-11'), 'Nequi', null, 5000]),
      fila(['Snacks', 'Tienda', 'Galletas', fecha('2025-02-11'), 'Nequi', 1, 5000]),
      fila([null, 'INGRESOS', 0, null, null, null, null]),
      fila(['Comida', 'Sin valor', 'x', fecha('2025-02-12'), 'Nequi', 1, null]),
    ],
  },
]

const base = (): Datos => ({ ...datosVacios(), ...datosIniciales() })

describe('leerExcel', () => {
  const l = leerExcel(libro)

  it('lee los dos bloques de cada hoja de mes e ignora filas sin fecha o sin valor', () => {
    expect(l.filas.filter((f) => f.tipo === 'egreso')).toHaveLength(5)
    expect(l.filas.filter((f) => f.tipo === 'ingreso')).toHaveLength(3)
  })

  it('convierte fechas Date y seriales de Excel, y lee comentarios', () => {
    const nomina = l.filas.find((f) => f.categoria === 'Nomina')!
    expect(nomina).toMatchObject({ fecha: '2025-02-15', valor: 3000000, tercero: 'Empresa', cuenta: 'Bancolombia', comentarios: 'quincena' })
    expect(l.filas.find((f) => f.categoria === 'Asesorías')!.fecha).toBe('2025-02-12')
  })

  it('lee las listas de la hoja Base de datos', () => {
    expect(l.listas).toEqual({
      egreso: ['Mercado', 'Mascotas'],
      ingreso: ['Nomina', 'Asesorías'],
      clientes: ['Cliente Uno', 'Cliente Dos'],
      medios: ['Ahorros Bancolombia', 'Billetera Nueva'],
    })
  })
})

describe('planificar', () => {
  const l = leerExcel(libro)

  it('reutiliza catálogos existentes (sin tildes ni mayúsculas) y crea solo los que faltan', () => {
    const p = planificar(l, base())
    expect(p.categorias.map((c) => `${c.tipo}:${c.nombre}`).sort()).toEqual(['egreso:Mascotas', 'ingreso:Asesorías'])
    expect(p.medios_pago.map((m) => [m.nombre, m.tipo])).toEqual([['Billetera Nueva', 'billetera']])
    expect(p.clientes.map((c) => c.nombre)).toEqual(['Cliente Uno', 'Cliente Dos', 'Empresa', 'Cliente Nuevo'])
  })

  it('convierte el pago de tarjeta en transferencia y omite el saldo del mes anterior', () => {
    const d = base()
    const p = planificar(l, d)
    const t = p.movimientos.filter((m) => m.tipo === 'transferencia')
    expect(t).toHaveLength(1)
    expect(d.medios_pago.find((m) => m.id === t[0].medio_destino_id)!.nombre).toBe('TdC Falabella')
    expect(d.medios_pago.find((m) => m.id === t[0].medio_pago_id)!.nombre).toBe('Bancolombia Ahorros')
    expect(p.omitidas).toHaveLength(1)
    expect(p.movimientos).toHaveLength(7)
  })

  it('al importar dos veces no duplica, pero respeta filas idénticas dentro del mismo archivo', () => {
    const d = base()
    const p1 = planificar(l, d)
    expect(p1.movimientos.filter((m) => m.descripcion === 'Galletas')).toHaveLength(2)
    const d2: Datos = {
      ...d,
      categorias: [...d.categorias, ...p1.categorias],
      medios_pago: [...d.medios_pago, ...p1.medios_pago],
      clientes: p1.clientes,
      movimientos: p1.movimientos,
    }
    const p2 = planificar(l, d2)
    expect(p2.movimientos).toHaveLength(0)
    expect(p2.duplicados).toBe(7)
    expect(p2.categorias).toHaveLength(0)
    expect(p2.clientes).toHaveLength(0)
  })
})
