import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './db'
import type { Compromiso, TipoCompromiso } from './types'
import { hoy } from './format'

/** Una opción del mercado que baja la tasa de un crédito. */
export interface OpcionCredito {
  entidad: string
  producto: string
  tasa_ea: number | null
  ahorro_mensual: number | null
  requisitos: string
  enlace: string | null
}

/** Lo que devuelve la función consultar-credito y se guarda en `compromisos.analisis`. */
export interface AnalisisCredito {
  mes: string
  usura_ea: number | null
  ibc_ea: number | null
  tasa_actual_ea: number | null
  hay_mejor_opcion: boolean
  opciones: OpcionCredito[]
  resumen: string
  siguiente_paso: string
  fuentes: { titulo: string; url: string }[]
  modelo?: string
}

/** Compromisos que tienen tasa de interés y se pueden comparar con el mercado. */
export const TIPOS_CON_TASA: TipoCompromiso[] = ['credito', 'prestamo', 'tarjeta']
export const tieneTasa = (tipo: TipoCompromiso) => TIPOS_CON_TASA.includes(tipo)

/** Un análisis se repite pasados estos días aunque nada haya cambiado: las tasas se mueven cada mes. */
export const DIAS_VIGENCIA = 30

/** Tasa mes vencido (%) a efectiva anual (%). */
export const mvAEa = (mv: number) => (Math.pow(1 + mv / 100, 12) - 1) * 100
/** Tasa efectiva anual (%) a mes vencido (%). */
export const eaAMv = (ea: number) => (Math.pow(1 + ea / 100, 1 / 12) - 1) * 100
/** Interés aproximado de un mes sobre el saldo. */
export const interesMensual = (saldo: number, tasaEa: number) => Math.round((saldo * eaAMv(tasaEa)) / 100)

const diasDesde = (fechaIso: string, ahora = Date.now()) => (ahora - Date.parse(fechaIso)) / 86_400_000

/**
 * ¿Hay que consultar el mercado al guardar? Sí cuando el crédito es nuevo, nunca se ha analizado,
 * cambió algo que afecta la comparación (tipo, entidad, tasa o saldo) o el análisis ya es viejo.
 */
export function debeConsultar(nuevo: Compromiso, anterior?: Compromiso, ahora = Date.now()): boolean {
  if (!tieneTasa(nuevo.tipo) || !nuevo.activo) return false
  if (!anterior || !anterior.analisis || !anterior.analizado_en) return true
  const cambio = (['tipo', 'entidad', 'tasa_ea', 'saldo_pendiente'] as const).some((k) => (nuevo[k] ?? null) !== (anterior[k] ?? null))
  return cambio || diasDesde(anterior.analizado_en, ahora) > DIAS_VIGENCIA
}

/** Pide a la función consultar-credito que compare el crédito con el mercado de este mes. */
export async function consultarCredito(c: Compromiso): Promise<AnalisisCredito> {
  if (!supabase) throw new Error('Consultar el mercado requiere la app conectada a Supabase')
  const { data, error } = await supabase.functions.invoke<AnalisisCredito>('consultar-credito', {
    body: {
      hoy: hoy(),
      tipo: c.tipo,
      nombre: c.nombre,
      entidad: c.entidad ?? null,
      tasa_ea: c.tasa_ea ?? null,
      saldo: c.saldo_pendiente,
      cuota: c.monto_cuota,
      cuotas_restantes: c.cuotas_total ? Math.max(0, c.cuotas_total - c.cuotas_pagadas) : null,
    },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const cuerpo = await error.context.json().catch(() => null)
      throw new Error(cuerpo?.error ?? 'La consulta falló')
    }
    throw new Error(`No se pudo conectar con la función consultar-credito: ${error.message}`)
  }
  if (!data || typeof data.hay_mejor_opcion !== 'boolean' || !Array.isArray(data.opciones)) throw new Error('Respuesta inesperada de la consulta')
  return data
}
