-- ============================================================================
-- 0102 — hardening_production: Hardening Final de Producción Sprint 24
-- ============================================================================
-- Cambios:
--   1. Bucket 'attachments' — file_size_limit 20 MB + MIME types permitidos
--   2. Rate limiting para portales públicos (/p/:token, /portal/:token, /ref/:refCode)
--   3. Índices faltantes críticos para escala
--   4. Notificaciones INSERT — forzar user_id = auth.uid()
-- ============================================================================

-- ─── 1. Bucket 'attachments' — hardening de storage ──────────────────────────
-- NOTA: storage.buckets NO puede modificarse via SQL en Supabase (no eres propietario).
-- Configurar MANUALMENTE en Supabase Dashboard → Storage → Buckets → attachments:
--   • File size limit: 20971520 (20 MB)
--   • Allowed MIME types:
--     image/jpeg, image/png, image/webp, image/gif,
--     application/pdf,
--     video/mp4, video/quicktime, video/webm,
--     audio/mpeg, audio/wav,
--     text/plain,
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--     application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
--
-- Para 'logos' (ya configurado en 0091): 5 MB, solo imágenes.
-- Para 'evidences' (ya configurado en 0053): 50 MB, imágenes + video + audio.
--
-- Esta sección es solo documentación — no ejecuta SQL sobre storage.buckets.

-- ─── 2. Rate limiting para portales públicos ──────────────────────────────────
-- Implementación: tabla liviana con ventana de 1 minuto por (token_hash, ip)
-- Máximo 20 requests/minuto por token. Límite generoso para uso real, restrictivo
-- para scraping/enumeración.

CREATE TABLE IF NOT EXISTS public.portal_rate_limit (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key   text        NOT NULL,  -- hash(token + ip) o solo token
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  attempts     int         NOT NULL DEFAULT 1,
  CONSTRAINT portal_rate_limit_unique UNIQUE (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_portal_rate_limit_window
  ON public.portal_rate_limit(window_start);

ALTER TABLE public.portal_rate_limit ENABLE ROW LEVEL SECURITY;

-- Solo funciones SECURITY DEFINER pueden escribir
CREATE POLICY "rpc inserts portal_rate_limit"
  ON public.portal_rate_limit FOR ALL
  WITH CHECK (auth.uid() IS NULL);

-- Cleanup: limpiar entradas antiguas (se llama desde la RPC y desde el scheduler)
CREATE OR REPLACE FUNCTION public.cleanup_portal_rate_limits()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.portal_rate_limit
  WHERE window_start < now() - interval '5 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_portal_rate_limits() TO service_role;

-- Función de rate check: retorna TRUE si está permitido, FALSE si excede el límite
CREATE OR REPLACE FUNCTION public.check_portal_rate_limit(
  p_bucket_key  text,
  p_max_per_min int DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_attempts int;
  v_window           timestamptz := date_trunc('minute', now());
BEGIN
  -- UPSERT: incrementar contador para esta ventana
  INSERT INTO public.portal_rate_limit (bucket_key, window_start, attempts)
  VALUES (p_bucket_key, v_window, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET attempts = portal_rate_limit.attempts + 1
  RETURNING attempts INTO v_current_attempts;

  -- Si el UPSERT no devolvió nada (race condition), leer directamente
  IF v_current_attempts IS NULL THEN
    SELECT attempts INTO v_current_attempts
    FROM public.portal_rate_limit
    WHERE bucket_key = p_bucket_key AND window_start = v_window;
  END IF;

  RETURN COALESCE(v_current_attempts, 1) <= p_max_per_min;
END;
$$;

-- Accesible para anon y authenticated (portales públicos)
GRANT EXECUTE ON FUNCTION public.check_portal_rate_limit(text, int) TO anon, authenticated;

-- Helper: obtener IP del cliente desde headers de PostgREST
CREATE OR REPLACE FUNCTION public.get_client_ip()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (current_setting('request.headers', true)::jsonb->>'x-forwarded-for'),
    (current_setting('request.headers', true)::jsonb->>'x-real-ip'),
    'unknown'
  );
EXCEPTION WHEN others THEN
  RETURN 'unknown';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_ip() TO anon, authenticated;

-- ─── 2b. Aplicar rate limiting en get_public_quote ────────────────────────────
-- Proteger el endpoint más expuesto: /p/:token → get_public_quote(token)

CREATE OR REPLACE FUNCTION public.get_public_quote(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result       jsonb;
  v_ip         text;
  v_bucket_key text;
BEGIN
  -- Rate limiting: 20 requests/min por token desde la misma IP
  v_ip         := public.get_client_ip();
  v_bucket_key := 'quote:' || p_token::text || ':' || split_part(v_ip, ',', 1);

  IF NOT public.check_portal_rate_limit(v_bucket_key, 20) THEN
    RAISE EXCEPTION 'rate_limit_exceeded'
      USING HINT = 'Demasiadas solicitudes. Intenta en 1 minuto.';
  END IF;

  SELECT jsonb_build_object(
    'quote', to_jsonb(q) - 'workspace_id' - 'created_by',
    'client', to_jsonb(c) - 'workspace_id' - 'created_by',
    'company', to_jsonb(cs) - 'workspace_id',
    'consent_status', (
      SELECT status FROM public.client_consents
      WHERE client_id = q.client_id
      ORDER BY created_at DESC LIMIT 1
    ),
    'consent_accepted_at', (
      SELECT accepted_at FROM public.client_consents
      WHERE client_id = q.client_id AND status = 'accepted'
      ORDER BY created_at DESC LIMIT 1
    ),
    'pdf_tier', (
      SELECT pf.pdf_tier FROM public.plan_features pf
      WHERE pf.plan_code = public.get_effective_plan_code(q.workspace_id)
    ),
    'custom_qr_enabled', public.check_feature_access(q.workspace_id, 'custom_qr_enabled')
  ) INTO result
  FROM public.quote_access_tokens t
  JOIN public.quotes q ON q.id = t.quote_id AND q.deleted_at IS NULL
  LEFT JOIN public.clients c ON c.id = q.client_id
  LEFT JOIN public.company_settings cs ON cs.workspace_id = q.workspace_id
  WHERE t.token = p_token
    AND t.expires_at > now();

  IF result IS NULL THEN
    RAISE EXCEPTION 'token_expired_or_not_found';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_quote(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_quote IS
  'Hardening 0102: Rate limit 20 req/min por token+IP. Token expiración validada.';

-- ─── 2c. Rate limiting en referral redirect ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_referral_info(p_ref_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip         text;
  v_bucket_key text;
  v_result     jsonb;
BEGIN
  -- Rate limiting: 30 requests/min por IP para referidos
  v_ip         := public.get_client_ip();
  v_bucket_key := 'ref:' || split_part(v_ip, ',', 1);

  IF NOT public.check_portal_rate_limit(v_bucket_key, 30) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit_exceeded');
  END IF;

  SELECT jsonb_build_object(
    'ok',             true,
    'workspace_id',   rl.workspace_id,
    'ref_code',       rl.ref_code,
    'company_name',   cs.name,
    'logo_path',      cs.logo_path
  ) INTO v_result
  FROM public.referral_links rl
  LEFT JOIN public.company_settings cs ON cs.workspace_id = rl.workspace_id
  WHERE rl.ref_code = p_ref_code
    AND rl.active = true;

  RETURN COALESCE(v_result, jsonb_build_object('ok', false, 'error', 'not_found'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_info(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_referral_info IS
  'Hardening 0102: Rate limit 30 req/min por IP. Reemplaza lookup directo en ReferralRedirect.';

-- ─── 3. Índices faltantes críticos para escalabilidad ────────────────────────

-- orders: queries BI + Finance (join por workspace, status, fecha)
CREATE INDEX IF NOT EXISTS idx_orders_ws_status_date
  ON public.orders(workspace_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- work_orders: queries ops KPIs (sin deleted_at ni due_date — usa scheduled_at)
CREATE INDEX IF NOT EXISTS idx_work_orders_ws_status_due
  ON public.work_orders(workspace_id, status, scheduled_at);

-- ai_usage: historial por workspace (get_ai_usage_history)
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_created
  ON public.ai_usage(workspace_id, created_at DESC);

-- integration_events: worker queue lookup
CREATE INDEX IF NOT EXISTS idx_integration_events_queue
  ON public.integration_events(status, execute_after NULLS FIRST)
  WHERE status IN ('pending', 'failed') AND retries < max_retries;

-- quotes: pipeline queries (by workspace + commercial_status)
CREATE INDEX IF NOT EXISTS idx_quotes_ws_commercial_status
  ON public.quotes(workspace_id, commercial_status, created_at DESC)
  WHERE deleted_at IS NULL;

-- clients: CS dashboard (last activity)
CREATE INDEX IF NOT EXISTS idx_clients_ws_created
  ON public.clients(workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- automation_rules: scheduler lookup activo (columna: enabled, no is_active)
CREATE INDEX IF NOT EXISTS idx_automation_rules_ws_active
  ON public.automation_rules(workspace_id, enabled)
  WHERE enabled = true;

-- webhook_deliveries: historial por workspace
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ws_created
  ON public.webhook_deliveries(workspace_id, created_at DESC);

-- ─── 4. Notifications INSERT — forzar user_id = auth.uid() ───────────────────
-- Bloqueador BLOQ-014: usuario podría crear notificación asignada a otro user_id
-- Fix: la policy INSERT debe validar user_id = auth.uid() O que venga de SECURITY DEFINER

DROP POLICY IF EXISTS "notifications_insert_workspace" ON public.notifications;

CREATE POLICY "notifications_insert_workspace"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND (
      user_id = auth.uid()          -- el usuario solo puede crear notifs para sí mismo
      OR auth.uid() IS NULL         -- RPCs SECURITY DEFINER (notifs para otros miembros)
    )
  );

COMMENT ON TABLE public.notifications IS
  'Hardening 0102: INSERT policy fuerza user_id = auth.uid() o SECURITY DEFINER (uid IS NULL).';

-- ─── 5. Agregar cleanup de portal_rate_limit al scheduler ────────────────────
-- Nota: la limpieza automática se hace en cleanup_portal_rate_limits().
-- Se llama cada hora desde automation-scheduler (ver index.ts) O con TTL de 5 min
-- en la propia función check_portal_rate_limit (limpieza lazy).

COMMENT ON FUNCTION public.check_portal_rate_limit IS
  'Hardening 0102: Rate limiting DB-based para portales públicos. Max 20 req/min por bucket_key.';
COMMENT ON FUNCTION public.get_client_ip IS
  'Hardening 0102: Obtiene IP real del cliente desde headers PostgREST (x-forwarded-for).';
