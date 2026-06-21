-- ============================================================================
-- 0060 — portal_rpc: RPCs del Portal del Cliente Sprint 10
-- ============================================================================
-- Zero Trust: token valida workspace_id + client_id. Nunca del frontend.
-- Todas las RPCs públicas (sin auth) validan el token antes de cualquier acción.
-- ============================================================================

-- ─── Helper interno: validar token portal ────────────────────────────────────

create or replace function public._validate_portal_token(
  p_token    uuid,
  p_action   text    default 'portal_opened',
  p_entity_id uuid   default null
)
returns table (
  workspace_id uuid,
  client_id    uuid,
  token_id     uuid,
  portal_enabled boolean,
  show_evidences boolean,
  show_responsible boolean,
  show_comments  boolean,
  show_timeline  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws   uuid;
  v_cl   uuid;
  v_tk   uuid;
begin
  -- Validar token: activo, no vencido, no revocado
  select cpt.workspace_id, cpt.client_id, cpt.id
  into v_ws, v_cl, v_tk
  from public.client_portal_tokens cpt
  where cpt.token = p_token
    and cpt.expires_at > now()
    and cpt.revoked_at is null;

  if not found then
    return;  -- tabla vacía → la RPC que llame verifica si found
  end if;

  -- Actualizar last_access_at
  update public.client_portal_tokens
  set last_access_at = now()
  where id = v_tk;

  -- Log de acceso (fire and forget, sin bloquear)
  insert into public.portal_access_log
    (workspace_id, client_id, token_id, action, entity_id)
  values (v_ws, v_cl, v_tk, p_action, p_entity_id);

  -- Obtener config del portal
  return query
  select
    v_ws, v_cl, v_tk,
    coalesce(cs.portal_enabled, true),
    coalesce(cs.portal_show_evidences, false),
    coalesce(cs.portal_show_responsible, true),
    coalesce(cs.portal_show_comments, false),
    coalesce(cs.portal_show_timeline, true)
  from public.company_settings cs
  where cs.workspace_id = v_ws;
end;
$$;

-- ============================================================================
-- RPC 1: create_client_portal_token — workspace genera token para su cliente
-- ============================================================================

create or replace function public.create_client_portal_token(
  p_workspace_id uuid,
  p_client_id    uuid,
  p_days_valid   int  default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_token    uuid;
  v_expires  timestamptz;
begin
  -- Validar membresía
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id and status = 'active'
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

  -- Límite de validez: 1 a 365 días
  p_days_valid := least(greatest(p_days_valid, 1), 365);
  v_expires    := now() + (p_days_valid || ' days')::interval;

  -- UPSERT: renovar si existe, crear si no
  insert into public.client_portal_tokens
    (workspace_id, client_id, created_by, expires_at, revoked_at)
  values
    (p_workspace_id, p_client_id, v_user_id, v_expires, null)
  on conflict (workspace_id, client_id) do update set
    token      = gen_random_uuid(),   -- rotar token al renovar
    expires_at = excluded.expires_at,
    revoked_at = null,                -- reactivar si estaba revocado
    created_by = excluded.created_by,
    created_at = now()
  returning token into v_token;

  return jsonb_build_object(
    'ok',        true,
    'token',     v_token,
    'expires_at',v_expires,
    'portal_url','/portal/' || v_token::text
  );
end;
$$;

grant execute on function public.create_client_portal_token(uuid, uuid, int) to authenticated;

-- ============================================================================
-- RPC 2: revoke_client_portal_token — revocar acceso del cliente
-- ============================================================================

create or replace function public.revoke_client_portal_token(
  p_workspace_id uuid,
  p_client_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Validar membresía (solo owner/admin)
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
      and status = 'active'
      and role in ('owner','admin','super_admin','support_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos para revocar tokens');
  end if;

  update public.client_portal_tokens
  set revoked_at = now()
  where workspace_id = p_workspace_id
    and client_id    = p_client_id
    and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No existe token activo para este cliente');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.revoke_client_portal_token(uuid, uuid) to authenticated;

-- ============================================================================
-- RPC 3: get_client_portal — dashboard principal del portal
-- ============================================================================

create or replace function public.get_client_portal(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws       uuid;
  v_cl       uuid;
  v_tk       uuid;
  v_cfg      record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'portal_opened');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Token inválido, expirado o revocado', 'code', 'invalid_token');
  end if;

  v_ws := v_cfg.workspace_id;
  v_cl := v_cfg.client_id;
  v_tk := v_cfg.token_id;

  if not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'El portal no está disponible para esta empresa', 'code', 'portal_disabled');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone
      )
      from public.clients c where c.id = v_cl
    ),
    'company', (
      select jsonb_build_object(
        'name',            cs.name,
        'logo_path',       cs.logo_path,
        'color_primary',   cs.color_primary,
        'color_secondary', cs.color_secondary,
        'color_accent',    cs.color_accent,
        'phone',           cs.phone,
        'email',           cs.email,
        'city',            cs.city
      )
      from public.company_settings cs where cs.workspace_id = v_ws
    ),
    'config', jsonb_build_object(
      'show_evidences',   v_cfg.show_evidences,
      'show_responsible', v_cfg.show_responsible,
      'show_comments',    v_cfg.show_comments,
      'show_timeline',    v_cfg.show_timeline
    ),
    'summary', (
      select jsonb_build_object(
        'total_quotes',    count(*)::int,
        'approved_quotes', count(*) filter (where status = 'Aprobada')::int,
        'pending_quotes',  count(*) filter (where status in ('Enviada','Borrador'))::int,
        'total_value',     coalesce(sum((calc_snapshot->>'total')::numeric) filter (where status = 'Aprobada'), 0)
      )
      from public.quotes
      where client_id = v_cl and workspace_id = v_ws and deleted_at is null
    ),
    'active_orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           o.id,
          'order_number', o.order_number,
          'title',        o.title,
          'status',       o.status,
          'scheduled_at', o.scheduled_at,
          'total_amount', o.total_amount
        )
        order by o.updated_at desc
      ), '[]'::jsonb)
      from public.orders o
      where o.client_id = v_cl and o.workspace_id = v_ws
        and o.deleted_at is null
        and o.status not in ('finalizado','cancelado')
    ),
    'recent_quote', (
      select jsonb_build_object(
        'id',           q.id,
        'quote_number', q.quote_number,
        'title',        q.title,
        'status',       q.status,
        'commercial_status', q.commercial_status,
        'total',        coalesce((q.calc_snapshot->>'total')::numeric, 0),
        'sent_at',      q.sent_at,
        'updated_at',   q.updated_at
      )
      from public.quotes q
      where q.client_id = v_cl and q.workspace_id = v_ws and q.deleted_at is null
      order by q.updated_at desc
      limit 1
    )
  );
end;
$$;

-- ============================================================================
-- RPC 4: get_portal_quotes — cotizaciones del cliente
-- ============================================================================

create or replace function public.get_portal_quotes(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'quote_viewed');
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'quotes', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',               q.id,
          'quote_number',     q.quote_number,
          'title',            q.title,
          'status',           q.status,
          'commercial_status',q.commercial_status,
          'total',            coalesce((q.calc_snapshot->>'total')::numeric, 0),
          'sent_at',          q.sent_at,
          'valid_days',       q.valid_days,
          'created_at',       q.created_at,
          'updated_at',       q.updated_at
        )
        order by q.updated_at desc
      ), '[]'::jsonb)
      from public.quotes q
      where q.client_id = v_cfg.client_id
        and q.workspace_id = v_cfg.workspace_id
        and q.deleted_at is null
    )
  );
end;
$$;

-- ============================================================================
-- RPC 5: get_portal_orders — pedidos del cliente
-- ============================================================================

create or replace function public.get_portal_orders(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'order_viewed');
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           o.id,
          'order_number', o.order_number,
          'title',        o.title,
          'description',  o.description,
          'status',       o.status,
          'total_amount', o.total_amount,
          'scheduled_at', o.scheduled_at,
          'started_at',   o.started_at,
          'finished_at',  o.finished_at,
          'created_at',   o.created_at,
          'updated_at',   o.updated_at,
          -- Responsable (si la empresa lo permite mostrar)
          'assigned_name', case when v_cfg.show_responsible then
            (select full_name from public.profiles where id = o.assigned_to)
          else null end,
          -- Progreso OTs
          'work_order_count', (
            select count(*)::int from public.work_orders where order_id = o.id
          ),
          'work_orders_done', (
            select count(*)::int from public.work_orders
            where order_id = o.id and status = 'finalizada'
          )
        )
        order by o.updated_at desc
      ), '[]'::jsonb)
      from public.orders o
      where o.client_id = v_cfg.client_id
        and o.workspace_id = v_cfg.workspace_id
        and o.deleted_at is null
    )
  );
end;
$$;

-- ============================================================================
-- RPC 6: get_portal_work_orders — OTs de un pedido
-- ============================================================================

create or replace function public.get_portal_work_orders(
  p_token    uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'ot_viewed', p_order_id);
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  end if;

  -- Verificar que el pedido pertenece al cliente
  if not exists (
    select 1 from public.orders
    where id = p_order_id and client_id = v_cfg.client_id
      and workspace_id = v_cfg.workspace_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'work_orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',                wo.id,
          'work_order_number', wo.work_order_number,
          'title',             wo.title,
          'description',       wo.description,
          'status',            wo.status,
          'priority',          wo.priority,
          'sequence_num',      wo.sequence_num,
          'scheduled_at',      wo.scheduled_at,
          'started_at',        wo.started_at,
          'finished_at',       wo.finished_at,
          'assigned_name', case when v_cfg.show_responsible then
            (select full_name from public.profiles where id = wo.assigned_to)
          else null end,
          'comments', case when v_cfg.show_comments then (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'note',       wl.note,
                'created_at', wl.created_at
              )
              order by wl.created_at asc
            ), '[]'::jsonb)
            from public.work_logs wl
            where wl.work_order_id = wo.id
              and wl.visible_to_client = true
              and wl.event_type = 'comment'
          ) else '[]'::jsonb end
        )
        order by wo.sequence_num asc
      ), '[]'::jsonb)
      from public.work_orders wo
      where wo.order_id = p_order_id and wo.workspace_id = v_cfg.workspace_id
    )
  );
end;
$$;

-- ============================================================================
-- RPC 7: get_portal_evidences — evidencias visible_to_client del cliente
-- ============================================================================

create or replace function public.get_portal_evidences(
  p_token    uuid,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'evidence_viewed', p_order_id);
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  end if;

  -- Verificar que la empresa permite mostrar evidencias
  if not v_cfg.show_evidences then
    return jsonb_build_object('ok', false, 'error', 'Las evidencias no están habilitadas en el portal', 'code', 'evidences_disabled');
  end if;

  -- Verificar que el pedido pertenece al cliente (si se especificó)
  if p_order_id is not null and not exists (
    select 1 from public.orders
    where id = p_order_id and client_id = v_cfg.client_id
      and workspace_id = v_cfg.workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'evidences', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',             e.id,
          'file_name',      e.file_name,
          'file_size',      e.file_size,
          'file_type',      e.file_type,
          'mime_type',      e.mime_type,
          'storage_path',   e.storage_path,
          'caption',        e.caption,
          'is_signature',   e.is_signature,
          'order_id',       e.order_id,
          'work_order_id',  e.work_order_id,
          'created_at',     e.created_at
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.evidence_files e
      -- Solo evidencias de pedidos de este cliente
      join public.orders o on o.id = e.order_id
        and o.client_id = v_cfg.client_id
        and o.workspace_id = v_cfg.workspace_id
      where e.visible_to_client = true
        and e.deleted_at is null
        and (p_order_id is null or e.order_id = p_order_id)
    )
  );
end;
$$;

-- ============================================================================
-- RPC 8: get_portal_timeline — timeline unificado del cliente
-- ============================================================================

create or replace function public.get_portal_timeline(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'timeline_viewed');
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  end if;

  if not v_cfg.show_timeline then
    return jsonb_build_object('ok', true, 'events', '[]'::jsonb, 'note', 'Timeline no habilitado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'events', (
      select coalesce(jsonb_agg(evt order by evt->>'created_at' desc), '[]'::jsonb)
      from (
        -- Eventos de cotizaciones
        select jsonb_build_object(
          'type',        'quote',
          'event_type',  case q.status
            when 'Aprobada' then 'quote_approved'
            when 'Rechazada' then 'quote_rejected'
            when 'Enviada' then 'quote_sent'
            else 'quote_created'
          end,
          'title',       case q.status
            when 'Aprobada' then 'Cotización aprobada'
            when 'Rechazada' then 'Cotización rechazada'
            when 'Enviada' then 'Cotización enviada'
            else 'Cotización creada'
          end,
          'description', q.title,
          'entity_id',   q.id,
          'amount',      coalesce((q.calc_snapshot->>'total')::numeric, 0),
          'created_at',  q.updated_at
        ) as evt
        from public.quotes q
        where q.client_id = v_cfg.client_id and q.workspace_id = v_cfg.workspace_id
          and q.deleted_at is null and q.status != 'Borrador'

        union all

        -- Eventos de pedidos
        select jsonb_build_object(
          'type',        'order',
          'event_type',  'order_' || o.status,
          'title',       case o.status
            when 'en_ejecucion' then 'Trabajo iniciado'
            when 'finalizado'   then 'Trabajo finalizado'
            when 'programado'   then 'Trabajo programado'
            else 'Pedido ' || o.status
          end,
          'description', o.title,
          'entity_id',   o.id,
          'amount',      o.total_amount,
          'created_at',  o.updated_at
        ) as evt
        from public.orders o
        where o.client_id = v_cfg.client_id and o.workspace_id = v_cfg.workspace_id
          and o.deleted_at is null

        union all

        -- Evidencias subidas (si portal_show_evidences)
        select jsonb_build_object(
          'type',       'evidence',
          'event_type', 'evidence_uploaded',
          'title',      'Nueva evidencia disponible',
          'description',coalesce(e.caption, e.file_name),
          'entity_id',  e.id,
          'created_at', e.created_at
        ) as evt
        from public.evidence_files e
        join public.orders o on o.id = e.order_id
          and o.client_id = v_cfg.client_id
          and o.workspace_id = v_cfg.workspace_id
        where e.visible_to_client = true and e.deleted_at is null
          and v_cfg.show_evidences = true

      ) sub
      limit 50
    )
  );
end;
$$;

-- ============================================================================
-- RPC 9: get_portal_analytics — métricas del portal para la empresa
-- ============================================================================

create or replace function public.get_portal_analytics(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Solo miembros del workspace
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'portal_enabled',    (select portal_enabled from public.company_settings where workspace_id = p_workspace_id),
    'total_tokens',      (select count(*)::int from public.client_portal_tokens where workspace_id = p_workspace_id and revoked_at is null),
    'active_tokens',     (select count(*)::int from public.client_portal_tokens where workspace_id = p_workspace_id and revoked_at is null and expires_at > now()),
    'clientes_con_acceso', (select count(distinct client_id)::int from public.client_portal_tokens where workspace_id = p_workspace_id and revoked_at is null and expires_at > now()),
    'accesos_totales',   (select count(*)::int from public.portal_access_log where workspace_id = p_workspace_id),
    'accesos_7d',        (select count(*)::int from public.portal_access_log where workspace_id = p_workspace_id and created_at >= now() - interval '7 days'),
    'portal_openings_hoy', (select count(*)::int from public.portal_access_log where workspace_id = p_workspace_id and action = 'portal_opened' and created_at >= current_date),
    'clientes_activos_hoy', (select count(distinct client_id)::int from public.portal_access_log where workspace_id = p_workspace_id and created_at >= current_date),
    'by_action', (
      select coalesce(jsonb_object_agg(action, cnt), '{}'::jsonb)
      from (
        select action, count(*)::int as cnt
        from public.portal_access_log
        where workspace_id = p_workspace_id and created_at >= now() - interval '30 days'
        group by action
      ) s
    ),
    'recent_accesses', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'client_name', c.name,
          'action',      pal.action,
          'created_at',  pal.created_at
        )
        order by pal.created_at desc
      ), '[]'::jsonb)
      from public.portal_access_log pal
      left join public.clients c on c.id = pal.client_id
      where pal.workspace_id = p_workspace_id
      limit 10
    )
  );
end;
$$;

grant execute on function public.get_client_portal(uuid)                  to anon, authenticated;
grant execute on function public.get_portal_quotes(uuid)                  to anon, authenticated;
grant execute on function public.get_portal_orders(uuid)                  to anon, authenticated;
grant execute on function public.get_portal_work_orders(uuid, uuid)       to anon, authenticated;
grant execute on function public.get_portal_evidences(uuid, uuid)         to anon, authenticated;
grant execute on function public.get_portal_timeline(uuid)                to anon, authenticated;
grant execute on function public.get_portal_analytics(uuid)               to authenticated;
grant execute on function public.create_client_portal_token(uuid, uuid, int) to authenticated;
grant execute on function public.revoke_client_portal_token(uuid, uuid)   to authenticated;

comment on function public.get_client_portal         is 'Sprint 10: dashboard principal del portal del cliente. Público via token.';
comment on function public.get_portal_quotes         is 'Sprint 10: cotizaciones del cliente en el portal.';
comment on function public.get_portal_orders         is 'Sprint 10: pedidos del cliente en el portal.';
comment on function public.get_portal_work_orders    is 'Sprint 10: OTs de un pedido para el cliente.';
comment on function public.get_portal_evidences      is 'Sprint 10: evidencias visible_to_client del cliente.';
comment on function public.get_portal_timeline       is 'Sprint 10: timeline unificado del cliente.';
comment on function public.get_portal_analytics      is 'Sprint 10: métricas del portal para la empresa.';
comment on function public.create_client_portal_token is 'Sprint 10: crear/renovar token de acceso del cliente.';
comment on function public.revoke_client_portal_token is 'Sprint 10: revocar acceso del cliente.';
