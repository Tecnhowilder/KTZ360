-- ============================================================================
-- 0058 — gps_rpc: RPCs de GPS y Dashboard Operativo
-- ============================================================================
-- Zero Trust: user_id del JWT, workspace_id del DB (nunca del cliente).
-- Sin watchPosition — solo one-shot en: check_in, check_out, status_change, manual.
-- Consentimiento GPS obligatorio (gps_consent_at NOT NULL).
-- Precisión GPS requerida: ≤ 500 metros.
-- ============================================================================

-- ============================================================================
-- RPC 1: grant_gps_consent — usuario acepta uso de GPS
-- ============================================================================

create or replace function public.grant_gps_consent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ws_id   uuid;
begin
  select workspace_id into v_ws_id
  from public.profiles
  where id = v_user_id and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  end if;

  -- Registrar consentimiento
  update public.profiles
  set gps_consent_at = now(), updated_at = now()
  where id = v_user_id;

  -- Log de auditoría
  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_ws_id, v_user_id, 'gps_consent_granted', 'profiles', v_user_id,
    jsonb_build_object('consented_at', now(), 'ip', null));

  return jsonb_build_object('ok', true, 'consented_at', now());
end;
$$;

grant execute on function public.grant_gps_consent() to authenticated;

-- ============================================================================
-- RPC 2: record_check_in — registra llegada al sitio
-- ============================================================================

create or replace function public.record_check_in(
  p_latitude      numeric,
  p_longitude     numeric,
  p_accuracy      numeric  default null,
  p_order_id      uuid     default null,
  p_work_order_id uuid     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_ws_id      uuid;
  v_consent    timestamptz;
  v_coord_ok   jsonb;
  v_gps_event  uuid;
  v_order_num  text;
begin
  -- Obtener workspace y consentimiento
  select workspace_id, gps_consent_at
  into v_ws_id, v_consent
  from public.profiles
  where id = v_user_id and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  end if;

  -- Feature gating: gps_enabled (PREMIUM)
  if not public.check_feature_access(v_ws_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  end if;

  -- ZERO TRUST: Consentimiento obligatorio
  if v_consent is null then
    return jsonb_build_object('ok', false, 'error', 'consent_required',
      'message', 'Debes aceptar el uso de GPS antes de registrar tu ubicación');
  end if;

  -- Validar coordenadas
  v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
  if not (v_coord_ok->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
  end if;

  -- Validar pedido/OT si se proporcionan
  if p_order_id is not null and not exists (
    select 1 from public.orders where id = p_order_id and workspace_id = v_ws_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado en tu workspace');
  end if;

  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders where id = p_work_order_id and workspace_id = v_ws_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'OT no encontrada en tu workspace');
  end if;

  -- Actualizar estado operativo
  update public.profiles
  set operational_status = 'en_sitio', updated_at = now()
  where id = v_user_id;

  -- UPSERT member_locations (última ubicación)
  insert into public.member_locations
    (workspace_id, user_id, latitude, longitude, accuracy_meters, source, order_id, work_order_id)
  values
    (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy, 'check_in', p_order_id, p_work_order_id)
  on conflict (workspace_id, user_id) do update set
    latitude        = excluded.latitude,
    longitude       = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    source          = 'check_in',
    order_id        = excluded.order_id,
    work_order_id   = excluded.work_order_id,
    recorded_at     = now();

  -- Insertar en historial gps_events
  insert into public.gps_events
    (workspace_id, user_id, event_type, latitude, longitude, accuracy_meters,
     operational_status, order_id, work_order_id)
  values
    (v_ws_id, v_user_id, 'check_in', p_latitude, p_longitude, p_accuracy,
     'en_sitio', p_order_id, p_work_order_id)
  returning id into v_gps_event;

  -- Registrar en bitácora de la OT/pedido si aplica
  if p_work_order_id is not null then
    select o.order_number into v_order_num
    from public.work_orders wo join public.orders o on o.id = wo.order_id
    where wo.id = p_work_order_id;

    insert into public.work_logs
      (workspace_id, order_id, work_order_id, user_id, event_type, note, metadata)
    values (
      v_ws_id, p_order_id, p_work_order_id, v_user_id,
      'work_order_status_changed',
      'Check In registrado en OT',
      jsonb_build_object('gps_event_id', v_gps_event, 'lat', p_latitude, 'lng', p_longitude)
    );
  end if;

  -- Notificar a admin/supervisor
  insert into public.notifications (workspace_id, user_id, title, message, type)
  select v_ws_id, p.id,
    '📍 Check In',
    (select full_name from public.profiles where id = v_user_id) || ' llegó al sitio' ||
    coalesce(' · ' || v_order_num, ''),
    'gps_check_in'
  from public.profiles p
  where p.workspace_id = v_ws_id
    and p.role in ('owner','admin','supervisor')
    and p.status = 'active'
    and p.id != v_user_id;

  return jsonb_build_object(
    'ok', true,
    'event_type', 'check_in',
    'operational_status', 'en_sitio',
    'gps_event_id', v_gps_event
  );
end;
$$;

grant execute on function public.record_check_in(numeric, numeric, numeric, uuid, uuid) to authenticated;

-- ============================================================================
-- RPC 3: record_check_out — registra salida del sitio
-- ============================================================================

create or replace function public.record_check_out(
  p_latitude      numeric,
  p_longitude     numeric,
  p_accuracy      numeric default null,
  p_order_id      uuid    default null,
  p_work_order_id uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_ws_id     uuid;
  v_consent   timestamptz;
  v_coord_ok  jsonb;
  v_gps_event uuid;
begin
  select workspace_id, gps_consent_at
  into v_ws_id, v_consent
  from public.profiles
  where id = v_user_id and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  end if;

  if not public.check_feature_access(v_ws_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  end if;

  if v_consent is null then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
  if not (v_coord_ok->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
  end if;

  -- Actualizar estado a disponible
  update public.profiles
  set operational_status = 'disponible', updated_at = now()
  where id = v_user_id;

  -- UPSERT member_locations
  insert into public.member_locations
    (workspace_id, user_id, latitude, longitude, accuracy_meters, source, order_id, work_order_id)
  values
    (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy, 'check_out', p_order_id, p_work_order_id)
  on conflict (workspace_id, user_id) do update set
    latitude        = excluded.latitude,
    longitude       = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    source          = 'check_out',
    order_id        = excluded.order_id,
    work_order_id   = excluded.work_order_id,
    recorded_at     = now();

  -- Historial
  insert into public.gps_events
    (workspace_id, user_id, event_type, latitude, longitude, accuracy_meters,
     operational_status, order_id, work_order_id)
  values
    (v_ws_id, v_user_id, 'check_out', p_latitude, p_longitude, p_accuracy,
     'disponible', p_order_id, p_work_order_id)
  returning id into v_gps_event;

  -- Bitácora OT
  if p_work_order_id is not null then
    insert into public.work_logs
      (workspace_id, order_id, work_order_id, user_id, event_type, note, metadata)
    values (
      v_ws_id, p_order_id, p_work_order_id, v_user_id,
      'work_order_status_changed',
      'Check Out registrado',
      jsonb_build_object('gps_event_id', v_gps_event, 'lat', p_latitude, 'lng', p_longitude)
    );
  end if;

  -- Notificación
  insert into public.notifications (workspace_id, user_id, title, message, type)
  select v_ws_id, p.id, '🏁 Check Out',
    (select full_name from public.profiles where id = v_user_id) || ' salió del sitio',
    'gps_check_out'
  from public.profiles p
  where p.workspace_id = v_ws_id
    and p.role in ('owner','admin','supervisor')
    and p.status = 'active'
    and p.id != v_user_id;

  return jsonb_build_object(
    'ok', true, 'event_type', 'check_out',
    'operational_status', 'disponible',
    'gps_event_id', v_gps_event
  );
end;
$$;

grant execute on function public.record_check_out(numeric, numeric, numeric, uuid, uuid) to authenticated;

-- ============================================================================
-- RPC 4: update_operational_status — cambio de estado sin coordenadas
-- ============================================================================

create or replace function public.update_operational_status(p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ws_id   uuid;
  v_old     text;
  v_allowed text[] := array['off','disponible','en_ruta','en_sitio','finalizado'];
begin
  if not (p_new_status = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'Estado inválido');
  end if;

  select workspace_id, operational_status into v_ws_id, v_old
  from public.profiles where id = v_user_id and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  end if;

  if not public.check_feature_access(v_ws_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  end if;

  update public.profiles
  set operational_status = p_new_status, updated_at = now()
  where id = v_user_id;

  -- Registrar en gps_events (sin coordenadas)
  insert into public.gps_events
    (workspace_id, user_id, event_type, operational_status, metadata)
  values
    (v_ws_id, v_user_id, 'status_change', p_new_status,
     jsonb_build_object('from', v_old, 'to', p_new_status));

  return jsonb_build_object(
    'ok', true,
    'from_status', v_old,
    'to_status',   p_new_status
  );
end;
$$;

grant execute on function public.update_operational_status(text) to authenticated;

-- ============================================================================
-- RPC 5: update_location_manual — actualización manual de ubicación
-- ============================================================================

create or replace function public.update_location_manual(
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_ws_id    uuid;
  v_consent  timestamptz;
  v_coord_ok jsonb;
begin
  select workspace_id, gps_consent_at
  into v_ws_id, v_consent
  from public.profiles where id = v_user_id and status = 'active';

  if not found then return jsonb_build_object('ok', false, 'error', 'Perfil no encontrado'); end if;
  if not public.check_feature_access(v_ws_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  end if;
  if v_consent is null then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
  if not (v_coord_ok->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
  end if;

  insert into public.member_locations
    (workspace_id, user_id, latitude, longitude, accuracy_meters, source)
  values (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy, 'manual')
  on conflict (workspace_id, user_id) do update set
    latitude        = excluded.latitude,
    longitude       = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    source          = 'manual',
    recorded_at     = now();

  insert into public.gps_events
    (workspace_id, user_id, event_type, latitude, longitude, accuracy_meters)
  values (v_ws_id, v_user_id, 'manual_update', p_latitude, p_longitude, p_accuracy);

  return jsonb_build_object('ok', true, 'event_type', 'manual_update');
end;
$$;

grant execute on function public.update_location_manual(numeric, numeric, numeric) to authenticated;

-- ============================================================================
-- RPC 6: get_team_map — mapa completo del equipo (solo owner/admin/supervisor)
-- ============================================================================

create or replace function public.get_team_map(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_can_view  boolean;
begin
  -- Validar membresía
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Feature gating
  if not public.check_feature_access(p_workspace_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  end if;

  -- Control de acceso por rol: comercial/operario solo ven su propia fila
  v_can_view := public.can_view_full_team(p_workspace_id);

  return jsonb_build_object(
    'ok', true,
    'can_view_full_team', v_can_view,
    'members', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id',           p.id,
          'full_name',         p.full_name,
          'email',             p.email,
          'phone',             p.phone,
          'role',              p.role,
          'operational_status',p.operational_status,
          'gps_consent',       p.gps_consent_at is not null,
          -- Última ubicación
          'latitude',          ml.latitude,
          'longitude',         ml.longitude,
          'accuracy_meters',   ml.accuracy_meters,
          'location_source',   ml.source,
          'location_updated',  ml.recorded_at,
          -- OT activa asignada
          'work_order_id',     wo.id,
          'work_order_number', wo.work_order_number,
          'work_order_title',  wo.title,
          'work_order_status', wo.status,
          'order_id',          o.id,
          'order_number',      o.order_number,
          'order_title',       o.title
        )
        order by p.full_name
      ), '[]'::jsonb)
      from public.profiles p
      left join public.member_locations ml
        on ml.user_id = p.id and ml.workspace_id = p.workspace_id
      left join public.work_orders wo
        on wo.assigned_to = p.id and wo.workspace_id = p.workspace_id
        and wo.status in ('asignada','en_progreso')
      left join public.orders o on o.id = wo.order_id
      where p.workspace_id = p_workspace_id
        and p.status = 'active'
        -- Comercial/operario solo ven su propia fila
        and (v_can_view or p.id = v_user_id)
    )
  );
end;
$$;

grant execute on function public.get_team_map(uuid) to authenticated;

-- ============================================================================
-- RPC 7: get_member_detail — detalle de un miembro con historial GPS
-- ============================================================================

create or replace function public.get_member_detail(
  p_user_id      uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  -- Validar acceso al workspace
  if not exists (
    select 1 from public.profiles
    where id = v_caller_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  if not public.check_feature_access(p_workspace_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  end if;

  -- Comercial/operario solo pueden ver sus propios datos
  if not public.can_view_full_team(p_workspace_id) and p_user_id != v_caller_id then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos para ver datos de otros miembros');
  end if;

  -- Validar que el target pertenece al workspace
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Miembro no encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'member', (
      select jsonb_build_object(
        'user_id',           p.id,
        'full_name',         p.full_name,
        'email',             p.email,
        'phone',             p.phone,
        'role',              p.role,
        'operational_status',p.operational_status,
        'gps_consent',       p.gps_consent_at is not null,
        'gps_consent_at',    p.gps_consent_at,
        'latitude',          ml.latitude,
        'longitude',         ml.longitude,
        'accuracy_meters',   ml.accuracy_meters,
        'location_updated',  ml.recorded_at
      )
      from public.profiles p
      left join public.member_locations ml on ml.user_id = p.id and ml.workspace_id = p.workspace_id
      where p.id = p_user_id and p.workspace_id = p_workspace_id
    ),
    'recent_gps_events', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'event_type',        e.event_type,
          'latitude',          e.latitude,
          'longitude',         e.longitude,
          'accuracy_meters',   e.accuracy_meters,
          'operational_status',e.operational_status,
          'created_at',        e.created_at
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.gps_events e
      where e.user_id = p_user_id and e.workspace_id = p_workspace_id
      limit 20
    ),
    'active_work_orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',                wo.id,
          'work_order_number', wo.work_order_number,
          'title',             wo.title,
          'status',            wo.status,
          'priority',          wo.priority,
          'order_number',      o.order_number,
          'order_title',       o.title
        )
        order by wo.updated_at desc
      ), '[]'::jsonb)
      from public.work_orders wo
      join public.orders o on o.id = wo.order_id
      where wo.assigned_to = p_user_id
        and wo.workspace_id = p_workspace_id
        and wo.status in ('asignada','en_progreso')
      limit 5
    )
  );
end;
$$;

grant execute on function public.get_member_detail(uuid, uuid) to authenticated;

-- ============================================================================
-- RPC 8: get_operational_dashboard — métricas operativas para dashboard
-- ============================================================================

create or replace function public.get_operational_dashboard(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_today_start timestamptz := date_trunc('day', now());
begin
  -- Validar acceso
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  -- Solo owner/admin/supervisor
  if not public.can_view_full_team(p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos para ver el dashboard operativo');
  end if;

  if not public.check_feature_access(p_workspace_id, 'gps_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Dashboard GPS requiere plan PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'team_status', (
      select jsonb_object_agg(operational_status, cnt)
      from (
        select operational_status, count(*)::int as cnt
        from public.profiles
        where workspace_id = p_workspace_id and status = 'active'
          and role not in ('super_admin','support_admin')
        group by operational_status
      ) s
    ),
    'total_miembros', (
      select count(*)::int from public.profiles
      where workspace_id = p_workspace_id and status = 'active'
        and role not in ('super_admin','support_admin')
    ),
    'en_campo', (
      select count(*)::int from public.profiles
      where workspace_id = p_workspace_id and status = 'active'
        and operational_status in ('en_ruta','en_sitio')
    ),
    'checkins_hoy', (
      select count(*)::int from public.gps_events
      where workspace_id = p_workspace_id
        and event_type = 'check_in'
        and created_at >= v_today_start
    ),
    'checkouts_hoy', (
      select count(*)::int from public.gps_events
      where workspace_id = p_workspace_id
        and event_type = 'check_out'
        and created_at >= v_today_start
    ),
    'ot_activas', (
      select count(*)::int from public.work_orders
      where workspace_id = p_workspace_id
        and status in ('asignada','en_progreso')
    ),
    'ot_finalizadas_hoy', (
      select count(*)::int from public.work_orders
      where workspace_id = p_workspace_id
        and status = 'finalizada'
        and updated_at >= v_today_start
    ),
    'miembros_en_campo', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id',           p.id,
          'full_name',         p.full_name,
          'role',              p.role,
          'operational_status',p.operational_status,
          'latitude',          ml.latitude,
          'longitude',         ml.longitude,
          'location_updated',  ml.recorded_at,
          'work_order_title',  wo.title,
          'work_order_number', wo.work_order_number
        )
        order by ml.recorded_at desc nulls last
      ), '[]'::jsonb)
      from public.profiles p
      left join public.member_locations ml on ml.user_id = p.id and ml.workspace_id = p.workspace_id
      left join public.work_orders wo on wo.assigned_to = p.id
        and wo.workspace_id = p.workspace_id
        and wo.status in ('asignada','en_progreso')
      where p.workspace_id = p_workspace_id
        and p.status = 'active'
        and p.operational_status in ('en_ruta','en_sitio')
    )
  );
end;
$$;

grant execute on function public.get_operational_dashboard(uuid) to authenticated;

comment on function public.grant_gps_consent         is 'Sprint 8: usuario acepta uso de GPS. Obligatorio antes de check_in/check_out.';
comment on function public.record_check_in           is 'Sprint 8: registra llegada. Valida consentimiento + precisión ≤500m.';
comment on function public.record_check_out          is 'Sprint 8: registra salida. Valida consentimiento + precisión ≤500m.';
comment on function public.update_operational_status is 'Sprint 8: cambia estado sin coordenadas.';
comment on function public.update_location_manual    is 'Sprint 8: actualización manual de ubicación.';
comment on function public.get_team_map              is 'Sprint 8: mapa completo — owner/admin/supervisor únicamente.';
comment on function public.get_member_detail         is 'Sprint 8: detalle de miembro con GPS. Comercial/operario solo se ven a sí mismos.';
comment on function public.get_operational_dashboard is 'Sprint 8: métricas operativas — owner/admin/supervisor únicamente.';
