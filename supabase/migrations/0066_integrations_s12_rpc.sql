-- ============================================================================
-- 0066 — integrations_s12_rpc: RPCs Sprint 12
-- ============================================================================
-- Zero Trust: workspace_id siempre del JWT.
-- Credenciales Alegra: nunca expuestas al frontend.
-- ============================================================================

-- ============================================================================
-- RPC 1: store_alegra_credentials — guarda API key cifrada (desde Edge Function)
-- ============================================================================
-- Solo service_role puede llamar directamente (la Edge Function connect-integration
-- usa service_role después de cifrar con ENCRYPTION_KEY).

create or replace function public.store_alegra_credentials(
  p_workspace_id  uuid,
  p_encrypted_data text,
  p_encryption_iv  text,
  p_expires_at     timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo service_role puede almacenar credenciales directamente
  if auth.role() != 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'Solo la Edge Function puede almacenar credenciales');
  end if;

  insert into public.integration_credentials
    (workspace_id, provider, encrypted_data, encryption_iv, expires_at)
  values
    (p_workspace_id, 'alegra', p_encrypted_data, p_encryption_iv, p_expires_at)
  on conflict (workspace_id, provider) do update set
    encrypted_data = excluded.encrypted_data,
    encryption_iv  = excluded.encryption_iv,
    expires_at     = excluded.expires_at,
    updated_at     = now();

  -- Marcar integración como conectada
  insert into public.integrations (workspace_id, provider, enabled, status, connected_at)
  values (p_workspace_id, 'alegra', true, 'connected', now())
  on conflict (workspace_id, provider) do update set
    enabled      = true,
    status       = 'connected',
    connected_at = now(),
    last_error   = null,
    updated_at   = now();

  -- Audit log
  insert into public.audit_log (workspace_id, action, entity_type, metadata)
  values (p_workspace_id, 'integration_connected', 'integrations',
    jsonb_build_object('provider', 'alegra', 'method', 'api_key'));

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- RPC 2: upsert_entity_ref — guardar/actualizar ID externo de una entidad
-- ============================================================================

create or replace function public.upsert_entity_ref(
  p_workspace_id uuid,
  p_entity_type  text,
  p_entity_id    uuid,
  p_provider     text,
  p_external_id  text,
  p_external_url text  default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ref_id  uuid;
begin
  -- Validar acceso al workspace (por entity_type)
  -- Simplificado: si el usuario puede acceder a la entidad, puede guardar refs
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    raise exception 'Sin acceso al workspace';
  end if;

  insert into public.integration_entity_refs
    (workspace_id, entity_type, entity_id, provider, external_id, external_url, metadata)
  values
    (p_workspace_id, p_entity_type, p_entity_id, p_provider, p_external_id, p_external_url, p_metadata)
  on conflict (workspace_id, entity_type, entity_id, provider) do update set
    external_id  = excluded.external_id,
    external_url = excluded.external_url,
    metadata     = excluded.metadata,
    updated_at   = now()
  returning id into v_ref_id;

  return v_ref_id;
end;
$$;

grant execute on function public.upsert_entity_ref(uuid, text, uuid, text, text, text, jsonb) to authenticated;

-- ============================================================================
-- RPC 3: get_entity_refs — obtener IDs externos de una entidad
-- ============================================================================

create or replace function public.get_entity_refs(
  p_workspace_id uuid,
  p_entity_type  text,
  p_entity_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'refs', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'provider',     r.provider,
          'external_id',  r.external_id,
          'external_url', r.external_url,
          'metadata',     r.metadata,
          'created_at',   r.created_at
        )
      ), '[]'::jsonb)
      from public.integration_entity_refs r
      where r.workspace_id = p_workspace_id
        and r.entity_type  = p_entity_type
        and r.entity_id    = p_entity_id
    )
  );
end;
$$;

grant execute on function public.get_entity_refs(uuid, text, uuid) to authenticated;

-- ============================================================================
-- RPC 4: log_communication — registrar comunicación en communication_log
-- ============================================================================

create or replace function public.log_communication(
  p_workspace_id   uuid,
  p_entity_type    text    default null,
  p_entity_id      uuid    default null,
  p_provider       text    default 'whatsapp',
  p_channel        text    default 'whatsapp',
  p_recipient      text    default null,
  p_subject        text    default null,
  p_content_preview text   default null,
  p_status         text    default 'generated',
  p_metadata       jsonb   default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  -- Validar workspace (puede ser llamado desde Edge Function o frontend)
  if auth.role() != 'service_role' then
    if not exists (
      select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id and status = 'active'
    ) then
      raise exception 'Sin acceso al workspace';
    end if;
  end if;

  insert into public.communication_log
    (workspace_id, entity_type, entity_id, provider, channel, recipient,
     subject, content_preview, status, sent_at, metadata)
  values (
    p_workspace_id, p_entity_type, p_entity_id, p_provider, p_channel, p_recipient,
    p_subject, left(coalesce(p_content_preview, ''), 200),
    p_status,
    case when p_status in ('sent','generated') then now() else null end,
    p_metadata
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.log_communication(uuid,text,uuid,text,text,text,text,text,text,jsonb) to authenticated, service_role;

-- ============================================================================
-- RPC 5: get_communication_history — historial de comunicaciones
-- ============================================================================

create or replace function public.get_communication_history(
  p_workspace_id uuid,
  p_entity_type  text    default null,
  p_entity_id    uuid    default null,
  p_provider     text    default null,
  p_limit        int     default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'communications', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',              cl.id,
          'provider',        cl.provider,
          'channel',         cl.channel,
          'recipient',       cl.recipient,
          'subject',         cl.subject,
          'content_preview', cl.content_preview,
          'status',          cl.status,
          'entity_type',     cl.entity_type,
          'entity_id',       cl.entity_id,
          'sent_at',         cl.sent_at,
          'failed_at',       cl.failed_at,
          'error_message',   cl.error_message,
          'created_at',      cl.created_at
        )
        order by cl.created_at desc
      ), '[]'::jsonb)
      from public.communication_log cl
      where cl.workspace_id = p_workspace_id
        and (p_entity_type is null or cl.entity_type = p_entity_type)
        and (p_entity_id   is null or cl.entity_id   = p_entity_id)
        and (p_provider    is null or cl.provider     = p_provider)
      limit p_limit
    )
  );
end;
$$;

grant execute on function public.get_communication_history(uuid, text, uuid, text, int) to authenticated;

-- ============================================================================
-- RPC 6: queue_invoice_generation — encolar generación de factura Alegra
-- ============================================================================

create or replace function public.queue_invoice_generation(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_event_id     uuid;
begin
  -- Obtener workspace del pedido + validar acceso
  select o.workspace_id into v_workspace_id
  from public.orders o
  join public.profiles p on p.workspace_id = o.workspace_id
  where o.id = p_order_id and o.deleted_at is null and p.id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado o sin acceso');
  end if;

  -- Verificar que Alegra está conectado
  if not exists (
    select 1 from public.integrations
    where workspace_id = v_workspace_id and provider = 'alegra' and status = 'connected'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Alegra no está conectado. Configúralo en Integraciones.');
  end if;

  -- Verificar que no hay factura ya generada para este pedido
  if exists (
    select 1 from public.integration_invoices
    where workspace_id = v_workspace_id and order_id = p_order_id
      and invoice_status not in ('void','cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Este pedido ya tiene una factura generada');
  end if;

  -- Encolar evento
  insert into public.integration_events
    (workspace_id, provider, event_type, payload)
  values (
    v_workspace_id, 'alegra', 'invoice_create',
    jsonb_build_object('order_id', p_order_id)
  )
  returning id into v_event_id;

  -- Audit
  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_workspace_id, v_user_id, 'invoice_generation_queued', 'orders', p_order_id,
    jsonb_build_object('event_id', v_event_id));

  return jsonb_build_object('ok', true, 'event_id', v_event_id,
    'message', 'Factura en cola de generación. El worker la procesará en breve.');
end;
$$;

grant execute on function public.queue_invoice_generation(uuid) to authenticated;

-- ============================================================================
-- RPC 7: queue_email_send — encolar envío de email por Gmail/Outlook Mail
-- ============================================================================

create or replace function public.queue_email_send(
  p_quote_id  uuid,
  p_provider  text  default 'gmail'   -- 'gmail' | 'outlook_mail'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_client_email text;
  v_client_name  text;
  v_quote_title  text;
  v_quote_number text;
  v_total        numeric;
  v_event_id     uuid;
begin
  -- Validar provider
  if p_provider not in ('gmail', 'outlook_mail') then
    return jsonb_build_object('ok', false, 'error', 'Provider inválido. Usar: gmail | outlook_mail');
  end if;

  -- Obtener datos de cotización + validar acceso
  select q.workspace_id, c.email, c.name, q.title, q.quote_number,
         coalesce((q.calc_snapshot->>'total')::numeric, 0)
  into v_workspace_id, v_client_email, v_client_name, v_quote_title, v_quote_number, v_total
  from public.quotes q
  join public.profiles p on p.workspace_id = q.workspace_id
  left join public.clients c on c.id = q.client_id
  where q.id = p_quote_id and q.deleted_at is null and p.id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada o sin acceso');
  end if;

  if v_client_email is null then
    return jsonb_build_object('ok', false, 'error', 'El cliente no tiene correo registrado');
  end if;

  -- Verificar integración activa
  if not exists (
    select 1 from public.integrations
    where workspace_id = v_workspace_id and provider = p_provider and status = 'connected'
  ) then
    return jsonb_build_object('ok', false, 'error',
      p_provider || ' no está conectado. Configúralo en Integraciones.');
  end if;

  -- Obtener URL del portal del cliente
  declare
    v_portal_url text;
  begin
    select '/portal/' || cpt.token::text into v_portal_url
    from public.client_portal_tokens cpt
    join public.quotes q on q.client_id = cpt.client_id
    where q.id = p_quote_id and cpt.workspace_id = v_workspace_id
      and cpt.expires_at > now() and cpt.revoked_at is null
    limit 1;
  end;

  -- Encolar
  insert into public.integration_events
    (workspace_id, provider, event_type, payload)
  values (
    v_workspace_id, p_provider, 'email_send',
    jsonb_build_object(
      'quote_id',     p_quote_id,
      'quote_number', v_quote_number,
      'quote_title',  v_quote_title,
      'total',        v_total,
      'recipient',    v_client_email,
      'client_name',  v_client_name,
      'portal_url',   v_portal_url
    )
  )
  returning id into v_event_id;

  return jsonb_build_object('ok', true, 'event_id', v_event_id,
    'recipient', v_client_email,
    'message', 'Correo en cola. El worker lo enviará en breve.');
end;
$$;

grant execute on function public.queue_email_send(uuid, text) to authenticated;

-- ============================================================================
-- RPC 8: get_invoice_history — historial de facturas del workspace
-- ============================================================================

create or replace function public.get_invoice_history(
  p_workspace_id uuid,
  p_limit        int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'invoices', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',                  inv.id,
          'provider',            inv.provider,
          'external_invoice_id', inv.external_invoice_id,
          'invoice_number',      inv.invoice_number,
          'invoice_status',      inv.invoice_status,
          'total',               inv.total,
          'currency',            inv.currency,
          'issued_at',           inv.issued_at,
          'paid_at',             inv.paid_at,
          'client_name',         c.name,
          'order_number',        o.order_number,
          'order_title',         o.title
        )
        order by inv.created_at desc
      ), '[]'::jsonb)
      from public.integration_invoices inv
      left join public.clients c on c.id = inv.client_id
      left join public.orders  o on o.id = inv.order_id
      where inv.workspace_id = p_workspace_id
      limit p_limit
    ),
    'summary', (
      select jsonb_build_object(
        'total_issued',  count(*)::int,
        'total_paid',    count(*) filter (where invoice_status = 'paid')::int,
        'total_pending', count(*) filter (where invoice_status in ('draft','issued'))::int,
        'total_value',   coalesce(sum(total) filter (where invoice_status = 'paid'), 0)
      )
      from public.integration_invoices
      where workspace_id = p_workspace_id
    )
  );
end;
$$;

grant execute on function public.get_invoice_history(uuid, int) to authenticated;

comment on function public.store_alegra_credentials    is 'Sprint 12: guarda API Key de Alegra cifrada. Solo service_role.';
comment on function public.upsert_entity_ref           is 'Sprint 12: guarda/actualiza ID externo de una entidad (calendar, invoice, etc.)';
comment on function public.get_entity_refs             is 'Sprint 12: obtiene todos los IDs externos de una entidad.';
comment on function public.log_communication           is 'Sprint 12: registra comunicación en communication_log.';
comment on function public.get_communication_history   is 'Sprint 12: historial de comunicaciones filtrable.';
comment on function public.queue_invoice_generation    is 'Sprint 12: encolar generación de factura Alegra.';
comment on function public.queue_email_send            is 'Sprint 12: encolar envío de email via Gmail o Outlook Mail.';
comment on function public.get_invoice_history         is 'Sprint 12: historial de facturas con resumen.';
