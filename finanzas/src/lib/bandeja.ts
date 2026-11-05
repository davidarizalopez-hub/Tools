import { supabase } from './db'
import { aBorrador, buscarDuplicado, faltantes, type Borrador, type MovimientoLeido } from './comprobantes'
import type { Datos } from './types'
import { mesDe } from './format'

/** Lo que se guarda en `pendientes.datos`: el movimiento con nombres (no ids) y el texto de la fuente. */
export interface Propuesta extends MovimientoLeido {
  avisos?: string[]
  /** El texto del correo del que salió, para compararlo al revisar. */
  extracto?: string
}

export type EstadoPendiente = 'pendiente' | 'guardado' | 'descartado'

/** Un movimiento propuesto (por ahora, desde los correos) que espera el visto bueno del usuario. */
export interface Pendiente {
  id: string
  fuente: string
  fuente_id: string
  remitente: string | null
  recibido_en: string | null
  datos: Propuesta
  estado: EstadoPendiente
  movimiento_id: string | null
}

const COLUMNAS = 'id, fuente, fuente_id, remitente, recibido_en, datos, estado, movimiento_id'

/** Trae los movimientos por revisar. Sin Supabase (modo local) no hay bandeja. */
export async function cargarPendientes(): Promise<Pendiente[]> {
  if (!supabase) return []
  const filas: Pendiente[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('pendientes').select(COLUMNAS).eq('estado', 'pendiente').order('id').range(desde, desde + 999)
    if (error) throw error
    filas.push(...(data as Pendiente[]))
    if (data.length < 1000) break
  }
  return filas
}

/** Marca como guardados o descartados. Al guardar, enlaza cada uno con el movimiento creado. */
export async function cerrarPendientes(cierres: { id: string; movimiento_id?: string | null }[], estado: EstadoPendiente) {
  if (!supabase || !cierres.length) return
  const sb = supabase
  if (estado !== 'guardado') {
    const { error } = await sb.from('pendientes').update({ estado, movimiento_id: null }).in('id', cierres.map((c) => c.id))
    if (error) throw error
    return
  }
  // De a 10 en paralelo: cada uno lleva su propio movimiento_id.
  for (let i = 0; i < cierres.length; i += 10) {
    const resultados = await Promise.all(
      cierres.slice(i, i + 10).map((c) => sb.from('pendientes').update({ estado, movimiento_id: c.movimiento_id ?? null }).eq('id', c.id)),
    )
    const fallo = resultados.find((r) => r.error)
    if (fallo?.error) throw fallo.error
  }
}

/** Un pendiente listo para mostrarse: su borrador, el mes y los avisos de duplicado. */
export interface Revision {
  pendiente: Pendiente
  borrador: Borrador
  mes: string
  /** Ya hay un movimiento registrado igual (mismo tipo y valor, ±1 día). */
  registrado: string | null
  /** Duplicado contra lo registrado o contra otro pendiente anterior. */
  duplicado: string | null
  /** Se puede guardar sin revisar: completo, sin avisos ni duplicados. */
  listo: boolean
}

/**
 * Arma la revisión de cada pendiente, ordenados por fecha. Un pendiente se compara con lo ya
 * registrado y con los pendientes anteriores que siguen abiertos.
 */
export function prepararRevision(pendientes: Pendiente[], datos: Datos): Revision[] {
  const borradores = pendientes
    .map((p) => ({ pendiente: p, borrador: aBorrador(p.datos, datos, { clave: p.id, origen: 'correo' }) }))
    .sort((a, b) => a.borrador.fecha.localeCompare(b.borrador.fecha) || a.borrador.valor - b.borrador.valor)

  const abiertos: Borrador[] = []
  return borradores.map(({ pendiente, borrador }) => {
    const abierto = pendiente.estado === 'pendiente'
    const registrado = abierto ? buscarDuplicado(borrador, datos.movimientos, []) : null
    const duplicado = abierto ? (registrado ?? buscarDuplicado(borrador, [], abiertos)) : null
    if (abierto) abiertos.push(borrador)
    return {
      pendiente,
      borrador,
      mes: mesDe(borrador.fecha),
      registrado,
      duplicado: duplicado && !registrado ? 'Otro correo tiene el mismo pago' : duplicado,
      listo: abierto && !duplicado && !borrador.avisos.length && !faltantes(borrador).length,
    }
  })
}
