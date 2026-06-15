-- KTZ360 — BLOQUE 1: Arquitectura Zero Trust de planes, permisos y suscripciones
-- Fuente de verdad del plan activo = public.subscriptions (workspaces.current_plan_id
-- queda como caché denormalizada, nunca como fuente de validación).
-- No ejecutar automáticamente: pegar manualmente en el editor SQL de Supabase.

-- ---------------------------------------------------------------------------
-- 1) PLANES: nueva estructura de precios y beneficios (PASO 3)
-- ---------------------------------------------------------------------------
update public.plans set
  price = 0,
  description = '10 cotizaciones/mes, 20 clientes, WhatsApp, Correo, Portal público, Historial, PDF FREE'
where code = 'free';

update public.plans set
  price = 39900,
  description = 'Cotizaciones y clientes ilimitados, plantillas ilimitadas, branding corporativo, QR personalizado, portal personalizado, seguimiento de cotizaciones, reportes básicos, PDF Profesional'
where code = 'pro';

update public.plans set
  price = 69900,
  description = 'Todo Pro + KTZ360 IA, cotización desde fotografía, materiales y mano de obra inteligentes, reportes avanzados, dashboard y embudo comercial, recordatorios automáticos, hasta 5 usuarios, roles y permisos, soporte prioritario'
where code = 'premium';

-- ---------------------------------------------------------------------------
-- 2) plan_features — beneficios booleanos por plan
-- ---------------------------------------------------------------------------
create table public.plan_features (
  plan_code text primary key references public.plans(code) on delete cascade,
  ai_enabled boolean not null default false,
  photo_quote_enabled boolean not null default false,
  templates_enabled boolean not null default false,
  branding_enabled boolean not null default false,
  custom_qr_enabled boolean not null default false,
  advanced_reports_enabled boolean not null default false,
  multiuser_enabled boolean not null default false,
  pdf_tier text not null default 'free' check (pdf_tier in ('free', 'pro')),
  updated_at timestamptz not null default now()
);

insert into public.plan_features (
  plan_code, ai_enabled, photo_quote_enabled, templates_enabled, branding_enabled,
  custom_qr_enabled, advanced_reports_enabled, multiuser_enabled, pdf_tier
) values
  ('free',    false, false, false, false, false, false, false, 'free'),
  ('pro',     false, false, true,  true,  true,  false, false, 'pro'),
  ('premium', true,  true,  true,  true,  true,  true,  true,  'pro');

-- ---------------------------------------------------------------------------
-- 3) plan_limits — límites cuantitativos y multiusuario facturable (PASO 3/6)
-- ---------------------------------------------------------------------------
create table public.plan_limits (
  plan_code text primary key references public.plans(code) on delete cascade,
  max_quotes_month int,              -- null = ilimitado
  max_clients int,                   -- null = ilimitado
  included_users int not null default 1,
  extra_user_price numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.plan_limits (plan_code, max_quotes_month, max_clients, included_users, extra_user_price) values
  ('free',    10,   20,   1, 0),
  ('pro',     null, null, 1, 0),
  ('premium', null, null, 5, 11999);

-- ---------------------------------------------------------------------------
-- 4) subscriptions — nuevos estados del ciclo de vida (PASO 12)
-- ---------------------------------------------------------------------------
update public.subscriptions set status = 'trial_active' where status = 'trialing';
update public.subscriptions set status = 'cancelled' where status = 'canceled';

alter table public.subscriptions drop constraint subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trial_active', 'active', 'past_due', 'cancelled', 'expired', 'suspended', 'free'));

-- Normaliza el estado inicial: toda alta en el plan free queda en 'trial_active'
-- (los triggers de registro existentes insertan status='active').
create or replace function public.normalize_initial_subscription_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_plan_id uuid;
begin
  if new.status = 'active' then
    select id into v_free_plan_id from public.plans where code = 'free';
    if new.plan_id = v_free_plan_id then
      new.status := 'trial_active';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_subscriptions_normalize_status
  before insert on public.subscriptions
  for each row execute function public.normalize_initial_subscription_status();

-- ---------------------------------------------------------------------------
-- 5) subscription_usage — consumo mensual de cotizaciones (PASO 8)
-- ---------------------------------------------------------------------------
create table public.subscription_usage (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  period_start timestamptz not null default date_trunc('month', now()),
  period_end timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  quotes_count int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.increment_quote_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscription_usage (workspace_id, period_start, period_end, quotes_count)
  values (new.workspace_id, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 1)
  on conflict (workspace_id) do update set
    quotes_count = case
      when public.subscription_usage.period_end < now() then 1
      else public.subscription_usage.quotes_count + 1
    end,
    period_start = case
      when public.subscription_usage.period_end < now() then date_trunc('month', now())
      else public.subscription_usage.period_start
    end,
    period_end = case
      when public.subscription_usage.period_end < now() then date_trunc('month', now()) + interval '1 month'
      else public.subscription_usage.period_end
    end,
    updated_at = now();
  return new;
end;
$$;

create trigger trg_increment_quote_usage
  after insert on public.quotes
  for each row execute function public.increment_quote_usage();

-- ---------------------------------------------------------------------------
-- 6) profiles — verificación de correo y roles administrativos (PASO 4/12)
-- ---------------------------------------------------------------------------
alter table public.profiles add column email_verified boolean not null default false;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'employee', 'super_admin', 'support_admin'));

-- Al crear el profile: hereda email_verified desde auth.users y asigna
-- super_admin automáticamente al correo administrador inicial.
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_confirmed_at timestamptz;
begin
  select email_confirmed_at into v_email_confirmed_at from auth.users where id = new.id;
  new.email_verified := v_email_confirmed_at is not null;

  if new.email = 'admin@ktz360.com' then
    new.role := 'super_admin';
  end if;

  return new;
end;
$$;

create trigger trg_profiles_before_insert
  before insert on public.profiles
  for each row execute function public.handle_new_profile();

-- Mantiene profiles.email_verified sincronizado con auth.users.email_confirmed_at
create or replace function public.sync_profile_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email_verified = (new.email_confirmed_at is not null)
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_verified
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_profile_email_verified();

-- ---------------------------------------------------------------------------
-- 7) company_users — arquitectura de multiusuario facturable (PASO 6)
-- ---------------------------------------------------------------------------
create table public.company_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  billable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, profile_id)
);

-- Al crear un profile, registra el asiento. Es facturable si excede los
-- usuarios incluidos del plan vigente del workspace.
create or replace function public.handle_new_company_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_included_users int;
  v_seat_count int;
begin
  v_plan_code := public.get_effective_plan_code(new.workspace_id);
  select included_users into v_included_users from public.plan_limits where plan_code = v_plan_code;
  select count(*) into v_seat_count from public.company_users where workspace_id = new.workspace_id;

  insert into public.company_users (workspace_id, profile_id, billable)
  values (new.workspace_id, new.id, v_seat_count >= coalesce(v_included_users, 1));

  return new;
end;
$$;

create trigger trg_profiles_after_insert
  after insert on public.profiles
  for each row execute function public.handle_new_company_user();

-- ---------------------------------------------------------------------------
-- 8) company_settings — branding ampliado (módulo "Mi Empresa")
-- ---------------------------------------------------------------------------
alter table public.company_settings
  add column color_primary text not null default '#2563EB',
  add column color_secondary text not null default '#06B6D4',
  add column color_accent text not null default '#0F172A';

-- ---------------------------------------------------------------------------
-- 9) system_configuration — CMS Super Admin (PASO 12)
-- ---------------------------------------------------------------------------
create table public.system_configuration (
  key text primary key,
  category text not null default 'general',
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.system_configuration (key, category, value) values
  ('mercadopago', 'payments', '{"public_key": "", "access_token": "", "webhook_secret": ""}'::jsonb),
  ('alegra', 'billing', '{"api_key": "", "api_user": "", "company_id": ""}'::jsonb),
  ('resend', 'email', '{"api_key": "", "domain": "", "templates": {}}'::jsonb),
  ('ai', 'ai', '{"provider": "", "model": "", "monthly_cost_limit": null, "usage_limit_per_workspace": null}'::jsonb),
  ('plans', 'plans', '{}'::jsonb),
  ('promotions', 'promotions', '{"coupons": []}'::jsonb);

-- ---------------------------------------------------------------------------
-- 10) admin_settings — preferencias generales del panel Super Admin
-- ---------------------------------------------------------------------------
create table public.admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (key, value) values
  ('signup_enabled', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb);

-- ---------------------------------------------------------------------------
-- 11) RLS de las tablas nuevas
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'super_admin', false);
$$;

create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('super_admin', 'support_admin'), false);
$$;

alter table public.plan_features enable row level security;
create policy "plan_features_select_all"
  on public.plan_features for select
  to anon, authenticated
  using (true);

alter table public.plan_limits enable row level security;
create policy "plan_limits_select_all"
  on public.plan_limits for select
  to anon, authenticated
  using (true);

alter table public.subscription_usage enable row level security;
create policy "subscription_usage_select_own"
  on public.subscription_usage for select
  to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_support_admin());

alter table public.company_users enable row level security;
create policy "company_users_select_own"
  on public.company_users for select
  to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_support_admin());

alter table public.system_configuration enable row level security;
create policy "system_configuration_super_admin"
  on public.system_configuration for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

alter table public.admin_settings enable row level security;
create policy "admin_settings_super_admin"
  on public.admin_settings for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Visibilidad global para soporte/super admin sobre datos multi-tenant clave
create policy "workspaces_select_support_admin"
  on public.workspaces for select
  to authenticated
  using (public.is_support_admin());

create policy "subscriptions_select_support_admin"
  on public.subscriptions for select
  to authenticated
  using (public.is_support_admin());

create policy "subscriptions_update_super_admin"
  on public.subscriptions for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "profiles_select_support_admin"
  on public.profiles for select
  to authenticated
  using (public.is_support_admin());

-- ---------------------------------------------------------------------------
-- 12) RPCs centrales de permisos (PASO 4) — Zero Trust
-- ---------------------------------------------------------------------------

-- Plan efectivo del workspace, resuelto SIEMPRE desde subscriptions
-- (fuente de verdad). 'past_due' conserva beneficios; 'cancelled' conserva
-- beneficios hasta el fin del periodo pagado; 'expired'/'suspended' degradan a free.
create or replace function public.get_effective_plan_code(p_workspace_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_code text;
  v_period_end timestamptz;
begin
  select s.status, p.code, s.current_period_end
    into v_status, v_code, v_period_end
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.workspace_id = p_workspace_id
  order by s.created_at desc
  limit 1;

  if v_code is null then
    return 'free';
  end if;

  if v_status in ('expired', 'suspended') then
    return 'free';
  end if;

  if v_status = 'cancelled' and v_period_end is not null and v_period_end < now() then
    return 'free';
  end if;

  return v_code;
end;
$$;

-- Acceso a un feature booleano del plan vigente. super_admin: acceso total.
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
    'custom_qr_enabled', 'advanced_reports_enabled', 'multiuser_enabled'
  ) then
    raise exception 'invalid_feature';
  end if;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  execute format('select %I from public.plan_features where plan_code = $1', p_feature)
    into v_value using v_plan_code;

  return coalesce(v_value, false);
end;
$$;

-- Límite cuantitativo del plan vigente vs. consumo actual.
create or replace function public.check_plan_limit(p_workspace_id uuid, p_limit text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_max int;
  v_current int;
  v_included_users int;
  v_extra_price numeric;
begin
  if p_workspace_id <> public.current_workspace_id() and not public.is_support_admin() then
    raise exception 'forbidden';
  end if;

  if p_limit not in ('quotes_month', 'clients', 'users') then
    raise exception 'invalid_limit';
  end if;

  if public.is_super_admin() then
    return jsonb_build_object('allowed', true, 'current', 0, 'max', null);
  end if;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  if p_limit = 'quotes_month' then
    select max_quotes_month into v_max from public.plan_limits where plan_code = v_plan_code;
    select case when period_end >= now() then quotes_count else 0 end into v_current
      from public.subscription_usage where workspace_id = p_workspace_id;
    v_current := coalesce(v_current, 0);
    return jsonb_build_object('allowed', (v_max is null or v_current < v_max), 'current', v_current, 'max', v_max);
  end if;

  if p_limit = 'clients' then
    select max_clients into v_max from public.plan_limits where plan_code = v_plan_code;
    select count(*) into v_current from public.clients where workspace_id = p_workspace_id and deleted_at is null;
    return jsonb_build_object('allowed', (v_max is null or v_current < v_max), 'current', v_current, 'max', v_max);
  end if;

  -- p_limit = 'users': no bloquea; informa usuarios incluidos vs. adicionales facturables
  select included_users, extra_user_price into v_included_users, v_extra_price
    from public.plan_limits where plan_code = v_plan_code;
  select count(*) into v_current from public.profiles where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'allowed', true,
    'current', v_current,
    'max', null,
    'included_users', v_included_users,
    'extra_users', greatest(v_current - coalesce(v_included_users, 1), 0),
    'extra_user_price', v_extra_price
  );
end;
$$;

-- Estado integral de la suscripción del workspace (para banners/modales de upgrade).
create or replace function public.check_subscription_status(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_period_end timestamptz;
  v_cancel_at_period_end boolean;
  v_email_verified boolean;
begin
  if p_workspace_id <> public.current_workspace_id() and not public.is_support_admin() then
    raise exception 'forbidden';
  end if;

  select s.status, s.current_period_end, s.cancel_at_period_end
    into v_status, v_period_end, v_cancel_at_period_end
  from public.subscriptions s
  where s.workspace_id = p_workspace_id
  order by s.created_at desc
  limit 1;

  select bool_or(email_verified) into v_email_verified
    from public.profiles where workspace_id = p_workspace_id and role = 'owner';

  return jsonb_build_object(
    'status', coalesce(v_status, 'free'),
    'plan_code', public.get_effective_plan_code(p_workspace_id),
    'current_period_end', v_period_end,
    'cancel_at_period_end', coalesce(v_cancel_at_period_end, false),
    'email_verified', coalesce(v_email_verified, false),
    'in_grace', coalesce(v_status = 'past_due', false)
  );
end;
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_support_admin() to authenticated;
grant execute on function public.get_effective_plan_code(uuid) to authenticated;
grant execute on function public.check_feature_access(uuid, text) to authenticated;
grant execute on function public.check_plan_limit(uuid, text) to authenticated;
grant execute on function public.check_subscription_status(uuid) to authenticated;
