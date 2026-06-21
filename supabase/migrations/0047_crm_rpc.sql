-- ============================================================================
-- 0047 — crm_rpc: RPCs para seguimientos, timeline y dashboard CRM
-- ============================================================================

-- ============================================================================
-- RPC: create_seguimiento — Zero Trust, feature gated
-- ============================================================================

create or replace function public.create_seguimiento(
  p_workspace_id uuid,
  p_quote_id     uuid        default null,
  p_client_id    uuid        default null,
  p_type         text        default 'nota',
  p_resultado    text        default null,
  p_comentario   text        default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_seguimiento_id uuid;
  v_client_id     uuid := p_client_id;
  v_allowed_types text[] := array['llamada','whatsapp','correo','visita','reunion','nota'];
begin
  -- Validar tipo
  if not (p_type = any(v_allowed_types)) then
    return jsonb_build_object('ok', false, 'error', 'Tipo de seguimiento inválido');
  end if;

  -- Validar pertenencia al workspace
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Feature gating PRO+
  if not public.check_feature_access(p_workspace_id, 'pipeline_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Seguimientos requieren plan PRO o PREMIUM');
  end if;

  -- Si hay quote_id, validar que pertenece al workspace y obtener client_id si no se pasó
  if p_quote_id is not null then
    if not exists (
      select 1 from public.quotes
      where id = p_quote_id and workspace_id = p_workspace_id and deleted_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
    end if;
    if v_client_id is null then
      select client_id into v_client_id
      from public.quotes where id = p_quote_id;
    end if;
  end if;

  -- Si hay client_id, validar que pertenece al workspace
  if v_client_id is not null then
    if not exists (
      select 1 from public.clients
      where id = v_client_id and workspace_id = p_workspace_id and deleted_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
    end if;
  end if;

  -- Crear seguimiento
  insert into public.seguimientos
    (workspace_id, quote_id, client_id, created_by, type, resultado, comentario)
  values
    (p_workspace_id, p_quote_id, v_client_id, v_user_id, p_type, p_resultado, p_comentario)
  returning id into v_seguimiento_id;

  -- Registrar en timeline si hay cliente
  if v_client_id is not null then
    insert into public.client_timeline_events
      (workspace_id, client_id, quote_id, seguimiento_id, type, title, description, created_by)
    values (
      p_workspace_id,
      v_client_id,
      p_quote_id,
      v_seguimiento_id,
      'seguimiento',
      initcap(p_type) || ' registrado',
      p_comentario,
      v_user_id
    );
  end if;

  -- Actualizar last_activity_at del cliente
  if v_client_id is not null then
    update public.clients
    set last_activity_at = now(), updated_at = now()
    where id = v_client_id;
  end if;

  return jsonb_build_object('ok', true, 'seguimiento_id', v_seguimiento_id);
end;
$$;

grant execute on function public.create_seguimiento(uuid, uuid, uuid, text, text, text) to authenticated;

-- ============================================================================
-- RPC: create_recordatorio — Zero Trust, feature gated
-- ============================================================================

create or replace function public.create_recordatorio(
  p_workspace_id uuid,
  p_scheduled_at timestamptz,
  p_type         text        default 'llamada',
  p_note         text        default null,
  p_quote_id     uuid        default null,
  p_client_id    uuid        default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_recordatorio_id uuid;
  v_client_id      uuid := p_client_id;
begin
  -- Validar acceso al workspace
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Feature gating PRO+
  if not public.check_feature_access(p_workspace_id, 'pipeline_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Recordatorios requieren plan PRO o PREMIUM');
  end if;

  -- Fecha futura (mínimo 1 minuto en el futuro)
  if p_scheduled_at <= now() - interval '1 minute' then
    return jsonb_build_object('ok', false, 'error', 'La fecha del recordatorio debe ser futura');
  end if;

  -- Validar quote pertenece al workspace
  if p_quote_id is not null then
    if not exists (
      select 1 from public.quotes
      where id = p_quote_id and workspace_id = p_workspace_id and deleted_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
    end if;
    if v_client_id is null then
      select client_id into v_client_id
      from public.quotes where id = p_quote_id;
    end if;
  end if;

  -- Crear recordatorio
  insert into public.recordatorios
    (workspace_id, created_by, quote_id, client_id, scheduled_at, type, note)
  values
    (p_workspace_id, v_user_id, p_quote_id, v_client_id, p_scheduled_at, p_type, p_note)
  returning id into v_recordatorio_id;

  -- Registrar en timeline
  if v_client_id is not null then
    insert into public.client_timeline_events
      (workspace_id, client_id, quote_id, recordatorio_id, type, title, description, created_by)
    values (
      p_workspace_id,
      v_client_id,
      p_quote_id,
      v_recordatorio_id,
      'recordatorio_created',
      'Recordatorio: ' || p_type,
      p_note,
      v_user_id
    );
  end if;

  -- Crear notificación interna
  insert into public.notifications
    (workspace_id, user_id, title, message, type)
  values (
    p_workspace_id,
    v_user_id,
    'Recordatorio programado',
    coalesce(p_note, 'Tienes un recordatorio de ' || p_type || ' programado.'),
    'reminder'
  );

  return jsonb_build_object('ok', true, 'recordatorio_id', v_recordatorio_id);
end;
$$;

grant execute on function public.create_recordatorio(uuid, timestamptz, text, text, uuid, uuid) to authenticated;

-- ============================================================================
-- RPC: get_client_timeline — historial comercial de un cliente
-- ============================================================================

create or replace function public.get_client_timeline(
  p_workspace_id uuid,
  p_client_id    uuid,
  p_limit        int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Validar acceso al workspace
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Validar que el cliente pertenece al workspace
  if not exists (
    select 1 from public.clients
    where id = p_client_id and workspace_id = p_workspace_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  -- Feature gating PRO+
  if not public.check_feature_access(p_workspace_id, 'pipeline_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Timeline requiere plan PRO o PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'events', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'type', e.type,
          'title', e.title,
          'description', e.description,
          'quote_id', e.quote_id,
          'seguimiento_id', e.seguimiento_id,
          'recordatorio_id', e.recordatorio_id,
          'created_at', e.created_at,
          'metadata', e.metadata
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.client_timeline_events e
      where e.client_id = p_client_id
        and e.workspace_id = p_workspace_id
      limit p_limit
    ),
    'seguimientos', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'type', s.type,
          'resultado', s.resultado,
          'comentario', s.comentario,
          'quote_id', s.quote_id,
          'created_at', s.created_at
        )
        order by s.created_at desc
      ), '[]'::jsonb)
      from public.seguimientos s
      where s.client_id = p_client_id
        and s.workspace_id = p_workspace_id
      limit 20
    )
  );
end;
$$;

grant execute on function public.get_client_timeline(uuid, uuid, int) to authenticated;

-- ============================================================================
-- RPC: get_crm_dashboard — métricas comerciales para dashboard CRM
-- ============================================================================

create or replace function public.get_crm_dashboard(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_sent int;
  v_total_viewed int;
  v_total_approved int;
  v_total_rejected int;
  v_total_negotiation int;
  v_conversion_rate numeric;
  v_avg_close_days numeric;
  v_total_value_approved numeric;
  v_quotes_without_followup int;
  v_quotes_expiring_soon int;
begin
  -- Validar acceso al workspace
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Cotizaciones enviadas (últ. 90 días)
  select count(*) into v_total_sent
  from public.quotes
  where workspace_id = p_workspace_id
    and commercial_status in ('enviada','vista','negociacion','aprobada','rechazada','vencida')
    and created_at >= now() - interval '90 days'
    and deleted_at is null;

  -- Cotizaciones vistas
  select count(*) into v_total_viewed
  from public.quotes
  where workspace_id = p_workspace_id
    and commercial_status in ('vista','negociacion','aprobada')
    and created_at >= now() - interval '90 days'
    and deleted_at is null;

  -- Aprobadas
  select count(*), coalesce(sum((calc_snapshot->>'total')::numeric), 0)
  into v_total_approved, v_total_value_approved
  from public.quotes
  where workspace_id = p_workspace_id
    and commercial_status = 'aprobada'
    and created_at >= now() - interval '90 days'
    and deleted_at is null;

  -- Rechazadas
  select count(*) into v_total_rejected
  from public.quotes
  where workspace_id = p_workspace_id
    and commercial_status = 'rechazada'
    and created_at >= now() - interval '90 days'
    and deleted_at is null;

  -- En negociación
  select count(*) into v_total_negotiation
  from public.quotes
  where workspace_id = p_workspace_id
    and commercial_status = 'negociacion'
    and deleted_at is null;

  -- Tasa de conversión (aprobadas / (aprobadas + rechazadas))
  if (v_total_approved + v_total_rejected) > 0 then
    v_conversion_rate := round(
      (v_total_approved::numeric / (v_total_approved + v_total_rejected)) * 100, 1
    );
  else
    v_conversion_rate := 0;
  end if;

  -- Tiempo promedio de cierre (días desde creación hasta aprobación)
  select coalesce(avg(
    extract(epoch from (updated_at - created_at)) / 86400
  ), 0)
  into v_avg_close_days
  from public.quotes
  where workspace_id = p_workspace_id
    and commercial_status = 'aprobada'
    and created_at >= now() - interval '90 days'
    and deleted_at is null;

  -- Cotizaciones enviadas hace >3 días sin seguimiento
  select count(*) into v_quotes_without_followup
  from public.quotes q
  where q.workspace_id = p_workspace_id
    and q.commercial_status in ('enviada', 'vista')
    and q.updated_at < now() - interval '3 days'
    and q.deleted_at is null
    and not exists (
      select 1 from public.seguimientos s
      where s.quote_id = q.id
        and s.created_at > now() - interval '3 days'
    );

  -- Cotizaciones próximas a vencer (en los próximos 3 días)
  select count(*) into v_quotes_expiring_soon
  from public.quotes q
  where q.workspace_id = p_workspace_id
    and q.commercial_status in ('enviada', 'vista', 'negociacion')
    and q.sent_at is not null
    and q.sent_at + (q.valid_days || ' days')::interval between now() and now() + interval '3 days'
    and q.deleted_at is null;

  return jsonb_build_object(
    'ok', true,
    'period_days', 90,
    'sent', v_total_sent,
    'viewed', v_total_viewed,
    'approved', v_total_approved,
    'rejected', v_total_rejected,
    'in_negotiation', v_total_negotiation,
    'conversion_rate', v_conversion_rate,
    'avg_close_days', round(v_avg_close_days::numeric, 1),
    'total_value_approved', v_total_value_approved,
    'without_followup', v_quotes_without_followup,
    'expiring_soon', v_quotes_expiring_soon
  );
end;
$$;

grant execute on function public.get_crm_dashboard(uuid) to authenticated;

-- ============================================================================
-- RPC: get_quote_commercial_history — historial de estados de una cotización
-- ============================================================================

create or replace function public.get_quote_commercial_history(
  p_quote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_workspace_id uuid;
begin
  -- Obtener workspace y validar acceso
  select q.workspace_id into v_workspace_id
  from public.quotes q
  join public.profiles p on p.workspace_id = q.workspace_id
  where q.id = p_quote_id
    and q.deleted_at is null
    and p.id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso a esta cotización');
  end if;

  return jsonb_build_object(
    'ok', true,
    'history', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'from_status', h.from_status,
          'to_status', h.to_status,
          'observacion', h.observacion,
          'changed_by', h.changed_by,
          'created_at', h.created_at
        )
        order by h.created_at asc
      ), '[]'::jsonb)
      from public.quote_commercial_history h
      where h.quote_id = p_quote_id
    ),
    'seguimientos', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'type', s.type,
          'resultado', s.resultado,
          'comentario', s.comentario,
          'created_at', s.created_at
        )
        order by s.created_at asc
      ), '[]'::jsonb)
      from public.seguimientos s
      where s.quote_id = p_quote_id
    ),
    'views', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'opened_at', v.opened_at,
          'device', v.device,
          'browser', v.browser,
          'city', v.city
        )
        order by v.opened_at desc
      ), '[]'::jsonb)
      from public.quote_views v
      where v.quote_id = p_quote_id
    )
  );
end;
$$;

grant execute on function public.get_quote_commercial_history(uuid) to authenticated;

comment on function public.get_pipeline(uuid) is 'CRM: cotizaciones agrupadas por estado comercial — PRO+';
comment on function public.create_seguimiento(uuid,uuid,uuid,text,text,text) is 'CRM: crear seguimiento comercial con feature gating — PRO+';
comment on function public.get_crm_dashboard(uuid) is 'CRM: métricas de conversión para dashboard — PRO+';
