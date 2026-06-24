-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0094: Webhook Marketplace — RPCs
-- ════════════════════════════════════════════════════════════════════════════
-- Zero Trust: workspace_id SIEMPRE del JWT.
-- Secret: generado server-side, NUNCA retornado tras creación.
-- get_webhook_endpoint_secret: SOLO service_role (integration-worker).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── RPC 1: register_webhook_endpoint ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_webhook_endpoint(
  p_workspace_id uuid,
  p_label        text,
  p_url          text,
  p_provider_type text DEFAULT 'webhook',
  p_events       text[] DEFAULT ARRAY['quote_approved']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_endpoint_id uuid;
  v_secret    text;
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden registrar webhooks');
  END IF;

  -- Plan gate: PRO+
  IF NOT public.check_feature_access(p_workspace_id, 'webhook_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Webhooks disponibles en plan PRO o PREMIUM');
  END IF;

  -- Validar URL
  IF p_url IS NULL OR LENGTH(p_url) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'URL inválida');
  END IF;
  IF NOT (p_url LIKE 'https://%') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La URL debe usar HTTPS');
  END IF;

  -- Validar eventos
  IF p_events IS NULL OR ARRAY_LENGTH(p_events, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Selecciona al menos un evento');
  END IF;

  -- Validar que los eventos sean válidos
  IF NOT (p_events <@ ARRAY[
    'quote_created','quote_approved','quote_sent','quote_rejected',
    'order_created','order_completed',
    'work_order_created','work_order_completed',
    'client_created'
  ]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Uno o más eventos no son válidos');
  END IF;

  -- Generar secret server-side (nunca del frontend)
  v_secret := 'whsec_' || encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.webhook_endpoints
    (workspace_id, label, url, provider_type, events, secret, created_by)
  VALUES
    (p_workspace_id, p_label, p_url, p_provider_type, p_events, v_secret, v_user_id)
  RETURNING id INTO v_endpoint_id;

  -- Auditoría
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_user_id, 'webhook_endpoint_created', 'webhook_endpoint', v_endpoint_id,
    jsonb_build_object('label', p_label, 'provider_type', p_provider_type, 'events', p_events));

  RETURN jsonb_build_object(
    'ok',         true,
    'endpoint_id', v_endpoint_id,
    -- El secret se muestra UNA SOLA VEZ en la creación
    'secret',     v_secret,
    'message',    'Guarda este secret — no podrá mostrarse nuevamente.'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_webhook_endpoint(uuid, text, text, text, text[]) TO authenticated;

-- ─── RPC 2: update_webhook_endpoint ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_webhook_endpoint(
  p_workspace_id uuid,
  p_endpoint_id  uuid,
  p_label        text    DEFAULT NULL,
  p_url          text    DEFAULT NULL,
  p_events       text[]  DEFAULT NULL,
  p_is_active    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permisos');
  END IF;

  IF p_url IS NOT NULL AND NOT (p_url LIKE 'https://%') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La URL debe usar HTTPS');
  END IF;

  UPDATE public.webhook_endpoints SET
    label        = COALESCE(p_label,     label),
    url          = COALESCE(p_url,       url),
    events       = COALESCE(p_events,    events),
    is_active    = COALESCE(p_is_active, is_active),
    -- Reactivar endpoint previamente deshabilitado por fallos
    disabled_at     = CASE WHEN p_is_active = true THEN NULL ELSE disabled_at END,
    disabled_reason = CASE WHEN p_is_active = true THEN NULL ELSE disabled_reason END,
    consecutive_failures = CASE WHEN p_is_active = true THEN 0 ELSE consecutive_failures END,
    updated_at   = now()
  WHERE id = p_endpoint_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Endpoint no encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_webhook_endpoint(uuid, uuid, text, text, text[], boolean) TO authenticated;

-- ─── RPC 3: rotate_webhook_secret ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(
  p_workspace_id uuid,
  p_endpoint_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_secret  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permisos');
  END IF;

  v_secret := 'whsec_' || encode(gen_random_bytes(32), 'hex');

  UPDATE public.webhook_endpoints
  SET secret = v_secret, updated_at = now()
  WHERE id = p_endpoint_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Endpoint no encontrado');
  END IF;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_user_id, 'webhook_secret_rotated', 'webhook_endpoint', p_endpoint_id, '{}'::jsonb);

  RETURN jsonb_build_object(
    'ok', true,
    'secret', v_secret,
    'message', 'Nuevo secret generado. Actualiza tu receptor.'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret(uuid, uuid) TO authenticated;

-- ─── RPC 4: delete_webhook_endpoint ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_webhook_endpoint(
  p_workspace_id uuid,
  p_endpoint_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permisos');
  END IF;

  DELETE FROM public.webhook_endpoints WHERE id = p_endpoint_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Endpoint no encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_webhook_endpoint(uuid, uuid) TO authenticated;

-- ─── RPC 5: get_webhook_endpoints — NUNCA expone el secret ───────────────────

CREATE OR REPLACE FUNCTION public.get_webhook_endpoints(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows    jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                    e.id,
    'label',                 e.label,
    'url',                   e.url,
    'provider_type',         e.provider_type,
    'events',                e.events,
    'is_active',             e.is_active,
    'failure_count',         e.failure_count,
    'consecutive_failures',  e.consecutive_failures,
    'last_success_at',       e.last_success_at,
    'last_failure_at',       e.last_failure_at,
    'disabled_at',           e.disabled_at,
    'disabled_reason',       e.disabled_reason,
    'created_at',            e.created_at,
    -- Resumen de entregas recientes
    'deliveries_last_24h',  (
      SELECT COUNT(*)::int FROM public.webhook_deliveries d
      WHERE d.endpoint_id = e.id AND d.created_at >= now() - interval '24 hours'
    ),
    'success_rate_7d', (
      SELECT CASE WHEN COUNT(*) > 0
        THEN round(COUNT(*) FILTER (WHERE status = 'delivered')::numeric / COUNT(*) * 100, 1)
        ELSE NULL END
      FROM public.webhook_deliveries d
      WHERE d.endpoint_id = e.id AND d.created_at >= now() - interval '7 days'
    )
    -- NOTA: secret NUNCA incluido aquí
  ) ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.webhook_endpoints e
  WHERE e.workspace_id = p_workspace_id;

  RETURN jsonb_build_object('ok', true, 'endpoints', v_rows);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_webhook_endpoints(uuid) TO authenticated;

-- ─── RPC 6: get_webhook_deliveries ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_webhook_deliveries(
  p_workspace_id uuid,
  p_endpoint_id  uuid   DEFAULT NULL,
  p_limit        int    DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows    jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              d.id,
    'endpoint_id',     d.endpoint_id,
    'endpoint_label',  e.label,
    'event_type',      d.event_type,
    'event_id',        d.event_id,
    'status',          d.status,
    'response_status', d.response_status,
    'duration_ms',     d.duration_ms,
    'attempt',         d.attempt,
    'max_attempts',    d.max_attempts,
    'delivered_at',    d.delivered_at,
    'next_retry_at',   d.next_retry_at,
    'created_at',      d.created_at
  ) ORDER BY d.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.webhook_deliveries d
  JOIN public.webhook_endpoints e ON e.id = d.endpoint_id
  WHERE d.workspace_id = p_workspace_id
    AND (p_endpoint_id IS NULL OR d.endpoint_id = p_endpoint_id)
  LIMIT LEAST(p_limit, 200);

  RETURN jsonb_build_object('ok', true, 'deliveries', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_webhook_deliveries(uuid, uuid, int) TO authenticated;

-- ─── RPC 7: redeliver_webhook — reintentar entrega fallida ───────────────────

CREATE OR REPLACE FUNCTION public.redeliver_webhook(
  p_workspace_id uuid,
  p_delivery_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_delivery   record;
  v_new_id     uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permisos');
  END IF;

  SELECT * INTO v_delivery
  FROM public.webhook_deliveries
  WHERE id = p_delivery_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entrega no encontrada');
  END IF;

  -- Crear nueva entrega a partir del payload original
  INSERT INTO public.webhook_deliveries
    (workspace_id, endpoint_id, event_type, event_id, payload, attempt, max_attempts, status)
  VALUES
    (p_workspace_id, v_delivery.endpoint_id, v_delivery.event_type,
     gen_random_uuid(), v_delivery.payload, 1, 3, 'pending')
  RETURNING id INTO v_new_id;

  -- Encolar en integration_events para que integration-worker lo procese
  INSERT INTO public.integration_events
    (workspace_id, provider, event_type, payload)
  VALUES (
    p_workspace_id,
    (SELECT provider_type FROM public.webhook_endpoints WHERE id = v_delivery.endpoint_id),
    v_delivery.event_type,
    jsonb_build_object(
      'delivery_id',  v_new_id,
      'endpoint_id',  v_delivery.endpoint_id,
      'original_payload', v_delivery.payload
    )
  );

  RETURN jsonb_build_object('ok', true, 'new_delivery_id', v_new_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeliver_webhook(uuid, uuid) TO authenticated;

-- ─── RPC 8: test_webhook_endpoint — enviar payload de prueba ─────────────────

CREATE OR REPLACE FUNCTION public.test_webhook_endpoint(
  p_workspace_id uuid,
  p_endpoint_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ep      record;
  v_test_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permisos');
  END IF;

  SELECT * INTO v_ep FROM public.webhook_endpoints WHERE id = p_endpoint_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Endpoint no encontrado');
  END IF;

  -- Encolar evento de prueba
  INSERT INTO public.integration_events
    (workspace_id, provider, event_type, payload)
  VALUES (
    p_workspace_id, v_ep.provider_type, 'webhook_test',
    jsonb_build_object(
      'test',        true,
      'test_id',     v_test_id,
      'endpoint_id', p_endpoint_id,
      'message',     'Este es un webhook de prueba de Shelwi'
    )
  );

  RETURN jsonb_build_object('ok', true, 'test_id', v_test_id, 'message', 'Evento de prueba enviado');
END;
$$;
GRANT EXECUTE ON FUNCTION public.test_webhook_endpoint(uuid, uuid) TO authenticated;

-- ─── RPC 9: dispatch_webhook_event — INTERNO, llamado por triggers ───────────
-- Verifica si hay endpoints activos para el evento y encola.
-- NO es un nuevo trigger — es llamado por los triggers EXISTENTES.

CREATE OR REPLACE FUNCTION public.dispatch_webhook_event(
  p_workspace_id uuid,
  p_event_type   text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_payload      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ep  record;
BEGIN
  -- Por cada endpoint activo que suscribe a este evento
  FOR v_ep IN
    SELECT id, provider_type FROM public.webhook_endpoints
    WHERE workspace_id = p_workspace_id
      AND is_active = true
      AND disabled_at IS NULL
      AND p_event_type = ANY(events)
  LOOP
    -- Encolar en integration_events para que integration-worker procese
    INSERT INTO public.integration_events
      (workspace_id, provider, event_type, payload)
    VALUES (
      p_workspace_id,
      v_ep.provider_type,
      p_event_type,
      jsonb_build_object(
        'endpoint_id',  v_ep.id,
        'entity_type',  p_entity_type,
        'entity_id',    p_entity_id,
        'event_data',   p_payload
      )
    );
  END LOOP;
END;
$$;
-- Solo accesible por funciones SECURITY DEFINER (triggers)
REVOKE ALL ON FUNCTION public.dispatch_webhook_event(uuid, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_webhook_event(uuid, text, text, uuid, jsonb) TO authenticated, service_role;

-- ─── RPC 10: get_webhook_endpoint_secret — SOLO service_role ─────────────────
-- Usado por integration-worker para obtener el secret de firma HMAC.
-- Si auth.uid() no es NULL (= llamada autenticada de usuario), rechaza.

CREATE OR REPLACE FUNCTION public.get_webhook_endpoint_secret(p_endpoint_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Solo service_role puede llamar esta función
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Esta función solo puede ser llamada por service_role';
  END IF;

  SELECT secret INTO v_secret FROM public.webhook_endpoints WHERE id = p_endpoint_id;
  RETURN v_secret;
END;
$$;
REVOKE ALL ON FUNCTION public.get_webhook_endpoint_secret(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_webhook_endpoint_secret(uuid) TO service_role;

-- ─── RPC 11: record_webhook_delivery — SOLO service_role ─────────────────────
-- Llamado por integration-worker para registrar el resultado de la entrega.

CREATE OR REPLACE FUNCTION public.record_webhook_delivery(
  p_endpoint_id    uuid,
  p_workspace_id   uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_status         text,
  p_response_status int   DEFAULT NULL,
  p_response_body  text  DEFAULT NULL,
  p_duration_ms    int   DEFAULT NULL,
  p_attempt        int   DEFAULT 1,
  p_next_retry_at  timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Solo service_role puede registrar entregas';
  END IF;

  -- Insertar entrega
  INSERT INTO public.webhook_deliveries
    (workspace_id, endpoint_id, event_type, payload,
     status, response_status, response_body, duration_ms,
     attempt, next_retry_at, delivered_at)
  VALUES (
    p_workspace_id, p_endpoint_id, p_event_type, p_payload,
    p_status, p_response_status, p_response_body, p_duration_ms,
    p_attempt, p_next_retry_at,
    CASE WHEN p_status = 'delivered' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_delivery_id;

  -- Actualizar contadores en el endpoint
  IF p_status = 'delivered' THEN
    UPDATE public.webhook_endpoints SET
      last_success_at       = now(),
      consecutive_failures  = 0,
      updated_at            = now()
    WHERE id = p_endpoint_id;
  ELSIF p_status = 'failed' THEN
    UPDATE public.webhook_endpoints SET
      failure_count         = failure_count + 1,
      consecutive_failures  = consecutive_failures + 1,
      last_failure_at       = now(),
      -- Auto-deshabilitar si supera el límite de fallos consecutivos
      is_active             = CASE
        WHEN consecutive_failures + 1 >= max_consecutive_failures THEN false
        ELSE is_active END,
      disabled_at           = CASE
        WHEN consecutive_failures + 1 >= max_consecutive_failures THEN now()
        ELSE disabled_at END,
      disabled_reason       = CASE
        WHEN consecutive_failures + 1 >= max_consecutive_failures
        THEN 'Deshabilitado automáticamente por ' || max_consecutive_failures || ' fallos consecutivos'
        ELSE disabled_reason END,
      updated_at            = now()
    WHERE id = p_endpoint_id;
  END IF;

  RETURN v_delivery_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_webhook_delivery(uuid,uuid,text,jsonb,text,int,text,int,int,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_webhook_delivery(uuid,uuid,text,jsonb,text,int,text,int,int,timestamptz) TO service_role;

COMMENT ON FUNCTION public.register_webhook_endpoint  IS 'Webhooks: registra endpoint. Secret generado server-side y mostrado una sola vez. PRO+.';
COMMENT ON FUNCTION public.get_webhook_endpoint_secret IS 'Webhooks: solo service_role. Retorna secret para firma HMAC en integration-worker.';
COMMENT ON FUNCTION public.record_webhook_delivery     IS 'Webhooks: solo service_role. Registra resultado de entrega y actualiza contadores de fallo.';
COMMENT ON FUNCTION public.dispatch_webhook_event      IS 'Webhooks: función interna llamada por triggers existentes. Encola eventos en integration_events.';
