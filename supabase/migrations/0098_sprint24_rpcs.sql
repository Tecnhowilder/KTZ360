-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0098: Sprint 24 RPCs — IA Enterprise + Session Security
-- ════════════════════════════════════════════════════════════════════════════
-- RPCs nuevas/actualizadas:
--   check_ai_credits()          → extiende con paquetes FIFO
--   consume_ai_credits()        → extiende con paquetes FIFO
--   check_ai_operation_permission() → validación unificada flag + créditos
--   register_session()          → registrar dispositivo, revocar anterior
--   check_session_valid()       → validar sesión activa
--   revoke_session()            → revocar sesión específica
--   get_active_sessions()       → listar sesiones del workspace/user
--   activate_ai_credit_pack()   → activar paquete tras pago
--   get_ai_credit_packs()       → catálogo público
--   get_ai_credit_purchases()   → historial del workspace
--   get_ai_admin_dashboard()    → métricas de monetización (super_admin)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── check_ai_credits() ACTUALIZADA — incluye paquetes comprados ──────────────

CREATE OR REPLACE FUNCTION public.check_ai_credits(
  p_workspace_id uuid,
  p_credits_needed int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code    text;
  v_plan_credits int;
  v_extra_credits int := 0;
  v_credits_max  int;
  v_credits_used int;
  v_ai_enabled   boolean;
BEGIN
  -- Plan del workspace
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  -- Verificar ai_enabled
  SELECT ai_enabled INTO v_ai_enabled
  FROM public.plan_features WHERE plan_code = v_plan_code;

  IF NOT COALESCE(v_ai_enabled, false) THEN
    RETURN jsonb_build_object(
      'allowed',           false,
      'reason',            'ai_not_included',
      'plan',              v_plan_code,
      'credits_used',      0,
      'credits_remaining', 0
    );
  END IF;

  -- Créditos del plan
  SELECT ai_credits_monthly INTO v_plan_credits
  FROM public.plan_limits WHERE plan_code = v_plan_code;
  v_plan_credits := COALESCE(v_plan_credits, 0);

  -- Créditos adicionales de paquetes comprados (FIFO por expires_at)
  SELECT COALESCE(SUM(credits_remaining), 0) INTO v_extra_credits
  FROM public.ai_credit_purchases
  WHERE workspace_id = p_workspace_id
    AND expires_at > now()
    AND credits_remaining > 0;

  -- Total disponible = plan + paquetes
  v_credits_max := v_plan_credits + v_extra_credits;

  -- Créditos usados este mes (del plan mensual)
  SELECT COALESCE(SUM(credits_used), 0) INTO v_credits_used
  FROM public.ai_usage
  WHERE workspace_id = p_workspace_id
    AND period_month = date_trunc('month', now())::date;

  -- Créditos efectivos disponibles
  DECLARE
    v_effective_remaining int := greatest(0, v_credits_max - v_credits_used);
  BEGIN
    RETURN jsonb_build_object(
      'allowed',            v_effective_remaining >= p_credits_needed,
      'reason',             CASE WHEN v_effective_remaining >= p_credits_needed THEN 'ok' ELSE 'limit_reached' END,
      'plan',               v_plan_code,
      'plan_credits',       v_plan_credits,
      'extra_credits',      v_extra_credits,
      'credits_used',       v_credits_used,
      'credits_remaining',  v_effective_remaining,
      'credits_max',        v_credits_max
    );
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_ai_credits(uuid, int) TO authenticated, service_role;

-- ─── consume_ai_credits() ACTUALIZADA — FIFO: paquetes primero ───────────────

CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_workspace_id  uuid,
  p_operation     text,
  p_tokens_used   int     DEFAULT 0,
  p_estimated_cost numeric DEFAULT 0,
  p_model         text    DEFAULT 'gemini-1.5-flash',
  p_exec_ms       int     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits_cost        int;
  v_check               jsonb;
  v_remaining_to_deduct int;
  v_pack_credits_used   int := 0;
  v_deduct              int;   -- Fix: declarar aquí, no dentro del LOOP
  rec                   RECORD; -- Fix: rec debe declararse como RECORD
BEGIN
  -- Costo de la operación
  SELECT credits_cost INTO v_credits_cost
  FROM public.ai_operation_costs
  WHERE operation = p_operation AND active = true;
  v_credits_cost := COALESCE(v_credits_cost, 1);

  -- Verificar disponibilidad
  v_check := public.check_ai_credits(p_workspace_id, v_credits_cost);

  IF NOT (v_check->>'allowed')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason',  v_check->>'reason',
      'credits_remaining', v_check->'credits_remaining'
    );
  END IF;

  v_remaining_to_deduct := v_credits_cost;

  -- FIFO: descontar de paquetes más próximos a vencer primero
  FOR rec IN (
    SELECT id, credits_remaining
    FROM public.ai_credit_purchases
    WHERE workspace_id = p_workspace_id
      AND expires_at > now()
      AND credits_remaining > 0
    ORDER BY expires_at ASC
  )
  LOOP
    EXIT WHEN v_remaining_to_deduct <= 0;
    -- Fix: v_deduct declarado en el bloque DECLARE principal (no anidado)
    v_deduct := LEAST(rec.credits_remaining, v_remaining_to_deduct);
    UPDATE public.ai_credit_purchases
    SET credits_remaining = credits_remaining - v_deduct
    WHERE id = rec.id;
    v_remaining_to_deduct := v_remaining_to_deduct - v_deduct;
    v_pack_credits_used   := v_pack_credits_used + v_deduct;
  END LOOP;

  -- Registrar consumo en ai_usage (incluye créditos de paquete + plan)
  INSERT INTO public.ai_usage
    (workspace_id, user_id, feature, provider, model, tokens_used, estimated_cost,
     credits_used, execution_time_ms)
  VALUES
    (p_workspace_id, auth.uid(), p_operation, 'gemini', p_model,
     p_tokens_used, p_estimated_cost, v_credits_cost, p_exec_ms);

  RETURN jsonb_build_object(
    'success',           true,
    'credits_consumed',  v_credits_cost,
    'pack_credits_used', v_pack_credits_used,
    'plan_credits_used', v_credits_cost - v_pack_credits_used,
    'credits_remaining', (v_check->'credits_remaining')::int - v_credits_cost
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid, text, int, numeric, text, int) TO authenticated, service_role;

-- Mantener firma anterior como wrapper para backward compatibility
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_workspace_id  uuid,
  p_operation     text,
  p_tokens_used   int     DEFAULT 0,
  p_estimated_cost numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.consume_ai_credits(p_workspace_id, p_operation, p_tokens_used, p_estimated_cost, 'gemini', NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid, text, int, numeric) TO authenticated, service_role;

-- ─── check_ai_operation_permission() — validación unificada ──────────────────

CREATE OR REPLACE FUNCTION public.check_ai_operation_permission(
  p_workspace_id uuid,
  p_operation    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_plan_code   text;
  v_ai_enabled  boolean;
  v_advanced    boolean;
  v_forecasting boolean;
  v_agents      boolean;
  v_photo       boolean;
  v_credits     jsonb;
  v_req_flag    text;
  v_req_plan    text;
BEGIN
  -- Zero Trust
  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  SELECT ai_enabled, ai_advanced_enabled, ai_forecasting_enabled,
         ai_agents_enabled, photo_quote_enabled
  INTO v_ai_enabled, v_advanced, v_forecasting, v_agents, v_photo
  FROM public.plan_features WHERE plan_code = v_plan_code;

  -- Determinar flag requerida por operación
  SELECT
    CASE
      WHEN p_operation IN ('generate_description','improve_proposal','ai_summary',
                            'close_probability','recommendations','risk_analysis') THEN 'ai_enabled'
      WHEN p_operation = 'photo_quote'      THEN 'photo_quote_enabled'
      WHEN p_operation = 'forecast'         THEN 'ai_forecasting_enabled'
      WHEN p_operation LIKE 'bi_%'
        OR p_operation LIKE 'ops_%'
        OR p_operation = 'forecast_finance' THEN 'ai_advanced_enabled'
      WHEN p_operation LIKE 'agent_%'       THEN 'ai_agents_enabled'
      ELSE 'ai_enabled'
    END,
    CASE
      WHEN p_operation IN ('generate_description','improve_proposal','ai_summary',
                            'close_probability','recommendations','risk_analysis') THEN 'pro'
      WHEN p_operation = 'photo_quote'      THEN 'premium'
      WHEN p_operation = 'forecast'         THEN 'pro'
      WHEN p_operation LIKE 'bi_%'
        OR p_operation LIKE 'ops_%'
        OR p_operation = 'forecast_finance' THEN 'premium'
      WHEN p_operation LIKE 'agent_%'       THEN 'enterprise'
      ELSE 'pro'
    END
  INTO v_req_flag, v_req_plan;

  -- Validar flag
  IF v_req_flag = 'ai_enabled'             AND NOT COALESCE(v_ai_enabled,  false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_included', 'required_plan', v_req_plan);
  END IF;
  IF v_req_flag = 'photo_quote_enabled'    AND NOT COALESCE(v_photo,       false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_included', 'required_plan', 'premium');
  END IF;
  IF v_req_flag = 'ai_forecasting_enabled' AND NOT COALESCE(v_forecasting, false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_included', 'required_plan', 'pro');
  END IF;
  IF v_req_flag = 'ai_advanced_enabled'    AND NOT COALESCE(v_advanced,    false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_included', 'required_plan', 'premium');
  END IF;
  IF v_req_flag = 'ai_agents_enabled'      AND NOT COALESCE(v_agents,      false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_included', 'required_plan', 'enterprise');
  END IF;

  -- Verificar créditos
  DECLARE
    v_credits_needed int;
  BEGIN
    SELECT credits_cost INTO v_credits_needed
    FROM public.ai_operation_costs WHERE operation = p_operation AND active = true;
    v_credits := public.check_ai_credits(p_workspace_id, COALESCE(v_credits_needed, 1));
  END;

  IF NOT (v_credits->>'allowed')::boolean THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'credits_exhausted',
      'credits_remaining', v_credits->'credits_remaining'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan', v_plan_code,
    'credits_remaining', v_credits->'credits_remaining'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_ai_operation_permission(uuid, text) TO authenticated;

-- ─── Session Security RPCs ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_session(
  p_workspace_id uuid,
  p_device_id    text,
  p_device_name  text  DEFAULT NULL,
  p_user_agent   text  DEFAULT NULL,
  p_ip           text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_plan_code   text;
  v_max_sessions int;
  v_active_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_plan_code   := public.get_effective_plan_code(p_workspace_id);
  SELECT max_sessions_per_user INTO v_max_sessions FROM public.plan_limits WHERE plan_code = v_plan_code;
  v_max_sessions := COALESCE(v_max_sessions, 1);

  -- Revocar sesiones anteriores del mismo usuario (excepto este device_id)
  -- para mantener el límite de 1 dispositivo por usuario
  UPDATE public.active_sessions
  SET revoked_at    = now(),
      revoke_reason = 'new_login'
  WHERE user_id    = v_user_id
    AND workspace_id = p_workspace_id
    AND device_id  != p_device_id
    AND revoked_at IS NULL;

  -- Registrar o actualizar esta sesión
  INSERT INTO public.active_sessions
    (workspace_id, user_id, device_id, device_name, user_agent, ip, last_seen_at)
  VALUES
    (p_workspace_id, v_user_id, p_device_id, p_device_name,
     p_user_agent, p_ip::inet, now())
  ON CONFLICT (user_id, device_id) DO UPDATE SET
    last_seen_at  = now(),
    revoked_at    = NULL,     -- reactivar si estaba revocada
    revoke_reason = NULL,
    device_name   = COALESCE(EXCLUDED.device_name, active_sessions.device_name),
    ip            = COALESCE(EXCLUDED.ip, active_sessions.ip);

  -- Registro en audit_log
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, metadata)
  VALUES (p_workspace_id, v_user_id, 'session_registered', 'session',
    jsonb_build_object('device_id', p_device_id, 'device_name', p_device_name));

  RETURN jsonb_build_object('ok', true, 'max_sessions', v_max_sessions);
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_session(uuid, text, text, text, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_session_valid(
  p_workspace_id uuid,
  p_device_id    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_auth');
  END IF;

  SELECT * INTO v_session
  FROM public.active_sessions
  WHERE user_id    = v_user_id
    AND workspace_id = p_workspace_id
    AND device_id  = p_device_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'session_not_found');
  END IF;

  IF v_session.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid',         false,
      'reason',        'session_revoked',
      'revoke_reason', v_session.revoke_reason,
      'revoked_at',    v_session.revoked_at
    );
  END IF;

  -- Actualizar last_seen_at (heartbeat)
  UPDATE public.active_sessions
  SET last_seen_at = now()
  WHERE user_id = v_user_id AND device_id = p_device_id;

  RETURN jsonb_build_object('valid', true, 'last_seen_at', v_session.last_seen_at);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_session_valid(uuid, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_active_sessions(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_rows    jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           s.id,
    'user_id',      s.user_id,
    'user_name',    p.full_name,
    'device_id',    s.device_id,
    'device_name',  s.device_name,
    'last_seen_at', s.last_seen_at,
    'is_current',   (s.user_id = v_user_id),
    'revoked_at',   s.revoked_at
  ) ORDER BY s.last_seen_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.active_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.workspace_id = p_workspace_id
    AND s.revoked_at IS NULL
    -- owner/admin ven todas; otros solo la suya
    AND (v_role IN ('owner','admin','super_admin','support_admin') OR s.user_id = v_user_id);

  RETURN jsonb_build_object('ok', true, 'sessions', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_sessions(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_session(
  p_workspace_id uuid,
  p_session_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_session record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id;

  SELECT * INTO v_session FROM public.active_sessions
  WHERE id = p_session_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada');
  END IF;

  -- Solo owner/admin pueden revocar sesiones ajenas; cualquiera puede revocar la suya
  IF v_session.user_id != v_user_id AND v_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permisos');
  END IF;

  UPDATE public.active_sessions
  SET revoked_at = now(), revoke_reason = 'manual'
  WHERE id = p_session_id;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_user_id, 'session_revoked', 'session', p_session_id,
    jsonb_build_object('revoked_user_id', v_session.user_id, 'device_name', v_session.device_name));

  RETURN jsonb_build_object('ok', true, 'message', 'Sesión revocada. El usuario será desconectado en la próxima validación.');
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_session(uuid, uuid) TO authenticated;

-- ─── IA Credit Packs RPCs ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_credit_packs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'packs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',        p.id,
        'pack_key',  p.pack_key,
        'name',      p.name,
        'credits',   p.credits,
        'price_cop', p.price_cop,
        'min_plan',  p.min_plan
      ) ORDER BY p.sort_order), '[]'::jsonb)
      FROM public.ai_credit_packs p
      WHERE p.active = true
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_packs() TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_credit_purchases(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'purchases', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',                 cp.id,
        'pack_name',          pk.name,
        'credits_total',      cp.credits_total,
        'credits_remaining',  cp.credits_remaining,
        'credits_used',       cp.credits_total - cp.credits_remaining,
        'price_paid_cop',     cp.price_paid_cop,
        'expires_at',         cp.expires_at,
        'is_active',          (cp.expires_at > now() AND cp.credits_remaining > 0),
        'activated_at',       cp.activated_at
      ) ORDER BY cp.expires_at ASC), '[]'::jsonb)
      FROM public.ai_credit_purchases cp
      JOIN public.ai_credit_packs pk ON pk.id = cp.pack_id
      WHERE cp.workspace_id = p_workspace_id
    ),
    'summary', jsonb_build_object(
      'total_purchased',  (SELECT COALESCE(SUM(credits_total), 0) FROM public.ai_credit_purchases WHERE workspace_id = p_workspace_id),
      'total_remaining',  (SELECT COALESCE(SUM(credits_remaining), 0) FROM public.ai_credit_purchases WHERE workspace_id = p_workspace_id AND expires_at > now() AND credits_remaining > 0),
      'active_packs',     (SELECT COUNT(*)::int FROM public.ai_credit_purchases WHERE workspace_id = p_workspace_id AND expires_at > now() AND credits_remaining > 0)
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_credit_purchases(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- activate_ai_credit_pack — llamado desde mp-webhook (service_role) tras pago

CREATE OR REPLACE FUNCTION public.activate_ai_credit_pack(
  p_workspace_id uuid,
  p_pack_id      uuid,
  p_payment_id   text,
  p_price_paid   int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack record;
  v_purchase_id uuid;
BEGIN
  -- Solo service_role puede activar paquetes
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo service_role puede activar paquetes');
  END IF;

  -- Validar pack existe y está activo
  SELECT * INTO v_pack FROM public.ai_credit_packs WHERE id = p_pack_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Paquete no encontrado o inactivo');
  END IF;

  -- Idempotencia: si ya existe este payment_id, retornar OK
  IF EXISTS (SELECT 1 FROM public.ai_credit_purchases WHERE payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Paquete ya activado (idempotente)');
  END IF;

  -- Crear registro de compra
  INSERT INTO public.ai_credit_purchases
    (workspace_id, pack_id, payment_id, credits_total, credits_remaining, price_paid_cop, expires_at)
  VALUES
    (p_workspace_id, p_pack_id, p_payment_id,
     v_pack.credits, v_pack.credits, p_price_paid,
     now() + interval '90 days')
  RETURNING id INTO v_purchase_id;

  -- Registro en audit
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, NULL, 'ai_pack_activated', 'ai_credit_purchase', v_purchase_id,
    jsonb_build_object('pack_key', v_pack.pack_key, 'credits', v_pack.credits, 'payment_id', p_payment_id));

  RETURN jsonb_build_object('ok', true, 'purchase_id', v_purchase_id, 'credits', v_pack.credits);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_ai_credit_pack(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_ai_credit_pack(uuid, uuid, text, int) TO service_role;

-- ─── Admin IA Dashboard ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_admin_dashboard(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo super_admin');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'period_days', p_days,
    'usage', jsonb_build_object(
      'total_credits_consumed',  (SELECT COALESCE(SUM(credits_used), 0)::int FROM public.ai_usage WHERE created_at >= now() - (p_days || ' days')::interval),
      'total_tokens_used',       (SELECT COALESCE(SUM(tokens_used), 0)::int  FROM public.ai_usage WHERE created_at >= now() - (p_days || ' days')::interval),
      'estimated_cost_usd',      (SELECT COALESCE(SUM(estimated_cost), 0)    FROM public.ai_usage WHERE created_at >= now() - (p_days || ' days')::interval),
      'unique_workspaces',       (SELECT COUNT(DISTINCT workspace_id)::int    FROM public.ai_usage WHERE created_at >= now() - (p_days || ' days')::interval),
      'avg_exec_ms',             (SELECT round(AVG(execution_time_ms))::int   FROM public.ai_usage WHERE created_at >= now() - (p_days || ' days')::interval AND execution_time_ms IS NOT NULL)
    ),
    'packs', jsonb_build_object(
      'total_revenue_cop',       (SELECT COALESCE(SUM(price_paid_cop), 0)::int FROM public.ai_credit_purchases WHERE activated_at >= now() - (p_days || ' days')::interval),
      'packs_sold',              (SELECT COUNT(*)::int FROM public.ai_credit_purchases WHERE activated_at >= now() - (p_days || ' days')::interval),
      'credits_sold',            (SELECT COALESCE(SUM(credits_total), 0)::int  FROM public.ai_credit_purchases WHERE activated_at >= now() - (p_days || ' days')::interval),
      'credits_remaining_total', (SELECT COALESCE(SUM(credits_remaining), 0)::int FROM public.ai_credit_purchases WHERE expires_at > now() AND credits_remaining > 0)
    ),
    'top_operations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('operation', feature, 'total_credits', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT feature, SUM(credits_used)::int AS total
        FROM public.ai_usage
        WHERE created_at >= now() - (p_days || ' days')::interval
        GROUP BY feature ORDER BY SUM(credits_used) DESC LIMIT 10
      ) t
    ),
    'top_workspaces', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('workspace_id', workspace_id, 'total_credits', total) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT workspace_id, SUM(credits_used)::int AS total
        FROM public.ai_usage
        WHERE created_at >= now() - (p_days || ' days')::interval
        GROUP BY workspace_id ORDER BY SUM(credits_used) DESC LIMIT 10
      ) t
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_admin_dashboard(int) TO authenticated;

COMMENT ON FUNCTION public.check_ai_credits(uuid, int)              IS 'Sprint 24: incluye créditos de paquetes comprados (FIFO por expires_at).';
COMMENT ON FUNCTION public.consume_ai_credits(uuid,text,int,numeric,text,int) IS 'Sprint 24: FIFO paquetes primero, luego créditos del plan. Registra model y execution_time_ms.';
COMMENT ON FUNCTION public.check_ai_operation_permission(uuid, text) IS 'Sprint 24: validación unificada de plan + flag + créditos para una operación IA.';
COMMENT ON FUNCTION public.register_session(uuid,text,text,text,text) IS 'Sprint 24 D1: registra dispositivo, revoca sesiones anteriores del mismo usuario.';
COMMENT ON FUNCTION public.check_session_valid(uuid, text)           IS 'Sprint 24 D1: valida que la sesión esté activa y no revocada. Actualiza last_seen_at.';
COMMENT ON FUNCTION public.activate_ai_credit_pack(uuid,uuid,text,int) IS 'Sprint 24: solo service_role. Activado desde mp-webhook tras pago aprobado.';
COMMENT ON FUNCTION public.get_ai_admin_dashboard(int)               IS 'Sprint 24: métricas de monetización IA para super_admin.';
