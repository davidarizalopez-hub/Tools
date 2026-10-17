import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Almacen } from './lib/db'
import type { Datos, Fila, Tabla } from './lib/types'

interface Contexto {
  datos: Datos
  modo: Almacen['modo']
  agregar<T extends Tabla>(tabla: T, filas: Fila<T>[]): Promise<void>
  actualizar<T extends Tabla>(tabla: T, id: string, cambios: Partial<Fila<T>>): Promise<void>
  eliminar(tabla: Tabla, id: string): Promise<void>
  aviso(mensaje: string): void
}

const Ctx = createContext<Contexto | null>(null)

export function ProveedorDatos(props: { almacen: Almacen; inicial: Datos; aviso: (m: string) => void; children: ReactNode }) {
  const { almacen, aviso } = props
  const [datos, setDatos] = useState(props.inicial)

  const conAviso = useCallback(
    async (accion: () => Promise<void>) => {
      try {
        await accion()
      } catch (e) {
        aviso(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`)
        throw e
      }
    },
    [aviso],
  )

  const valor = useMemo<Contexto>(
    () => ({
      datos,
      modo: almacen.modo,
      aviso,
      agregar: (tabla, filas) =>
        conAviso(async () => {
          if (!filas.length) return
          await almacen.insertar(tabla, filas)
          setDatos((d) => ({ ...d, [tabla]: [...d[tabla], ...filas] }))
        }),
      actualizar: (tabla, id, cambios) =>
        conAviso(async () => {
          await almacen.actualizar(tabla, id, cambios)
          setDatos((d) => ({ ...d, [tabla]: (d[tabla] as { id: string }[]).map((f) => (f.id === id ? { ...f, ...cambios } : f)) }))
        }),
      eliminar: (tabla, id) =>
        conAviso(async () => {
          await almacen.eliminar(tabla, id)
          setDatos((d) => ({ ...d, [tabla]: (d[tabla] as { id: string }[]).filter((f) => f.id !== id) }))
        }),
    }),
    [datos, almacen, aviso, conAviso],
  )
  return <Ctx.Provider value={valor}>{props.children}</Ctx.Provider>
}

export function useDatos() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDatos fuera de ProveedorDatos')
  return c
}
