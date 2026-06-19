-- ============================================================================
-- 0030 — catalog_items (catálogo universal por workspace) — idempotente
-- ============================================================================

create table if not exists public.catalog_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid references auth.users(id),
  type          text not null default 'SERVICE'
                  check (type in ('PRODUCT','SERVICE','BUNDLE')),
  name          text not null,
  description   text,
  unit          text not null default 'und',
  price         numeric(14,2) not null default 0,
  favorite      boolean not null default false,
  use_count     int not null default 0,
  status        text not null default 'active' check (status in ('active','inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

drop trigger if exists trg_catalog_items_updated_at on public.catalog_items;
create trigger trg_catalog_items_updated_at
  before update on public.catalog_items
  for each row execute function public.set_updated_at();

create index if not exists idx_catalog_items_workspace on public.catalog_items(workspace_id)
  where deleted_at is null;
create index if not exists idx_catalog_items_favorite on public.catalog_items(workspace_id, favorite)
  where deleted_at is null and favorite = true;
create index if not exists idx_catalog_items_use_count on public.catalog_items(workspace_id, use_count desc)
  where deleted_at is null;

alter table public.catalog_items enable row level security;

drop policy if exists "catalog_items_select"      on public.catalog_items;
drop policy if exists "catalog_items_insert"      on public.catalog_items;
drop policy if exists "catalog_items_update"      on public.catalog_items;
drop policy if exists "catalog_items_delete"      on public.catalog_items;
drop policy if exists "catalog_items_support_all" on public.catalog_items;

create policy "catalog_items_select" on public.catalog_items
  for select using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "catalog_items_insert" on public.catalog_items
  for insert with check (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "catalog_items_update" on public.catalog_items
  for update using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "catalog_items_delete" on public.catalog_items
  for delete using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "catalog_items_support_all" on public.catalog_items
  for all using (public.is_support_admin());
