-- ============================================================================
-- 0064 — integrations_triggers: Auto-queue de eventos de integración
-- ============================================================================
-- Cuando ocurre un evento en Shelwi (cotización enviada, OT programada, etc.),
-- si hay una integración activa para ese proveedor, encola el evento automáticamente.
-- El frontend no necesita hacer nada extra.
-- ============================================================================

-- ─── Helper: encolar para todos los providers activos ────────────────────────

create or replace function public.queue_for_active_integrations(
  p_workspace_id uuid,
  p_event_type   text,
  p_payload      jsonb,
  p_providers    text[]  default array['whatsapp','google_calendar','outlook_calendar']
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  foreach v_provider in array p_providers loop
    perform public.queue_integration_event(p_workspace_id, v_provider, p_event_type, p_payload);
  end loop;
end;
$$;

-- ─── Trigger 1: cotización enviada → WhatsApp + Calendar ─────────────────────

create or replace function public.trg_integrations_quote_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_payload     jsonb;
begin
  -- Solo cuando cambia a Enviada
  if old.status = new.status then return new; end if;
  if new.status != 'Enviada' then return new; end if;

  select name into v_client_name from public.clients where id = new.client_id;

  v_payload := jsonb_build_object(
    'quote_id',    new.id,
    'quote_number',new.quote_number,
    'title',       new.title,
    'client_id',   new.client_id,
    'client_name', v_client_name,
    'total',       coalesce((new.calc_snapshot->>'total')::numeric, 0),
    'sent_at',     new.sent_at
  );

  -- WhatsApp: mensaje enriquecido de cotización enviada
  perform public.queue_integration_event(new.workspace_id, 'whatsapp', 'quote_sent', v_payload);

  return new;
end;
$$;

drop trigger if exists trg_integrations_quote_sent on public.quotes;
create trigger trg_integrations_quote_sent
  after update of status on public.quotes
  for each row execute function public.trg_integrations_quote_status();

-- ─── Trigger 2: pedido creado → WhatsApp + Calendar ──────────────────────────

create or replace function public.trg_integrations_order_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_payload     jsonb;
begin
  select name into v_client_name from public.clients where id = new.client_id;

  v_payload := jsonb_build_object(
    'order_id',     new.id,
    'order_number', new.order_number,
    'title',        new.title,
    'client_id',    new.client_id,
    'client_name',  v_client_name,
    'total_amount', new.total_amount,
    'scheduled_at', new.scheduled_at
  );

  -- WhatsApp: pedido creado
  perform public.queue_integration_event(new.workspace_id, 'whatsapp', 'order_created', v_payload);

  -- Google Calendar: crear evento si hay fecha programada
  if new.scheduled_at is not null then
    perform public.queue_integration_event(new.workspace_id, 'google_calendar', 'calendar_create',
      v_payload || jsonb_build_object('event_date', new.scheduled_at, 'event_title', 'Pedido: ' || new.title));
    perform public.queue_integration_event(new.workspace_id, 'outlook_calendar', 'calendar_create',
      v_payload || jsonb_build_object('event_date', new.scheduled_at, 'event_title', 'Pedido: ' || new.title));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_integrations_order_insert on public.orders;
create trigger trg_integrations_order_insert
  after insert on public.orders
  for each row execute function public.trg_integrations_order_created();

-- ─── Trigger 3: OT status → WhatsApp + Calendar ──────────────────────────────

create or replace function public.trg_integrations_work_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_payload     jsonb;
begin
  if old.status = new.status then return new; end if;

  -- Obtener cliente del pedido padre
  select c.name into v_client_name
  from public.orders o
  left join public.clients c on c.id = o.client_id
  where o.id = new.order_id;

  v_payload := jsonb_build_object(
    'work_order_id',     new.id,
    'work_order_number', new.work_order_number,
    'title',             new.title,
    'order_id',          new.order_id,
    'client_name',       v_client_name,
    'status',            new.status,
    'scheduled_at',      new.scheduled_at,
    'finished_at',       new.finished_at
  );

  -- OT programada (asignada y con fecha)
  if new.status = 'asignada' and new.scheduled_at is not null then
    perform public.queue_integration_event(new.workspace_id, 'whatsapp', 'work_order_scheduled', v_payload);
    perform public.queue_integration_event(new.workspace_id, 'google_calendar', 'calendar_create',
      v_payload || jsonb_build_object('event_date', new.scheduled_at, 'event_title', 'OT: ' || new.title));
    perform public.queue_integration_event(new.workspace_id, 'outlook_calendar', 'calendar_create',
      v_payload || jsonb_build_object('event_date', new.scheduled_at, 'event_title', 'OT: ' || new.title));
  end if;

  -- OT finalizada
  if new.status = 'finalizada' then
    perform public.queue_integration_event(new.workspace_id, 'whatsapp', 'work_order_completed', v_payload);
    -- Actualizar evento de calendario
    perform public.queue_integration_event(new.workspace_id, 'google_calendar', 'calendar_update',
      v_payload || jsonb_build_object('event_title', 'OT Finalizada: ' || new.title));
    perform public.queue_integration_event(new.workspace_id, 'outlook_calendar', 'calendar_update',
      v_payload || jsonb_build_object('event_title', 'OT Finalizada: ' || new.title));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_integrations_work_order on public.work_orders;
create trigger trg_integrations_work_order
  after update of status on public.work_orders
  for each row execute function public.trg_integrations_work_order_status();

-- ─── Trigger 4: seguimiento creado → Calendar ─────────────────────────────────

create or replace function public.trg_integrations_seguimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_title   text;
begin
  -- Solo seguimientos que no son notas (tienen fecha implícita = now)
  if new.type = 'nota' then return new; end if;

  v_title := case new.type
    when 'llamada'   then 'Llamada comercial'
    when 'whatsapp'  then 'Seguimiento WhatsApp'
    when 'correo'    then 'Seguimiento por correo'
    when 'visita'    then 'Visita comercial'
    when 'reunion'   then 'Reunión'
    else 'Seguimiento'
  end;

  -- Solo encolar para Calendar si hay una cotización o cliente asociado
  if new.quote_id is not null or new.client_id is not null then
    v_payload := jsonb_build_object(
      'seguimiento_id', new.id,
      'type',           new.type,
      'quote_id',       new.quote_id,
      'client_id',      new.client_id,
      'comentario',     new.comentario,
      'event_date',     new.created_at,
      'event_title',    v_title
    );
    perform public.queue_integration_event(new.workspace_id, 'google_calendar', 'calendar_create', v_payload);
    perform public.queue_integration_event(new.workspace_id, 'outlook_calendar', 'calendar_create', v_payload);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_integrations_seguimiento on public.seguimientos;
create trigger trg_integrations_seguimiento
  after insert on public.seguimientos
  for each row execute function public.trg_integrations_seguimiento();

-- ─── Trigger 5: recordatorio → Calendar ──────────────────────────────────────

create or replace function public.trg_integrations_recordatorio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'recordatorio_id', new.id,
    'type',            new.type,
    'note',            new.note,
    'quote_id',        new.quote_id,
    'client_id',       new.client_id,
    'event_date',      new.scheduled_at,
    'event_title',     'Recordatorio: ' || coalesce(new.type, 'seguimiento')
  );

  perform public.queue_integration_event(new.workspace_id, 'google_calendar', 'calendar_create', v_payload);
  perform public.queue_integration_event(new.workspace_id, 'outlook_calendar', 'calendar_create', v_payload);

  return new;
end;
$$;

drop trigger if exists trg_integrations_recordatorio on public.recordatorios;
create trigger trg_integrations_recordatorio
  after insert on public.recordatorios
  for each row execute function public.trg_integrations_recordatorio();

comment on function public.queue_for_active_integrations is 'Sprint 11: helper para encolar un evento en todos los providers activos';
