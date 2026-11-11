import { describe, expect, it } from 'vitest'
import { debeConsultar, eaAMv, interesMensual, mvAEa, tieneTasa } from './creditos'
import type { Compromiso } from './types'

const compromiso = (c: Partial<Compromiso> = {}): Compromiso => ({
  id: 'c1',
  nombre: 'Crédito libre inversión',
  tipo: 'credito',
  medio_pago_id: null,
  categoria_id: null,
  monto_cuota: 2_030_000,
  dia_pago: 15,
  cuotas_total: 60,
  cuotas_pagadas: 20,
  saldo_pendiente: 50_000_000,
  activo: true,
  notas: null,
  entidad: 'Banco X',
  tasa_ea: 24,
  ...c,
})

const ahora = Date.parse('2026-11-11T12:00:00Z')
const analizado = { analisis: { hay_mejor_opcion: false } as Compromiso['analisis'], analizado_en: '2026-11-01T12:00:00Z' }

describe('tasas', () => {
  it('convierte entre mes vencido y efectiva anual', () => {
    expect(mvAEa(2)).toBeCloseTo(26.824, 2)
    expect(eaAMv(26.824179)).toBeCloseTo(2, 4)
    expect(eaAMv(mvAEa(1.5))).toBeCloseTo(1.5, 8)
  })

  it('calcula el interés aproximado de un mes', () => {
    // 1 % mes vencido sobre 10 millones = 100.000
    expect(interesMensual(10_000_000, mvAEa(1))).toBe(100_000)
  })

  it('solo créditos, préstamos y tarjetas tienen tasa', () => {
    expect(['credito', 'prestamo', 'tarjeta'].every((t) => tieneTasa(t as Compromiso['tipo']))).toBe(true)
    expect(tieneTasa('suscripcion')).toBe(false)
    expect(tieneTasa('servicio')).toBe(false)
  })
})

describe('debeConsultar', () => {
  it('consulta un crédito nuevo o sin análisis', () => {
    expect(debeConsultar(compromiso(), undefined, ahora)).toBe(true)
    expect(debeConsultar(compromiso(), compromiso(), ahora)).toBe(true)
  })

  it('no consulta suscripciones, servicios ni compromisos pausados', () => {
    expect(debeConsultar(compromiso({ tipo: 'suscripcion' }), undefined, ahora)).toBe(false)
    expect(debeConsultar(compromiso({ activo: false }), undefined, ahora)).toBe(false)
  })

  it('no repite si nada cambió y el análisis es reciente', () => {
    const anterior = compromiso(analizado)
    expect(debeConsultar(compromiso({ ...analizado, nombre: 'Otro nombre', dia_pago: 20 }), anterior, ahora)).toBe(false)
  })

  it('repite si cambió la tasa, el saldo, la entidad o el tipo', () => {
    const anterior = compromiso(analizado)
    expect(debeConsultar(compromiso({ tasa_ea: 20 }), anterior, ahora)).toBe(true)
    expect(debeConsultar(compromiso({ saldo_pendiente: 40_000_000 }), anterior, ahora)).toBe(true)
    expect(debeConsultar(compromiso({ entidad: 'Banco Y' }), anterior, ahora)).toBe(true)
    expect(debeConsultar(compromiso({ tipo: 'tarjeta' }), anterior, ahora)).toBe(true)
  })

  it('repite si el análisis tiene más de 30 días', () => {
    const viejo = compromiso({ ...analizado, analizado_en: '2026-10-01T12:00:00Z' })
    expect(debeConsultar(compromiso(), viejo, ahora)).toBe(true)
  })
})
