-- ============================================================================
-- 0050 — orders_schema: Pedidos + Órdenes de Trabajo + Bitácora (Sprint 6)
-- Arquitectura Zero Trust, PREMIUM-only, compatible con GPS/Evidencias Sprint 7+
-- R2: assigned_to = UUID (user_id), no texto
-- R4: order_snapshot = JSONB congelado en el momento de creación
-- R5: soft delete only, restrict si tiene pedido activo
-- ============================================================================

-- ─── Contador de números por workspace ───────────────────────────────────────

create table if not exists public.workspace_order_counters (
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  last_order_number      int  not null default 0,
  last_work_order_number int  not null default 0,
  primary key (workspace_id)
);

create or replace function public.next_order_number(p_workspace_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.workspace_order_counters (workspace_id, last_order_number)
  values (p_workspace_id, 1)
  on conflict (workspace_id)
  do update set last_order_number = workspace_order_counters.last_order_number + 1
  returning last_order_number into v_n;
  return 'ORD-' || lpad(v_n::text, 5, '0');
end;
$$;

create or replace function public.next_work_order_number(p_workspace_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.workspace_order_counters (workspace_id, last_work_order_number)
  values (p_workspace_id, 1)
  on conflict (workspace_id)
  do update set last_work_order_number = workspace_order_counters.last_work_order_number + 1
  returning last_work_order_number into v_n;
  return 'OT-' || lpad(v_n::text, 5, '0');
end;
$$;

-- ─── TABLA: orders ────────────────────────────────────────────────────────────

create table if not exists public.orders (
  id              uuid          primary key default gen_random_uuid(),
  workspace_id    uuid          not null references public.workspaces(id) on delete restrict,
  quote_id        uuid          references public.quotes(id) on delete restrict,  -- R5
  client_id       uuid          references public.clients(id) on delete restrict,
  created_by      uuid          not null references auth.users(id),
  assigned_to     uuid          references auth.users(id),  -- R2: UUID
  order_number    text          not null default '',
  title           text          not null,
  description     text,
  status          text          not null default 'pendiente' check (status in (
    'pendiente','programado','en_ejecucion','pausado','finalizado','cancelado'
  )),
  order_snapshot  jsonb         not null default '{}'::jsonb,  -- R4: congelado
  total_amount    numeric(14,2) not null default 0,
  scheduled_at    timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  notes           text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  deleted_at      timestamptz   -- R5: soft delete only
);

create or replace function public.orders_set_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := public.next_order_number(new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger trg_orders_set_number
  before insert on public.orders
  for each row execute function public.orders_set_number();

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index idx_orders_workspace on public.orders(workspace_id) where deleted_at is null;
create index idx_orders_quote     on public.orders(quote_id);
create index idx_orders_client    on public.orders(client_id);
create index idx_orders_status    on public.orders(workspace_id, status) where deleted_at is null;
create index idx_orders_assigned  on public.orders(assigned_to) where deleted_at is null;
create unique index idx_orders_number on public.orders(workspace_id, order_number);

-- ─── TABLA: work_orders ───────────────────────────────────────────────────────

create table if not exists public.work_orders (
  id                uuid    primary key default gen_random_uuid(),
  workspace_id      uuid    not null references public.workspaces(id) on delete restrict,
  order_id          uuid    not null references public.orders(id) on delete cascade,
  created_by        uuid    not null references auth.users(id),
  assigned_to       uuid    references auth.users(id),  -- R2: UUID
  work_order_number text    not null default '',
  title             text    not null,
  description       text,
  status            text    not null default 'pendiente' check (status in (
    'pendiente','asignada','en_progreso','pausada','finalizada','cancelada'
  )),
  priority          text    not null default 'media' check (priority in (
    'baja','media','alta','urgente'
  )),
  sequence_num      int     not null default 1,
  scheduled_at      timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.work_orders_set_number()
returns trigger language plpgsql as $$
begin
  if new.work_order_number is null or new.work_order_number = '' then
    new.work_order_number := public.next_work_order_number(new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger trg_work_orders_set_number
  before insert on public.work_orders
  for each row execute function public.work_orders_set_number();

create trigger trg_work_orders_updated_at
  before update on public.work_orders
  for each row execute function public.set_updated_at();

create index idx_work_orders_workspace on public.work_orders(workspace_id);
create index idx_work_orders_order     on public.work_orders(order_id);
create index idx_work_orders_status    on public.work_orders(workspace_id, status);
create index idx_work_orders_assigned  on public.work_orders(assigned_to);
create unique index idx_work_orders_number on public.work_orders(workspace_id, work_order_number);

-- ─── TABLA: work_logs (Bitácora operativa) ────────────────────────────────────

create table if not exists public.work_logs (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  order_id      uuid        references public.orders(id) on delete cascade,
  work_order_id uuid        references public.work_orders(id) on delete cascade,
  user_id       uuid        not null references auth.users(id),
  event_type    text        not null check (event_type in (
    'order_created','order_status_changed','order_assigned',
    'work_order_created','work_order_status_changed','work_order_assigned',
    'comment','completed'
  )),
  from_status   text,
  to_status     text,
  note          text,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index idx_work_logs_order      on public.work_logs(order_id, created_at desc);
create index idx_work_logs_wo         on public.work_logs(work_order_id, created_at desc);
create index idx_work_logs_workspace  on public.work_logs(workspace_id, created_at desc);

-- ─── RLS — orders ─────────────────────────────────────────────────────────────

alter table public.orders enable row level security;

create policy "members select orders"
  on public.orders for select using (
    exists (select 1 from public.profiles where workspace_id = orders.workspace_id and id = auth.uid())
  );

create policy "members insert orders"
  on public.orders for insert with check (
    exists (select 1 from public.profiles where workspace_id = orders.workspace_id and id = auth.uid())
    and created_by = auth.uid()
  );

create policy "members update orders"
  on public.orders for update using (
    exists (select 1 from public.profiles where workspace_id = orders.workspace_id and id = auth.uid())
  );

-- DELETE solo via service_role (soft delete via RPC)
create policy "service_role delete orders"
  on public.orders for delete using (auth.role() = 'service_role');

-- ─── RLS — work_orders ───────────────────────────────────────────────────────

alter table public.work_orders enable row level security;

create policy "members select work_orders"
  on public.work_orders for select using (
    exists (select 1 from public.profiles where workspace_id = work_orders.workspace_id and id = auth.uid())
  );

create policy "members insert work_orders"
  on public.work_orders for insert with check (
    exists (select 1 from public.profiles where workspace_id = work_orders.workspace_id and id = auth.uid())
    and created_by = auth.uid()
  );

create policy "members update work_orders"
  on public.work_orders for update using (
    exists (select 1 from public.profiles where workspace_id = work_orders.workspace_id and id = auth.uid())
  );

-- ─── RLS — work_logs ─────────────────────────────────────────────────────────

alter table public.work_logs enable row level security;

create policy "members select work_logs"
  on public.work_logs for select using (
    exists (select 1 from public.profiles where workspace_id = work_logs.workspace_id and id = auth.uid())
  );

create policy "members insert work_logs"
  on public.work_logs for insert with check (
    exists (select 1 from public.profiles where workspace_id = work_logs.workspace_id and id = auth.uid())
    and user_id = auth.uid()
  );

create policy "service_role delete work_logs"
  on public.work_logs for delete using (auth.role() = 'service_role');

-- ─── RLS — workspace_order_counters ──────────────────────────────────────────

alter table public.workspace_order_counters enable row level security;

create policy "service_role manages counters"
  on public.workspace_order_counters
  using (auth.role() = 'service_role');

-- ─── Comments ─────────────────────────────────────────────────────────────────

comment on table  public.orders                    is 'Pedidos operativos (Sprint 6). Requiere PREMIUM.';
comment on table  public.work_orders               is 'Órdenes de Trabajo: subtareas de un pedido (Sprint 6).';
comment on table  public.work_logs                 is 'Bitácora operativa: quién/qué/cuándo/de→a (Sprint 6).';
comment on column public.orders.order_snapshot     is 'R4: Snapshot congelado de la cotización al crear el pedido.';
comment on column public.orders.assigned_to        is 'R2: UUID del usuario asignado (owner/admin/supervisor/operario).';
comment on column public.orders.deleted_at         is 'R5: Soft delete solamente. No se puede eliminar con pedidos activos.';
