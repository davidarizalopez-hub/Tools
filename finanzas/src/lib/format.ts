const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const miles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export const pesos = (n: number) => cop.format(Math.round(n))

/** $1,2 M · $350 mil · $9.500 */
export function pesosCorto(n: number): string {
  const a = Math.abs(n)
  const signo = n < 0 ? '-' : ''
  if (a >= 1_000_000) return `${signo}$${(a / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (a >= 10_000) return `${signo}$${Math.round(a / 1000)} mil`
  return `${signo}$${miles.format(a)}`
}

export const conMiles = (n: number) => miles.format(n)

/** Convierte lo que escribe el usuario ("12.500", "$ 12500") en número. */
export function leerValor(texto: string): number {
  const limpio = texto.replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number.parseFloat(limpio)
  return Number.isFinite(n) ? n : 0
}

export const porcentaje = (n: number) => `${Math.round(n * 100)}%`

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2025-02" -> "Febrero 2025" */
export function nombreMes(mes: string, conAnio = true): string {
  const [a, m] = mes.split('-').map(Number)
  const nombre = MESES[m - 1]
  const cap = nombre[0].toUpperCase() + nombre.slice(1)
  return conAnio ? `${cap} ${a}` : cap
}

export const nombreMesCorto = (mes: string) => nombreMes(mes, false).slice(0, 3)

export function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const mesDe = (fecha: string) => fecha.slice(0, 7)

export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** "2025-02-09" -> "dom 9 feb" */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Normaliza nombres para compararlos: sin tildes, minúsculas, espacios simples. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export const nuevoId = () => crypto.randomUUID()
