-- KTZ360 — Bloqueo server-side de límites de plan (Zero Trust)
-- Complementa check_plan_limit(): aquí se garantiza que ningún insert puede
-- exceder el límite del plan vigente, sin importar lo que envíe el frontend.
-- No ejecutar automáticamente: pegar manualmente en el editor SQL de Supabase.

create or replace function public.enforce_quote_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_max int;
  v_current int;
begin
  if public.is_support_admin() then
    return new;
  end if;

  v_plan_code := public.get_effective_plan_code(new.workspace_id);
  select max_quotes_month into v_max from public.plan_limits where plan_code = v_plan_code;

  if v_max is null then
    return new;
  end if;

  select case when period_end >= now() then quotes_count else 0 end into v_current
    from public.subscription_usage where workspace_id = new.workspace_id;
  v_current := coalesce(v_current, 0);

  if v_current >= v_max then
    raise exception 'plan_limit_exceeded: quotes_month';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_quote_limit
  before insert on public.quotes
  for each row execute function public.enforce_quote_limit();

create or replace function public.enforce_client_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_max int;
  v_current int;
begin
  if public.is_support_admin() then
    return new;
  end if;

  v_plan_code := public.get_effective_plan_code(new.workspace_id);
  select max_clients into v_max from public.plan_limits where plan_code = v_plan_code;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_current from public.clients where workspace_id = new.workspace_id and deleted_at is null;

  if v_current >= v_max then
    raise exception 'plan_limit_exceeded: clients';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_client_limit
  before insert on public.clients
  for each row execute function public.enforce_client_limit();
