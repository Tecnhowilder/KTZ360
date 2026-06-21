-- ============================================================================
-- 0036 — founder_program: Programa Founder (precios especiales por 12 meses)
-- ============================================================================
-- PRO Founder:     $29.900/mes durante 12 meses → luego $39.900/mes
-- PREMIUM Founder: $89.900/mes durante 12 meses → luego $129.900/mes
-- Las fechas NO están hardcodeadas — se calculan en runtime al activar.
-- ============================================================================

-- 1. Tabla de definición de promotions (configurable por admin)
create table if not exists public.founder_promotions (
  id                uuid primary key default gen_random_uuid(),
  plan_code         text not null references public.plans(code) on delete cascade,
  name              text not null,                    -- 'PRO Founder', 'PREMIUM Founder'
  founder_price     numeric(12,2) not null,           -- precio promocional
  regular_price     numeric(12,2) not null,           -- precio final tras expiración
  duration_months   int not null default 12,          -- duración de la promo en meses
  max_redemptions   int,                              -- null = ilimitado
  current_redemptions int not null default 0,
  active            boolean not null default true,
  valid_until       timestamptz,                      -- null = sin expiración de la promo
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (plan_code, name)
);

create trigger trg_founder_promotions_updated_at
  before update on public.founder_promotions
  for each row execute function public.set_updated_at();

-- RLS
alter table public.founder_promotions enable row level security;

-- Cualquier autenticado puede ver las promotions activas
create policy "founder_promotions_select_active" on public.founder_promotions
  for select using (active = true);

-- Solo super_admin puede gestionar
create policy "founder_promotions_admin" on public.founder_promotions
  for all using (public.is_support_admin());

-- 2. Columnas en subscriptions para rastrear founder
alter table public.subscriptions
  add column if not exists is_founder           boolean not null default false,
  add column if not exists founder_promotion_id uuid references public.founder_promotions(id),
  add column if not exists founder_expires_at   timestamptz,   -- cuando expira el precio founder
  add column if not exists founder_price        numeric(12,2); -- precio pagado durante founder

-- Índice para consultas de expiración
create index if not exists idx_subscriptions_founder_expires
  on public.subscriptions(founder_expires_at)
  where is_founder = true and founder_expires_at is not null;

-- 3. Seed: definición oficial de promotions Founder
insert into public.founder_promotions
  (plan_code, name, founder_price, regular_price, duration_months, active)
values
  ('pro',     'PRO Founder',     29900, 39900,  12, true),
  ('premium', 'PREMIUM Founder', 89900, 129900, 12, true)
on conflict (plan_code, name) do update set
  founder_price   = excluded.founder_price,
  regular_price   = excluded.regular_price,
  duration_months = excluded.duration_months,
  active          = excluded.active,
  updated_at      = now();

-- 4. Función para activar un workspace como Founder
--    Llamada desde el webhook de pago cuando se detecta precio founder
create or replace function public.activate_founder_subscription(
  p_workspace_id    uuid,
  p_plan_code       text,
  p_promotion_name  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo  public.founder_promotions%rowtype;
  v_expires timestamptz;
begin
  -- Obtener la definición de la promo
  select * into v_promo
  from public.founder_promotions
  where plan_code = p_plan_code and name = p_promotion_name and active = true;

  if not found then
    raise exception 'Founder promotion not found or inactive: % / %', p_plan_code, p_promotion_name;
  end if;

  -- Verificar disponibilidad de cupos
  if v_promo.max_redemptions is not null
     and v_promo.current_redemptions >= v_promo.max_redemptions then
    raise exception 'Founder promotion is sold out';
  end if;

  -- Calcular fecha de expiración del precio founder
  v_expires := now() + (v_promo.duration_months || ' months')::interval;

  -- Actualizar suscripción
  update public.subscriptions set
    is_founder           = true,
    founder_promotion_id = v_promo.id,
    founder_expires_at   = v_expires,
    founder_price        = v_promo.founder_price,
    updated_at           = now()
  where workspace_id = p_workspace_id;

  -- Incrementar contador de redenciones
  update public.founder_promotions set
    current_redemptions = current_redemptions + 1
  where id = v_promo.id;
end;
$$;

grant execute on function public.activate_founder_subscription(uuid, text, text) to service_role;

-- 5. Vista auxiliar: workspaces en periodo founder con precio efectivo
create or replace view public.v_subscription_effective_price as
select
  s.workspace_id,
  s.plan_id,
  p.code as plan_code,
  p.name as plan_name,
  s.is_founder,
  case
    when s.is_founder and s.founder_expires_at > now()
    then s.founder_price
    else p.price
  end as effective_price,
  s.founder_expires_at,
  s.status,
  s.current_period_end
from public.subscriptions s
join public.plans p on p.id = s.plan_id;

comment on table public.founder_promotions is
  'Programa Founder — precios especiales por duración configurable. Sprint 1.';
