-- ============================================================================
-- 0065 — integrations_s12_schema: Sprint 12 — Integraciones Empresariales
-- ============================================================================
-- Decisiones aprobadas:
--   1. DROP CHECK constraint en event_type → validación en RPC/worker (flexible)
--   2. integration_invoices — trazabilidad de facturas (Shelwi nunca depende de Alegra solo)
--   3. integration_entity_refs — IDs externos genéricos (calendar, invoice, file, etc.)
--   4. communication_log — historial unificado WhatsApp + Gmail + Outlook Mail
-- ============================================================================

-- ─── 1. Eliminar CHECK constraint en integration_events.event_type ─────────────
-- Razón: Sprint 13+ agregarán tipos nuevos. La validación ocurre en RPC + worker.

alter table public.integration_events
  drop constraint if exists integration_events_event_type_check;

-- event_type permanece como text not null — sin constraint de DB
comment on column public.integration_events.event_type
  is 'Tipo de evento. Sin CHECK constraint (validado en RPC y worker para flexibilidad en sprints futuros).';

-- ─── 2. integration_invoices — trazabilidad de facturas ──────────────────────
-- Requerimiento especial: Shelwi conserva su propia trazabilidad.
-- Si Alegra falla, Shelwi puede mostrar número, estado, valor y cliente.

create table if not exists public.integration_invoices (
  id                  uuid        primary key default gen_random_uuid(),
  workspace_id        uuid        not null references public.workspaces(id) on delete cascade,
  provider            text        not null default 'alegra',
  order_id            uuid        references public.orders(id)  on delete set null,
  client_id           uuid        references public.clients(id) on delete set null,
  external_invoice_id text        not null,
  invoice_number      text,
  invoice_status      text        not null default 'draft',   -- draft|issued|paid|void|cancelled
  total               numeric(14,2) not null default 0,
  currency            text        not null default 'COP',
  issued_at           timestamptz,
  paid_at             timestamptz,
  metadata            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_integration_invoices_updated_at
  before update on public.integration_invoices
  for each row execute function public.set_updated_at();

create index if not exists idx_integration_invoices_workspace
  on public.integration_invoices(workspace_id, created_at desc);
create index if not exists idx_integration_invoices_order
  on public.integration_invoices(order_id);
create index if not exists idx_integration_invoices_client
  on public.integration_invoices(client_id);
create unique index if not exists uq_integration_invoices_external
  on public.integration_invoices(workspace_id, provider, external_invoice_id);

alter table public.integration_invoices enable row level security;

create policy "workspace members select invoices"
  on public.integration_invoices for select
  using (
    exists (select 1 from public.profiles where workspace_id = integration_invoices.workspace_id and id = auth.uid())
  );

create policy "service manages invoices"
  on public.integration_invoices for all
  using (
    exists (select 1 from public.profiles where workspace_id = integration_invoices.workspace_id and id = auth.uid())
  );

-- ─── 3. integration_entity_refs — IDs externos genéricos ─────────────────────
-- Una sola tabla para: calendar_event_id, alegra_invoice_id, drive_file_id, etc.
-- Evita contaminar orders/work_orders/quotes con columnas de providers específicos.

create table if not exists public.integration_entity_refs (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  entity_type  text        not null,   -- 'order' | 'work_order' | 'quote' | 'client' | 'seguimiento' | 'recordatorio'
  entity_id    uuid        not null,
  provider     text        not null,   -- 'google_calendar' | 'outlook_calendar' | 'alegra' | 'drive' | ...
  external_id  text        not null,   -- calendar_event_id, invoice_id, file_id, etc.
  external_url text,                   -- htmlLink, webLink, etc.
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (workspace_id, entity_type, entity_id, provider)
);

create trigger trg_entity_refs_updated_at
  before update on public.integration_entity_refs
  for each row execute function public.set_updated_at();

create index if not exists idx_entity_refs_entity
  on public.integration_entity_refs(entity_type, entity_id);
create index if not exists idx_entity_refs_workspace
  on public.integration_entity_refs(workspace_id, provider);

alter table public.integration_entity_refs enable row level security;

create policy "workspace members manage entity refs"
  on public.integration_entity_refs for all
  using (
    exists (select 1 from public.profiles where workspace_id = integration_entity_refs.workspace_id and id = auth.uid())
  );

-- ─── 4. communication_log — historial unificado de comunicaciones ─────────────
-- Separado de integration_events (infraestructura).
-- communication_log es NEGOCIO: qué, a quién, cuándo, con qué resultado.

create table if not exists public.communication_log (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  entity_type     text,       -- 'quote' | 'client' | 'order' | 'work_order'
  entity_id       uuid,
  provider        text        not null,  -- 'whatsapp' | 'gmail' | 'outlook_mail'
  channel         text        not null,  -- 'whatsapp' | 'email'
  recipient       text,                  -- email o teléfono
  subject         text,                  -- asunto (para email)
  content_preview text,                  -- primeros 200 chars del mensaje
  status          text        not null default 'generated' check (status in (
    'generated',   -- WhatsApp URL generada (manual)
    'sent',        -- Email enviado via API
    'delivered',   -- Confirmación de entrega
    'failed'       -- Error al enviar
  )),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  failed_at       timestamptz,
  error_message   text,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_communication_log_workspace
  on public.communication_log(workspace_id, created_at desc);
create index if not exists idx_communication_log_entity
  on public.communication_log(entity_type, entity_id);
create index if not exists idx_communication_log_provider
  on public.communication_log(workspace_id, provider, created_at desc);

alter table public.communication_log enable row level security;

create policy "workspace members select comm log"
  on public.communication_log for select
  using (
    exists (select 1 from public.profiles where workspace_id = communication_log.workspace_id and id = auth.uid())
  );

create policy "service inserts comm log"
  on public.communication_log for insert
  with check (true);  -- validado por RPCs

comment on table public.integration_invoices    is 'Sprint 12: trazabilidad de facturas. Shelwi conserva su copia independiente de Alegra.';
comment on table public.integration_entity_refs is 'Sprint 12: IDs externos genéricos (calendar_event_id, alegra_invoice_id, etc.).';
comment on table public.communication_log       is 'Sprint 12: historial unificado de comunicaciones (WhatsApp + Gmail + Outlook Mail).';
