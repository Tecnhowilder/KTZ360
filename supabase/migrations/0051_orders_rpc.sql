-- ============================================================================
-- 0051 — orders_rpc: RPCs Pedidos + OT con Zero Trust + Feature Gating
-- PREMIUM-only. workspace_id siempre desde JWT, nunca del frontend.
-- ============================================================================

-- ─── RPC: create_order ────────────────────────────────────────────────────────
-- Crea un pedido desde una cotización aprobada. Congela snapshot (R4).

create or replace function public.create_order(
  p_quote_id    uuid,
  p_title       text        default null,
  p_description text        default null,
  p_assigned_to uuid        default null,
  p_scheduled_at timestamptz default null,
  p_notes       text        default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id     uuid := auth.uid();
  v_workspace_id uuid;
  v_quote       record;
  v_client      record;
  v_order_id    uuid;
  v_snapshot    jsonb;
begin
  -- Zero Trust: obtener workspace desde JWT
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id
  from public.profiles where id = v_user_id;

  if v_workspace_id is null then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  end if;

  -- Feature gating: solo PREMIUM
  if not public.check_feature_access(v_workspace_id, 'orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'orders_not_included', 'plan_required', 'premium');
  end if;

  -- Validar cotización: debe existir, pertenecer al workspace, y estar Aprobada
  select * into v_quote
  from public.quotes
  where id = p_quote_id
    and workspace_id = v_workspace_id
    and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada en este workspace');
  end if;

  if v_quote.status != 'Aprobada' then
    return jsonb_build_object('ok', false, 'error', 'Solo cotizaciones aprobadas pueden generar pedidos', 'current_status', v_quote.status);
  end if;

  -- Validar que no exista ya un pedido activo para esta cotización
  if exists (
    select 1 from public.orders
    where quote_id = p_quote_id
      and workspace_id = v_workspace_id
      and deleted_at is null
      and status not in ('cancelado', 'finalizado')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ya existe un pedido activo para esta cotización');
  end if;

  -- Validar assigned_to si se proporcionó (debe pertenecer al workspace)
  if p_assigned_to is not null then
    if not exists (
      select 1 from public.profiles
      where id = p_assigned_to and workspace_id = v_workspace_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Usuario asignado no pertenece al workspace');
    end if;
  end if;

  -- Obtener datos del cliente para el snapshot
  if v_quote.client_id is not null then
    select * into v_client from public.clients where id = v_quote.client_id;
  end if;

  -- R4: Construir snapshot congelado de la cotización
  v_snapshot := jsonb_build_object(
    'quote_id',        v_quote.id,
    'quote_number',    v_quote.quote_number,
    'title',           v_quote.title,
    'location',        v_quote.location,
    'frozen_at',       now(),
    'client', case when v_client is not null then jsonb_build_object(
      'id',    v_client.id,
      'name',  v_client.name,
      'phone', v_client.phone,
      'email', v_client.email
    ) else null end,
    'calc_snapshot',   v_quote.calc_snapshot,
    'service_lines',   v_quote.service_lines,
    'tax_mode',        v_quote.tax_mode,
    'tax_rate',        v_quote.tax_rate,
    'discount',        v_quote.discount,
    'advance_pct',     v_quote.advance_pct,
    'valid_days',      v_quote.valid_days,
    'currency_code',   v_quote.currency_code
  );

  -- Crear el pedido
  insert into public.orders (
    workspace_id, quote_id, client_id, created_by, assigned_to,
    title, description, order_snapshot, total_amount,
    scheduled_at, notes, status
  ) values (
    v_workspace_id, p_quote_id, v_quote.client_id, v_user_id, p_assigned_to,
    coalesce(p_title, v_quote.title), p_description,
    v_snapshot,
    coalesce((v_quote.calc_snapshot->>'total')::numeric, 0),
    p_scheduled_at, p_notes, 'pendiente'
  )
  returning id into v_order_id;

  return jsonb_build_object(
    'ok',        true,
    'order_id',  v_order_id,
    'message',   'Pedido creado exitosamente'
  );
end;
$$;

grant execute on function public.create_order(uuid, text, text, uuid, timestamptz, text) to authenticated;

-- ─── RPC: list_orders ─────────────────────────────────────────────────────────

create or replace function public.list_orders(
  p_status text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_result       jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id
  from public.profiles where id = v_user_id;

  if not public.check_feature_access(v_workspace_id, 'orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'orders_not_included');
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id',            o.id,
      'order_number',  o.order_number,
      'title',         o.title,
      'description',   o.description,
      'status',        o.status,
      'total_amount',  o.total_amount,
      'scheduled_at',  o.scheduled_at,
      'started_at',    o.started_at,
      'finished_at',   o.finished_at,
      'created_at',    o.created_at,
      'updated_at',    o.updated_at,
      'quote_id',      o.quote_id,
      'client_id',     o.client_id,
      'client_name',   c.name,
      'assigned_to',   o.assigned_to,
      'assigned_name', p_a.full_name,
      'created_by',    o.created_by,
      'creator_name',  p_c.full_name,
      'work_order_count', (
        select count(*) from public.work_orders wo
        where wo.order_id = o.id
      ),
      'work_orders_done', (
        select count(*) from public.work_orders wo
        where wo.order_id = o.id and wo.status = 'finalizada'
      )
    ) order by o.created_at desc
  ) into v_result
  from public.orders o
  left join public.clients c  on c.id = o.client_id
  left join public.profiles p_a on p_a.id = o.assigned_to
  left join public.profiles p_c on p_c.id = o.created_by
  where o.workspace_id = v_workspace_id
    and o.deleted_at is null
    and (p_status is null or o.status = p_status);

  return jsonb_build_object('ok', true, 'orders', coalesce(v_result, '[]'::jsonb));
end;
$$;

grant execute on function public.list_orders(text) to authenticated;

-- ─── RPC: get_order ───────────────────────────────────────────────────────────

create or replace function public.get_order(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_order        record;
  v_work_orders  jsonb;
  v_logs         jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id
  from public.profiles where id = v_user_id;

  -- Zero Trust: validar que el pedido pertenece al workspace del usuario
  select * into v_order from public.orders
  where id = p_order_id
    and workspace_id = v_workspace_id
    and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;

  if not public.check_feature_access(v_workspace_id, 'orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'orders_not_included');
  end if;

  -- Órdenes de trabajo del pedido
  select jsonb_agg(
    jsonb_build_object(
      'id',                wo.id,
      'work_order_number', wo.work_order_number,
      'title',             wo.title,
      'description',       wo.description,
      'status',            wo.status,
      'priority',          wo.priority,
      'sequence_num',      wo.sequence_num,
      'assigned_to',       wo.assigned_to,
      'assigned_name',     p.full_name,
      'scheduled_at',      wo.scheduled_at,
      'started_at',        wo.started_at,
      'finished_at',       wo.finished_at,
      'created_at',        wo.created_at
    ) order by wo.sequence_num, wo.created_at
  ) into v_work_orders
  from public.work_orders wo
  left join public.profiles p on p.id = wo.assigned_to
  where wo.order_id = p_order_id;

  -- Logs del pedido
  select jsonb_agg(
    jsonb_build_object(
      'id',          wl.id,
      'event_type',  wl.event_type,
      'from_status', wl.from_status,
      'to_status',   wl.to_status,
      'note',        wl.note,
      'user_name',   p.full_name,
      'created_at',  wl.created_at
    ) order by wl.created_at desc
  ) into v_logs
  from public.work_logs wl
  left join public.profiles p on p.id = wl.user_id
  where wl.order_id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id',            v_order.id,
      'order_number',  v_order.order_number,
      'title',         v_order.title,
      'description',   v_order.description,
      'status',        v_order.status,
      'total_amount',  v_order.total_amount,
      'order_snapshot',v_order.order_snapshot,
      'scheduled_at',  v_order.scheduled_at,
      'started_at',    v_order.started_at,
      'finished_at',   v_order.finished_at,
      'notes',         v_order.notes,
      'quote_id',      v_order.quote_id,
      'client_id',     v_order.client_id,
      'assigned_to',   v_order.assigned_to,
      'created_by',    v_order.created_by,
      'created_at',    v_order.created_at,
      'updated_at',    v_order.updated_at
    ),
    'work_orders', coalesce(v_work_orders, '[]'::jsonb),
    'logs',        coalesce(v_logs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_order(uuid) to authenticated;

-- ─── RPC: update_order_status ─────────────────────────────────────────────────

create or replace function public.update_order_status(
  p_order_id  uuid,
  p_new_status text,
  p_note      text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_old_status   text;
  v_allowed      text[] := array['pendiente','programado','en_ejecucion','pausado','finalizado','cancelado'];
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not (p_new_status = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'Estado inválido');
  end if;

  if not public.check_feature_access(v_workspace_id, 'orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'orders_not_included');
  end if;

  -- Zero Trust: validar ownership
  select status into v_old_status from public.orders
  where id = p_order_id and workspace_id = v_workspace_id and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;

  if v_old_status = p_new_status then
    return jsonb_build_object('ok', true, 'message', 'Sin cambios');
  end if;

  update public.orders set
    status       = p_new_status,
    started_at   = case when p_new_status = 'en_ejecucion' and started_at is null then now() else started_at end,
    finished_at  = case when p_new_status in ('finalizado','cancelado') then now() else finished_at end
  where id = p_order_id;

  -- Bitácora automática
  insert into public.work_logs
    (workspace_id, order_id, user_id, event_type, from_status, to_status, note)
  values
    (v_workspace_id, p_order_id, v_user_id, 'order_status_changed', v_old_status, p_new_status, p_note);

  return jsonb_build_object('ok', true, 'from_status', v_old_status, 'to_status', p_new_status);
end;
$$;

grant execute on function public.update_order_status(uuid, text, text) to authenticated;

-- ─── RPC: create_work_order ───────────────────────────────────────────────────

create or replace function public.create_work_order(
  p_order_id    uuid,
  p_title       text,
  p_description text        default null,
  p_priority    text        default 'media',
  p_assigned_to uuid        default null,
  p_scheduled_at timestamptz default null,
  p_sequence_num int        default null,
  p_notes       text        default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_order        record;
  v_wo_id        uuid;
  v_seq          int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not public.check_feature_access(v_workspace_id, 'work_orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'work_orders_not_included', 'plan_required', 'premium');
  end if;

  -- Zero Trust: validar que el pedido pertenece al workspace
  select * into v_order from public.orders
  where id = p_order_id and workspace_id = v_workspace_id and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;

  if v_order.status in ('finalizado', 'cancelado') then
    return jsonb_build_object('ok', false, 'error', 'No se pueden agregar OT a un pedido ' || v_order.status);
  end if;

  if not (p_priority = any(array['baja','media','alta','urgente'])) then
    return jsonb_build_object('ok', false, 'error', 'Prioridad inválida');
  end if;

  -- Validar assigned_to
  if p_assigned_to is not null then
    if not exists (
      select 1 from public.profiles where id = p_assigned_to and workspace_id = v_workspace_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Usuario asignado no pertenece al workspace');
    end if;
  end if;

  -- Calcular sequence_num si no se proporcionó
  if p_sequence_num is null then
    select coalesce(max(sequence_num), 0) + 1 into v_seq
    from public.work_orders where order_id = p_order_id;
  else
    v_seq := p_sequence_num;
  end if;

  insert into public.work_orders (
    workspace_id, order_id, created_by, assigned_to,
    title, description, priority, sequence_num,
    scheduled_at, notes,
    status
  ) values (
    v_workspace_id, p_order_id, v_user_id, p_assigned_to,
    p_title, p_description, p_priority, v_seq,
    p_scheduled_at, p_notes, 'pendiente'
  )
  returning id into v_wo_id;

  -- Actualizar status de pedido a 'programado' si aún está pendiente
  update public.orders set status = 'programado'
  where id = p_order_id and status = 'pendiente';

  return jsonb_build_object(
    'ok',              true,
    'work_order_id',   v_wo_id,
    'message',         'Orden de trabajo creada'
  );
end;
$$;

grant execute on function public.create_work_order(uuid, text, text, text, uuid, timestamptz, int, text) to authenticated;

-- ─── RPC: list_work_orders ────────────────────────────────────────────────────

create or replace function public.list_work_orders(
  p_order_id uuid  default null,
  p_status   text  default null,
  p_priority text  default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_result       jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not public.check_feature_access(v_workspace_id, 'work_orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'work_orders_not_included');
  end if;

  -- Si p_order_id se proporcionó, validar que pertenece al workspace
  if p_order_id is not null then
    if not exists (
      select 1 from public.orders where id = p_order_id and workspace_id = v_workspace_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
    end if;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id',                wo.id,
      'work_order_number', wo.work_order_number,
      'order_id',          wo.order_id,
      'order_number',      o.order_number,
      'order_title',       o.title,
      'title',             wo.title,
      'description',       wo.description,
      'status',            wo.status,
      'priority',          wo.priority,
      'sequence_num',      wo.sequence_num,
      'assigned_to',       wo.assigned_to,
      'assigned_name',     p.full_name,
      'scheduled_at',      wo.scheduled_at,
      'started_at',        wo.started_at,
      'finished_at',       wo.finished_at,
      'created_at',        wo.created_at,
      'client_name',       c.name
    ) order by wo.created_at desc
  ) into v_result
  from public.work_orders wo
  join public.orders o    on o.id = wo.order_id
  left join public.clients c  on c.id = o.client_id
  left join public.profiles p on p.id = wo.assigned_to
  where wo.workspace_id = v_workspace_id
    and (p_order_id is null or wo.order_id = p_order_id)
    and (p_status   is null or wo.status   = p_status)
    and (p_priority is null or wo.priority = p_priority);

  return jsonb_build_object('ok', true, 'work_orders', coalesce(v_result, '[]'::jsonb));
end;
$$;

grant execute on function public.list_work_orders(uuid, text, text) to authenticated;

-- ─── RPC: update_work_order_status ────────────────────────────────────────────

create or replace function public.update_work_order_status(
  p_work_order_id uuid,
  p_new_status    text,
  p_note          text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_old_status   text;
  v_order_id     uuid;
  v_allowed      text[] := array['pendiente','asignada','en_progreso','pausada','finalizada','cancelada'];
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not (p_new_status = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'Estado inválido');
  end if;

  if not public.check_feature_access(v_workspace_id, 'work_orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'work_orders_not_included');
  end if;

  select status, order_id into v_old_status, v_order_id
  from public.work_orders
  where id = p_work_order_id and workspace_id = v_workspace_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Orden de trabajo no encontrada');
  end if;

  if v_old_status = p_new_status then
    return jsonb_build_object('ok', true, 'message', 'Sin cambios');
  end if;

  update public.work_orders set
    status      = p_new_status,
    started_at  = case when p_new_status = 'en_progreso'  and started_at is null then now() else started_at end,
    finished_at = case when p_new_status in ('finalizada','cancelada') then now() else finished_at end
  where id = p_work_order_id;

  -- Bitácora
  insert into public.work_logs
    (workspace_id, order_id, work_order_id, user_id, event_type, from_status, to_status, note)
  values
    (v_workspace_id, v_order_id, p_work_order_id, v_user_id,
     'work_order_status_changed', v_old_status, p_new_status, p_note);

  -- Si todas las OT del pedido están finalizadas, actualizar pedido a 'finalizado'
  if p_new_status = 'finalizada' then
    if not exists (
      select 1 from public.work_orders
      where order_id = v_order_id and status not in ('finalizada','cancelada')
    ) then
      update public.orders set status = 'finalizado', finished_at = now()
      where id = v_order_id and status != 'finalizado';

      insert into public.work_logs
        (workspace_id, order_id, user_id, event_type, from_status, to_status, note)
      values
        (v_workspace_id, v_order_id, v_user_id, 'completed', 'en_ejecucion', 'finalizado',
         'Pedido finalizado automáticamente al completar todas las OT');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'from_status', v_old_status, 'to_status', p_new_status);
end;
$$;

grant execute on function public.update_work_order_status(uuid, text, text) to authenticated;

-- ─── RPC: assign_work_order ───────────────────────────────────────────────────

create or replace function public.assign_work_order(
  p_work_order_id uuid,
  p_assigned_to   uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_order_id     uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not public.check_feature_access(v_workspace_id, 'work_orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'work_orders_not_included');
  end if;

  -- Validar que la OT pertenece al workspace
  select order_id into v_order_id from public.work_orders
  where id = p_work_order_id and workspace_id = v_workspace_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'OT no encontrada');
  end if;

  -- Validar que el asignado pertenece al workspace
  if not exists (
    select 1 from public.profiles where id = p_assigned_to and workspace_id = v_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Usuario no pertenece al workspace');
  end if;

  update public.work_orders set
    assigned_to = p_assigned_to,
    status = case when status = 'pendiente' then 'asignada' else status end
  where id = p_work_order_id;

  -- Bitácora
  insert into public.work_logs
    (workspace_id, order_id, work_order_id, user_id, event_type, note, metadata)
  values
    (v_workspace_id, v_order_id, p_work_order_id, v_user_id,
     'work_order_assigned', null,
     jsonb_build_object('assigned_to', p_assigned_to));

  return jsonb_build_object('ok', true, 'message', 'OT asignada');
end;
$$;

grant execute on function public.assign_work_order(uuid, uuid) to authenticated;

-- ─── RPC: add_work_log_comment ────────────────────────────────────────────────

create or replace function public.add_work_log_comment(
  p_order_id      uuid default null,
  p_work_order_id uuid default null,
  p_note          text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not public.check_feature_access(v_workspace_id, 'orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'orders_not_included');
  end if;

  if p_order_id is null and p_work_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'Debe especificar order_id o work_order_id');
  end if;

  insert into public.work_logs
    (workspace_id, order_id, work_order_id, user_id, event_type, note)
  values
    (v_workspace_id, p_order_id, p_work_order_id, v_user_id, 'comment', p_note);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.add_work_log_comment(uuid, uuid, text) to authenticated;

-- ─── RPC: get_operations_dashboard ────────────────────────────────────────────

create or replace function public.get_operations_dashboard()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_orders_stats jsonb;
  v_wo_stats     jsonb;
  v_recent_orders jsonb;
  v_recent_wo    jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'No autenticado');
  end if;

  select workspace_id into v_workspace_id from public.profiles where id = v_user_id;

  if not public.check_feature_access(v_workspace_id, 'orders_enabled') then
    return jsonb_build_object('ok', false, 'error', 'orders_not_included');
  end if;

  -- KPIs pedidos
  select jsonb_build_object(
    'total',       count(*),
    'pendiente',   count(*) filter (where status = 'pendiente'),
    'programado',  count(*) filter (where status = 'programado'),
    'en_ejecucion',count(*) filter (where status = 'en_ejecucion'),
    'pausado',     count(*) filter (where status = 'pausado'),
    'finalizado',  count(*) filter (where status = 'finalizado'),
    'cancelado',   count(*) filter (where status = 'cancelado'),
    'activos',     count(*) filter (where status not in ('finalizado','cancelado'))
  ) into v_orders_stats
  from public.orders
  where workspace_id = v_workspace_id and deleted_at is null;

  -- KPIs OT
  select jsonb_build_object(
    'total',     count(*),
    'pendiente', count(*) filter (where status = 'pendiente'),
    'asignada',  count(*) filter (where status = 'asignada'),
    'en_progreso',count(*) filter (where status = 'en_progreso'),
    'pausada',   count(*) filter (where status = 'pausada'),
    'finalizada',count(*) filter (where status = 'finalizada'),
    'cancelada', count(*) filter (where status = 'cancelada'),
    'activas',   count(*) filter (where status not in ('finalizada','cancelada'))
  ) into v_wo_stats
  from public.work_orders wo
  join public.orders o on o.id = wo.order_id
  where wo.workspace_id = v_workspace_id and o.deleted_at is null;

  -- Pedidos recientes (últimos 5)
  select jsonb_agg(
    jsonb_build_object(
      'id',           o.id,
      'order_number', o.order_number,
      'title',        o.title,
      'status',       o.status,
      'client_name',  c.name,
      'total_amount', o.total_amount,
      'created_at',   o.created_at
    ) order by o.created_at desc
  ) into v_recent_orders
  from public.orders o
  left join public.clients c on c.id = o.client_id
  where o.workspace_id = v_workspace_id and o.deleted_at is null
  limit 5;

  -- OT activas recientes (últimas 5)
  select jsonb_agg(
    jsonb_build_object(
      'id',                wo.id,
      'work_order_number', wo.work_order_number,
      'title',             wo.title,
      'status',            wo.status,
      'priority',          wo.priority,
      'order_number',      o.order_number,
      'assigned_name',     p.full_name,
      'created_at',        wo.created_at
    ) order by wo.created_at desc
  ) into v_recent_wo
  from public.work_orders wo
  join public.orders o on o.id = wo.order_id
  left join public.profiles p on p.id = wo.assigned_to
  where wo.workspace_id = v_workspace_id
    and wo.status not in ('finalizada','cancelada')
    and o.deleted_at is null
  limit 5;

  return jsonb_build_object(
    'ok',            true,
    'orders',        v_orders_stats,
    'work_orders',   v_wo_stats,
    'recent_orders', coalesce(v_recent_orders, '[]'::jsonb),
    'recent_work_orders', coalesce(v_recent_wo, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_operations_dashboard() to authenticated;

-- ─── Comments ─────────────────────────────────────────────────────────────────

comment on function public.create_order              is 'Crea pedido desde cotización aprobada con snapshot R4. Sprint 6.';
comment on function public.list_orders               is 'Lista pedidos del workspace. Feature gated: orders_enabled. Sprint 6.';
comment on function public.get_order                 is 'Detalle de pedido con OT y bitácora. Zero Trust. Sprint 6.';
comment on function public.update_order_status       is 'Cambia estado de pedido + escribe bitácora. Sprint 6.';
comment on function public.create_work_order         is 'Crea OT dentro de un pedido. Feature gated: work_orders_enabled. Sprint 6.';
comment on function public.list_work_orders          is 'Lista OT del workspace o de un pedido. Sprint 6.';
comment on function public.update_work_order_status  is 'Cambia estado OT + bitácora + auto-finaliza pedido. Sprint 6.';
comment on function public.assign_work_order         is 'Asigna OT a usuario del workspace + bitácora. Sprint 6.';
comment on function public.get_operations_dashboard  is 'KPIs operativos: pedidos y OT. Feature gated. Sprint 6.';
