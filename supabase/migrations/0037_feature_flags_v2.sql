-- ============================================================================
-- 0037 — feature_flags_v2: Nuevas columnas en plan_features + valores
-- ============================================================================
-- Agrega feature flags para módulos PREMIUM y PRO nuevos.
-- ============================================================================

-- 1. Agregar columnas nuevas (idempotente con IF NOT EXISTS)
alter table public.plan_features
  add column if not exists pipeline_enabled      boolean not null default false,
  add column if not exists orders_enabled        boolean not null default false,
  add column if not exists work_orders_enabled   boolean not null default false,
  add column if not exists gps_enabled           boolean not null default false,
  add column if not exists ai_credits_enabled    boolean not null default false,
  add column if not exists founder_eligible      boolean not null default false,
  add column if not exists storage_enabled       boolean not null default false;

-- 2. Actualizar valores por plan
update public.plan_features set
  pipeline_enabled    = false,
  orders_enabled      = false,
  work_orders_enabled = false,
  gps_enabled         = false,
  ai_credits_enabled  = false,
  founder_eligible    = false,
  storage_enabled     = false
where plan_code = 'free';

update public.plan_features set
  pipeline_enabled    = true,   -- CRM Pipeline
  orders_enabled      = false,  -- Pedidos: solo PREMIUM
  work_orders_enabled = false,  -- OT: solo PREMIUM
  gps_enabled         = false,  -- GPS: solo PREMIUM
  ai_credits_enabled  = true,   -- IA con créditos (500/mes)
  founder_eligible    = true,   -- Puede aplicar Founder
  storage_enabled     = false   -- Storage extendido: solo PREMIUM
where plan_code = 'pro';

update public.plan_features set
  pipeline_enabled    = true,
  orders_enabled      = true,
  work_orders_enabled = true,
  gps_enabled         = true,
  ai_credits_enabled  = true,   -- IA con créditos (2000/mes)
  founder_eligible    = true,
  storage_enabled     = true    -- 5 GB storage
where plan_code = 'premium';

-- 3. Actualizar la función check_feature_access para reconocer nuevos features
--    La función ya usa columnas dinámicas via EXECUTE format — solo necesitamos
--    agregar los nuevos nombres a la whitelist de features permitidas.
create or replace function public.check_feature_access(
  p_workspace_id uuid,
  p_feature      text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_value     boolean;
  v_allowed_features text[] := array[
    'ai_enabled', 'photo_quote_enabled', 'templates_enabled',
    'branding_enabled', 'custom_qr_enabled', 'advanced_reports_enabled',
    'multiuser_enabled', 'quote_editing_enabled',
    -- NUEVAS Sprint 1
    'pipeline_enabled', 'orders_enabled', 'work_orders_enabled',
    'gps_enabled', 'ai_credits_enabled', 'founder_eligible',
    'storage_enabled'
  ];
begin
  -- Validar feature permitida (previene SQL injection)
  if not (p_feature = any(v_allowed_features)) then
    return false;
  end if;

  -- Bypass para super/support admin
  if public.is_support_admin() then
    return true;
  end if;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  execute format(
    'select %I from public.plan_features where plan_code = $1',
    p_feature
  ) into v_value using v_plan_code;

  return coalesce(v_value, false);
end;
$$;

grant execute on function public.check_feature_access(uuid, text) to authenticated;

comment on column public.plan_features.pipeline_enabled    is 'CRM Pipeline visual — PRO+';
comment on column public.plan_features.orders_enabled      is 'Módulo Pedidos — PREMIUM';
comment on column public.plan_features.work_orders_enabled is 'Órdenes de trabajo — PREMIUM';
comment on column public.plan_features.gps_enabled         is 'GPS check-in/out — PREMIUM';
comment on column public.plan_features.ai_credits_enabled  is 'IA con créditos mensuales — PRO+';
comment on column public.plan_features.founder_eligible    is 'Puede aplicar a precio Founder — PRO+';
comment on column public.plan_features.storage_enabled     is 'Storage extendido 5GB — PREMIUM';
