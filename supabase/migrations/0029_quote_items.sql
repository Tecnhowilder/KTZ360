-- ============================================================================
-- 0029 — quote_items (modelo relacional de ítems) — versión idempotente
-- ============================================================================

-- 1. Agregar snapshot_items a quotes
alter table public.quotes
  add column if not exists snapshot_items jsonb not null default '[]'::jsonb;

-- 2. Ampliar constraint de status (detecta el nombre real dinámicamente)
do $$
declare
  v_constraint text;
begin
  select con.conname into v_constraint
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relname = 'quotes'
    and con.contype = 'c'
    and con.conname ilike '%status%'
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.quotes drop constraint %I', v_constraint);
  end if;
end;
$$;

alter table public.quotes
  add constraint quotes_status_check
  check (status in ('Borrador','Enviada','Aprobada','Rechazada','Vencida','converted_to_order'));

-- 3. Tabla quote_items
create table if not exists public.quote_items (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.quotes(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  type            text not null default 'SERVICE'
                    check (type in ('PRODUCT','SERVICE','BUNDLE','MANUAL')),
  item_name       text not null,
  description     text,
  quantity        numeric(12,4) not null default 1,
  unit            text not null default 'und',
  unit_price      numeric(14,2) not null default 0,
  discount        numeric(5,2)  not null default 0,
  subtotal        numeric(14,2) not null default 0,
  sort_order      int           not null default 0,
  catalog_item_id uuid,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- Trigger idempotente: eliminar si ya existe, luego crear
drop trigger if exists trg_quote_items_updated_at on public.quote_items;
create trigger trg_quote_items_updated_at
  before update on public.quote_items
  for each row execute function public.set_updated_at();

create index if not exists idx_quote_items_quote     on public.quote_items(quote_id);
create index if not exists idx_quote_items_workspace on public.quote_items(workspace_id);

-- 4. RLS
alter table public.quote_items enable row level security;

-- Políticas idempotentes: eliminar si existen, luego crear
drop policy if exists "quote_items_select"      on public.quote_items;
drop policy if exists "quote_items_insert"      on public.quote_items;
drop policy if exists "quote_items_update"      on public.quote_items;
drop policy if exists "quote_items_delete"      on public.quote_items;
drop policy if exists "quote_items_support_all" on public.quote_items;

create policy "quote_items_select" on public.quote_items
  for select using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "quote_items_insert" on public.quote_items
  for insert with check (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "quote_items_update" on public.quote_items
  for update using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "quote_items_delete" on public.quote_items
  for delete using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "quote_items_support_all" on public.quote_items
  for all using (public.is_support_admin());
