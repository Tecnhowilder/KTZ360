-- ============================================================================
-- 0059 — portal_schema: Portal del Cliente Sprint 10
-- ============================================================================
-- Fase 1: Correcciones críticas + nuevo schema del portal.
--
-- FUENTE DE VERDAD (documentada):
--   - quote_events → lógica comercial (proposal_opened, accepted, rejected...)
--   - quote_views  → analítica técnica (device, city, browser, apertura)
--   - Las notificaciones de apertura vienen SOLO del trigger trg_quote_views_crm
--     (Sprint 4). El frontend NO genera notificaciones.
-- ============================================================================

-- ─── FIX 1: get_public_quote — validar expiración + revocación ───────────────
-- BUG ACTIVO: la función actual no valida expires_at → token vencido = acceso libre

create or replace function public.get_public_quote(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'workspace_id' - 'created_by',
    'client', to_jsonb(c) - 'workspace_id' - 'created_by',
    'company', to_jsonb(cs) - 'workspace_id',
    'consent_status', (
      select status from public.client_consents
      where client_id = q.client_id
      order by created_at desc limit 1
    ),
    'consent_accepted_at', (
      select accepted_at from public.client_consents
      where client_id = q.client_id and status = 'accepted'
      order by created_at desc limit 1
    ),
    'pdf_tier', (
      select pf.pdf_tier from public.plan_features pf
      where pf.plan_code = public.get_effective_plan_code(q.workspace_id)
    ),
    'custom_qr_enabled', (
      select pf.custom_qr_enabled from public.plan_features pf
      where pf.plan_code = public.get_effective_plan_code(q.workspace_id)
    )
  ) into result
  from public.quote_access_tokens t
  join public.quotes q on q.id = t.quote_id and q.deleted_at is null
  left join public.clients c on c.id = q.client_id
  left join public.company_settings cs on cs.workspace_id = q.workspace_id
  where t.token = p_token
    and t.expires_at > now();  -- ← FIX: validar expiración

  if result is null then
    raise exception 'token_expired_or_not_found';
  end if;

  return result;
end;
$$;

-- ─── FIX 2: evidence_files — campo visible_to_client ─────────────────────────
-- Default false: nada visible al cliente por defecto (Zero Trust)

alter table public.evidence_files
  add column if not exists visible_to_client boolean not null default false;

comment on column public.evidence_files.visible_to_client
  is 'Si true, el cliente puede ver esta evidencia en su portal. Default: false (privado).';

-- ─── FIX 3: work_logs — campo visible_to_client ──────────────────────────────

alter table public.work_logs
  add column if not exists visible_to_client boolean not null default false;

comment on column public.work_logs.visible_to_client
  is 'Si true, el comentario/evento es visible al cliente en el portal.';

-- ─── Fase 2: Portal config en company_settings ───────────────────────────────

alter table public.company_settings
  add column if not exists portal_enabled          boolean not null default true,
  add column if not exists portal_show_evidences   boolean not null default false,
  add column if not exists portal_show_responsible boolean not null default true,
  add column if not exists portal_show_comments    boolean not null default false,
  add column if not exists portal_show_timeline    boolean not null default true;

comment on column public.company_settings.portal_enabled          is 'Habilita el portal del cliente para esta empresa';
comment on column public.company_settings.portal_show_evidences   is 'Mostrar evidencias (visible_to_client=true) en el portal';
comment on column public.company_settings.portal_show_responsible is 'Mostrar nombre del responsable en pedidos/OTs';
comment on column public.company_settings.portal_show_comments    is 'Mostrar comentarios de bitácora (visible_to_client=true)';
comment on column public.company_settings.portal_show_timeline    is 'Mostrar timeline de eventos en el portal';

-- ─── Fase 2: client_portal_tokens ────────────────────────────────────────────
-- 1 token activo por cliente por workspace. 90 días. Revocable. Auditable.

create table if not exists public.client_portal_tokens (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  client_id      uuid        not null references public.clients(id) on delete cascade,
  token          uuid        not null unique default gen_random_uuid(),
  created_by     uuid        references auth.users(id),
  expires_at     timestamptz not null default now() + interval '90 days',
  revoked_at     timestamptz,
  last_access_at timestamptz,
  created_at     timestamptz not null default now(),

  -- Solo un token activo por cliente por workspace
  unique (workspace_id, client_id)
);

create index if not exists idx_client_portal_tokens_token
  on public.client_portal_tokens(token)
  where revoked_at is null;

create index if not exists idx_client_portal_tokens_workspace
  on public.client_portal_tokens(workspace_id, client_id);

-- RLS: solo workspace members pueden gestionar tokens
alter table public.client_portal_tokens enable row level security;

create policy "workspace members manage portal tokens"
  on public.client_portal_tokens for all
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = client_portal_tokens.workspace_id
        and p.id = auth.uid()
        and p.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = client_portal_tokens.workspace_id
        and p.id = auth.uid()
        and p.status = 'active'
    )
  );

-- ─── Fase 2: portal_access_log ───────────────────────────────────────────────

create table if not exists public.portal_access_log (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  client_id    uuid        references public.clients(id) on delete set null,
  token_id     uuid        references public.client_portal_tokens(id) on delete set null,
  ip           text,
  user_agent   text,
  action       text        not null check (action in (
    'portal_opened', 'quote_viewed', 'order_viewed',
    'ot_viewed', 'evidence_viewed', 'timeline_viewed'
  )),
  entity_id    uuid,       -- ID de la entidad vista (quote_id, order_id, etc.)
  created_at   timestamptz not null default now()
);

create index if not exists idx_portal_access_log_workspace
  on public.portal_access_log(workspace_id, created_at desc);
create index if not exists idx_portal_access_log_client
  on public.portal_access_log(client_id, created_at desc);

-- RLS: workspace members pueden leer (para analítica)
alter table public.portal_access_log enable row level security;

create policy "workspace members read portal logs"
  on public.portal_access_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = portal_access_log.workspace_id
        and p.id = auth.uid()
    )
  );

-- INSERT solo vía RPCs security definer
create policy "service inserts portal logs"
  on public.portal_access_log for insert
  with check (true);  -- validado en la RPC

comment on table public.client_portal_tokens is 'Sprint 10: tokens de acceso al portal del cliente. 1 por cliente por workspace. 90 días.';
comment on table public.portal_access_log    is 'Sprint 10: log de acceso al portal del cliente para analítica.';
