-- ============================================================================
-- 0068 — automations_schema: Motor de Automatizaciones Sprint 13
-- ============================================================================
-- Decisiones aprobadas:
--   1. Cola unificada: integration_events con provider='shelwi_internal'
--   2. Migrar triggers hardcoded a automation_templates (en 0070)
--   3. Edge Function scheduler (automation-scheduler)
--   4. Condiciones: JSON estructurado evaluado en RPC
--   5. Anti-loops: execution_depth máximo=3
--   6. Control IA: PRO=20%, PREMIUM=30% de créditos mensuales
--   7. Retención: automation_logs=180d, integration_events=90d
-- ============================================================================

-- ─── 1. Feature flags y límites ───────────────────────────────────────────────

alter table public.plan_features
  add column if not exists automation_enabled boolean not null default false;

update public.plan_features set automation_enabled = false where plan_code = 'free';
update public.plan_features set automation_enabled = true  where plan_code = 'pro';
update public.plan_features set automation_enabled = true  where plan_code = 'premium';

alter table public.plan_limits
  add column if not exists max_automations           int,   -- null = ilimitado
  add column if not exists automation_ai_credits_pct int not null default 0;

update public.plan_limits set max_automations = 0,    automation_ai_credits_pct = 0  where plan_code = 'free';
update public.plan_limits set max_automations = 5,    automation_ai_credits_pct = 20 where plan_code = 'pro';
update public.plan_limits set max_automations = null, automation_ai_credits_pct = 30 where plan_code = 'premium';

comment on column public.plan_features.automation_enabled    is 'Motor de automatizaciones. FREE=false, PRO/PREMIUM=true';
comment on column public.plan_limits.max_automations          is 'Reglas activas simultáneas. FREE=0, PRO=5, PREMIUM=ilimitado';
comment on column public.plan_limits.automation_ai_credits_pct is '% de créditos IA del mes reservados para automatizaciones. PRO=20%, PREMIUM=30%';

-- ─── 2. Extender integration_events — campos de automatizaciones ──────────────

alter table public.integration_events
  add column if not exists execute_after     timestamptz,           -- null = inmediato
  add column if not exists source_rule_id    uuid,                  -- qué regla lo generó
  add column if not exists execution_depth   int not null default 0, -- anti-loop: máx 3
  add column if not exists parent_event_id   uuid references public.integration_events(id) on delete set null;

-- Índice para el scheduler (eventos diferidos pendientes)
create index if not exists idx_integration_events_scheduled
  on public.integration_events(execute_after, status)
  where status = 'pending' and execute_after is not null;

comment on column public.integration_events.execute_after   is 'Cuándo ejecutar. NULL = inmediato. Scheduler lo procesa cuando <= now()';
comment on column public.integration_events.source_rule_id  is 'ID de la automation_rule que generó este evento';
comment on column public.integration_events.execution_depth is 'Profundidad de cadena de automatizaciones. Bloqueado en >= 3';
comment on column public.integration_events.parent_event_id is 'Evento padre que generó este (para trazar cadenas)';

-- ─── 3. automation_templates — reglas predefinidas del sistema ────────────────
-- Templates globales (no por workspace). Los workspaces instalan copias.

create table if not exists public.automation_templates (
  key            text        primary key,
  name           text        not null,
  description    text,
  category       text        not null check (category in ('crm','operations','retention','billing')),
  trigger_event  text        not null,
  trigger_type   text        not null default 'event' check (trigger_type in ('event','periodic')),
  delay_hours    int         not null default 0,
  conditions     jsonb       not null default '[]'::jsonb,
  action_type    text        not null,
  action_payload jsonb       not null default '{}'::jsonb,
  plan_required  text        not null default 'pro',
  sort_order     int         not null default 0,
  active         boolean     not null default true
);

-- Insertar los 5 templates predefinidos obligatorios
insert into public.automation_templates
  (key, name, description, category, trigger_event, trigger_type, delay_hours, conditions, action_type, action_payload, plan_required, sort_order)
values

-- Template 1: Seguimiento post-envío (72h sin apertura)
(
  'quote_followup_72h',
  'Seguimiento si cotización no abierta',
  'Si el cliente no abre la cotización en 72 horas, crea un seguimiento y notifica al asesor.',
  'crm', 'quote_sent', 'event', 72,
  '[{"field":"commercial_status","operator":"not_in","value":["vista","negociacion","aprobada","rechazada","vencida"]}]'::jsonb,
  'create_followup_and_notify',
  '{"followup_type":"llamada","followup_resultado":null,"notify_message":"Cotización sin apertura después de 72h. Contácta al cliente."}'::jsonb,
  'pro', 1
),

-- Template 2: Alerta cliente caliente (abre la cotización 3+ veces)
(
  'client_hot_signal',
  'Cliente caliente — aperturas múltiples',
  'Si el cliente abre la cotización 3 o más veces, genera una alerta de oportunidad.',
  'crm', 'quote_viewed_multiple', 'event', 0,
  '[{"field":"view_count","operator":"gte","value":3}]'::jsonb,
  'notify_user',
  '{"title":"🔥 Cliente caliente","message_template":"{{client_name}} abrió la cotización {{view_count}} veces. ¡Llámalo ahora!","type":"success"}'::jsonb,
  'pro', 2
),

-- Template 3: Solicitud de reseña (pedido finalizado)
(
  'review_request_on_completion',
  'Solicitar reseña al finalizar pedido',
  'Cuando un pedido se finaliza, envía automáticamente un WhatsApp solicitando reseña al cliente.',
  'retention', 'order_completed', 'event', 24,
  '[]'::jsonb,
  'send_whatsapp',
  '{"event_type":"review_request"}'::jsonb,
  'pro', 3
),

-- Template 4: Recuperación de cliente inactivo (60 días)
(
  'client_recovery_60d',
  'Recuperar clientes inactivos (60 días)',
  'Detecta clientes sin actividad en 60 días y crea un seguimiento de recuperación.',
  'retention', 'client_inactive', 'periodic', 0,
  '[{"field":"days_inactive","operator":"gte","value":60}]'::jsonb,
  'create_followup_and_notify',
  '{"followup_type":"whatsapp","followup_resultado":null,"notify_message":"Cliente {{client_name}} lleva {{days_inactive}} días sin actividad. Crea una propuesta de recuperación."}'::jsonb,
  'pro', 4
),

-- Template 5: OT retrasada — notificar supervisor
(
  'work_order_overdue_alert',
  'Alertar por OT retrasada',
  'Si una OT lleva más de 24 horas sin avanzar después de su fecha programada, notifica al supervisor.',
  'operations', 'work_order_delayed', 'periodic', 0,
  '[{"field":"hours_overdue","operator":"gte","value":24}]'::jsonb,
  'notify_supervisor',
  '{"title":"⚠️ OT retrasada","message_template":"La OT {{work_order_number}} lleva {{hours_overdue}}h de retraso."}'::jsonb,
  'premium', 5
)
on conflict (key) do update set
  name           = excluded.name,
  description    = excluded.description,
  conditions     = excluded.conditions,
  action_payload = excluded.action_payload,
  sort_order     = excluded.sort_order;

-- ─── 4. automation_rules — reglas configuradas por workspace ──────────────────

create table if not exists public.automation_rules (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  name            text        not null,
  description     text,
  template_key    text        references public.automation_templates(key) on delete set null,
  enabled         boolean     not null default true,
  trigger_event   text        not null,
  trigger_type    text        not null default 'event' check (trigger_type in ('event','periodic')),
  delay_hours     int         not null default 0,
  conditions      jsonb       not null default '[]'::jsonb,
  action_type     text        not null,
  action_payload  jsonb       not null default '{}'::jsonb,
  -- Control de ejecución
  max_executions_per_entity int default null,   -- null = ilimitado
  executions_count           int not null default 0,
  -- Anti-spam: mínimo N horas entre ejecuciones para la misma entidad
  min_interval_hours         int not null default 0,
  created_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_automation_rules_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

create index if not exists idx_automation_rules_workspace
  on public.automation_rules(workspace_id, enabled, trigger_event);
create index if not exists idx_automation_rules_periodic
  on public.automation_rules(trigger_type, enabled)
  where trigger_type = 'periodic' and enabled = true;

alter table public.automation_rules enable row level security;

-- SELECT: todos los miembros + support_admin (para diagnóstico)
create policy "workspace members select rules"
  on public.automation_rules for select
  using (exists (
    select 1 from public.profiles
    where workspace_id = automation_rules.workspace_id and id = auth.uid()
  ));

-- INSERT / UPDATE / DELETE: solo owner, admin, super_admin
-- support_admin puede VER pero NO modificar reglas comerciales de clientes
create policy "owner admin write rules"
  on public.automation_rules for insert
  with check (exists (
    select 1 from public.profiles
    where workspace_id = automation_rules.workspace_id
      and id = auth.uid()
      and role in ('owner','admin','super_admin')
      and status = 'active'
  ));

create policy "owner admin update rules"
  on public.automation_rules for update
  using (exists (
    select 1 from public.profiles
    where workspace_id = automation_rules.workspace_id
      and id = auth.uid()
      and role in ('owner','admin','super_admin')
      and status = 'active'
  ));

create policy "owner admin delete rules"
  on public.automation_rules for delete
  using (exists (
    select 1 from public.profiles
    where workspace_id = automation_rules.workspace_id
      and id = auth.uid()
      and role in ('owner','admin','super_admin')
      and status = 'active'
  ));

-- ─── 5. automation_logs — historial de ejecuciones (retención 180 días) ──────

create table if not exists public.automation_logs (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  rule_id          uuid        references public.automation_rules(id) on delete set null,
  rule_name        text,
  trigger_event    text,
  entity_type      text,
  entity_id        uuid,
  action_type      text,
  status           text        not null default 'queued' check (status in (
    'queued', 'executed', 'failed', 'skipped', 'blocked_loop', 'blocked_credits', 'blocked_limit'
  )),
  execution_depth  int         not null default 0,
  parent_log_id    uuid        references public.automation_logs(id) on delete set null,
  event_id         uuid,       -- integration_events.id
  error_message    text,
  result           jsonb,
  executed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_automation_logs_workspace
  on public.automation_logs(workspace_id, created_at desc);
create index if not exists idx_automation_logs_rule
  on public.automation_logs(rule_id, created_at desc);
create index if not exists idx_automation_logs_entity
  on public.automation_logs(entity_type, entity_id);

-- Retención automática: eliminar logs > 180 días
create or replace function public.cleanup_automation_logs()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.automation_logs
    where created_at < now() - interval '180 days'
    returning id
  )
  select count(*)::int from deleted;
$$;

-- Retención automática: eliminar integration_events procesados > 90 días
create or replace function public.cleanup_processed_integration_events()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.integration_events
    where status in ('processed','skipped','failed')
      and processed_at < now() - interval '90 days'
    returning id
  )
  select count(*)::int from deleted;
$$;

grant execute on function public.cleanup_automation_logs()                to service_role;
grant execute on function public.cleanup_processed_integration_events()   to service_role;

alter table public.automation_logs enable row level security;

create policy "workspace members select logs"
  on public.automation_logs for select
  using (exists (select 1 from public.profiles where workspace_id = automation_logs.workspace_id and id = auth.uid()));

comment on table public.automation_rules    is 'Sprint 13: reglas de automatización configurables por workspace.';
comment on table public.automation_templates is 'Sprint 13: templates predefinidos de reglas. Workspaces instalan copias.';
comment on table public.automation_logs     is 'Sprint 13: historial de ejecuciones. Retención 180 días.';
