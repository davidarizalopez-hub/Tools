import { describe, expect, it } from 'vitest'
import { prepararRevision, type Pendiente, type Propuesta } from './bandeja'
import { construirMovimiento } from './comprobantes'
import { datosIniciales } from './seed'
import { datosVacios, type Datos, type Movimiento } from './types'

const base = (): Datos => ({ ...datosVacios(), ...datosIniciales() })

let n = 0
const pendiente = (d: Partial<Propuesta>, estado: Pendiente['estado'] = 'pendiente'): Pendiente => ({
  id: `p${++n}`,
  fuente: 'correo',
  fuente_id: `c${n}`,
  remitente: 'Bancolombia',
  recibido_en: null,
  estado,
  movimiento_id: null,
  datos: {
    tipo: 'egreso',
    valor: 68000,
    fecha: '2026-01-19',
    medio_pago: 'Bancolombia Ahorros',
    medio_destino: null,
    categoria: 'Mercado',
    tercero: 'Carnicería',
    descripcion: 'Compra con tarjeta débito',
    referencia: null,
    confianza: 'alta',
    extracto: 'Compraste $68.000,00 en CARNICERIA',
    ...d,
  },
})

const movimiento = (m: Partial<Movimiento>): Movimiento => ({
  id: 'm1',
  tipo: 'egreso',
  fecha: '2026-01-20',
  valor: 68000,
  medio_pago_id: null,
  medio_destino_id: null,
  categoria_id: null,
  cliente_id: null,
  compromiso_id: null,
  proveedor: null,
  descripcion: 'Carne',
  cuotas: 1,
  comentarios: null,
  origen: 'manual',
  ...m,
})

describe('prepararRevision', () => {
  it('ordena por fecha, agrupa por mes y deja listo lo completo', () => {
    const [feb, ene] = [pendiente({ fecha: '2026-02-02', valor: 60450 }), pendiente({})]
    const r = prepararRevision([feb, ene], base())
    expect(r.map((x) => x.mes)).toEqual(['2026-01', '2026-02'])
    expect(r[0]).toMatchObject({ listo: true, duplicado: null, registrado: null })
    expect(r[0].borrador).toMatchObject({ clave: ene.id, origen: 'correo', valor: 68000, tercero: 'Carnicería' })
  })

  it('no deja listo lo que tiene avisos, confianza media o datos faltantes', () => {
    const r = prepararRevision(
      [
        pendiente({ avisos: ['El correo no dice con qué pagaste'] }),
        pendiente({ fecha: '2026-03-01', confianza: 'media' }),
        pendiente({ fecha: '2026-04-01', categoria: null, confianza: 'media' }),
      ],
      base(),
    )
    expect(r.map((x) => x.listo)).toEqual([false, false, false])
    expect(r[0].borrador.avisos).toEqual(['El correo no dice con qué pagaste'])
    expect(r[1].borrador.avisos).toEqual(['Revisa los datos'])
    // Si ya falta el tipo, no hace falta el aviso genérico
    expect(r[2].borrador.avisos).toEqual([])
  })

  it('marca lo que ya está registrado y los correos repetidos entre sí', () => {
    const d = { ...base(), movimientos: [movimiento({})] }
    const r = prepararRevision([pendiente({}), pendiente({ fecha: '2026-05-10', valor: 23100 }), pendiente({ fecha: '2026-05-10', valor: 23100 })], d)
    expect(r[0].registrado).toMatch(/Ya registraste/)
    expect(r[0].listo).toBe(false)
    expect(r[1].duplicado).toBeNull()
    expect(r[2]).toMatchObject({ registrado: null, duplicado: 'Otro correo tiene el mismo pago', listo: false })
  })

  it('no compara contra los ya cerrados', () => {
    const r = prepararRevision([pendiente({}, 'descartado'), pendiente({})], base())
    expect(r[0]).toMatchObject({ listo: false, duplicado: null })
    expect(r[1]).toMatchObject({ listo: true, duplicado: null })
  })

  it('el movimiento guardado queda con origen correo', () => {
    const [r] = prepararRevision([pendiente({})], base())
    expect(construirMovimiento(r.borrador, []).movimiento.origen).toBe('correo')
  })
})
