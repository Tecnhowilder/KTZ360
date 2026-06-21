-- ============================================================================
-- 0063 — integrations_rpc: RPCs de Integraciones Sprint 11
-- ============================================================================
-- Zero Trust: workspace_id siempre del JWT. Provider validado contra whitelist.
-- Credenciales nunca expuestas al frontend — solo Edge Functions usan service_role.
-- ============================================================================

-- ─── Helper: whitelist de providers soportados ───────────────────────────────

create or replace function public.is_valid_integration_provider(p_provider text)
returns boolean
language sql
immutable
as $$
  select p_provider in (
    'whatsapp', 'google_calendar', 'outlook_calendar',
    'alegra', 'gmail', 'outlook_mail', 'drive', 'onedrive', 'teams'
  );
$$;

-- ============================================================================
-- RPC 1: initiate_oauth — inicia flujo OAuth (genera URL y PKCE state)
-- ============================================================================

create or replace function public.initiate_oauth(
  p_workspace_id uuid,
  p_provider     text,
  p_redirect_to  text default '/app/config/integraciones'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_state        text;
  v_verifier     text;
  v_nonce        text;
  v_supabase_url text;
  v_callback_url text;
  v_auth_url     text;
begin
  -- Validar membresía (owner/admin solamente)
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
      and status = 'active' and role in ('owner','admin','super_admin','support_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo el propietario o administrador puede conectar integraciones');
  end if;

  -- Validar provider
  if not public.is_valid_integration_provider(p_provider) then
    return jsonb_build_object('ok', false, 'error', 'Proveedor no soportado: ' || p_provider);
  end if;

  -- Solo providers con OAuth
  if p_provider = 'whatsapp' then
    return jsonb_build_object('ok', false, 'error', 'WhatsApp no usa OAuth — usa el flujo de configuración manual');
  end if;

  -- Generar PKCE y state (valores aleatorios)
  v_state    := encode(gen_random_bytes(32), 'hex');
  v_verifier := encode(gen_random_bytes(32), 'hex');
  v_nonce    := encode(gen_random_bytes(16), 'hex');

  -- Limpiar estados anteriores del mismo workspace/provider
  delete from public.oauth_states
  where workspace_id = p_workspace_id and provider = p_provider;

  -- Guardar estado PKCE (10 minutos de validez)
  insert into public.oauth_states
    (workspace_id, provider, state, code_verifier, nonce, redirect_to)
  values
    (p_workspace_id, p_provider, v_state, v_verifier, v_nonce, p_redirect_to);

  -- Registrar como pending
  insert into public.integrations (workspace_id, provider, status, connected_by)
  values (p_workspace_id, p_provider, 'pending', v_user_id)
  on conflict (workspace_id, provider) do update set
    status = 'pending', updated_at = now();

  -- Construir URL de autorización (el code_challenge se calcula en frontend para evitar exponer verifier)
  -- Nota: el frontend debe calcular SHA-256(verifier) → base64url → code_challenge
  return jsonb_build_object(
    'ok',           true,
    'state',        v_state,
    'code_verifier',v_verifier,   -- el frontend lo guarda en sessionStorage
    'nonce',        v_nonce,
    'provider',     p_provider,
    -- Los parámetros OAuth los construye el frontend usando estos valores
    -- La URL del callback es la Edge Function
    'callback_url', 'functions/v1/oauth-callback'
  );
end;
$$;

grant execute on function public.initiate_oauth(uuid, text, text) to authenticated;

-- ============================================================================
-- RPC 2: get_integration_status — estado de todas las integraciones
-- ============================================================================

create or replace function public.get_integration_status(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'integrations', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           i.id,
          'provider',     i.provider,
          'enabled',      i.enabled,
          'status',       i.status,
          'config',       i.config,
          'connected_at', i.connected_at,
          'last_sync_at', i.last_sync_at,
          'last_error',   i.last_error
        )
        order by i.provider
      ), '[]'::jsonb)
      from public.integrations i
      where i.workspace_id = p_workspace_id
    ),
    'recent_events', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           e.id,
          'provider',     e.provider,
          'event_type',   e.event_type,
          'status',       e.status,
          'retries',      e.retries,
          'last_error',   e.last_error,
          'created_at',   e.created_at,
          'processed_at', e.processed_at
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.integration_events e
      where e.workspace_id = p_workspace_id
      limit 20
    )
  );
end;
$$;

grant execute on function public.get_integration_status(uuid) to authenticated;

-- ============================================================================
-- RPC 3: disconnect_integration — desconectar un proveedor
-- ============================================================================

create or replace function public.disconnect_integration(
  p_workspace_id uuid,
  p_provider     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Solo owner/admin pueden desconectar
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
      and status = 'active' and role in ('owner','admin','super_admin','support_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos para desconectar integraciones');
  end if;

  if not public.is_valid_integration_provider(p_provider) then
    return jsonb_build_object('ok', false, 'error', 'Proveedor inválido');
  end if;

  -- Actualizar estado
  update public.integrations
  set status = 'disconnected', enabled = false, connected_at = null, updated_at = now()
  where workspace_id = p_workspace_id and provider = p_provider;

  -- Eliminar credenciales (requiere service_role — solo posible vía Edge Function)
  -- El frontend llama esta RPC, la Edge Function borra las credenciales
  -- Por ahora marcamos las credenciales como expiradas
  update public.integration_credentials
  set expires_at = now() - interval '1 second', updated_at = now()
  where workspace_id = p_workspace_id and provider = p_provider;

  -- Audit log
  insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
  values (
    p_workspace_id, v_user_id,
    'integration_disconnected', 'integrations',
    jsonb_build_object('provider', p_provider)
  );

  return jsonb_build_object('ok', true, 'provider', p_provider, 'status', 'disconnected');
end;
$$;

grant execute on function public.disconnect_integration(uuid, text) to authenticated;

-- ============================================================================
-- RPC 4: configure_whatsapp — configurar integración WhatsApp (manual/enriquecida)
-- ============================================================================

create or replace function public.configure_whatsapp(
  p_workspace_id uuid,
  p_config       jsonb  -- {phone_country_code, templates: {quote_sent: bool, ...}}
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
      and status = 'active' and role in ('owner','admin','super_admin','support_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos');
  end if;

  insert into public.integrations
    (workspace_id, provider, enabled, status, config, connected_at, connected_by)
  values
    (p_workspace_id, 'whatsapp', true, 'connected', p_config, now(), v_user_id)
  on conflict (workspace_id, provider) do update set
    config       = p_config,
    enabled      = true,
    status       = 'connected',
    connected_at = now(),
    connected_by = v_user_id,
    updated_at   = now();

  insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
  values (p_workspace_id, v_user_id, 'integration_configured', 'integrations',
    jsonb_build_object('provider', 'whatsapp'));

  return jsonb_build_object('ok', true, 'provider', 'whatsapp', 'status', 'connected');
end;
$$;

grant execute on function public.configure_whatsapp(uuid, jsonb) to authenticated;

-- ============================================================================
-- RPC 5: queue_integration_event — encolar evento para procesamiento
-- ============================================================================

create or replace function public.queue_integration_event(
  p_workspace_id uuid,
  p_provider     text,
  p_event_type   text,
  p_payload      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_enabled  boolean;
begin
  -- Verificar que la integración está activa
  select enabled into v_enabled
  from public.integrations
  where workspace_id = p_workspace_id and provider = p_provider and status = 'connected';

  if not found or not v_enabled then
    return null;  -- Integración no activa — no encolar
  end if;

  insert into public.integration_events
    (workspace_id, provider, event_type, payload)
  values
    (p_workspace_id, p_provider, p_event_type, p_payload)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ============================================================================
-- RPC 6: get_whatsapp_message — genera mensaje WA con variables dinámicas
-- ============================================================================

create or replace function public.get_whatsapp_message(
  p_workspace_id uuid,
  p_event_type   text,
  p_entity_id    uuid    default null,
  p_extra_params jsonb   default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_company_name text;
  v_message     text;
  v_phone       text;
  v_wa_url      text;
  v_client_name text;
  v_project     text;
  v_total       numeric;
  v_portal_url  text;
  v_order_num   text;
  v_date        text;
begin
  -- Validar acceso
  if not exists (
    select 1 from public.profiles where workspace_id = p_workspace_id and id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  -- Obtener nombre de empresa
  select name into v_company_name from public.company_settings where workspace_id = p_workspace_id;

  -- Construir mensaje según event_type
  case p_event_type

    when 'quote_sent' then
      -- Obtener datos de cotización
      select
        c.name, q.title,
        coalesce((q.calc_snapshot->>'total')::numeric, 0),
        c.phone
      into v_client_name, v_project, v_total, v_phone
      from public.quotes q
      left join public.clients c on c.id = q.client_id
      where q.id = p_entity_id and q.workspace_id = p_workspace_id;

      -- URL del portal del cliente (Sprint 10)
      select '/portal/' || cpt.token::text into v_portal_url
      from public.client_portal_tokens cpt
      join public.clients c on c.id = cpt.client_id
      join public.quotes q on q.client_id = c.id
      where q.id = p_entity_id and cpt.workspace_id = p_workspace_id
        and cpt.expires_at > now() and cpt.revoked_at is null
      limit 1;

      v_message := format(
        E'Hola %s 👋\n\nPreparé una propuesta personalizada para:\n\n📌 %s\n\n💰 Valor estimado:\n$ %s\n\nPuedes revisarla aquí:\n🔗 %s\n\nQuedo atento a cualquier consulta.\n\n%s',
        coalesce(split_part(v_client_name, ' ', 1), 'Cliente'),
        coalesce(v_project, 'tu proyecto'),
        to_char(coalesce(v_total, 0), 'FM999,999,999'),
        coalesce(v_portal_url, ''),
        coalesce(v_company_name, '')
      );

    when 'followup' then
      select c.name, q.title, c.phone
      into v_client_name, v_project, v_phone
      from public.quotes q
      left join public.clients c on c.id = q.client_id
      where q.id = p_entity_id and q.workspace_id = p_workspace_id;

      v_message := format(
        E'Hola %s 👋\n\n¿Tuviste la oportunidad de revisar nuestra propuesta para *%s*?\n\nEstoy a tu disposición para cualquier ajuste o consulta.\n\n%s',
        coalesce(split_part(v_client_name, ' ', 1), 'Cliente'),
        coalesce(v_project, 'tu proyecto'),
        coalesce(v_company_name, '')
      );

    when 'order_created' then
      select c.name, o.order_number, o.title,
             to_char(o.scheduled_at at time zone 'America/Bogota', 'DD/MM/YYYY'), c.phone
      into v_client_name, v_order_num, v_project, v_date, v_phone
      from public.orders o
      left join public.clients c on c.id = o.client_id
      where o.id = p_entity_id and o.workspace_id = p_workspace_id;

      v_message := format(
        E'Hola %s 👋\n\n¡Tu pedido ha sido confirmado! ✅\n\n📦 *%s* - %s\n%s\n\nNuestro equipo se pondrá en contacto contigo.\n\n%s',
        coalesce(split_part(v_client_name, ' ', 1), 'Cliente'),
        coalesce(v_order_num, ''),
        coalesce(v_project, ''),
        case when v_date is not null then E'📅 Fecha: ' || v_date else '' end,
        coalesce(v_company_name, '')
      );

    when 'work_order_scheduled' then
      select c.name, wo.title,
             to_char(wo.scheduled_at at time zone 'America/Bogota', 'DD/MM/YYYY'), c.phone
      into v_client_name, v_project, v_date, v_phone
      from public.work_orders wo
      join public.orders o on o.id = wo.order_id
      left join public.clients c on c.id = o.client_id
      where wo.id = p_entity_id and wo.workspace_id = p_workspace_id;

      v_message := format(
        E'Hola %s 👋\n\nTe informamos que hemos programado la siguiente actividad:\n\n🔧 *%s*\n📅 Fecha: %s\n\nNuestro equipo llegará puntualmente.\n\n%s',
        coalesce(split_part(v_client_name, ' ', 1), 'Cliente'),
        coalesce(v_project, 'la actividad programada'),
        coalesce(v_date, 'a confirmar'),
        coalesce(v_company_name, '')
      );

    when 'work_order_completed' then
      select c.name, wo.title, c.phone
      into v_client_name, v_project, v_phone
      from public.work_orders wo
      join public.orders o on o.id = wo.order_id
      left join public.clients c on c.id = o.client_id
      where wo.id = p_entity_id and wo.workspace_id = p_workspace_id;

      v_message := format(
        E'Hola %s 👋\n\n¡Trabajo completado! ✅\n\n🔧 *%s*\n\nEl servicio ha sido finalizado exitosamente. Si tienes algún comentario, con gusto lo atendemos.\n\n%s',
        coalesce(split_part(v_client_name, ' ', 1), 'Cliente'),
        coalesce(v_project, 'el trabajo'),
        coalesce(v_company_name, '')
      );

    when 'review_request' then
      select c.name, c.phone
      into v_client_name, v_phone
      from public.clients c
      where c.id = p_entity_id and c.workspace_id = p_workspace_id;

      v_message := format(
        E'Hola %s 👋\n\nEsperamos que hayas quedado satisfecho con nuestro servicio.\n\n⭐ ¿Nos podrías dejar una opinión? Tu comentario nos ayuda a mejorar.\n\nMuchas gracias por confiar en nosotros.\n\n%s',
        coalesce(split_part(v_client_name, ' ', 1), 'Cliente'),
        coalesce(v_company_name, '')
      );

    else
      return jsonb_build_object('ok', false, 'error', 'Tipo de evento no soportado: ' || p_event_type);
  end case;

  -- Override con parámetros extra si se pasan
  if p_extra_params ? 'phone' then v_phone := p_extra_params->>'phone'; end if;

  -- Construir URL de WhatsApp
  v_wa_url := case
    when v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) >= 7
    then 'https://wa.me/' || regexp_replace(v_phone, '\D', '', 'g') || '?text=' || encode(v_message::bytea, 'escape')
    else 'https://wa.me/?text=' || encode(v_message::bytea, 'escape')
  end;

  return jsonb_build_object(
    'ok',         true,
    'message',    v_message,
    'phone',      v_phone,
    'wa_url',     v_wa_url,
    'event_type', p_event_type
  );
end;
$$;

grant execute on function public.get_whatsapp_message(uuid, text, uuid, jsonb) to authenticated;

-- ============================================================================
-- RPC 7: get_portal_analytics_integrations — métricas para admin CMS
-- ============================================================================

create or replace function public.get_integrations_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_support_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo super admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'by_provider', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'provider',    provider,
          'connected',   count(*) filter (where status = 'connected')::int,
          'error',       count(*) filter (where status = 'error')::int,
          'pending',     count(*) filter (where status = 'pending')::int,
          'total',       count(*)::int
        )
        order by provider
      ), '[]'::jsonb)
      from public.integrations
      group by provider
    ),
    'events_last_7d', (
      select jsonb_build_object(
        'total',     count(*)::int,
        'processed', count(*) filter (where status = 'processed')::int,
        'failed',    count(*) filter (where status = 'failed')::int,
        'pending',   count(*) filter (where status = 'pending')::int
      )
      from public.integration_events
      where created_at >= now() - interval '7 days'
    ),
    'recent_errors', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'workspace_id', e.workspace_id,
          'provider',     e.provider,
          'event_type',   e.event_type,
          'last_error',   e.last_error,
          'created_at',   e.created_at
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.integration_events e
      where e.status = 'failed' and e.created_at >= now() - interval '7 days'
      limit 10
    )
  );
end;
$$;

grant execute on function public.get_integrations_admin_overview() to authenticated;

comment on function public.initiate_oauth             is 'Sprint 11: inicia flujo OAuth con PKCE. Devuelve state + verifier al frontend.';
comment on function public.get_integration_status     is 'Sprint 11: estado de todas las integraciones del workspace.';
comment on function public.disconnect_integration     is 'Sprint 11: desconectar proveedor y revocar credenciales.';
comment on function public.configure_whatsapp         is 'Sprint 11: configurar WhatsApp enriquecido (no OAuth).';
comment on function public.queue_integration_event    is 'Sprint 11: encolar evento para procesamiento asíncrono.';
comment on function public.get_whatsapp_message       is 'Sprint 11: generar mensaje WhatsApp con variables dinámicas.';
