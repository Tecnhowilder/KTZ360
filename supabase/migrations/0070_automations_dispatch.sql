-- ============================================================================
-- 0070 — automations_dispatch: Triggers genéricos + eliminar triggers hardcoded
-- ============================================================================
-- Reemplaza los triggers estáticos de Sprint 11 (0064) por dispatch genérico.
-- Todos los eventos pasan por evaluate_and_queue_automations → motor de reglas.
-- Los triggers hardcoded de integración se ELIMINAN para evitar doble ejecución.
-- ============================================================================

-- ─── 1. ELIMINAR triggers hardcoded de Sprint 11 ─────────────────────────────
-- Estos triggers encolan directamente en integration_events sin pasar por reglas.
-- Son reemplazados por el motor de automatizaciones.

drop trigger if exists trg_integrations_quote_sent      on public.quotes;
drop trigger if exists trg_integrations_order_insert    on public.orders;
drop trigger if exists trg_integrations_work_order      on public.work_orders;
drop trigger if exists trg_integrations_seguimiento     on public.seguimientos;
drop trigger if exists trg_integrations_recordatorio    on public.recordatorios;

-- Las funciones de trigger se mantienen (pueden usarse como fallback).
-- Solo se eliminan los triggers en sí.

-- ─── 2. Trigger genérico: cotizaciones ───────────────────────────────────────

create or replace function public.trg_quotes_automation_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_client_name text;
begin
  select name into v_client_name from public.clients where id = new.client_id;

  v_payload := jsonb_build_object(
    'quote_id',     new.id,
    'quote_number', new.quote_number,
    'title',        new.title,
    'client_id',    new.client_id,
    'client_name',  v_client_name,
    'total',        coalesce((new.calc_snapshot->>'total')::numeric, 0),
    'sent_at',      new.sent_at
  );

  -- INSERT: cotización creada
  if tg_op = 'INSERT' then
    perform public.evaluate_and_queue_automations(
      new.workspace_id, 'quote_created', 'quote', new.id, v_payload
    );
  end if;

  -- UPDATE: cambios de status
  if tg_op = 'UPDATE' and old.status != new.status then
    case new.status
      when 'Enviada'   then
        perform public.evaluate_and_queue_automations(
          new.workspace_id, 'quote_sent', 'quote', new.id, v_payload
        );
      when 'Aprobada'  then
        perform public.evaluate_and_queue_automations(
          new.workspace_id, 'quote_approved', 'quote', new.id, v_payload
        );
      when 'Rechazada' then
        perform public.evaluate_and_queue_automations(
          new.workspace_id, 'quote_rejected', 'quote', new.id, v_payload
        );
      else null;
    end case;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quotes_automation_dispatch on public.quotes;
create trigger trg_quotes_automation_dispatch
  after insert or update of status on public.quotes
  for each row execute function public.trg_quotes_automation_dispatch();

-- ─── 3. Trigger: quote_views → quote_viewed_multiple ─────────────────────────

create or replace function public.trg_quote_views_automation_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws_id      uuid;
  v_view_count int;
  v_client_id  uuid;
  v_title      text;
begin
  select q.workspace_id, q.client_id, q.title
  into v_ws_id, v_client_id, v_title
  from public.quotes q where q.id = new.quote_id;

  if not found then return new; end if;

  select count(*)::int into v_view_count
  from public.quote_views where quote_id = new.quote_id;

  -- Disparar quote_viewed_multiple cuando alcanza múltiplos (3, 5, 10)
  if v_view_count in (3, 5, 10) then
    perform public.evaluate_and_queue_automations(
      v_ws_id, 'quote_viewed_multiple', 'quote', new.quote_id,
      jsonb_build_object(
        'quote_id', new.quote_id, 'client_id', v_client_id,
        'title', v_title, 'view_count', v_view_count
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quote_views_automation on public.quote_views;
create trigger trg_quote_views_automation
  after insert on public.quote_views
  for each row execute function public.trg_quote_views_automation_dispatch();

-- ─── 4. Trigger: pedidos ─────────────────────────────────────────────────────

create or replace function public.trg_orders_automation_dispatch()
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

  if tg_op = 'INSERT' then
    perform public.evaluate_and_queue_automations(
      new.workspace_id, 'order_created', 'order', new.id, v_payload
    );
  end if;

  if tg_op = 'UPDATE' and old.status != new.status and new.status = 'finalizado' then
    perform public.evaluate_and_queue_automations(
      new.workspace_id, 'order_completed', 'order', new.id,
      v_payload || jsonb_build_object('finished_at', new.finished_at)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_automation_dispatch on public.orders;
create trigger trg_orders_automation_dispatch
  after insert or update of status on public.orders
  for each row execute function public.trg_orders_automation_dispatch();

-- ─── 5. Trigger: órdenes de trabajo ──────────────────────────────────────────

create or replace function public.trg_work_orders_automation_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_payload     jsonb;
begin
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
    'assigned_to',       new.assigned_to
  );

  if tg_op = 'INSERT' then
    perform public.evaluate_and_queue_automations(
      new.workspace_id, 'work_order_created', 'work_order', new.id, v_payload
    );
  end if;

  if tg_op = 'UPDATE' and old.status != new.status then
    case new.status
      when 'asignada' then
        perform public.evaluate_and_queue_automations(
          new.workspace_id, 'work_order_assigned', 'work_order', new.id, v_payload
        );
      when 'en_progreso' then
        perform public.evaluate_and_queue_automations(
          new.workspace_id, 'work_order_started', 'work_order', new.id, v_payload
        );
      when 'finalizada' then
        perform public.evaluate_and_queue_automations(
          new.workspace_id, 'work_order_completed', 'work_order', new.id, v_payload
        );
      else null;
    end case;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_orders_automation_dispatch on public.work_orders;
create trigger trg_work_orders_automation_dispatch
  after insert or update of status on public.work_orders
  for each row execute function public.trg_work_orders_automation_dispatch();

-- ─── 6. Trigger: cliente creado ──────────────────────────────────────────────

create or replace function public.trg_clients_automation_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.evaluate_and_queue_automations(
      new.workspace_id, 'client_created', 'client', new.id,
      jsonb_build_object('client_id', new.id, 'client_name', new.name, 'email', new.email)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_automation_dispatch on public.clients;
create trigger trg_clients_automation_dispatch
  after insert on public.clients
  for each row execute function public.trg_clients_automation_dispatch();

-- ─── 7. Auto-instalar templates cuando se conecta una integración ─────────────

create or replace function public.trg_install_templates_on_integration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cuando una integración pasa a 'connected', instalar templates relevantes
  if new.status = 'connected' and (old.status is null or old.status != 'connected') then
    -- Templates relacionados con el provider
    case new.provider
      when 'whatsapp' then
        perform public.install_automation_templates(new.workspace_id,
          array['quote_followup_72h','review_request_on_completion','client_recovery_60d']);
      when 'google_calendar', 'outlook_calendar' then
        perform public.install_automation_templates(new.workspace_id,
          array['work_order_overdue_alert']);
      else null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_install_templates_on_integration on public.integrations;
create trigger trg_install_templates_on_integration
  after insert or update of status on public.integrations
  for each row execute function public.trg_install_templates_on_integration();

comment on function public.trg_quotes_automation_dispatch        is 'Sprint 13: reemplaza trg_integrations_quote_status. Pasa por motor de automatizaciones.';
comment on function public.trg_orders_automation_dispatch        is 'Sprint 13: reemplaza trg_integrations_order_insert.';
comment on function public.trg_work_orders_automation_dispatch   is 'Sprint 13: reemplaza trg_integrations_work_order.';
comment on function public.trg_install_templates_on_integration  is 'Sprint 13: instala automation templates predefinidos al activar una integración.';
