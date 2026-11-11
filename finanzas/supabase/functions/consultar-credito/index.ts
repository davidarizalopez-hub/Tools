// Edge Function de Supabase: compara un crédito o una tarjeta de crédito del usuario con el
// mercado colombiano de este mes (tasa de usura, interés bancario corriente, compra de cartera
// por banco) usando Claude con búsqueda web, y dice si hay una opción que mejore el flujo de caja.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY   obligatorio (el mismo de leer-comprobante)
//   MODELO_CREDITOS     opcional, por defecto claude-opus-5-5

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODELO = Deno.env.get('MODELO_CREDITOS') ?? 'claude-opus-5-5'
/** Vueltas máximas: reanudaciones de la búsqueda (pause_turn) más un recordatorio de entregar. */
const MAX_VUELTAS = 5

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Solicitud {
  hoy: string
  tipo: 'credito' | 'prestamo' | 'tarjeta'
  nombre: string
  entidad: string | null
  /** Tasa efectiva anual en porcentaje (por ejemplo 24.5), si el usuario la conoce. */
  tasa_ea: number | null
  saldo: number | null
  cuota: number
  cuotas_restantes: number | null
}

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const nulable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

/** Lo que entrega el análisis. La herramienta es "strict": su entrada siempre cumple este esquema. */
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mes', 'usura_ea', 'ibc_ea', 'tasa_actual_ea', 'hay_mejor_opcion', 'opciones', 'resumen', 'siguiente_paso', 'fuentes'],
  properties: {
    mes: { type: 'string', description: 'Mes de las tasas consultadas, por ejemplo "noviembre de 2026".' },
    usura_ea: nulable({ type: 'number', description: 'Tasa de usura de consumo y ordinario del mes, % E.A.' }),
    ibc_ea: nulable({ type: 'number', description: 'Interés bancario corriente de consumo y ordinario del mes, % E.A.' }),
    tasa_actual_ea: nulable({ type: 'number', description: 'La tasa actual del usuario en % E.A., solo si la dio.' }),
    hay_mejor_opcion: { type: 'boolean' },
    opciones: {
      type: 'array',
      description: 'Opciones concretas que bajan la tasa, de mayor a menor ahorro. Vacío si no hay.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entidad', 'producto', 'tasa_ea', 'ahorro_mensual', 'requisitos', 'enlace'],
        properties: {
          entidad: { type: 'string' },
          producto: { type: 'string', description: 'Por ejemplo "Compra de cartera de tarjeta de crédito".' },
          tasa_ea: nulable({ type: 'number' }),
          ahorro_mensual: nulable({ type: 'number', description: 'Ahorro estimado en pesos al mes; null si falta el saldo o la tasa.' }),
          requisitos: { type: 'string' },
          enlace: nulable({ type: 'string' }),
        },
      },
    },
    resumen: { type: 'string', description: 'Dos o tres frases en español sencillo para el usuario.' },
    siguiente_paso: { type: 'string', description: 'Una acción concreta: a quién llamar, qué pedir o qué dato conseguir.' },
    fuentes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'url'],
        properties: { titulo: { type: 'string' }, url: { type: 'string' } },
      },
    },
  },
}

const TIPO = { credito: 'crédito de consumo / libre inversión', prestamo: 'préstamo', tarjeta: 'tarjeta de crédito' } as const

function instrucciones(s: Solicitud) {
  return `Eres un asesor financiero para una persona en Colombia (todo en pesos colombianos). Hoy es ${s.hoy}.
Tu trabajo: averiguar si existe hoy en el mercado colombiano una opción que le baje la tasa a uno de sus créditos y así mejore su flujo de caja.

Usa la búsqueda web para conseguir, del mes en curso:
1. La tasa de usura y el interés bancario corriente de consumo y ordinario, certificados por la Superintendencia Financiera.
2. Las tasas de compra de cartera para este tipo de producto, por banco (la Superfinanciera las publica; también las páginas oficiales de los bancos y la prensa económica). Incluye la entidad actual del usuario si tiene oferta de reducción de tasa.
Prefiere fuentes oficiales y recientes. No inventes tasas: si no encuentras un dato, déjalo en null.

Cómo decidir:
- hay_mejor_opcion = true solo si conoces la tasa actual del usuario y encontraste una opción concreta al menos 2 puntos E.A. más baja.
- "Rediferir", alargar el plazo o subir el cupo NO son mejoras: bajan la cuota pero aumentan el interés total. No los propongas como opción.
- Si el usuario no dio su tasa, hay_mejor_opcion = false. En el resumen di desde qué tasa le convendría cambiarse según lo que encontraste, y en siguiente_paso pídele que busque su tasa en el extracto o en la app del banco.
- ahorro_mensual ≈ saldo × ((1 + tasa_actual)^(1/12) − (1 + tasa_nueva)^(1/12)), con las tasas en decimal. Si falta el saldo o la tasa, null.
- Las tasas siempre en porcentaje efectivo anual (24.5 significa 24,5 % E.A.). Si encuentras una tasa mes vencido, conviértela: E.A. = (1 + M.V.)^12 − 1.

Cuando termines de buscar, entrega el resultado llamando una sola vez a la herramienta entregar_analisis. Escribe el resumen y el siguiente paso en español sencillo, sin tecnicismos.`
}

function descripcion(s: Solicitud) {
  const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`
  return [
    `Producto: ${TIPO[s.tipo]} ("${s.nombre}")`,
    `Entidad: ${s.entidad ?? 'no indicada'}`,
    `Tasa actual: ${s.tasa_ea != null ? `${s.tasa_ea} % E.A.` : 'el usuario no la sabe'}`,
    `Saldo pendiente: ${s.saldo != null ? pesos(s.saldo) : 'no indicado'}`,
    `Cuota mensual: ${pesos(s.cuota)}`,
    `Cuotas que faltan: ${s.cuotas_restantes ?? 'no indicado'}`,
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  // Solo usuarios con sesión iniciada en la app: así nadie más gasta tus créditos de Anthropic.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return responder({ error: 'Falta la sesión' }, 401)
  const claveSupabase = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, claveSupabase)
  const { data: usuario, error: errorSesion } = await supabase.auth.getUser(token)
  if (errorSesion || !usuario.user) return responder({ error: 'Sesión inválida' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return responder({ error: 'Falta configurar el secreto ANTHROPIC_API_KEY en Supabase' }, 500)

  let s: Solicitud
  try {
    s = await req.json()
  } catch {
    return responder({ error: 'Solicitud inválida' }, 400)
  }
  if (!s.tipo || !(s.tipo in TIPO) || !s.nombre || !s.hoy) return responder({ error: 'Faltan datos del crédito' }, 400)

  const herramientas: Anthropic.Beta.BetaToolUnion[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'CO', timezone: 'America/Bogota' } },
    {
      name: 'entregar_analisis',
      description: 'Entrega el análisis final del crédito al usuario. Llámala una sola vez, al terminar de buscar.',
      strict: true,
      input_schema: ESQUEMA as Anthropic.Beta.BetaTool.InputSchema,
    },
  ]
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Analiza este crédito:\n${descripcion(s)}` }]

  // El cliente corta antes que la función (150 s en el plan gratuito de Supabase).
  const client = new Anthropic({ apiKey, timeout: 140_000, maxRetries: 1 })
  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        system: instrucciones(s),
        messages: mensajes,
        tools: herramientas,
        output_config: { effort: 'low' },
        // Si un clasificador de seguridad rechaza la solicitud, la API la reintenta con otro modelo.
        ...(MODELO.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
      })

      if (respuesta.stop_reason === 'refusal') return responder({ error: 'No se pudo hacer el análisis de este crédito.' }, 422)
      const entrega = respuesta.content.find((b) => b.type === 'tool_use' && b.name === 'entregar_analisis')
      if (entrega && entrega.type === 'tool_use') return responder({ ...(entrega.input as object), modelo: respuesta.model })

      // La búsqueda se pausó (pause_turn): se reenvía tal cual y el servidor la retoma.
      // Si terminó sin entregar, se le recuerda que entregue.
      const ultimo = mensajes.at(-1)!
      if (ultimo.role === 'assistant' && Array.isArray(ultimo.content)) ultimo.content.push(...respuesta.content)
      else mensajes.push({ role: 'assistant', content: respuesta.content })
      if (respuesta.stop_reason !== 'pause_turn') mensajes.push({ role: 'user', content: 'Entrega ahora el resultado llamando a entregar_analisis.' })
    }
    return responder({ error: 'El análisis tardó demasiado. Intenta de nuevo en un rato.' }, 504)
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return responder({ error: 'La API key de Anthropic no es válida' }, 500)
    if (e instanceof Anthropic.RateLimitError) return responder({ error: 'Demasiadas solicitudes seguidas. Espera un momento.' }, 429)
    if (e instanceof Anthropic.BadRequestError) return responder({ error: `Solicitud rechazada: ${e.message}` }, 400)
    if (e instanceof Anthropic.APIConnectionTimeoutError) return responder({ error: 'La consulta tardó demasiado. Intenta de nuevo.' }, 504)
    if (e instanceof Anthropic.APIError) return responder({ error: `Error de Anthropic (${e.status}): ${e.message}` }, 502)
    return responder({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
