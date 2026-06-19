-- ============================================================================
-- 0034 — quote_revisions (historial de cambios en cotizaciones)
-- ============================================================================
-- Se registra cada vez que una cotización es editada por un usuario PRO/PREMIUM.
-- Permite auditoría y recovery de versiones anteriores.
-- ============================================================================

create table if not exists public.quote_revisions (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  edited_by    uuid references auth.users(id),
  edited_at    timestamptz not null default now(),
  -- Snapshot completo antes del cambio (para poder hacer rollback)
  previous_snapshot jsonb not null default '{}'::jsonb,
  -- Resumen de qué cambió (para mostrar en historial)
  changes_summary jsonb not null default '{}'::jsonb
);

create index if not exists idx_quote_revisions_quote on public.quote_revisions(quote_id);
create index if not exists idx_quote_revisions_workspace on public.quote_revisions(workspace_id);

-- RLS
alter table public.quote_revisions enable row level security;

create policy "quote_revisions_select" on public.quote_revisions
  for select using (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "quote_revisions_insert" on public.quote_revisions
  for insert with check (
    workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "quote_revisions_support" on public.quote_revisions
  for all using (public.is_support_admin());
