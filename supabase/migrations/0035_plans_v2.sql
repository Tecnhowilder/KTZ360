-- ============================================================================
-- 0035 — plans_v2: Actualización oficial de precios, límites y features
-- ============================================================================
-- CAMBIOS:
--   FREE:    50 cots/mes, 50 clientes, 100 items catálogo, IA deshabilitada
--   PRO:     $39.900, 1000 cots/mes, 2000 clientes, 2000 items, 500 créditos IA
--   PREMIUM: $129.900, ilimitado, 2000 créditos IA, 5 usuarios, 5 GB storage
-- COMPATIBILIDAD: idempotente — usa ON CONFLICT / IF NOT EXISTS
-- ============================================================================

-- 1. Actualizar precios oficiales
update public.plans set
  price       = 39900,
  description = 'CRM comercial + IA con créditos + Reportes avanzados + PDF white-label'
where code = 'pro';

update public.plans set
  price       = 129900,
  description = 'Todo PRO + Operaciones (Pedidos, OT, Bitácora, Evidencias, GPS) + 5 usuarios'
where code = 'premium';

update public.plans set
  description = 'Cotizaciones, Clientes, Catálogo, PDF profesional, Portal público'
where code = 'free';

-- 2. Agregar columnas nuevas a plan_limits (si no existen)
alter table public.plan_limits
  add column if not exists max_catalog_items int,      -- null = ilimitado
  add column if not exists max_storage_gb    int;      -- null = ilimitado

-- 3. Actualizar límites por plan
update public.plan_limits set
  max_quotes_month   = 50,
  max_clients        = 50,
  max_catalog_items  = 100,
  included_users     = 1,
  extra_user_price   = 0,
  ai_credits_monthly = 0,
  max_storage_gb     = null
where plan_code = 'free';

update public.plan_limits set
  max_quotes_month   = 1000,
  max_clients        = 2000,
  max_catalog_items  = 2000,
  included_users     = 1,
  extra_user_price   = 0,
  ai_credits_monthly = 500,
  max_storage_gb     = null
where plan_code = 'pro';

update public.plan_limits set
  max_quotes_month   = null,
  max_clients        = null,
  max_catalog_items  = null,
  included_users     = 5,
  extra_user_price   = 11900,
  ai_credits_monthly = 2000,
  max_storage_gb     = 5
where plan_code = 'premium';

-- 4. Actualizar features — IA habilitada en PRO (con créditos) y PREMIUM
update public.plan_features set
  ai_enabled             = false,
  photo_quote_enabled    = false,
  templates_enabled      = false,
  branding_enabled       = false,
  custom_qr_enabled      = false,
  advanced_reports_enabled = false,
  multiuser_enabled      = false,
  quote_editing_enabled  = false,
  pdf_tier               = 'free'
where plan_code = 'free';

update public.plan_features set
  ai_enabled             = true,   -- habilitado con límite de créditos
  photo_quote_enabled    = false,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  multiuser_enabled      = false,
  quote_editing_enabled  = true,
  pdf_tier               = 'pro'
where plan_code = 'pro';

update public.plan_features set
  ai_enabled             = true,
  photo_quote_enabled    = true,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  multiuser_enabled      = true,
  quote_editing_enabled  = true,
  pdf_tier               = 'pro'
where plan_code = 'premium';

-- 5. Actualizar check_plan_limit RPC para incluir max_catalog_items
create or replace function public.check_catalog_limit(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code    text;
  v_max          int;
  v_current      int;
begin
  v_plan_code := public.get_effective_plan_code(p_workspace_id);
  select max_catalog_items into v_max from public.plan_limits where plan_code = v_plan_code;

  select count(*) into v_current
  from public.catalog_items
  where workspace_id = p_workspace_id and deleted_at is null and status = 'active';

  return jsonb_build_object(
    'allowed', v_max is null or v_current < v_max,
    'current', v_current,
    'max', v_max
  );
end;
$$;

grant execute on function public.check_catalog_limit(uuid) to authenticated;

-- Comentario de auditoría
comment on table public.plan_limits is
  'Sprint 1 v2 — FREE: 50/50/100, PRO: 1000/2000/2000+500créditos, PREMIUM: ilimitado+2000créditos+5GB';
