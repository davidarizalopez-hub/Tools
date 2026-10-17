import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/db'

export function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setOcupado(true)
    setMensaje(null)
    const { data, error } =
      modo === 'entrar' ? await supabase.auth.signInWithPassword({ email, password: clave }) : await supabase.auth.signUp({ email, password: clave })
    setOcupado(false)
    if (error) setMensaje(traducir(error.message))
    else if (modo === 'crear' && !data.session) setMensaje('Cuenta creada. Revisa tu correo para confirmarla y luego entra.')
  }

  return (
    <div className="login">
      <img src="/icon.svg" alt="" width={72} height={72} />
      <h1>Mis Finanzas</h1>
      <p className="muted">Tus ingresos, gastos y compromisos en un solo lugar.</p>
      <form onSubmit={enviar} className="tarjeta formulario">
        <label className="campo">
          <span>Correo</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </label>
        {mensaje && <p className="mensaje">{mensaje}</p>}
        <button className="btn btn-primario" disabled={ocupado}>
          {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button type="button" className="btn-texto" onClick={() => setModo(modo === 'entrar' ? 'crear' : 'entrar')}>
          {modo === 'entrar' ? '¿Primera vez? Crea tu cuenta' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  )
}

function traducir(m: string) {
  if (/invalid login/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja).'
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Usa "Ya tengo cuenta".'
  if (/signups not allowed/i.test(m)) return 'El registro de cuentas nuevas está desactivado.'
  return m
}
