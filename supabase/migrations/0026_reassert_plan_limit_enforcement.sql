-- KTZ360 — Reasegura límites de plan (Zero Trust)
-- Re-crea de forma idempotente las funciones/triggers de límite y re-siembra
-- plan_limits, por si 0016/0017 no quedaron aplicados o quedaron incompletos.
-- Pegar manualmente en el editor SQL de Supabase.

-- ---------------------------------------------------------------------------
-- 1) Re-siembra plan_limits (no duplica, actualiza si ya existen)
-- ---------------------------------------------------------------------------
insert into public.plan_limits (plan_code, max_quotes_month, max_clients, included_users, extra_user_price, ai_credits_monthly)
values
  ('free',    10,   20,   1, 0,     0),
  ('pro',     null, null, 1, 0,     0),
  ('premium', null, null, 5, 11999, 100)
on conflict (plan_code) do update set
  max_quotes_month = excluded.max_quotes_month,
  max_clients = excluded.max_clients,
  included_users = excluded.included_users,
  extra_user_price = excluded.extra_user_price,
  ai_credits_monthly = excluded.ai_credits_monthly;

-- ---------------------------------------------------------------------------
-- 2) enforce_quote_limit() + trigger BEFORE INSERT en quotes
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_enforce_quote_limit on public.quotes;
create trigger trg_enforce_quote_limit
  before insert on public.quotes
  for each row execute function public.enforce_quote_limit();

-- ---------------------------------------------------------------------------
-- 3) enforce_client_limit() + trigger BEFORE INSERT en clients
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_enforce_client_limit on public.clients;
create trigger trg_enforce_client_limit
  before insert on public.clients
  for each row execute function public.enforce_client_limit();

-- ---------------------------------------------------------------------------
-- 4) increment_quote_usage() + trigger AFTER INSERT en quotes
--    (necesario para que enforce_quote_limit pueda contar el consumo del mes)
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_increment_quote_usage on public.quotes;
create trigger trg_increment_quote_usage
  after insert on public.quotes
  for each row execute function public.increment_quote_usage();
