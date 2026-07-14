-- ============================================================================
-- 0149 — Prompt Versioning + Observabilidad P50/P95/P99 + Ranking Dinámico
-- ============================================================================

-- ─── 1. Prompt Versioning ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_prompt_templates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation        text        NOT NULL,        -- operación a la que aplica
  version          int         NOT NULL DEFAULT 1,
  status           text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  name             text        NOT NULL,        -- nombre descriptivo para el admin
  system_prompt    text,                        -- prompt de sistema (instrucciones base)
  prompt_template  text,                        -- template con placeholders {variable}
  variables        jsonb,                       -- variables disponibles y su descripción
  ab_test_pct      int         NOT NULL DEFAULT 0  -- 0-100: % de tráfico en A/B test
    CHECK (ab_test_pct BETWEEN 0 AND 100),
  quality_notes    text,                        -- notas de calidad del admin
  change_notes     text,                        -- notas del cambio vs versión anterior
  published_at     timestamptz,
  archived_at      timestamptz,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_operation ON public.ai_prompt_templates(operation, status, version DESC);

ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_prompts_admin"  ON public.ai_prompt_templates FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_prompts_select" ON public.ai_prompt_templates FOR SELECT USING (public.is_support_admin());

-- RPC: publicar una versión de prompt (archiva la anterior)
CREATE OR REPLACE FUNCTION public.publish_prompt_version(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template record;
BEGIN
  SELECT * INTO v_template FROM public.ai_prompt_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Template no encontrado'); END IF;

  -- Archivar versión publicada actual
  UPDATE public.ai_prompt_templates
  SET status = 'archived', archived_at = now(), updated_at = now()
  WHERE operation = v_template.operation AND status = 'published' AND id != p_template_id;

  -- Publicar la nueva versión
  UPDATE public.ai_prompt_templates
  SET status = 'published', published_at = now(), updated_at = now()
  WHERE id = p_template_id;

  RETURN jsonb_build_object('ok', true, 'version', v_template.version, 'operation', v_template.operation);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_prompt_version(uuid) TO authenticated;

-- RPC: rollback a una versión anterior
CREATE OR REPLACE FUNCTION public.rollback_prompt_version(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Es el mismo flujo que publicar — re-publicar la versión archivada
  RETURN public.publish_prompt_version(p_template_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rollback_prompt_version(uuid) TO authenticated;

COMMENT ON TABLE public.ai_prompt_templates IS
  'Versioning de prompts por operación. draft → published → archived. Rollback via re-publicar.';

-- ─── 2. Observabilidad P50/P95/P99 ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_latency_percentiles(
  p_days     int  DEFAULT 7,
  p_provider text DEFAULT NULL  -- NULL = todos los proveedores
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_since timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  RETURN (
    SELECT jsonb_agg(row_data ORDER BY (row_data->>'provider') ASC)
    FROM (
      SELECT jsonb_build_object(
        'provider',          provider_selected,
        'operation',         operation,
        'sample_count',      COUNT(*),
        'p50_ms',            ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0),
        'p95_ms',            ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0),
        'p99_ms',            ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0),
        'avg_ms',            ROUND(AVG(latency_ms)::numeric, 0),
        'min_ms',            MIN(latency_ms),
        'max_ms',            MAX(latency_ms),
        'success_rate_pct',  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
        'fallback_rate_pct', ROUND(100.0 * SUM(CASE WHEN fallback_used THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
        'cache_hit_pct',     ROUND(100.0 * SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2)
      ) AS row_data
      FROM public.ai_request_log
      WHERE created_at >= v_since
        AND latency_ms IS NOT NULL
        AND (p_provider IS NULL OR provider_selected = p_provider)
        AND success = true
      GROUP BY provider_selected, operation
    ) sub
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_latency_percentiles(int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_latency_percentiles(int, text) TO service_role;

-- RPC: Circuit Breaker State + Health Score global
CREATE OR REPLACE FUNCTION public.get_ai_health_score()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'provider_key',       p.provider_key,
      'name',               p.name,
      'health_score',       ROUND(
        COALESCE(h.availability_score, 100) * 0.40 +
        LEAST(100, 100 - COALESCE(h.error_rate_pct, 0)) * 0.35 +
        CASE WHEN COALESCE(h.latency_ms, 9999) < 1000 THEN 100
             WHEN COALESCE(h.latency_ms, 9999) < 3000 THEN 75
             WHEN COALESCE(h.latency_ms, 9999) < 5000 THEN 50
             ELSE 25 END * 0.25
      ::numeric, 2),
      'availability',       COALESCE(h.availability_score, 100),
      'error_rate_pct',     COALESCE(h.error_rate_pct, 0),
      'latency_ms',         h.latency_ms,
      'status',             COALESCE(h.status, 'unknown'),
      'circuit_open',       COALESCE(h.is_circuit_open, false),
      'enabled',            p.enabled,
      'last_check',         h.checked_at
    ) ORDER BY p.priority ASC)
    FROM public.ai_providers p
    LEFT JOIN LATERAL (
      SELECT * FROM public.ai_provider_health
      WHERE provider_key = p.provider_key
      ORDER BY checked_at DESC LIMIT 1
    ) h ON true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_health_score() TO authenticated;

-- ─── 3. Ranking Dinámico (usa datos reales de ai_request_log) ────────────────

CREATE OR REPLACE FUNCTION public.get_ai_dynamic_ranking(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_since timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'provider_key',     p.provider_key,
      'name',             p.name,
      'enabled',          p.enabled,
      -- Score base del admin
      'quality_score',    p.quality_score,
      'cost_score',       p.cost_score,
      -- Métricas reales de los últimos N días
      'real_success_rate',  ROUND(COALESCE(
        100.0 * SUM(CASE WHEN l.success THEN 1 ELSE 0 END) / NULLIF(COUNT(l.id), 0),
        100), 2),
      'real_p50_ms',      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY l.latency_ms)::numeric, 0),
      'real_p95_ms',      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l.latency_ms)::numeric, 0),
      'real_avg_cost_usd',ROUND(AVG(l.real_cost_usd)::numeric, 8),
      'total_requests',   COUNT(l.id),
      -- Benchmark data
      'benchmark_quality',ROUND(AVG(b.quality_score)::numeric, 2),
      'benchmark_latency',ROUND(AVG(b.latency_ms)::numeric, 0),
      -- Score dinámico compuesto
      'dynamic_score', ROUND((
        p.quality_score * 0.25 +
        COALESCE(ROUND(100.0 * SUM(CASE WHEN l.success THEN 1 ELSE 0 END) / NULLIF(COUNT(l.id), 0), 2), 100) * 0.30 +
        p.cost_score * 0.20 +
        CASE WHEN COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY l.latency_ms)::numeric, 9999) < 1500
             THEN 100
             WHEN COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY l.latency_ms)::numeric, 9999) < 3000
             THEN 75
             ELSE 50 END * 0.15 +
        COALESCE(AVG(b.quality_score), p.quality_score) * 0.10
      )::numeric, 2)
    ) ORDER BY (
      p.quality_score * 0.25 +
      COALESCE(100.0 * SUM(CASE WHEN l.success THEN 1 ELSE 0 END) / NULLIF(COUNT(l.id), 0), 100) * 0.30 +
      p.cost_score * 0.20
    ) DESC NULLS LAST)
    FROM public.ai_providers p
    LEFT JOIN public.ai_request_log l ON l.provider_selected = p.provider_key AND l.created_at >= v_since
    LEFT JOIN public.ai_benchmark_results b ON b.provider_key = p.provider_key AND b.created_at >= v_since
    GROUP BY p.provider_key, p.name, p.enabled, p.quality_score, p.cost_score, p.priority
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_dynamic_ranking(int) TO authenticated;

-- ─── 4. Cost Simulator RPC ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.simulate_ai_costs(
  p_users         int DEFAULT 100,
  p_operations    jsonb DEFAULT '[{"operation":"ia_photo_interpret","count":100},{"operation":"forecast","count":50}]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_credits int := 0;
  v_total_cost    numeric := 0;
  v_items         jsonb := '[]';
  v_op            record;
  v_pricing       record;
BEGIN
  FOR v_op IN SELECT * FROM jsonb_to_recordset(p_operations) AS x(operation text, count int)
  LOOP
    SELECT op.credits_cost, op.estimated_usd_cost, op.quality_level, op.preferred_provider
    INTO v_pricing
    FROM public.ai_operation_pricing op
    WHERE op.operation = v_op.operation;

    IF FOUND THEN
      v_total_credits := v_total_credits + (v_pricing.credits_cost * COALESCE(v_op.count, 0));
      v_total_cost    := v_total_cost    + (v_pricing.estimated_usd_cost * COALESCE(v_op.count, 0));
      v_items := v_items || jsonb_build_object(
        'operation',        v_op.operation,
        'count',            v_op.count,
        'credits_each',     v_pricing.credits_cost,
        'credits_total',    v_pricing.credits_cost * v_op.count,
        'cost_usd_each',    v_pricing.estimated_usd_cost,
        'cost_usd_total',   v_pricing.estimated_usd_cost * v_op.count,
        'quality_level',    v_pricing.quality_level,
        'provider',         v_pricing.preferred_provider
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'users',             p_users,
    'total_credits',     v_total_credits,
    'total_cost_usd',    ROUND(v_total_cost::numeric, 4),
    'cost_per_user_usd', ROUND((v_total_cost / NULLIF(p_users, 0))::numeric, 6),
    'breakdown',         v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulate_ai_costs(int, jsonb) TO authenticated;

COMMENT ON FUNCTION public.get_ai_latency_percentiles IS 'P50/P95/P99 latencia real por proveedor y operación.';
COMMENT ON FUNCTION public.get_ai_dynamic_ranking     IS 'Ranking dinámico basado en métricas reales + benchmark.';
COMMENT ON FUNCTION public.simulate_ai_costs          IS 'Simulador de costos: dado un mix de operaciones, calcula créditos y costo USD.';
