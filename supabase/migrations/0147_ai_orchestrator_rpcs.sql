-- ============================================================================
-- 0147 — AI Orchestrator RPCs: Scoring, Routing, Cache, FinOps
-- ============================================================================
-- RPCs:
--   get_ai_routing_config(operation, ai_mode) → configuración completa para el Orchestrator
--   get_ai_provider_scores()                  → scores actuales de todos los proveedores
--   record_provider_health(provider, status, latency, errors) → actualiza salud
--   get_or_create_ai_cache(cache_key, ...)    → cache inteligente
--   get_ai_finops_summary(days)               → FinOps dashboard
--   get_ai_usage_by_provider(days)            → uso por proveedor
--   purge_ai_cache()                          → limpia entradas expiradas
-- ============================================================================

-- ─── 1. Configuración de routing para el Orchestrator ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_routing_config(
  p_operation text,
  p_ai_mode   text DEFAULT 'balanced'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pricing    record;
  v_provider   record;
  v_model      record;
  v_fallback   record;
  v_fb_model   record;
  v_health     jsonb;
  v_score      numeric;
BEGIN
  -- Obtener configuración de pricing (preferred + fallback)
  SELECT * INTO v_pricing FROM public.ai_operation_pricing
  WHERE operation = p_operation AND enabled = true;

  IF NOT FOUND THEN
    -- Configuración por defecto si la operación no tiene pricing configurado
    RETURN jsonb_build_object(
      'operation',   p_operation,
      'provider',    'gemini',
      'model',       'gemini-2.5-flash',
      'fallback_provider', null,
      'fallback_model',    null,
      'cache_enabled',     false,
      'cache_ttl_minutes', 0,
      'requires_vision',   false,
      'credits_cost',      3
    );
  END IF;

  -- Obtener provider principal
  SELECT * INTO v_provider FROM public.ai_providers
  WHERE provider_key = v_pricing.preferred_provider AND enabled = true;

  -- Si provider preferido no disponible, usar fallback
  IF NOT FOUND THEN
    SELECT * INTO v_provider FROM public.ai_providers
    WHERE provider_key = v_pricing.fallback_provider AND enabled = true;
  END IF;

  -- Modelo según modo de IA
  DECLARE v_model_id text;
  BEGIN
    v_model_id := CASE p_ai_mode
      WHEN 'economy' THEN (
        SELECT model_id FROM public.ai_provider_models
        WHERE provider_key = COALESCE(v_provider.provider_key, 'gemini') AND enabled = true
        ORDER BY cost_per_1m_tokens ASC LIMIT 1
      )
      WHEN 'quality' THEN (
        SELECT model_id FROM public.ai_provider_models
        WHERE provider_key = COALESCE(v_provider.provider_key, 'gemini') AND enabled = true
        ORDER BY quality_score DESC LIMIT 1
      )
      ELSE v_pricing.preferred_model
    END;

    RETURN jsonb_build_object(
      'operation',          p_operation,
      'ai_mode',            p_ai_mode,
      'provider',           COALESCE(v_provider.provider_key, 'gemini'),
      'model',              COALESCE(v_model_id, v_pricing.preferred_model, 'gemini-2.5-flash'),
      'fallback_provider',  v_pricing.fallback_provider,
      'fallback_model',     v_pricing.fallback_model,
      'cache_enabled',      v_pricing.cache_enabled,
      'cache_ttl_minutes',  v_pricing.cache_ttl_minutes,
      'requires_vision',    v_pricing.requires_vision,
      'quality_level',      v_pricing.quality_level,
      'credits_cost',       v_pricing.credits_cost,
      'estimated_usd',      v_pricing.estimated_usd_cost,
      'max_allowed_usd',    v_pricing.max_allowed_usd,
      'min_margin_pct',     v_pricing.minimum_margin_pct
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_routing_config(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_routing_config(text, text) TO service_role;

-- ─── 2. Scores actuales de proveedores ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_provider_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]';
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'provider_key',        p.provider_key,
      'name',                p.name,
      'enabled',             p.enabled,
      'priority',            p.priority,
      'quality_score',       p.quality_score,
      'cost_score',          p.cost_score,
      'supports_vision',     p.supports_vision,
      -- Datos de salud más recientes
      'status',              COALESCE(h.status, 'unknown'),
      'latency_ms',          h.latency_ms,
      'error_rate_pct',      COALESCE(h.error_rate_pct, 0),
      'availability_score',  COALESCE(h.availability_score, 100),
      'is_circuit_open',     COALESCE(h.is_circuit_open, false),
      'last_check',          h.checked_at,
      -- Score compuesto: calidad * 0.35 + disponibilidad * 0.30 + costo * 0.20 + (100-prioridad)/100*0.15
      'composite_score',     ROUND(
        p.quality_score * 0.35 +
        COALESCE(h.availability_score, 100) * 0.30 +
        p.cost_score * 0.20 +
        (100 - p.priority) * 0.15
      , 2)
    ) ORDER BY p.priority ASC
  )
  INTO v_result
  FROM public.ai_providers p
  LEFT JOIN LATERAL (
    SELECT * FROM public.ai_provider_health
    WHERE provider_key = p.provider_key
    ORDER BY checked_at DESC LIMIT 1
  ) h ON true;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_provider_scores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_provider_scores() TO service_role;

-- ─── 3. Registrar salud de proveedor ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_provider_health(
  p_provider_key      text,
  p_status            text DEFAULT 'ok',
  p_latency_ms        int  DEFAULT NULL,
  p_error_count       int  DEFAULT 0,
  p_success_count     int  DEFAULT 1,
  p_is_circuit_open   boolean DEFAULT false,
  p_last_error        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total          int;
  v_error_rate_pct numeric(5,2);
  v_avail_score    numeric(4,2);
BEGIN
  v_total := p_error_count + p_success_count;
  v_error_rate_pct := CASE WHEN v_total > 0 THEN (p_error_count::numeric / v_total) * 100 ELSE 0 END;
  v_avail_score    := GREATEST(0, 100 - v_error_rate_pct);

  INSERT INTO public.ai_provider_health
    (provider_key, status, latency_ms, error_rate_pct, success_count_1h, error_count_1h, availability_score, is_circuit_open, last_error)
  VALUES
    (p_provider_key, p_status, p_latency_ms, v_error_rate_pct, p_success_count, p_error_count, v_avail_score, p_is_circuit_open, p_last_error);

  -- Limpiar registros > 48h
  DELETE FROM public.ai_provider_health
  WHERE provider_key = p_provider_key AND checked_at < now() - interval '48 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_provider_health(text, text, int, int, int, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_provider_health(text, text, int, int, int, boolean, text) TO authenticated;

-- ─── 4. Cache inteligente ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_cache_hit(p_cache_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_entry record;
BEGIN
  SELECT * INTO v_entry FROM public.ai_cache
  WHERE cache_key = p_cache_key AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('hit', false);
  END IF;

  -- Actualizar hit_count y last_hit_at
  UPDATE public.ai_cache
  SET hit_count = hit_count + 1, last_hit_at = now()
  WHERE cache_key = p_cache_key;

  RETURN jsonb_build_object(
    'hit',          true,
    'text',         v_entry.response_text,
    'tokens_used',  v_entry.tokens_used,
    'hit_count',    v_entry.hit_count + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_cache_hit(text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_ai_cache(
  p_cache_key     text,
  p_workspace_id  uuid,
  p_operation     text,
  p_response_text text,
  p_tokens_used   int   DEFAULT 0,
  p_credits       int   DEFAULT 1,
  p_ttl_minutes   int   DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_cache
    (cache_key, workspace_id, operation, response_text, tokens_used, credits_saved, expires_at)
  VALUES
    (p_cache_key, p_workspace_id, p_operation, p_response_text, p_tokens_used, p_credits,
     now() + (p_ttl_minutes || ' minutes')::interval)
  ON CONFLICT (cache_key) DO UPDATE SET
    response_text = excluded.response_text,
    tokens_used   = excluded.tokens_used,
    expires_at    = excluded.expires_at,
    last_hit_at   = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ai_cache(text, uuid, text, text, int, int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_ai_cache()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.ai_cache WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_ai_cache() TO service_role;

-- ─── 5. FinOps: resumen de costos reales ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_finops_summary(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'period_days',          p_days,
      'total_requests',       COUNT(*),
      'total_credits_consumed', SUM(credits_consumed),
      'total_real_cost_usd',  ROUND(SUM(real_cost_usd)::numeric, 4),
      'avg_latency_ms',       ROUND(AVG(latency_ms)::numeric, 0),
      'success_rate_pct',     ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
      'fallback_rate_pct',    ROUND(100.0 * SUM(CASE WHEN fallback_used THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
      'cache_hit_rate_pct',   ROUND(100.0 * SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
      'by_provider',          (
        SELECT jsonb_agg(jsonb_build_object(
          'provider',      provider_selected,
          'requests',      COUNT(*),
          'credits',       SUM(credits_consumed),
          'cost_usd',      ROUND(SUM(real_cost_usd)::numeric, 6),
          'avg_latency',   ROUND(AVG(latency_ms)::numeric, 0),
          'success_rate',  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2)
        ) ORDER BY COUNT(*) DESC)
        FROM public.ai_request_log
        WHERE created_at >= v_since
        GROUP BY provider_selected
      ),
      'by_operation',         (
        SELECT jsonb_agg(jsonb_build_object(
          'operation',  operation,
          'requests',   COUNT(*),
          'credits',    SUM(credits_consumed),
          'cost_usd',   ROUND(SUM(real_cost_usd)::numeric, 6)
        ) ORDER BY SUM(credits_consumed) DESC NULLS LAST)
        FROM public.ai_request_log
        WHERE created_at >= v_since
        GROUP BY operation
      ),
      'by_workspace',         (
        SELECT jsonb_agg(row_data)
        FROM (
          SELECT jsonb_build_object(
            'workspace_id', workspace_id,
            'requests',     COUNT(*),
            'credits',      SUM(credits_consumed),
            'cost_usd',     ROUND(SUM(real_cost_usd)::numeric, 6)
          ) AS row_data
          FROM public.ai_request_log
          WHERE created_at >= v_since
          GROUP BY workspace_id
          ORDER BY SUM(credits_consumed) DESC NULLS LAST
          LIMIT 20
        ) ws_sub
      )
    )
    FROM public.ai_request_log
    WHERE created_at >= v_since
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_finops_summary(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_finops_summary(int) TO authenticated;

-- ─── 6. Benchmark: obtener resultados agrupados ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_benchmark_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'provider_key',   provider_key,
      'model_id',       model_id,
      'operation',      operation,
      'avg_latency_ms', ROUND(AVG(latency_ms)::numeric, 0),
      'avg_quality',    ROUND(AVG(quality_score)::numeric, 2),
      'avg_cost_usd',   ROUND(AVG(cost_usd)::numeric, 8),
      'success_rate',   ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
      'sample_count',   COUNT(*),
      'last_run',       MAX(created_at)
    ) ORDER BY AVG(quality_score) DESC NULLS LAST)
    FROM public.ai_benchmark_results
    WHERE created_at >= now() - interval '30 days'
    GROUP BY provider_key, model_id, operation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_benchmark_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_benchmark_summary() TO authenticated;
