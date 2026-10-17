import type { Categoria, Datos, MedioPago, Naturaleza, TipoMedio } from './types'
import { nuevoId } from './format'

// Catálogos con los que arranca la app. Todo se puede editar en Ajustes > Catálogos.
const MEDIOS: [string, TipoMedio, boolean][] = [
  ['Bancolombia Ahorros', 'ahorros', true],
  ['Nequi', 'billetera', true],
  ['Daviplata', 'billetera', true],
  ['Davivienda', 'ahorros', true],
  ['TdC Falabella', 'tarjeta_credito', true],
  ['Efectivo', 'efectivo', true],
  ['PayPal', 'billetera', true],
  ['Caja Social', 'ahorros', false],
  ['Banco Popular', 'ahorros', false],
]

const EGRESOS: [string, Naturaleza][] = [
  ['Arriendo', 'fijo'],
  ['EPS', 'fijo'],
  ['Servicio: Administración', 'fijo'],
  ['Servicio: Agua', 'fijo'],
  ['Servicio: Luz', 'fijo'],
  ['Servicio: Gas', 'fijo'],
  ['Servicio: Internet', 'fijo'],
  ['Servicio: Celular', 'fijo'],
  ['Servicio: Plancha', 'fijo'],
  ['Pago crédito Bancolombia', 'fijo'],
  ['Pago crédito Davivienda', 'fijo'],
  ['Pago préstamo', 'fijo'],
  ['Plataforma', 'fijo'],
  ['Entrenamiento', 'fijo'],
  ['Estudios', 'fijo'],
  ['Community Manager', 'fijo'],
  ['Salario', 'fijo'],
  ['Mercado', 'variable'],
  ['Comida', 'variable'],
  ['Snacks', 'variable'],
  ['Salida nocturna', 'variable'],
  ['Gasolina', 'variable'],
  ['Transportes', 'variable'],
  ['Carro', 'variable'],
  ['Casa', 'variable'],
  ['Barbería', 'variable'],
  ['Ropa', 'variable'],
  ['Regalos', 'variable'],
  ['Salud - Copago', 'variable'],
  ['Suplementos', 'variable'],
  ['Equipos para Box/Gym', 'variable'],
  ['Viajes vacaciones', 'variable'],
  ['Viajes trabajo', 'variable'],
  ['Impuestos', 'variable'],
  ['Gravamen financiero (4x1000)', 'variable'],
  ['Préstamo', 'variable'],
  ['Otros', 'variable'],
  ['Ahorro', 'ahorro'],
]

const INGRESOS = [
  'Nómina',
  'Programación Box',
  'Personalizado',
  'Competencias CF',
  'Plataforma',
  'Venta',
  'Intereses cesantías',
  'Préstamo',
  'Otros',
]

export function datosIniciales(): Pick<Datos, 'medios_pago' | 'categorias'> {
  const medios_pago: MedioPago[] = MEDIOS.map(([nombre, tipo, activo]) => ({ id: nuevoId(), nombre, tipo, saldo_inicial: 0, activo }))
  const categorias: Categoria[] = [
    ...EGRESOS.map(([nombre, naturaleza]): Categoria => ({ id: nuevoId(), nombre, tipo: 'egreso', naturaleza, activo: true })),
    ...INGRESOS.map((nombre): Categoria => ({ id: nuevoId(), nombre, tipo: 'ingreso', naturaleza: null, activo: true })),
  ]
  return { medios_pago, categorias }
}
