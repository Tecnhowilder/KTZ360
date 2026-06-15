-- KTZ360 — QA Bloque 1: feature flags, límites IA y permisos de edición
-- Pegar manualmente en el editor SQL de Supabase.

-- ---------------------------------------------------------------------------
-- 1) quote_editing_enabled (FREE no, PRO/PREMIUM sí)
-- ---------------------------------------------------------------------------
alter table public.plan_features
  add column quote_editing_enabled boolean not null default false;

update public.plan_features set quote_editing_enabled = true where plan_code in ('pro','premium');

-- ---------------------------------------------------------------------------
-- 2) ai_credits_monthly (preparación IA, sin wiring de feature en este bloque)
-- ---------------------------------------------------------------------------
alter table public.plan_limits
  add column ai_credits_monthly int not null default 0;

update public.plan_limits set ai_credits_monthly = 0   where plan_code in ('free','pro');
update public.plan_limits set ai_credits_monthly = 100 where plan_code = 'premium';

-- ---------------------------------------------------------------------------
-- 3) check_feature_access(): agrega 'quote_editing_enabled' a la whitelist
-- ---------------------------------------------------------------------------
create or replace function public.check_feature_access(p_workspace_id uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_value boolean;
begin
  if p_workspace_id <> public.current_workspace_id() and not public.is_support_admin() then
    raise exception 'forbidden';
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if p_feature not in (
    'ai_enabled', 'photo_quote_enabled', 'templates_enabled', 'branding_enabled',
    'custom_qr_enabled', 'advanced_reports_enabled', 'multiuser_enabled',
    'quote_editing_enabled'
  ) then
    raise exception 'invalid_feature';
  end if;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  execute format('select %I from public.plan_features where plan_code = $1', p_feature)
    into v_value using v_plan_code;

  return coalesce(v_value, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Trigger BEFORE UPDATE en quotes: bloquea edición de campos de
--    precio/materiales/mano de obra si el plan no tiene quote_editing_enabled.
--    Permite siempre cambios de status/sent_at/deleted_at (flujo enviar/eliminar).
--    is_support_admin() (incluye super_admin) siempre puede editar.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_quote_edit_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_support_admin() then
    return new;
  end if;

  if not public.check_feature_access(new.workspace_id, 'quote_editing_enabled') then
    if new.service_lines is distinct from old.service_lines
       or new.admin_pct is distinct from old.admin_pct
       or new.imprevistos_pct is distinct from old.imprevistos_pct
       or new.util is distinct from old.util
       or new.tax_mode is distinct from old.tax_mode
       or new.tax_rate is distinct from old.tax_rate
       or new.discount is distinct from old.discount
       or new.discount_on is distinct from old.discount_on
       or new.transport_cost is distinct from old.transport_cost
       or new.transport_enabled is distinct from old.transport_enabled
       or new.advance_pct is distinct from old.advance_pct
       or new.title is distinct from old.title
       or new.notes is distinct from old.notes
    then
      raise exception 'feature_not_available: quote_editing_enabled';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_quote_edit_permission on public.quotes;
create trigger trg_enforce_quote_edit_permission
  before update on public.quotes
  for each row execute function public.enforce_quote_edit_permission();

-- ---------------------------------------------------------------------------
-- 5) log_login_failed(): registro de intentos de login fallidos (RPC anónima)
--    Solo registra si el email corresponde a un workspace existente.
-- ---------------------------------------------------------------------------
create or replace function public.log_login_failed(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_user_id uuid;
begin
  select p.workspace_id, p.id into v_workspace_id, v_user_id
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(p_email)
    limit 1;

  if v_workspace_id is not null then
    insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
    values (v_workspace_id, v_user_id, 'login_failed', 'auth',
            jsonb_build_object('email', p_email, 'timestamp', now()));
  end if;
end;
$$;

grant execute on function public.log_login_failed(text) to anon, authenticated;
