-- ============================================================================
-- 0034 — quote_views: tracking de apertura de cotizaciones por clientes
-- ============================================================================

create table if not exists public.quote_views (
  id           uuid        primary key default gen_random_uuid(),
  quote_id     uuid        not null references public.quotes(id) on delete cascade,
  opened_at    timestamptz not null default now(),
  ip           text,
  city         text,
  country      text,
  device       text,       -- 'mobile' | 'desktop' | 'tablet'
  browser      text,
  user_agent   text
);

-- Índices para performance en dashboard
create index if not exists quote_views_quote_id_idx  on public.quote_views(quote_id);
create index if not exists quote_views_opened_at_idx on public.quote_views(opened_at desc);

-- RLS
alter table public.quote_views enable row level security;

-- Cualquiera puede insertar (portal público sin auth)
create policy "public can insert quote_views"
  on public.quote_views for insert
  with check (true);

-- Solo miembros del workspace pueden leer las vistas de sus cotizaciones
-- (workspace_id en profiles, no existe workspace_members en este schema)
create policy "workspace members can read quote_views"
  on public.quote_views for select
  using (
    exists (
      select 1
      from   public.quotes q
      join   public.profiles p on p.workspace_id = q.workspace_id
      where  q.id = quote_views.quote_id
        and  p.id = auth.uid()
    )
  );
