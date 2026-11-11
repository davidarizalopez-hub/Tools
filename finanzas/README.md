# Mis Finanzas

App para el celular (Android o iPhone) que registra ingresos, gastos, transferencias y compromisos
financieros en pesos colombianos. Reemplaza el Excel "Debitos" y los pantallazos de WhatsApp.

Es una **PWA**: una página web que se instala en la pantalla de inicio y funciona como app, sin pasar
por Play Store ni App Store.

## Qué hace (fase 1)

- **Registrar** un gasto, ingreso o transferencia en pocos toques. Los tipos de egreso y medios de
  pago que más usas aparecen primero.
- **Inicio**: cuánto te quedó en el mes, ingresos, gastos y tasa de ahorro; en qué se fue tu dinero
  por tipo de egreso; fijos, variables y ahorro; comparativo de 6 meses; saldo de cada cuenta.
- **Lo que te dicen tus números**: qué categorías se llevan tus ingresos, cuáles subieron frente a
  tu promedio, gastos hormiga, ingresos que fueron préstamos, regla 50/30/20, 4x1000.
- **Proyección del mes siguiente**: gastos fijos (según tus compromisos o lo que se repite), gastos
  variables (promedio de los últimos 3 meses) e ingreso esperado.
- **Compromisos**: créditos, cuotas de tarjeta, suscripciones y servicios, con su progreso y un botón
  de "Registrar pago". Una compra con tarjeta a varias cuotas puede crear el compromiso sola.
- **Catálogos**: crear, editar y archivar tipos de egreso (fijo, variable o ahorro), tipos de
  ingreso, clientes y medios de pago.
- **Importar el Excel** de débitos: lee las hojas por mes y la hoja "Base de datos". Si lo importas
  dos veces no duplica nada.
- **Respaldo**: descargar todo en .json, exportar los movimientos a .csv para Excel y restaurar.

> Pagar la tarjeta de crédito se registra como **transferencia** (de tu cuenta a la tarjeta), no como
> gasto: las compras ya se contaron como gasto el día que las hiciste. Así no se cuentan dos veces.

## Puesta en marcha, paso a paso

Solo necesitas dos cuentas gratuitas: **Supabase** (base de datos en la nube) y **Vercel** (publica
la app). No hay que instalar ningún MCP para esta fase.

### Paso 1. Base de datos en Supabase

1. Entra a <https://supabase.com>, crea una cuenta (puedes usar GitHub) y luego **New project**.
   - Nombre: `finanzas`. Región: la más cercana (por ejemplo *East US* o *São Paulo*).
   - Guarda la contraseña de la base de datos en un lugar seguro.
2. Cuando el proyecto esté listo, abre **SQL Editor > New query**, pega todo el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) y presiona **Run**. Crea las tablas y la seguridad para
   que cada usuario vea solo sus datos.
3. En **Authentication > Sign In / Providers > Email**, desactiva **Confirm email** para no tener que
   confirmar el correo (opcional).
4. En **Project Settings > API Keys** (o **Data API**) copia:
   - la **Project URL** (`https://xxxx.supabase.co`)
   - la **publishable key** (o `anon` key). Esta clave puede ir en la app: la seguridad la dan las
     políticas RLS del paso 2. **Nunca** uses la `service_role` / secret key en la app.

### Paso 2. Publicar la app en Vercel

1. Entra a <https://vercel.com> y crea una cuenta con tu GitHub.
2. **Add New > Project** e importa el repositorio `Tools`.
3. En **Root Directory** elige `finanzas`. Vercel detecta Vite solo.
4. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = la Project URL
   - `VITE_SUPABASE_ANON_KEY` = la publishable/anon key
5. **Deploy**. Al terminar te da una dirección tipo `https://finanzas-xxxx.vercel.app`.

### Paso 3. Instalarla en el celular

- **Android (Chrome)**: abre la dirección, menú **⋮ > Instalar app** (o *Agregar a la pantalla
  principal*).
- **iPhone (Safari)**: abre la dirección, botón **Compartir > Agregar a inicio**.

### Paso 4. Primer uso

1. Abre la app y toca **¿Primera vez? Crea tu cuenta** con tu correo y una contraseña.
2. Vuelve a Supabase > **Authentication > Sign In / Providers** y desactiva **Allow new users to sign
   up**, para que nadie más pueda crear cuentas en tu app.
3. En **Ajustes > Importar** sube tu Excel de débitos (funciona desde el celular o el computador).
   Revisa los años marcados: la app desmarca sola los años viejos o mal digitados.
4. En **Ajustes > Catálogos**:
   - **Egresos**: marca cada tipo como fijo, variable o ahorro; esto mejora la proyección.
   - **Medios**: pon el saldo que tiene hoy cada cuenta (en la tarjeta, lo que debes).
5. En **Compromisos** agrega tus créditos, cuotas de tarjeta y suscripciones.

## Fase 2: leer pantallazos y comprobantes

En **Registrar** toca **📷 Leer comprobante** y elige el pantallazo o el PDF del pago. La app llena
el formulario (valor, fecha, medio de pago, tipo de egreso, comercio y referencia) para que solo
revises y guardes. Si eliges varios archivos a la vez, o entras a **Ajustes → Importar → Pantallazos
y comprobantes**, la app los lee uno por uno y te muestra cada movimiento con avisos de lo que falta
o de lo que parece repetido. Puedes guardar los completos de un toque, revisarlos o descartarlos.

La lectura la hace Claude (API de Anthropic) desde una función de Supabase. La clave de la API vive
solo en Supabase, y la app no guarda las imágenes.

### Paso 5. Clave de la API de Anthropic

1. Entra a <https://console.anthropic.com> y crea una cuenta.
2. En **Billing** compra créditos (desde USD 5).
3. En **API Keys** presiona **Create Key**, ponle de nombre `finanzas` y copia la clave (empieza por
   `sk-ant-`). Solo se muestra una vez.

### Paso 6. Publicar la función en Supabase

1. En Supabase abre **Edge Functions** y presiona **Deploy a new function → Via Editor**.
2. Como nombre escribe exactamente `leer-comprobante`.
3. Borra el código de ejemplo, pega todo el contenido de
   [`supabase/functions/leer-comprobante/index.ts`](supabase/functions/leer-comprobante/index.ts) y
   presiona **Deploy function**.
4. En **Edge Functions → Secrets** agrega:
   - `ANTHROPIC_API_KEY` = la clave del paso 5.
   - `MODELO_COMPROBANTES` (opcional) = el modelo a usar. Por defecto es `claude-opus-5-5`; con
     `claude-haiku-5-5` cuesta mucho menos, a cambio de leer con menos precisión los pantallazos difíciles.

Si la app dice *"Invalid JWT"* al leer un comprobante, entra a la función → **Settings** y desactiva
**Verify JWT with legacy secret**: la función ya verifica por su cuenta que haya una sesión iniciada.

## Fase 3: movimientos desde tus correos

Los avisos de Bancolombia, los comprobantes de PSE y los pedidos de Rappi que llegan a Gmail se
convierten en movimientos **propuestos**. Quedan en la bandeja **Por revisar** (se entra desde el
aviso de Inicio), mes por mes, con el texto del correo al lado para comparar:

- **Guardar los N listos**: guarda de un toque los que están completos y sin dudas.
- **Revisar**: abre el formulario prellenado para corregir cuenta, tipo o descripción.
- **Descartar**: lo saca de la bandeja (con *Deshacer*). **Descartar los que ya registraste**
  limpia los que ya habías anotado a mano o con pantallazo.

Nada entra a tus estadísticas hasta que lo guardas. Los movimientos guardados desde la bandeja
quedan con origen `correo`.

Si tu base de datos se creó antes de esta fase, vuelve a ejecutar
[`supabase/schema.sql`](supabase/schema.sql) en el **SQL Editor**: crea la tabla `pendientes` sin
tocar tus datos.

## Tasas de tus créditos frente al mercado

En **Compromisos**, los créditos, préstamos y cuotas de tarjeta tienen dos campos más: el **banco o
entidad** y la **tasa de interés** (E.A. o M.V.; la app la pasa a efectiva anual y muestra cuánto
pagas de interés al mes). Al guardar uno, la app consulta las tasas del mercado colombiano de ese mes
(usura, interés bancario corriente y compra de cartera por banco) y te dice si hay una opción que te
baje la tasa. El resultado queda en la tarjeta del compromiso, con las fuentes. Se vuelve a consultar
cuando cambias la tasa, el saldo o la entidad, o cuando el último análisis tiene más de 30 días.

La consulta la hace la función `consultar-credito` de Supabase, con Claude y búsqueda web. Usa la
misma `ANTHROPIC_API_KEY` de la fase 2. Para publicarla, sigue el paso 6 con el nombre
`consultar-credito` y el archivo [`supabase/functions/consultar-credito/index.ts`](supabase/functions/consultar-credito/index.ts).
El secreto `MODELO_CREDITOS` (opcional) cambia el modelo; por defecto es `claude-opus-5-5`.

## Desarrollo local

```bash
cd finanzas
npm install
cp .env.example .env.local   # opcional: sin estas variables la app guarda los datos solo en el navegador
npm run dev                  # abre http://localhost:5173
npm test                     # pruebas
npm run build                # compila a dist/
```

Sin las variables de Supabase la app funciona en **modo local** (datos en el navegador). Es útil para
probarla; luego puedes pasar esos datos a la nube con *Descargar respaldo* y *Restaurar respaldo*.

## Estructura

```
finanzas/
├── supabase/schema.sql      tablas y políticas de seguridad
├── supabase/functions/
│   ├── leer-comprobante/    lee comprobantes con Claude (Edge Function)
│   └── consultar-credito/   compara un crédito con las tasas del mercado (Claude + búsqueda web)
├── src/lib/
│   ├── types.ts             modelo de datos
│   ├── db.ts                guardado en Supabase o en el navegador
│   ├── seed.ts              catálogos iniciales
│   ├── stats.ts             resumen del mes, saldos, proyección y consejos
│   ├── importExcel.ts       lectura del Excel de débitos
│   ├── comprobantes.ts      envío de pantallazos y armado de movimientos
│   ├── creditos.ts          tasas E.A./M.V., interés del mes y consulta del mercado
│   ├── gmf.ts               4x1000: cálculo por cuenta y recomendación de cuenta exenta
│   └── bandeja.ts           bandeja "Por revisar" (movimientos propuestos desde los correos)
├── src/views/               pantallas: Inicio, Movimientos, Registrar, Compromisos, Ajustes, Catálogos, Bandeja
├── diseno/                  propuestas de logo, logos de Higgsfield y el logo final ("Bucle infinito")
└── src/components/          gráficos y piezas de interfaz
```

## Próximas fases

| Fase | Qué agrega | Qué se necesita |
|------|------------|-----------------|
| 2 ✅ | **Pantallazos**: subes la foto del comprobante (Nequi, Bancolombia, Daviplata…) y la app llena el movimiento | Ver pasos 5 y 6 |
| 3 🟡 | **Correos de Gmail**: lee los soportes de pago y los propone como movimientos para que solo los confirmes. Ya está la bandeja *Por revisar*; falta que la app lea los correos nuevos sola | Proyecto en Google Cloud con la Gmail API activada (OAuth, solo lectura) |
| 4 | **Asesor de fin de mes**: un informe en lenguaje natural sobre tus hábitos y cómo optimizar el ahorro | La misma API key de la fase 2 |
| — | Registrar sin conexión y sincronizar después | Nada adicional |
