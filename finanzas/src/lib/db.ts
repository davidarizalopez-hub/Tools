import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { datosVacios, TABLAS, type Datos, type Fila, type Tabla } from './types'

/** Dónde se guardan los datos: Supabase (nube) o el navegador (modo local). */
export interface Almacen {
  readonly modo: 'nube' | 'local'
  cargar(): Promise<Datos>
  insertar<T extends Tabla>(tabla: T, filas: Fila<T>[]): Promise<void>
  actualizar<T extends Tabla>(tabla: T, id: string, cambios: Partial<Fila<T>>): Promise<void>
  eliminar(tabla: Tabla, id: string): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined

export const supabase: SupabaseClient | null = url && clave ? createClient(url, clave) : null

const LOTE = 500

class AlmacenNube implements Almacen {
  readonly modo = 'nube'
  constructor(private sb: SupabaseClient) {}

  async cargar(): Promise<Datos> {
    const datos = datosVacios()
    await Promise.all(
      TABLAS.map(async (tabla) => {
        const filas: unknown[] = []
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await this.sb.from(tabla).select('*').order('created_at').range(desde, desde + 999)
          if (error) throw error
          filas.push(...data)
          if (data.length < 1000) break
        }
        ;(datos[tabla] as unknown[]) = filas.map(numerico)
      }),
    )
    return datos
  }

  async insertar<T extends Tabla>(tabla: T, filas: Fila<T>[]) {
    for (let i = 0; i < filas.length; i += LOTE) {
      const { error } = await this.sb.from(tabla).insert(filas.slice(i, i + LOTE))
      if (error) throw error
    }
  }

  async actualizar<T extends Tabla>(tabla: T, id: string, cambios: Partial<Fila<T>>) {
    const { error } = await this.sb.from(tabla).update(cambios as never).eq('id', id)
    if (error) throw error
  }

  async eliminar(tabla: Tabla, id: string) {
    const { error } = await this.sb.from(tabla).delete().eq('id', id)
    if (error) throw error
  }
}

/** Postgres devuelve los numeric como texto; los pasamos a número. */
function numerico(fila: any) {
  const f = { ...fila }
  delete f.user_id
  delete f.created_at
  for (const k of ['valor', 'saldo_inicial', 'monto_cuota', 'saldo_pendiente']) {
    if (typeof f[k] === 'string') f[k] = Number(f[k])
  }
  return f
}

const CLAVE_LOCAL = 'finanzas:v1'

class AlmacenLocal implements Almacen {
  readonly modo = 'local'
  private datos: Datos = datosVacios()

  async cargar() {
    try {
      const guardado = localStorage.getItem(CLAVE_LOCAL)
      if (guardado) this.datos = { ...datosVacios(), ...JSON.parse(guardado) }
    } catch {
      this.datos = datosVacios()
    }
    return structuredClone(this.datos)
  }

  private guardar() {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(this.datos))
  }

  async insertar<T extends Tabla>(tabla: T, filas: Fila<T>[]) {
    ;(this.datos[tabla] as Fila<T>[]).push(...structuredClone(filas))
    this.guardar()
  }

  async actualizar<T extends Tabla>(tabla: T, id: string, cambios: Partial<Fila<T>>) {
    const lista = this.datos[tabla] as Fila<T>[]
    const i = lista.findIndex((f) => f.id === id)
    if (i >= 0) lista[i] = { ...lista[i], ...cambios }
    this.guardar()
  }

  async eliminar(tabla: Tabla, id: string) {
    ;(this.datos[tabla] as { id: string }[]) = this.datos[tabla].filter((f) => f.id !== id)
    this.guardar()
  }
}

export const crearAlmacen = (): Almacen => (supabase ? new AlmacenNube(supabase) : new AlmacenLocal())
