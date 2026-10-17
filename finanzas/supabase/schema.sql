-- Esquema de "Mis Finanzas" para Supabase.
-- Pégalo completo en Supabase > SQL Editor > New query y presiona "Run".
-- Cada fila queda ligada al usuario que la crea (user_id) y las políticas RLS
-- garantizan que solo ese usuario pueda leerla o modificarla.

create extension if not exists pgcrypto;

-- Medios de pago: cuentas de ahorro, billeteras, tarjetas de crédito, efectivo.
create table if not exists public.medios_pago (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'ahorros'
    check (tipo in ('ahorros', 'corriente', 'billetera', 'tarjeta_credito', 'efectivo', 'otro')),
  saldo_inicial numeric(14, 2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tipos de egreso y tipos de ingreso.
-- naturaleza solo aplica a egresos: fijo, variable o ahorro.
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('egreso', 'ingreso')),
  naturaleza text check (naturaleza in ('fijo', 'variable', 'ahorro')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  telefono text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Compromisos: cuotas de tarjeta, créditos, préstamos, suscripciones, servicios.
create table if not exists public.compromisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'otro'
    check (tipo in ('tarjeta', 'credito', 'prestamo', 'suscripcion', 'servicio', 'otro')),
  medio_pago_id uuid references public.medios_pago (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  monto_cuota numeric(14, 2) not null check (monto_cuota >= 0),
  dia_pago smallint check (dia_pago between 1 and 31),
  cuotas_total integer check (cuotas_total > 0),
  cuotas_pagadas integer not null default 0,
  saldo_pendiente numeric(14, 2),
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('egreso', 'ingreso', 'transferencia')),
  fecha date not null,
  valor numeric(14, 2) not null check (valor > 0),
  medio_pago_id uuid references public.medios_pago (id) on delete set null,
  medio_destino_id uuid references public.medios_pago (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  cliente_id uuid references public.clientes (id) on delete set null,
  compromiso_id uuid references public.compromisos (id) on delete set null,
  proveedor text,
  descripcion text,
  cuotas integer not null default 1 check (cuotas >= 1),
  comentarios text,
  origen text not null default 'manual' check (origen in ('manual', 'excel', 'pantallazo', 'correo')),
  created_at timestamptz not null default now()
);

create index if not exists movimientos_usuario_fecha on public.movimientos (user_id, fecha desc);

-- Seguridad: cada usuario solo ve y modifica sus propias filas.
do $$
declare
  t text;
begin
  foreach t in array array['medios_pago', 'categorias', 'clientes', 'compromisos', 'movimientos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists propietario on public.%I', t);
    execute format(
      'create policy propietario on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
