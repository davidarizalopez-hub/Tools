import { describe, expect, it } from 'vitest'
import { aBorradores, buscarDuplicado, construirMovimiento, faltantes, type Lectura, type MovimientoLeido } from './comprobantes'
import { datosIniciales } from './seed'
import { hoy } from './format'
import { datosVacios, type Datos } from './types'

const base = (): Datos => ({ ...datosVacios(), ...datosIniciales() })
const leido = (m: Partial<MovimientoLeido>): MovimientoLeido => ({
  tipo: 'egreso',
  valor: 45000,
  fecha: '2025-02-10',
  medio_pago: 'Nequi',
  medio_destino: null,
  categoria: 'Comida',
  tercero: 'Rappi',
  descripcion: 'Pago en Rappi',
  referencia: 'M123',
  confianza: 'alta',
  ...m,
})
const lectura = (...movimientos: MovimientoLeido[]): Lectura => ({ es_comprobante: true, observacion: null, movimientos })

describe('aBorradores', () => {
  it('traduce nombres a ids sin importar tildes ni mayúsculas', () => {
    const d = base()
    const [b] = aBorradores(lectura(leido({ medio_pago: 'NEQUI', categoria: 'barberia' })), d)
    expect(d.medios_pago.find((m) => m.id === b.medio_pago_id)!.nombre).toBe('Nequi')
    expect(d.categorias.find((c) => c.id === b.categoria_id)!.nombre).toBe('Barbería')
    expect(b).toMatchObject({ valor: 45000, fecha: '2025-02-10', tercero: 'Rappi', comentarios: 'Ref. M123', avisos: [] })
  })

  it('busca la categoría según el tipo y deja sin categoría las transferencias', () => {
    const d = base()
    const [ing, tr] = aBorradores(
      lectura(leido({ tipo: 'ingreso', categoria: 'Otros' }), leido({ tipo: 'transferencia', categoria: 'Otros', medio_pago: 'Bancolombia Ahorros', medio_destino: 'Nequi' })),
      d,
    )
    expect(d.categorias.find((c) => c.id === ing.categoria_id)).toMatchObject({ nombre: 'Otros', tipo: 'ingreso' })
    expect(tr.categoria_id).toBeNull()
    expect(faltantes(tr)).toEqual([])
  })

  it('avisa la confianza baja, pone hoy si falta la fecha o quedó en el futuro y descarta valores en cero', () => {
    const bs = aBorradores(lectura(leido({ fecha: null, confianza: 'baja' }), leido({ fecha: '2999-01-01' }), leido({ valor: 0 })), base())
    expect(bs).toHaveLength(2)
    expect(bs[0].fecha).toBe(hoy())
    expect(bs[0].avisos).toEqual(['Lectura dudosa: revisa todo', 'No se vio la fecha'])
    expect(bs[1].fecha).toBe(hoy())
  })
})

describe('faltantes', () => {
  it('pide medio y categoría cuando no se reconocieron', () => {
    const [b] = aBorradores(lectura(leido({ medio_pago: 'Cuenta desconocida', categoria: null })), base())
    expect(faltantes(b)).toEqual(['medio de pago', 'tipo de egreso'])
  })
})

describe('buscarDuplicado', () => {
  it('detecta el mismo pago ya registrado con un día de diferencia o repetido en el lote', () => {
    const d = base()
    const [b] = aBorradores(lectura(leido({})), d)
    const { movimiento } = construirMovimiento({ ...b, fecha: '2025-02-11' }, d.clientes)
    expect(buscarDuplicado(b, [movimiento], [])).toContain('Ya registraste')
    expect(buscarDuplicado(b, [{ ...movimiento, fecha: '2025-02-14' }], [])).toBeNull()
    expect(buscarDuplicado(b, [], [{ ...b }])).toBe('Otro pantallazo de este lote tiene el mismo pago')
    expect(buscarDuplicado(b, [], [{ ...b, valor: 46000 }])).toBeNull()
  })
})

describe('construirMovimiento', () => {
  it('en ingresos usa el cliente existente o crea uno nuevo; en gastos guarda el proveedor', () => {
    const d = base()
    d.clientes.push({ id: 'c1', nombre: 'Laura Gómez', telefono: null, notas: null, activo: true })
    const [ing] = aBorradores(lectura(leido({ tipo: 'ingreso', categoria: 'Personalizado', tercero: 'laura gomez' })), d)
    expect(construirMovimiento(ing, d.clientes)).toMatchObject({ clienteNuevo: null, movimiento: { cliente_id: 'c1', proveedor: null, origen: 'pantallazo' } })

    const nuevo = construirMovimiento({ ...ing, tercero: 'Pedro' }, d.clientes)
    expect(nuevo.clienteNuevo?.nombre).toBe('Pedro')
    expect(nuevo.movimiento.cliente_id).toBe(nuevo.clienteNuevo?.id)

    const [eg] = aBorradores(lectura(leido({})), d)
    expect(construirMovimiento(eg, d.clientes).movimiento).toMatchObject({ tipo: 'egreso', proveedor: 'Rappi', cliente_id: null, descripcion: 'Pago en Rappi' })
  })
})
