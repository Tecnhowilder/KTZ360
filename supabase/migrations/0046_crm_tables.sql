-- ============================================================================
-- 0046 — crm_tables: seguimientos, recordatorios, client_timeline_events
-- ============================================================================

-- ============================================================================
-- Seguimientos comerciales (llamadas, WhatsApp, correos, visitas, etc.)
-- ============================================================================

create table if not exists public.seguimientos (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  quote_id     uuid        references public.quotes(id) on delete set null,
  client_id    uuid        references public.clients(id) on delete set null,
  created_by   uuid        not null references auth.users(id),
  type         text        not null check (type in (
    'llamada', 'whatsapp', 'correo', 'visita', 'reunion', 'nota'
  )),
  resultado    text,       -- 'contactado'|'no_contesto'|'interesado'|'no_interesado'|'reprogramar'
  comentario   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_seguimientos_updated_at
  before update on public.seguimientos
  for each row execute function public.set_updated_at();

create index if not exists idx_seguimientos_workspace
  on public.seguimientos(workspace_id, created_at desc);
create index if not exists idx_seguimientos_quote
  on public.seguimientos(quote_id);
create index if not exists idx_seguimientos_client
  on public.seguimientos(client_id);

-- RLS seguimientos
alter table public.seguimientos enable row level security;

create policy "workspace members can select seguimientos"
  on public.seguimientos for select
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = seguimientos.workspace_id
        and p.id = auth.uid()
    )
  );

create policy "workspace members can insert seguimientos"
  on public.seguimientos for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = seguimientos.workspace_id
        and p.id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy "creator can update seguimientos"
  on public.seguimientos for update
  using (created_by = auth.uid());

create policy "owner admin can delete seguimientos"
  on public.seguimientos for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = seguimientos.workspace_id
        and p.id = auth.uid()
        and p.role in ('owner', 'admin', 'super_admin', 'support_admin')
    )
  );

-- ============================================================================
-- Recordatorios
-- ============================================================================

create table if not exists public.recordatorios (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  created_by   uuid        not null references auth.users(id),
  quote_id     uuid        references public.quotes(id) on delete cascade,
  client_id    uuid        references public.clients(id) on delete set null,
  scheduled_at timestamptz not null,
  type         text        not null default 'llamada' check (type in (
    'llamada', 'whatsapp', 'correo', 'visita', 'reunion', 'nota'
  )),
  note         text,
  status       text        not null default 'pendiente' check (status in (
    'pendiente', 'completado', 'cancelado'
  )),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_recordatorios_updated_at
  before update on public.recordatorios
  for each row execute function public.set_updated_at();

create index if not exists idx_recordatorios_workspace
  on public.recordatorios(workspace_id, scheduled_at)
  where status = 'pendiente';
create index if not exists idx_recordatorios_quote
  on public.recordatorios(quote_id);
create index if not exists idx_recordatorios_client
  on public.recordatorios(client_id);

-- RLS recordatorios
alter table public.recordatorios enable row level security;

create policy "workspace members can select recordatorios"
  on public.recordatorios for select
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = recordatorios.workspace_id
        and p.id = auth.uid()
    )
  );

create policy "workspace members can insert recordatorios"
  on public.recordatorios for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = recordatorios.workspace_id
        and p.id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy "creator can update recordatorios"
  on public.recordatorios for update
  using (created_by = auth.uid());

create policy "owner admin can delete recordatorios"
  on public.recordatorios for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = recordatorios.workspace_id
        and p.id = auth.uid()
        and p.role in ('owner', 'admin', 'super_admin', 'support_admin')
    )
  );

-- ============================================================================
-- Timeline de eventos comerciales por cliente
-- ============================================================================

create table if not exists public.client_timeline_events (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  client_id       uuid        not null references public.clients(id) on delete cascade,
  quote_id        uuid        references public.quotes(id) on delete set null,
  seguimiento_id  uuid        references public.seguimientos(id) on delete set null,
  recordatorio_id uuid        references public.recordatorios(id) on delete set null,
  type            text        not null,   -- ver constantes abajo
  title           text        not null,
  description     text,
  icon            text,                   -- nombre de icono lucide
  metadata        jsonb       not null default '{}'::jsonb,
  created_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now()
);
-- Tipos de evento: 'quote_created'|'quote_sent'|'quote_viewed'|'quote_approved'|
--   'quote_rejected'|'quote_expired'|'status_changed'|'seguimiento'|'nota'|
--   'recordatorio_created'|'recordatorio_done'

create index if not exists idx_cte_client
  on public.client_timeline_events(client_id, created_at desc);
create index if not exists idx_cte_workspace
  on public.client_timeline_events(workspace_id, created_at desc);
create index if not exists idx_cte_quote
  on public.client_timeline_events(quote_id);

-- RLS client_timeline_events
alter table public.client_timeline_events enable row level security;

create policy "workspace members can select client timeline"
  on public.client_timeline_events for select
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = client_timeline_events.workspace_id
        and p.id = auth.uid()
    )
  );

-- Solo SECURITY DEFINER inserta en timeline (no directo desde frontend)
create policy "service role inserts timeline"
  on public.client_timeline_events for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = client_timeline_events.workspace_id
        and p.id = auth.uid()
    )
  );

-- ============================================================================
-- Poblar timeline con datos existentes (quotes históricas)
-- ============================================================================

-- Insertar eventos de cotizaciones ya creadas (retroactivo)
insert into public.client_timeline_events
  (workspace_id, client_id, quote_id, type, title, description, created_at)
select
  q.workspace_id,
  q.client_id,
  q.id,
  'quote_created',
  'Cotización creada: ' || q.quote_number,
  q.title,
  q.created_at
from public.quotes q
where q.client_id is not null
  and q.deleted_at is null
on conflict do nothing;

-- Eventos de envío
insert into public.client_timeline_events
  (workspace_id, client_id, quote_id, type, title, description, created_at)
select
  q.workspace_id,
  q.client_id,
  q.id,
  'quote_sent',
  'Cotización enviada: ' || q.quote_number,
  null,
  q.sent_at
from public.quotes q
where q.client_id is not null
  and q.sent_at is not null
  and q.deleted_at is null
on conflict do nothing;

-- Eventos de aprobación
insert into public.client_timeline_events
  (workspace_id, client_id, quote_id, type, title, description, created_at)
select
  q.workspace_id,
  q.client_id,
  q.id,
  'quote_approved',
  'Cotización aprobada: ' || q.quote_number,
  null,
  q.updated_at
from public.quotes q
where q.client_id is not null
  and q.status = 'Aprobada'
  and q.deleted_at is null
on conflict do nothing;

comment on table public.seguimientos is 'Seguimientos comerciales por cotización/cliente — PRO+';
comment on table public.recordatorios is 'Recordatorios de seguimiento — PRO+';
comment on table public.client_timeline_events is 'Timeline comercial por cliente — PRO+';
