import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './db'
import type { Cliente, Datos, Movimiento, TipoMovimiento } from './types'
import { fechaLarga, hoy, normalizar, nuevoId, pesos } from './format'

/** Lo que devuelve la función leer-comprobante por cada movimiento encontrado. */
export interface MovimientoLeido {
  tipo: TipoMovimiento
  valor: number
  fecha: string | null
  medio_pago: string | null
  medio_destino: string | null
  categoria: string | null
  tercero: string | null
  descripcion: string
  referencia: string | null
  confianza: 'alta' | 'media' | 'baja'
}

export interface Lectura {
  es_comprobante: boolean
  observacion: string | null
  movimientos: MovimientoLeido[]
}

/** Movimiento propuesto a partir de un comprobante, pendiente de que el usuario lo confirme. */
export interface Borrador {
  clave: string
  tipo: TipoMovimiento
  valor: number
  fecha: string
  medio_pago_id: string | null
  medio_destino_id: string | null
  categoria_id: string | null
  tercero: string
  descripcion: string
  comentarios: string
  /** Advertencias de la lectura (confianza, datos que no se vieron). */
  avisos: string[]
}

const LADO_MAX = 2000
const MAX_BYTES = 8 * 1024 * 1024

function aBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Prepara el archivo para enviarlo: las imágenes se pasan a JPEG con el lado mayor
 * en máximo 2000 px (suficiente para leer un comprobante y mucho más liviano de subir).
 */
export async function prepararArchivo(archivo: File): Promise<{ archivo: string; tipo_mime: string }> {
  if (archivo.type === 'application/pdf') {
    if (archivo.size > MAX_BYTES) throw new Error('El PDF pesa más de 8 MB')
    return { archivo: aBase64(await archivo.arrayBuffer()), tipo_mime: 'application/pdf' }
  }
  try {
    const imagen = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(imagen.width * escala)
    lienzo.height = Math.round(imagen.height * escala)
    lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.85))
    if (!blob) throw new Error('No se pudo convertir la imagen')
    return { archivo: aBase64(await blob.arrayBuffer()), tipo_mime: 'image/jpeg' }
  } catch {
    // Si el navegador no puede redimensionarla, se envía tal cual.
    if (archivo.size > MAX_BYTES) throw new Error('La imagen pesa más de 8 MB')
    return { archivo: aBase64(await archivo.arrayBuffer()), tipo_mime: archivo.type }
  }
}

export async function leerComprobante(archivo: File, datos: Datos): Promise<Lectura> {
  if (!supabase) throw new Error('Leer comprobantes requiere la app conectada a Supabase')
  const activos = <T extends { activo: boolean; nombre: string }>(l: T[]) => l.filter((x) => x.activo).map((x) => x.nombre)
  const { data, error } = await supabase.functions.invoke<Lectura>('leer-comprobante', {
    body: {
      ...(await prepararArchivo(archivo)),
      hoy: hoy(),
      medios: activos(datos.medios_pago),
      egresos: activos(datos.categorias.filter((c) => c.tipo === 'egreso')),
      ingresos: activos(datos.categorias.filter((c) => c.tipo === 'ingreso')),
    },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const cuerpo = await error.context.json().catch(() => null)
      throw new Error(cuerpo?.error ?? 'La lectura falló')
    }
    throw new Error(`No se pudo conectar con la función leer-comprobante: ${error.message}`)
  }
  if (!data) throw new Error('Respuesta vacía')
  return data
}

/** Convierte la lectura en borradores, buscando cada nombre en los catálogos del usuario. */
export function aBorradores(lectura: Lectura, datos: Datos): Borrador[] {
  const buscar = <T extends { id: string; nombre: string }>(lista: T[], nombre: string | null) =>
    nombre ? (lista.find((x) => normalizar(x.nombre) === normalizar(nombre)) ?? null) : null

  return lectura.movimientos
    .filter((m) => m.valor > 0)
    .map((m) => {
      const avisos: string[] = []
      if (m.confianza !== 'alta') avisos.push(m.confianza === 'baja' ? 'Lectura dudosa: revisa todo' : 'Revisa los datos')
      if (!m.fecha) avisos.push('No se vio la fecha')
      const categoria = m.tipo === 'transferencia' ? null : buscar(datos.categorias.filter((c) => c.tipo === m.tipo), m.categoria)
      return {
        clave: nuevoId(),
        tipo: m.tipo,
        valor: Math.round(m.valor),
        fecha: m.fecha && m.fecha <= hoy() ? m.fecha : hoy(),
        medio_pago_id: buscar(datos.medios_pago, m.medio_pago)?.id ?? null,
        medio_destino_id: m.tipo === 'transferencia' ? (buscar(datos.medios_pago, m.medio_destino)?.id ?? null) : null,
        categoria_id: categoria?.id ?? null,
        tercero: m.tercero ?? '',
        descripcion: m.descripcion,
        comentarios: m.referencia ? `Ref. ${m.referencia}` : '',
        avisos,
      }
    })
}

/** Qué le falta al borrador para poder guardarse sin revisión. */
export function faltantes(b: Borrador): string[] {
  const f: string[] = []
  if (!b.medio_pago_id) f.push(b.tipo === 'transferencia' ? 'cuenta de origen' : 'medio de pago')
  if (b.tipo === 'transferencia' && !b.medio_destino_id) f.push('cuenta de destino')
  if (b.tipo !== 'transferencia' && !b.categoria_id) f.push(b.tipo === 'egreso' ? 'tipo de egreso' : 'tipo de ingreso')
  return f
}

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

/**
 * Busca si el movimiento ya está registrado (mismo tipo y valor, con un día de diferencia
 * como máximo) o si otro pantallazo del mismo lote es el mismo pago.
 */
export function buscarDuplicado(b: Borrador, movimientos: Movimiento[], otros: Borrador[]): string | null {
  const igual = (x: { tipo: string; valor: number; fecha: string }) => x.tipo === b.tipo && Math.round(x.valor) === b.valor && diasEntre(x.fecha, b.fecha) <= 1
  const mov = movimientos.find(igual)
  if (mov) return `Ya registraste ${pesos(mov.valor)} el ${fechaLarga(mov.fecha)}${mov.descripcion ? ` (${mov.descripcion})` : ''}`
  if (otros.some(igual)) return 'Otro pantallazo de este lote tiene el mismo pago'
  return null
}

/** Arma el movimiento final. Para ingresos busca o crea el cliente por su nombre. */
export function construirMovimiento(b: Borrador, clientes: Cliente[]): { movimiento: Movimiento; clienteNuevo: Cliente | null } {
  let clienteNuevo: Cliente | null = null
  let clienteId: string | null = null
  const nombre = b.tercero.trim()
  if (b.tipo === 'ingreso' && nombre) {
    const existente = clientes.find((c) => normalizar(c.nombre) === normalizar(nombre))
    if (existente) clienteId = existente.id
    else {
      clienteNuevo = { id: nuevoId(), nombre, telefono: null, notas: null, activo: true }
      clienteId = clienteNuevo.id
    }
  }
  return {
    clienteNuevo,
    movimiento: {
      id: nuevoId(),
      tipo: b.tipo,
      fecha: b.fecha,
      valor: b.valor,
      medio_pago_id: b.medio_pago_id,
      medio_destino_id: b.tipo === 'transferencia' ? b.medio_destino_id : null,
      categoria_id: b.tipo === 'transferencia' ? null : b.categoria_id,
      cliente_id: clienteId,
      compromiso_id: null,
      proveedor: b.tipo === 'ingreso' ? null : nombre || null,
      descripcion: b.descripcion.trim() || null,
      cuotas: 1,
      comentarios: b.comentarios.trim() || null,
      origen: 'pantallazo',
    },
  }
}
