-- ============================================================================
-- 0052 — orders_triggers: Bitácora automática + Notificaciones + R5 Protección
-- ============================================================================

-- ─── TRIGGER R5: Prevenir soft-delete de cotización con pedido activo ─────────

create or replace function public.prevent_quote_soft_delete_with_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo actúa cuando se intenta poner deleted_at (soft delete)
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1 from public.orders
      where quote_id  = new.id
        and deleted_at is null
        and status not in ('finalizado', 'cancelado')
    ) then
      raise exception 'quote_has_active_order: No se puede eliminar una cotización con pedidos activos. Cancela o finaliza los pedidos primero.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_quote_delete_with_order
  before update on public.quotes
  for each row execute function public.prevent_quote_soft_delete_with_order();

-- ─── TRIGGER: Bitácora automática al crear un pedido ─────────────────────────

create or replace function public.trg_orders_after_insert_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Insertar log de creación
  insert into public.work_logs
    (workspace_id, order_id, user_id, event_type, to_status, note)
  values
    (new.workspace_id, new.id, new.created_by, 'order_created', new.status,
     'Pedido creado desde cotización ' || coalesce(
       (select quote_number from public.quotes where id = new.quote_id), 'directamente'
     ));

  -- Notificación al workspace
  insert into public.notifications
    (workspace_id, title, message, type, is_read)
  values (
    new.workspace_id,
    '📦 Pedido ' || new.order_number || ' creado',
    'Se creó el pedido "' || new.title || '" por $' ||
      to_char(new.total_amount, 'FM999,999,999'),
    'info',
    false
  );

  return new;
end;
$$;

create trigger trg_orders_after_insert
  after insert on public.orders
  for each row execute function public.trg_orders_after_insert_fn();

-- ─── TRIGGER: Bitácora automática al crear una OT ────────────────────────────

create or replace function public.trg_work_orders_after_insert_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_number text;
begin
  select order_number into v_order_number
  from public.orders where id = new.order_id;

  -- Log de creación
  insert into public.work_logs
    (workspace_id, order_id, work_order_id, user_id, event_type, to_status, note)
  values
    (new.workspace_id, new.order_id, new.id, new.created_by, 'work_order_created', new.status,
     'OT ' || new.work_order_number || ' creada para pedido ' || coalesce(v_order_number, ''));

  -- Notificación si hay asignado
  if new.assigned_to is not null then
    insert into public.notifications
      (workspace_id, title, message, type, is_read)
    values (
      new.workspace_id,
      '🔧 OT ' || new.work_order_number || ' asignada',
      'Se te asignó la OT "' || new.title || '" (Prioridad: ' || new.priority || ')',
      'info',
      false
    );
  end if;

  return new;
end;
$$;

create trigger trg_work_orders_after_insert
  after insert on public.work_orders
  for each row execute function public.trg_work_orders_after_insert_fn();

-- ─── TRIGGER: Notificación cuando OT es finalizada ───────────────────────────

create or replace function public.trg_work_orders_on_status_change_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_number text;
begin
  if new.status = old.status then
    return new;
  end if;

  select order_number into v_order_number
  from public.orders where id = new.order_id;

  -- Notificación cuando OT es finalizada
  if new.status = 'finalizada' then
    insert into public.notifications
      (workspace_id, title, message, type, is_read)
    values (
      new.workspace_id,
      '✅ OT ' || new.work_order_number || ' finalizada',
      '"' || new.title || '" del pedido ' || coalesce(v_order_number, '') || ' fue completada.',
      'success',
      false
    );
  end if;

  return new;
end;
$$;

create trigger trg_work_orders_on_status_change
  after update of status on public.work_orders
  for each row execute function public.trg_work_orders_on_status_change_fn();

-- ─── TRIGGER: Notificación cuando pedido es finalizado ───────────────────────

create or replace function public.trg_orders_on_status_change_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'finalizado' then
    insert into public.notifications
      (workspace_id, title, message, type, is_read)
    values (
      new.workspace_id,
      '🎉 Pedido ' || new.order_number || ' finalizado',
      '"' || new.title || '" fue completado exitosamente.',
      'success',
      false
    );
  end if;

  return new;
end;
$$;

create trigger trg_orders_on_status_change
  after update of status on public.orders
  for each row execute function public.trg_orders_on_status_change_fn();

-- ─── Comments ─────────────────────────────────────────────────────────────────

comment on function public.prevent_quote_soft_delete_with_order is
  'R5: Bloquea soft-delete de cotización si tiene pedidos activos. Sprint 6.';
comment on function public.trg_orders_after_insert_fn is
  'Bitácora automática + notificación al crear pedido. Sprint 6.';
comment on function public.trg_work_orders_after_insert_fn is
  'Bitácora automática + notificación al crear OT. Sprint 6.';
comment on function public.trg_work_orders_on_status_change_fn is
  'Notificación al finalizar OT. Sprint 6.';
comment on function public.trg_orders_on_status_change_fn is
  'Notificación al finalizar pedido. Sprint 6.';
