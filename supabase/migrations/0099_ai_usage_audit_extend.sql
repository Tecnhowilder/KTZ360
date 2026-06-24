-- ============================================================================
-- 0099 — ai_usage_audit_extend: Extender ai_usage para auditabilidad completa
-- ============================================================================
-- Sprint 24 — REUTILIZA ai_usage existente (no duplica).
-- Agrega columnas faltantes para observabilidad completa:
--   - execution_time_ms: latencia de Gemini
--   - model: modelo específico usado
--   - user_id: usuario que ejecutó (ya existe en ai_usage — verificar)
-- Crea índices adicionales para queries de historial y admin.
-- Crea RPC admin_get_ai_dashboard() para el panel de administración.
-- ============================================================================

-- ─── 1. Extender ai_usage con columnas de observabilidad ─────────────────────

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS execution_time_ms int,       -- latencia del proveedor IA en ms
  ADD COLUMN IF NOT EXISTS model             text,       -- modelo usado: gemini-2.5-flash, etc.
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'rate_limited', 'credits_exhausted'));

COMMENT ON COLUMN public.ai_usage.execution_time_ms IS
  'Sprint 24: latencia de la llamada al proveedor IA en milisegundos.';
COMMENT ON COLUMN public.ai_usage.model IS
  'Sprint 24: modelo específico usado (gemini-2.5-flash, etc.).';
COMMENT ON COLUMN public.ai_usage.status IS
  'Sprint 24: resultado de la operación IA.';

-- ─── 2. Índice adicional para historial por workspace ────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_created
  ON public.ai_usage(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_feature
  ON public.ai_usage(feature, period_month DESC);

-- ─── 3. Actualizar la vista v_ai_credits_summary para incluir ENTERPRISE ─────

CREATE OR REPLACE VIEW public.v_ai_credits_summary AS
SELECT
  w.id                                        AS workspace_id,
  public.get_effective_plan_code(w.id)        AS plan_code,
  COALESCE(pl.ai_credits_monthly, 0)          AS credits_max,
  COALESCE(
    (SELECT SUM(au.credits_used)
     FROM public.ai_usage au
     WHERE au.workspace_id = w.id
       AND au.period_month = date_trunc('month', now())::date
    ), 0
  )                                            AS credits_used_this_month,
  GREATEST(0,
    COALESCE(pl.ai_credits_monthly, 0) - COALESCE(
      (SELECT SUM(au.credits_used)
       FROM public.ai_usage au
       WHERE au.workspace_id = w.id
         AND au.period_month = date_trunc('month', now())::date
      ), 0
    )
  )                                            AS credits_remaining
FROM public.workspaces w
JOIN public.plan_limits pl
  ON pl.plan_code = public.get_effective_plan_code(w.id)
WHERE w.id IN (
  SELECT DISTINCT workspace_id FROM public.ai_usage
);

-- ─── 4. RPC admin: dashboard global de IA ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_ai_dashboard(
  p_period_month date DEFAULT date_trunc('month', now())::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Solo super admins pueden ver esto
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso restringido a super admins');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'period_month', p_period_month,
    -- Total créditos potenciales (todos los workspaces)
    'credits_potential', (
      SELECT COALESCE(SUM(pl.ai_credits_monthly), 0)
      FROM public.workspaces w
      JOIN public.plan_limits pl ON pl.plan_code = public.get_effective_plan_code(w.id)
      WHERE pl.ai_credits_monthly > 0
    ),
    -- Total créditos consumidos en el período
    'credits_consumed', (
      SELECT COALESCE(SUM(credits_used), 0)
      FROM public.ai_usage
      WHERE period_month = p_period_month
    ),
    -- Costo total estimado en USD
    'cost_usd', (
      SELECT COALESCE(SUM(estimated_cost), 0)
      FROM public.ai_usage
      WHERE period_month = p_period_month
        AND status = 'success'
    ),
    -- Total llamadas
    'total_calls', (
      SELECT COUNT(*)
      FROM public.ai_usage
      WHERE period_month = p_period_month
    ),
    -- Workspaces que usaron IA este período
    'active_ai_workspaces', (
      SELECT COUNT(DISTINCT workspace_id)
      FROM public.ai_usage
      WHERE period_month = p_period_month
    ),
    -- Top 10 workspaces por consumo
    'top_workspaces', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.credits_used DESC), '[]')
      FROM (
        SELECT
          au.workspace_id,
          COALESCE(cs.name, 'Sin nombre') AS company_name,
          public.get_effective_plan_code(au.workspace_id) AS plan_code,
          SUM(au.credits_used) AS credits_used,
          SUM(au.estimated_cost) AS cost_usd,
          COUNT(*) AS operations
        FROM public.ai_usage au
        LEFT JOIN public.company_settings cs ON cs.workspace_id = au.workspace_id
        WHERE au.period_month = p_period_month
        GROUP BY au.workspace_id, cs.name
        ORDER BY credits_used DESC
        LIMIT 10
      ) t
    ),
    -- Operaciones más usadas
    'top_operations', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.total_calls DESC), '[]')
      FROM (
        SELECT
          feature AS operation,
          SUM(credits_used) AS credits_used,
          SUM(estimated_cost) AS cost_usd,
          COUNT(*) AS total_calls,
          ROUND(AVG(execution_time_ms)) AS avg_latency_ms
        FROM public.ai_usage
        WHERE period_month = p_period_month
        GROUP BY feature
        ORDER BY total_calls DESC
        LIMIT 15
      ) t
    ),
    -- Errores IA del período
    'error_count', (
      SELECT COUNT(*)
      FROM public.ai_usage
      WHERE period_month = p_period_month
        AND status != 'success'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_ai_dashboard(date) TO authenticated;

-- ─── 5. RPC: historial de uso IA por workspace (para AI Studio V2) ───────────

CREATE OR REPLACE FUNCTION public.get_ai_usage_history(
  p_workspace_id uuid,
  p_days         int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Verificar acceso al workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = p_workspace_id AND id = v_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'history', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',               au.id,
          'feature',          au.feature,
          'credits_used',     au.credits_used,
          'tokens_used',      au.tokens_used,
          'estimated_cost',   au.estimated_cost,
          'model',            au.model,
          'execution_time_ms',au.execution_time_ms,
          'status',           au.status,
          'created_at',       au.created_at
        ) ORDER BY au.created_at DESC
      ), '[]')
      FROM public.ai_usage au
      WHERE au.workspace_id = p_workspace_id
        AND au.created_at >= now() - (p_days || ' days')::interval
      LIMIT 200
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total_credits',  COALESCE(SUM(credits_used), 0),
        'total_calls',    COUNT(*),
        'total_cost_usd', COALESCE(SUM(estimated_cost), 0),
        'avg_latency_ms', ROUND(AVG(execution_time_ms))
      )
      FROM public.ai_usage
      WHERE workspace_id = p_workspace_id
        AND created_at >= now() - (p_days || ' days')::interval
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_usage_history(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.admin_get_ai_dashboard IS
  'Sprint 24: Dashboard global de IA para super admins. Muestra créditos, costos, top workspaces.';
COMMENT ON FUNCTION public.get_ai_usage_history IS
  'Sprint 24: Historial de uso IA por workspace para AI Studio V2.';
