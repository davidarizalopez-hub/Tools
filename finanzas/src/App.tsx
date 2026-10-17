import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { crearAlmacen, supabase } from './lib/db'
import { datosIniciales } from './lib/seed'
import type { Datos } from './lib/types'
import { hoy, mesDe } from './lib/format'
import { ProveedorDatos } from './state'
import { Login } from './views/Login'
import { Inicio } from './views/Inicio'
import { Movimientos } from './views/Movimientos'
import { Registrar } from './views/Registrar'
import { Compromisos } from './views/Compromisos'
import { Ajustes } from './views/Ajustes'
import { Icono, type NombreIcono } from './components/Icono'

type Pestana = 'inicio' | 'movimientos' | 'registrar' | 'compromisos' | 'ajustes'

const PESTANAS: { id: Pestana; etiqueta: string; icono: NombreIcono }[] = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'inicio' },
  { id: 'movimientos', etiqueta: 'Movimientos', icono: 'lista' },
  { id: 'registrar', etiqueta: 'Registrar', icono: 'mas' },
  { id: 'compromisos', etiqueta: 'Compromisos', icono: 'calendario' },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: 'ajustes' },
]

export default function App() {
  const [sesion, setSesion] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [aviso, setAviso] = useState<string | null>(null)
  const temporizador = useRef<number>(undefined)

  const mostrarAviso = useCallback((m: string) => {
    setAviso(m)
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setAviso(null), 3500)
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const necesitaLogin = supabase && !sesion
  return (
    <>
      {sesion === undefined ? (
        <Cargando texto="Conectando…" />
      ) : necesitaLogin ? (
        <Login />
      ) : (
        <Aplicacion key={sesion?.user.id ?? 'local'} email={sesion?.user.email ?? null} aviso={mostrarAviso} />
      )}
      {aviso && (
        <div className="aviso" role="status">
          {aviso}
        </div>
      )}
    </>
  )
}

function Cargando({ texto }: { texto: string }) {
  return <div className="cargando">{texto}</div>
}

function Aplicacion({ email, aviso }: { email: string | null; aviso: (m: string) => void }) {
  const almacen = useMemo(crearAlmacen, [])
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const d = await almacen.cargar()
        if (!d.medios_pago.length && !d.categorias.length) {
          // Primera vez: se crean los catálogos iniciales.
          const ini = datosIniciales()
          await almacen.insertar('medios_pago', ini.medios_pago)
          await almacen.insertar('categorias', ini.categorias)
          Object.assign(d, ini)
        }
        if (vigente) setDatos(d)
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      vigente = false
    }
  }, [almacen])

  if (error)
    return (
      <div className="cargando">
        <p>No se pudieron cargar tus datos.</p>
        <p className="muted">{error}</p>
        <button className="btn" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    )
  if (!datos) return <Cargando texto="Cargando tus movimientos…" />
  return (
    <ProveedorDatos almacen={almacen} inicial={datos} aviso={aviso}>
      <Pantallas email={email} />
    </ProveedorDatos>
  )
}

function Pantallas({ email }: { email: string | null }) {
  const [pestana, setPestana] = useState<Pestana>('inicio')
  const [mes, setMes] = useState(mesDe(hoy()))

  return (
    <div className="app">
      <main className="contenido">
        {pestana === 'inicio' && <Inicio mes={mes} setMes={setMes} irA={setPestana} />}
        {pestana === 'movimientos' && <Movimientos mes={mes} setMes={setMes} />}
        {pestana === 'registrar' && <Registrar onGuardado={() => undefined} />}
        {pestana === 'compromisos' && <Compromisos />}
        {pestana === 'ajustes' && <Ajustes email={email} />}
      </main>
      <nav className="barra-nav" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            className={`nav-item ${p.id === 'registrar' ? 'nav-registrar' : ''}`}
            aria-current={pestana === p.id ? 'page' : undefined}
            onClick={() => setPestana(p.id)}
          >
            <Icono nombre={p.icono} />
            <span>{p.etiqueta}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
