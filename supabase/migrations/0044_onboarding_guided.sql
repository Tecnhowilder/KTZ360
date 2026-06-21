-- ============================================================================
-- 0044 — onboarding_guided: Sistema de activación guiada Sprint 3
-- ============================================================================

-- 1. Nuevas columnas en profiles para tracking de onboarding
alter table public.profiles
  add column if not exists onboarding_seen           boolean      not null default false,
  add column if not exists onboarding_card_collapsed boolean      not null default false,
  add column if not exists onboarding_card_hidden_at timestamptz;

-- Los usuarios existentes ya completaron el onboarding → no mostrarles la tarjeta
update public.profiles set onboarding_seen = true;

-- 2. RPC: mark_onboarding_seen — llamada al completar el onboarding de 3 pantallas
create or replace function public.mark_onboarding_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  update public.profiles
  set onboarding_seen = true
  where id = auth.uid();
end;
$$;

grant execute on function public.mark_onboarding_seen() to authenticated;

-- 3. RPC: set_onboarding_card_collapsed — persiste estado collapsed de la tarjeta
create or replace function public.set_onboarding_card_collapsed(p_collapsed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  update public.profiles
  set onboarding_card_collapsed = p_collapsed
  where id = auth.uid();
end;
$$;

grant execute on function public.set_onboarding_card_collapsed(boolean) to authenticated;

-- 4. RPC: hide_onboarding_card — oculta la tarjeta permanentemente
create or replace function public.hide_onboarding_card()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  update public.profiles
  set onboarding_card_hidden_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.hide_onboarding_card() to authenticated;

-- 5. RPC: get_onboarding_progress — fuente única de verdad del progreso
--    ZERO TRUST: workspace_id se obtiene del JWT, nunca del frontend
create or replace function public.get_onboarding_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid;
  v_workspace_id   uuid;
  v_collapsed      boolean;
  v_hidden_at      timestamptz;
  v_company_done   boolean;
  v_client_done    boolean;
  v_service_done   boolean;
  v_quote_done     boolean;
  v_steps_done     int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select workspace_id, onboarding_card_collapsed, onboarding_card_hidden_at
  into v_workspace_id, v_collapsed, v_hidden_at
  from public.profiles
  where id = v_user_id;

  -- Paso 1: Empresa — nombre + teléfono + ciudad completos
  select exists(
    select 1 from public.company_settings
    where workspace_id = v_workspace_id
      and name  is not null and trim(name)  <> ''
      and phone is not null and trim(phone) <> ''
      and city  is not null and trim(city)  <> ''
  ) into v_company_done;

  -- Paso 2: Al menos 1 cliente (no eliminado)
  select exists(
    select 1 from public.clients
    where workspace_id = v_workspace_id
      and deleted_at is null
  ) into v_client_done;

  -- Paso 3: Al menos 1 material/servicio (no eliminado)
  select exists(
    select 1 from public.materials
    where workspace_id = v_workspace_id
      and deleted_at is null
  ) into v_service_done;

  -- Paso 4: Al menos 1 cotización creada (no eliminada)
  select exists(
    select 1 from public.quotes
    where workspace_id = v_workspace_id
      and deleted_at is null
  ) into v_quote_done;

  v_steps_done := (
    v_company_done::int +
    v_client_done::int  +
    v_service_done::int +
    v_quote_done::int
  );

  return jsonb_build_object(
    'progress',          v_steps_done * 25,
    'company_completed', v_company_done,
    'client_completed',  v_client_done,
    'service_completed', v_service_done,
    'quote_completed',   v_quote_done,
    'reward_unlocked',   (v_steps_done = 4),
    'card_collapsed',    v_collapsed,
    'card_hidden',       (v_hidden_at is not null)
  );
end;
$$;

grant execute on function public.get_onboarding_progress() to authenticated;

-- Comments
comment on function public.get_onboarding_progress       is 'Progreso de activación guiada Sprint 3. ZERO TRUST: workspace desde JWT.';
comment on function public.mark_onboarding_seen          is 'Marca onboarding de 3 pantallas como visto. Sprint 3.';
comment on function public.set_onboarding_card_collapsed is 'Persiste estado collapsed de tarjeta de activación. Sprint 3.';
comment on function public.hide_onboarding_card          is 'Oculta permanentemente la tarjeta de activación. Sprint 3.';
