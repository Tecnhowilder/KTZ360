-- ============================================================================
-- 0062 — integrations_schema: Arquitectura de Integraciones Sprint 11
-- ============================================================================
-- Arquitectura extensible — NO específica de ningún proveedor.
-- Providers iniciales: whatsapp | google_calendar | outlook_calendar
-- Preparados para Sprint 12: alegra | gmail | outlook_mail | drive | onedrive | teams
--
-- Decisiones aprobadas:
--   - Credenciales cifradas en Edge Function (ENCRYPTION_KEY secret)
--   - OAuth Callback via Edge Function (Zero Trust, PKCE)
--   - Eventos queued en integration_events, procesados por integration-worker
-- ============================================================================

-- ─── 1. oauth_states — estado temporal durante el flujo OAuth (PKCE) ─────────

create table if not exists public.oauth_states (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  provider       text        not null,
  state          text        not null unique,   -- CSRF protection
  code_verifier  text        not null,          -- PKCE S256
  nonce          text        not null,          -- replay protection
  redirect_to    text,                          -- URL post-auth en el frontend
  expires_at     timestamptz not null default now() + interval '10 minutes',
  created_at     timestamptz not null default now()
);

create index if not exists idx_oauth_states_state on public.oauth_states(state);

-- Auto-limpiar estados expirados
create or replace function public.cleanup_expired_oauth_states()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.oauth_states where expires_at < now();
$$;

-- RLS: solo workspace members gestionan sus estados OAuth
alter table public.oauth_states enable row level security;

create policy "workspace members manage oauth states"
  on public.oauth_states for all
  using (
    exists (
      select 1 from public.profiles
      where workspace_id = oauth_states.workspace_id and id = auth.uid() and status = 'active'
    )
  );

-- ─── 2. integrations — estado de integración por proveedor ────────────────────

create table if not exists public.integrations (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  provider       text        not null check (provider in (
    'whatsapp', 'google_calendar', 'outlook_calendar',
    'alegra', 'gmail', 'outlook_mail', 'drive', 'onedrive', 'teams'
  )),
  enabled        boolean     not null default false,
  status         text        not null default 'disconnected' check (status in (
    'connected', 'disconnected', 'pending', 'error'
  )),
  -- Configuración específica por proveedor (no sensible)
  config         jsonb       not null default '{}'::jsonb,
  connected_at   timestamptz,
  connected_by   uuid        references auth.users(id),
  last_sync_at   timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (workspace_id, provider)
);

create trigger trg_integrations_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

create index if not exists idx_integrations_workspace
  on public.integrations(workspace_id);

alter table public.integrations enable row level security;

create policy "workspace members select integrations"
  on public.integrations for select
  using (
    exists (select 1 from public.profiles where workspace_id = integrations.workspace_id and id = auth.uid())
  );

create policy "owner admin manage integrations"
  on public.integrations for all
  using (
    exists (
      select 1 from public.profiles
      where workspace_id = integrations.workspace_id and id = auth.uid()
        and role in ('owner','admin','super_admin','support_admin') and status = 'active'
    )
  );

-- ─── 3. integration_credentials — tokens OAuth cifrados ───────────────────────
-- Los tokens NUNCA se exponen al frontend.
-- Solo la Edge Function (con ENCRYPTION_KEY secret) puede descifrarlos.

create table if not exists public.integration_credentials (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  provider        text        not null,
  encrypted_data  text        not null,    -- AES-256-GCM: {access_token, refresh_token, scope, ...}
  encryption_iv   text        not null,    -- initialization vector (base64)
  expires_at      timestamptz,             -- access_token expiry (no el refresh)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (workspace_id, provider)
);

create trigger trg_integration_credentials_updated_at
  before update on public.integration_credentials
  for each row execute function public.set_updated_at();

-- CRÍTICO: RLS muy restrictivo — NUNCA exponer al frontend
alter table public.integration_credentials enable row level security;

-- Frontend no puede leer ni escribir directamente. Solo via Edge Functions (service_role).
create policy "deny_all_direct_access_credentials"
  on public.integration_credentials
  using (false);

-- ─── 4. integration_events — cola de eventos para procesamiento ───────────────
-- Trigger → queue event → Edge Function worker → process → update status

create table if not exists public.integration_events (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  provider        text        not null,
  event_type      text        not null check (event_type in (
    -- WhatsApp events
    'quote_sent', 'followup', 'order_created', 'work_order_scheduled',
    'work_order_completed', 'review_request',
    -- Calendar events
    'calendar_create', 'calendar_update', 'calendar_delete'
  )),
  payload         jsonb       not null default '{}'::jsonb,
  status          text        not null default 'pending' check (status in (
    'pending', 'processing', 'processed', 'failed', 'skipped'
  )),
  retries         int         not null default 0,
  max_retries     int         not null default 3,
  last_error      text,
  result          jsonb,                   -- URL de WhatsApp, calendar_event_id, etc.
  created_at      timestamptz not null default now(),
  processed_at    timestamptz,
  next_retry_at   timestamptz
);

create index if not exists idx_integration_events_pending
  on public.integration_events(workspace_id, provider, status, next_retry_at)
  where status in ('pending','failed') and retries < max_retries;

create index if not exists idx_integration_events_workspace
  on public.integration_events(workspace_id, created_at desc);

alter table public.integration_events enable row level security;

create policy "workspace members select integration_events"
  on public.integration_events for select
  using (
    exists (select 1 from public.profiles where workspace_id = integration_events.workspace_id and id = auth.uid())
  );

-- INSERT solo vía RPC (security definer)
create policy "service inserts integration_events"
  on public.integration_events for insert
  with check (true);  -- validado por RPCs

-- UPDATE solo via service_role (Edge Functions)
create policy "service_role updates integration_events"
  on public.integration_events for update
  using (auth.role() = 'service_role');

comment on table public.integrations            is 'Sprint 11: estado de integraciones por workspace/proveedor.';
comment on table public.integration_credentials is 'Sprint 11: tokens OAuth cifrados con AES-256-GCM. Solo accesibles vía service_role.';
comment on table public.integration_events      is 'Sprint 11: cola de eventos para procesamiento por integration-worker.';
comment on table public.oauth_states            is 'Sprint 11: estados PKCE temporales (10 min) para flujo OAuth.';
