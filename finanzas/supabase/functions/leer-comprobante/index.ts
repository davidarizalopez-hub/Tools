// Edge Function de Supabase: lee un pantallazo o PDF de un comprobante de pago
// con Claude y devuelve los movimientos que encuentra, listos para revisar en la app.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY      obligatorio, se crea en console.anthropic.com
//   MODELO_COMPROBANTES    opcional, por defecto claude-opus-5-5
//
// La clave de Anthropic vive solo aquí, nunca en la app.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODELO = Deno.env.get('MODELO_COMPROBANTES') ?? 'claude-opus-5-5'
const MAX_BYTES = 8 * 1024 * 1024
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Solicitud {
  archivo: string
  tipo_mime: string
  hoy: string
  medios: string[]
  egresos: string[]
  ingresos: string[]
}

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const nulable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const unoDe = (lista: string[]) => (lista.length ? nulable({ type: 'string', enum: lista }) : { type: 'null' })

/** Esquema de la respuesta. Los nombres de cuentas y categorías salen de los catálogos del usuario. */
function esquema(s: Solicitud) {
  const categorias = [...new Set([...s.egresos, ...s.ingresos])]
  return {
    type: 'object',
    additionalProperties: false,
    required: ['es_comprobante', 'movimientos', 'observacion'],
    properties: {
      es_comprobante: { type: 'boolean' },
      observacion: nulable({ type: 'string' }),
      movimientos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tipo', 'valor', 'fecha', 'medio_pago', 'medio_destino', 'categoria', 'tercero', 'descripcion', 'referencia', 'confianza'],
          properties: {
            tipo: { type: 'string', enum: ['egreso', 'ingreso', 'transferencia'] },
            valor: { type: 'number' },
            fecha: nulable({ type: 'string', format: 'date' }),
            medio_pago: unoDe(s.medios),
            medio_destino: unoDe(s.medios),
            categoria: unoDe(categorias),
            tercero: nulable({ type: 'string' }),
            descripcion: { type: 'string' },
            referencia: nulable({ type: 'string' }),
            confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
          },
        },
      },
    },
  }
}

function instrucciones(s: Solicitud) {
  return `Lees comprobantes de pago de una persona en Colombia (pantallazos de Nequi, Daviplata, Bancolombia, Davivienda, Banco Falabella, Bre-B, PSE, pagos con QR, datáfonos, facturas o correos de confirmación) y extraes cada movimiento de dinero. Todo está en pesos colombianos (COP).

Hoy es ${s.hoy}.

Cómo llenar cada campo:
- tipo: "egreso" si el dueño de la cuenta pagó o envió plata a otra persona o comercio; "ingreso" si la recibió; "transferencia" si movió plata entre sus propias cuentas (por ejemplo de Bancolombia a su Nequi, o el pago de su tarjeta de crédito).
- valor: el monto total como número, sin puntos de miles ni símbolo. En Colombia "$ 45.000,00" son 45000 y "$1.250.500" son 1250500.
- fecha: AAAA-MM-DD. Si el comprobante no muestra el año, usa el año de hoy, salvo que esa fecha quede en el futuro: entonces usa el año anterior. Si no se ve la fecha, null.
- medio_pago: la cuenta del dueño de donde salió la plata (egreso o transferencia) o a donde llegó (ingreso). Elige solo de esta lista: ${JSON.stringify(s.medios)}. Una "cuenta de ahorros Bancolombia" o "Ahorros *1234" de Bancolombia corresponde a la de Bancolombia de la lista; un pantallazo de la app Nequi corresponde a Nequi. Si no puedes saberlo, null.
- medio_destino: solo para transferencia, la cuenta propia que recibió. Misma lista. Si no aplica, null.
- categoria: para egresos elige de ${JSON.stringify(s.egresos)}; para ingresos de ${JSON.stringify(s.ingresos)}. Elige según el comercio o el concepto (Rappi o restaurantes → Comida; Éxito, D1, Olímpica → Mercado; estaciones de servicio → Gasolina; Claro, WOM, Movistar → Servicio: Celular). Si no es claro, null; no adivines. Para transferencias, null.
- tercero: el comercio o la persona del otro lado (a quién se le pagó o quién pagó), tal como aparece. Si no aparece, null.
- descripcion: frase corta en español con lo que fue el movimiento, por ejemplo "Pago en Rappi" o "Envío a Juan Pérez".
- referencia: número de comprobante, aprobación o referencia si aparece; si no, null.
- confianza: "alta" si leíste valor, fecha y cuenta sin dudas; "media" si inferiste algo; "baja" si la imagen es borrosa o ambigua.

Si la imagen muestra una lista con varios movimientos, devuelve cada uno. Si no es un comprobante ni un movimiento de dinero, es_comprobante = false y movimientos vacío. Nunca inventes datos que no se vean. En observacion anota en una frase cualquier duda importante, o null.`
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
  if (!s.archivo || !s.tipo_mime) return responder({ error: 'Falta el archivo' }, 400)
  if (s.archivo.length * 0.75 > MAX_BYTES) return responder({ error: 'El archivo pesa más de 8 MB' }, 413)

  const esPdf = s.tipo_mime === 'application/pdf'
  const tipoImagen = TIPOS_IMAGEN.find((t) => t === s.tipo_mime)
  if (!esPdf && !tipoImagen) return responder({ error: `Formato no soportado: ${s.tipo_mime}` }, 415)

  const contenido: Anthropic.Beta.BetaContentBlockParam[] = [
    esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: s.archivo } }
      : { type: 'image', source: { type: 'base64', media_type: tipoImagen!, data: s.archivo } },
    { type: 'text', text: 'Extrae los movimientos de este comprobante.' },
  ]

  const client = new Anthropic({ apiKey })
  try {
    const respuesta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: instrucciones(s),
      messages: [{ role: 'user', content: contenido }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema(s) } },
      // Si un clasificador de seguridad rechaza la solicitud, la API la reintenta con
      // otro modelo. Los modelos Haiku no tienen esta opción.
      ...(MODELO.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    })

    if (respuesta.stop_reason === 'refusal') {
      return responder({ error: 'El modelo no pudo procesar esta imagen. Regístrala a mano.' }, 422)
    }
    if (respuesta.stop_reason === 'max_tokens') {
      return responder({ error: 'La respuesta quedó incompleta. Intenta con un pantallazo de un solo movimiento.' }, 422)
    }
    const texto = respuesta.content.find((b) => b.type === 'text')
    if (!texto || texto.type !== 'text') return responder({ error: 'Respuesta vacía del modelo' }, 502)
    return responder({ ...JSON.parse(texto.text), modelo: respuesta.model })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return responder({ error: 'La API key de Anthropic no es válida' }, 500)
    if (e instanceof Anthropic.RateLimitError) return responder({ error: 'Demasiadas solicitudes seguidas. Espera un momento.' }, 429)
    if (e instanceof Anthropic.BadRequestError) return responder({ error: `Solicitud rechazada: ${e.message}` }, 400)
    if (e instanceof Anthropic.APIError) return responder({ error: `Error de Anthropic (${e.status}): ${e.message}` }, 502)
    return responder({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
