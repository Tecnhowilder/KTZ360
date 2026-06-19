-- ============================================================================
-- 0032 — clients v2 (campos extendidos + CRM básico)
-- ============================================================================
-- Agrega: dirección, barrio, ciudad, número de documento.
-- CRM: total_quotes, total_approved, total_value, last_activity_at.
-- Trigger para mantener métricas actualizadas automáticamente.
-- ============================================================================

-- 1. Campos de contacto extendidos
alter table public.clients
  add column if not exists document_number text,
  add column if not exists address         text,
  add column if not exists neighborhood    text,
  add column if not exists city            text;

-- 2. Campos CRM (métricas comerciales por cliente)
alter table public.clients
  add column if not exists total_quotes    int not null default 0,
  add column if not exists total_approved  int not null default 0,
  add column if not exists total_value     numeric(16,2) not null default 0,
  add column if not exists last_activity_at timestamptz;

-- 3. Índice para búsqueda multi-campo (phone, email, document_number)
create index if not exists idx_clients_phone    on public.clients(phone)    where deleted_at is null;
create index if not exists idx_clients_email    on public.clients(email)    where deleted_at is null;
create index if not exists idx_clients_document on public.clients(document_number) where deleted_at is null;
create index if not exists idx_clients_city     on public.clients(city)     where deleted_at is null;

-- 4. Función de actualización de métricas CRM
create or replace function public.refresh_client_metrics(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_quotes   int;
  v_total_approved int;
  v_total_value    numeric(16,2);
  v_last_activity  timestamptz;
begin
  select
    count(*),
    count(*) filter (where status = 'Aprobada'),
    coalesce(sum((calc_snapshot->>'total')::numeric) filter (where status = 'Aprobada'), 0),
    max(updated_at)
  into v_total_quotes, v_total_approved, v_total_value, v_last_activity
  from public.quotes
  where client_id = p_client_id
    and deleted_at is null;

  update public.clients
  set
    total_quotes   = coalesce(v_total_quotes, 0),
    total_approved = coalesce(v_total_approved, 0),
    total_value    = coalesce(v_total_value, 0),
    last_activity_at = v_last_activity,
    updated_at     = now()
  where id = p_client_id;
end;
$$;

-- 5. Trigger en quotes para mantener métricas actualizadas
create or replace function public.trg_quotes_update_client_metrics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Actualizar cliente del registro nuevo/modificado
  if new.client_id is not null then
    perform public.refresh_client_metrics(new.client_id);
  end if;
  -- Si cambió de cliente, actualizar el anterior también
  if tg_op = 'UPDATE' and old.client_id is not null and old.client_id <> coalesce(new.client_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    perform public.refresh_client_metrics(old.client_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_client_metrics on public.quotes;
create trigger trg_quotes_client_metrics
  after insert or update of status, client_id, calc_snapshot, deleted_at
  on public.quotes
  for each row execute function public.trg_quotes_update_client_metrics();
