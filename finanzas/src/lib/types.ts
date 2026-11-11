export type TipoMovimiento = 'egreso' | 'ingreso' | 'transferencia'
export type TipoCategoria = 'egreso' | 'ingreso'
export type Naturaleza = 'fijo' | 'variable' | 'ahorro'
export type TipoMedio = 'ahorros' | 'corriente' | 'billetera' | 'tarjeta_credito' | 'efectivo' | 'otro'
export type TipoCompromiso = 'tarjeta' | 'credito' | 'prestamo' | 'suscripcion' | 'servicio' | 'otro'
export type Origen = 'manual' | 'excel' | 'pantallazo' | 'correo'

export interface MedioPago {
  id: string
  nombre: string
  tipo: TipoMedio
  saldo_inicial: number
  activo: boolean
  /** Marcada en el banco como exenta del 4x1000 (solo una). */
  exenta_gmf?: boolean
}

export interface Categoria {
  id: string
  nombre: string
  tipo: TipoCategoria
  naturaleza: Naturaleza | null
  activo: boolean
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  notas: string | null
  activo: boolean
}

export interface Compromiso {
  id: string
  nombre: string
  tipo: TipoCompromiso
  medio_pago_id: string | null
  categoria_id: string | null
  monto_cuota: number
  dia_pago: number | null
  cuotas_total: number | null
  cuotas_pagadas: number
  saldo_pendiente: number | null
  activo: boolean
  notas: string | null
  /** Banco o entidad del crédito o la tarjeta (para compararlo con el mercado). */
  entidad?: string | null
  /** Tasa de interés en % efectivo anual, si el usuario la conoce. */
  tasa_ea?: number | null
  /** Último análisis de mercado (lib/creditos) y cuándo se hizo. */
  analisis?: import('./creditos').AnalisisCredito | null
  analizado_en?: string | null
}

export interface Movimiento {
  id: string
  tipo: TipoMovimiento
  /** YYYY-MM-DD */
  fecha: string
  valor: number
  medio_pago_id: string | null
  medio_destino_id: string | null
  categoria_id: string | null
  cliente_id: string | null
  compromiso_id: string | null
  proveedor: string | null
  descripcion: string | null
  cuotas: number
  comentarios: string | null
  origen: Origen
}

export interface Datos {
  medios_pago: MedioPago[]
  categorias: Categoria[]
  clientes: Cliente[]
  compromisos: Compromiso[]
  movimientos: Movimiento[]
}

export type Tabla = keyof Datos
export type Fila<T extends Tabla> = Datos[T][number]

export const TABLAS: Tabla[] = ['medios_pago', 'categorias', 'clientes', 'compromisos', 'movimientos']

export const datosVacios = (): Datos => ({
  medios_pago: [],
  categorias: [],
  clientes: [],
  compromisos: [],
  movimientos: [],
})

export const ETIQUETA_TIPO_MEDIO: Record<TipoMedio, string> = {
  ahorros: 'Cuenta de ahorros',
  corriente: 'Cuenta corriente',
  billetera: 'Billetera digital',
  tarjeta_credito: 'Tarjeta de crédito',
  efectivo: 'Efectivo',
  otro: 'Otro',
}

export const ETIQUETA_NATURALEZA: Record<Naturaleza, string> = {
  fijo: 'Fijo',
  variable: 'Variable',
  ahorro: 'Ahorro',
}

export const ETIQUETA_TIPO_COMPROMISO: Record<TipoCompromiso, string> = {
  tarjeta: 'Cuotas de tarjeta',
  credito: 'Crédito',
  prestamo: 'Préstamo',
  suscripcion: 'Suscripción',
  servicio: 'Servicio',
  otro: 'Otro',
}
