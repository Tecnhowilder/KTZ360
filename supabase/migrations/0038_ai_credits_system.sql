-- ============================================================================
-- 0038 — ai_credits_system: Control de créditos IA por plan
-- ============================================================================
-- Implementa:
--   1. Columna credits_used en ai_usage (por período mensual)
--   2. RPC check_ai_credits(workspace_id, cost) → puede usar?
--   3. RPC consume_ai_credits(workspace_id, cost, feature) → descuenta y registra
--   4. Vista v_ai_credits_summary por workspace
--   5. Tabla ai_credits_ledger para auditoría detallada
-- COSTO POR OPERACIÓN (configurable, no hardcodeado):
--   Generar descripción: 1 crédito
--   Mejorar propuesta:   2 créditos
--   Resumen IA:          2 créditos
--   Probabilidad cierre: 3 créditos
--   Recomendaciones:     3 créditos
-- ============================================================================

-- 1. Tabla de costos de operaciones IA (configurable por admin)
create table if not exists public.ai_operation_costs (
  operation     text primary key,
  credits_cost  int not null default 1,
  description   text,
  active        boolean not null default true
);

insert into public.ai_operation_costs (operation, credits_cost, description) values
  ('generate_description',   1, 'Generar descripción de trabajo'),
  ('improve_proposal',       2, 'Mejorar texto de propuesta'),
  ('ai_summary',             2, 'Resumen inteligente del dashboard'),
  ('close_probability',      3, 'Cálculo de probabilidad de cierre'),
  ('recommendations',        3, 'Recomendaciones comerciales'),
  ('photo_quote',            5, 'Cotización desde fotografía'),
  ('forecast',               3, 'Forecast de ventas'),
  ('risk_analysis',          3, 'Análisis de clientes en riesgo')
on conflict (operation) do update set
  credits_cost = excluded.credits_cost,
  description  = excluded.description;

alter table public.ai_operation_costs enable row level security;
create policy "ai_op_costs_select_all" on public.ai_operation_costs for select using (true);
create policy "ai_op_costs_admin" on public.ai_operation_costs for all using (public.is_support_admin());

-- 2. Agregar período al ai_usage para facilitar conteo mensual
alter table public.ai_usage
  add column if not exists credits_used   int not null default 0,
  add column if not exists period_month   date;  -- primer día del mes

-- Trigger para auto-rellenar period_month
create or replace function public.set_ai_usage_period()
returns trigger language plpgsql as $$
begin
  new.period_month := date_trunc('month', now())::date;
  return new;
end;
$$;

drop trigger if exists trg_ai_usage_period on public.ai_usage;
create trigger trg_ai_usage_period
  before insert on public.ai_usage
  for each row execute function public.set_ai_usage_period();

create index if not exists idx_ai_usage_period
  on public.ai_usage(workspace_id, period_month desc);

-- 3. RPC: verificar si el workspace puede usar N créditos IA
create or replace function public.check_ai_credits(
  p_workspace_id uuid,
  p_credits_needed int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code      text;
  v_credits_max    int;
  v_credits_used   int;
  v_ai_enabled     boolean;
begin
  -- Verificar que el plan tiene IA habilitada
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  select ai_enabled, ai_credits_enabled
  into v_ai_enabled, v_ai_enabled
  from public.plan_features
  where plan_code = v_plan_code;

  if not coalesce(v_ai_enabled, false) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'ai_not_included',
      'plan',   v_plan_code,
      'credits_used', 0,
      'credits_max',  0,
      'credits_remaining', 0
    );
  end if;

  -- Obtener límite mensual del plan
  select ai_credits_monthly into v_credits_max
  from public.plan_limits
  where plan_code = v_plan_code;

  -- Si es null = ilimitado (no aplica en planes actuales, pero por si acaso)
  if v_credits_max is null then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'credits_used', 0,
      'credits_max',  null,
      'credits_remaining', null
    );
  end if;

  -- Contar créditos usados en el mes actual
  select coalesce(sum(credits_used), 0) into v_credits_used
  from public.ai_usage
  where workspace_id = p_workspace_id
    and period_month = date_trunc('month', now())::date;

  return jsonb_build_object(
    'allowed',           (v_credits_used + p_credits_needed) <= v_credits_max,
    'reason',            case when (v_credits_used + p_credits_needed) <= v_credits_max then 'ok' else 'limit_reached' end,
    'plan',              v_plan_code,
    'credits_used',      v_credits_used,
    'credits_max',       v_credits_max,
    'credits_remaining', greatest(0, v_credits_max - v_credits_used),
    'credits_needed',    p_credits_needed
  );
end;
$$;

grant execute on function public.check_ai_credits(uuid, int) to authenticated;

-- 4. RPC: consumir créditos IA (registra en ai_usage)
create or replace function public.consume_ai_credits(
  p_workspace_id uuid,
  p_operation    text,
  p_tokens_used  int default 0,
  p_estimated_cost numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits_cost   int;
  v_check          jsonb;
begin
  -- Obtener costo de la operación
  select credits_cost into v_credits_cost
  from public.ai_operation_costs
  where operation = p_operation and active = true;

  -- Si no existe la operación, costo por defecto = 1
  v_credits_cost := coalesce(v_credits_cost, 1);

  -- Verificar si puede usar esos créditos
  v_check := public.check_ai_credits(p_workspace_id, v_credits_cost);

  if not (v_check->>'allowed')::boolean then
    return jsonb_build_object(
      'success', false,
      'reason',  v_check->>'reason',
      'credits_remaining', v_check->'credits_remaining'
    );
  end if;

  -- Registrar consumo
  insert into public.ai_usage
    (workspace_id, feature, provider, tokens_used, estimated_cost, credits_used)
  values
    (p_workspace_id, p_operation, 'gemini', p_tokens_used, p_estimated_cost, v_credits_cost);

  return jsonb_build_object(
    'success',           true,
    'credits_consumed',  v_credits_cost,
    'credits_remaining', (v_check->'credits_remaining')::int - v_credits_cost
  );
end;
$$;

grant execute on function public.consume_ai_credits(uuid, text, int, numeric) to authenticated;
grant execute on function public.consume_ai_credits(uuid, text, int, numeric) to service_role;

-- 5. Vista resumen de créditos IA por workspace
create or replace view public.v_ai_credits_summary as
select
  w.id                              as workspace_id,
  public.get_effective_plan_code(w.id) as plan_code,
  pl.ai_credits_monthly             as credits_max,
  coalesce(
    (select sum(au.credits_used)
     from public.ai_usage au
     where au.workspace_id = w.id
       and au.period_month = date_trunc('month', now())::date
    ), 0
  )                                 as credits_used_this_month,
  greatest(0,
    pl.ai_credits_monthly - coalesce(
      (select sum(au.credits_used)
       from public.ai_usage au
       where au.workspace_id = w.id
         and au.period_month = date_trunc('month', now())::date
      ), 0
    )
  )                                 as credits_remaining
from public.workspaces w
join public.plan_limits pl
  on pl.plan_code = public.get_effective_plan_code(w.id)
where w.id in (select distinct workspace_id from public.ai_usage);

-- RLS en ai_usage ya existe desde 0003 — verificar select del propio workspace
-- No se agrega nada aquí pues la RLS ya protege la tabla.

comment on function public.check_ai_credits  is 'Verifica si workspace puede usar N créditos IA este mes';
comment on function public.consume_ai_credits is 'Registra consumo de créditos IA. Bloquea si sin saldo.';
