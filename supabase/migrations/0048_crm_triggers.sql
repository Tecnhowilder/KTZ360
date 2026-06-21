-- ============================================================================
-- 0048 — crm_triggers: Triggers automáticos CRM + notificaciones
-- ============================================================================

-- ============================================================================
-- Trigger: registrar en timeline cuando se crea una cotización
-- ============================================================================

create or replace function public.trg_quotes_timeline_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null then
    insert into public.client_timeline_events
      (workspace_id, client_id, quote_id, type, title, description, created_by)
    values (
      new.workspace_id,
      new.client_id,
      new.id,
      'quote_created',
      'Cotización creada: ' || new.quote_number,
      new.title,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_timeline_insert on public.quotes;
create trigger trg_quotes_timeline_insert
  after insert on public.quotes
  for each row execute function public.trg_quotes_timeline_on_insert();

-- ============================================================================
-- Trigger: registrar en timeline cuando cambia el status técnico
-- ============================================================================

create or replace function public.trg_quotes_timeline_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_title      text;
begin
  if old.status = new.status then
    return new;
  end if;

  v_event_type := case new.status
    when 'Enviada'   then 'quote_sent'
    when 'Aprobada'  then 'quote_approved'
    when 'Rechazada' then 'quote_rejected'
    when 'Vencida'   then 'quote_expired'
    else 'status_changed'
  end;

  v_title := case new.status
    when 'Enviada'   then 'Cotización enviada: ' || new.quote_number
    when 'Aprobada'  then 'Cotización aprobada: ' || new.quote_number
    when 'Rechazada' then 'Cotización rechazada: ' || new.quote_number
    when 'Vencida'   then 'Cotización vencida: ' || new.quote_number
    else 'Estado cambiado a ' || new.status || ': ' || new.quote_number
  end;

  if new.client_id is not null then
    insert into public.client_timeline_events
      (workspace_id, client_id, quote_id, type, title, created_by,
       metadata)
    values (
      new.workspace_id,
      new.client_id,
      new.id,
      v_event_type,
      v_title,
      new.created_by,
      jsonb_build_object('from_status', old.status, 'to_status', new.status)
    );
  end if;

  -- Notificación cuando el cliente aprueba (Aprobada)
  if new.status = 'Aprobada' and old.status != 'Aprobada' then
    insert into public.notifications
      (workspace_id, user_id, title, message, type)
    select
      new.workspace_id,
      p.id,
      '¡Cotización aprobada!',
      'La cotización ' || new.quote_number || ' fue aprobada.',
      'success'
    from public.profiles p
    where p.workspace_id = new.workspace_id
      and p.role in ('owner', 'admin')
      and p.status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quotes_timeline_status on public.quotes;
create trigger trg_quotes_timeline_status
  after update of status on public.quotes
  for each row execute function public.trg_quotes_timeline_on_status();

-- ============================================================================
-- Trigger: cuando quote_views registra apertura → marcar como 'vista'
-- ============================================================================

create or replace function public.trg_quote_views_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_client_id    uuid;
  v_quote_number text;
  v_current_cs   text;
begin
  -- Obtener datos de la cotización
  select q.workspace_id, q.client_id, q.quote_number, q.commercial_status
  into v_workspace_id, v_client_id, v_quote_number, v_current_cs
  from public.quotes q
  where q.id = new.quote_id and q.deleted_at is null;

  if not found then
    return new;
  end if;

  -- Actualizar commercial_status a 'vista' si está en 'enviada'
  if v_current_cs = 'enviada' then
    update public.quotes
    set commercial_status = 'vista', updated_at = now()
    where id = new.quote_id;

    -- Registrar en historial comercial
    insert into public.quote_commercial_history
      (quote_id, workspace_id, from_status, to_status, observacion)
    values
      (new.quote_id, v_workspace_id, 'enviada', 'vista', 'Apertura automática por cliente');
  end if;

  -- Timeline del cliente
  if v_client_id is not null then
    insert into public.client_timeline_events
      (workspace_id, client_id, quote_id, type, title, description,
       metadata)
    values (
      v_workspace_id,
      v_client_id,
      new.quote_id,
      'quote_viewed',
      'Cliente abrió cotización: ' || v_quote_number,
      'Dispositivo: ' || coalesce(new.device, 'desconocido'),
      jsonb_build_object(
        'device', new.device,
        'browser', new.browser,
        'city', new.city,
        'opened_at', new.opened_at
      )
    );
  end if;

  -- Notificación al dueño del workspace (primera apertura del día)
  if not exists (
    select 1 from public.quote_views
    where quote_id = new.quote_id
      and opened_at >= now() - interval '24 hours'
      and id != new.id
  ) then
    insert into public.notifications
      (workspace_id, user_id, title, message, type)
    select
      v_workspace_id,
      p.id,
      '👁 Cotización vista',
      'El cliente abrió la cotización ' || v_quote_number,
      'info'
    from public.profiles p
    where p.workspace_id = v_workspace_id
      and p.role in ('owner', 'admin')
      and p.status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quote_views_crm on public.quote_views;
create trigger trg_quote_views_crm
  after insert on public.quote_views
  for each row execute function public.trg_quote_views_on_insert();

-- ============================================================================
-- Trigger: cuando se crea un seguimiento → notificación de confirmación
-- ============================================================================

create or replace function public.trg_seguimientos_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_number text;
begin
  -- Obtener número de cotización si hay quote_id
  if new.quote_id is not null then
    select quote_number into v_quote_number
    from public.quotes where id = new.quote_id;
  end if;

  -- Actualizar commercial_status a 'negociacion' si el seguimiento tiene resultado positivo
  if new.quote_id is not null
     and new.resultado in ('interesado', 'reprogramar')
     and exists (
       select 1 from public.quotes
       where id = new.quote_id and commercial_status in ('vista', 'enviada')
     )
  then
    update public.quotes
    set commercial_status = 'negociacion', updated_at = now()
    where id = new.quote_id;

    insert into public.quote_commercial_history
      (quote_id, workspace_id, from_status, to_status, changed_by, observacion)
    select new.quote_id, new.workspace_id, commercial_status, 'negociacion', new.created_by,
           'Automático: seguimiento positivo'
    from public.quotes where id = new.quote_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seguimientos_crm on public.seguimientos;
create trigger trg_seguimientos_crm
  after insert on public.seguimientos
  for each row execute function public.trg_seguimientos_on_insert();

-- ============================================================================
-- Función periódica: vencer cotizaciones expiradas (llamar desde cron)
-- ============================================================================

create or replace function public.expire_overdue_quotes(p_workspace_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.quotes
  set
    status = 'Vencida',
    commercial_status = 'vencida',
    updated_at = now()
  where
    status in ('Enviada')
    and sent_at is not null
    and sent_at + (valid_days || ' days')::interval < now()
    and deleted_at is null
    and (p_workspace_id is null or workspace_id = p_workspace_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_overdue_quotes(uuid) to service_role;

comment on function public.expire_overdue_quotes(uuid) is 'Vencer cotizaciones expiradas — llamar periódicamente desde pg_cron o Edge Function';
