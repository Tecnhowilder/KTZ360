-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0088: Sprint 19 BI — DW Views + Analytical RPCs
-- ════════════════════════════════════════════════════════════════════════════
-- DW Views (SQL regulares, NO materializadas — decisión arquitectural):
--   dw_sales        → quotes + profiles + clients
--   dw_operations   → work_orders + orders + profiles + evidences
--   dw_finance      → quotes aprobadas + order_cost_entries
--   dw_marketing    → utm_events + referral_conversions + clients
--
-- Nuevas RPCs analíticas (gap real):
--   get_sales_by_rep()   → performance por comercial
--   get_ops_productivity()→ productividad por operario/supervisor
--
-- Estas views NO tienen RLS porque SOLO se usan desde funciones SECURITY
-- DEFINER que validan workspace_id desde JWT. Nunca expuestas al front.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. DW Views ─────────────────────────────────────────────────────────────

-- dw_sales: cotizaciones + creador + cliente
CREATE OR REPLACE VIEW public.dw_sales AS
SELECT
  q.id,
  q.workspace_id,
  q.created_by,
  q.client_id,
  q.commercial_status,
  q.status           AS quote_status,
  q.created_at,
  q.sent_at,
  q.updated_at,
  COALESCE((q.calc_snapshot->>'total')::numeric,     0) AS total,
  COALESCE((q.calc_snapshot->>'subtotal')::numeric,  0) AS direct_cost,
  COALESCE((q.calc_snapshot->>'utilAmt')::numeric,   0) AS util_amount,
  COALESCE((q.calc_snapshot->>'materials')::numeric, 0) AS materials_cost,
  COALESCE((q.calc_snapshot->>'labor')::numeric,     0) AS labor_cost,
  p.full_name   AS creator_name,
  p.role        AS creator_role,
  c.name        AS client_name,
  c.city        AS client_city
FROM public.quotes q
LEFT JOIN public.profiles p ON p.id = q.created_by AND p.workspace_id = q.workspace_id
LEFT JOIN public.clients  c ON c.id = q.client_id
WHERE q.deleted_at IS NULL;

COMMENT ON VIEW public.dw_sales IS 'Sprint 19: vista BI de ventas. Joins quotes+profiles+clients. Solo usada desde RPCs SECURITY DEFINER.';

-- dw_operations: OTs + pedido + operario asignado
CREATE OR REPLACE VIEW public.dw_operations AS
SELECT
  wo.id,
  wo.workspace_id,
  wo.order_id,
  wo.assigned_to,
  wo.status         AS wo_status,
  wo.priority,
  wo.created_at,
  wo.started_at,
  wo.finished_at,
  wo.scheduled_at,
  -- Duración real en horas (si existe started_at + finished_at)
  CASE WHEN wo.started_at IS NOT NULL AND wo.finished_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (wo.finished_at - wo.started_at)) / 3600.0
    ELSE NULL
  END                                 AS duration_hours,
  -- Retraso: finalizó después de la fecha programada
  CASE WHEN wo.scheduled_at IS NOT NULL AND wo.finished_at > wo.scheduled_at
    THEN 1 ELSE 0
  END                                 AS is_delayed,
  o.client_id,
  o.total_amount    AS order_value,
  o.status          AS order_status,
  p.full_name       AS assignee_name,
  p.role            AS assignee_role,
  o.order_number
FROM public.work_orders wo
JOIN  public.orders  o ON o.id = wo.order_id AND o.deleted_at IS NULL
LEFT JOIN public.profiles p ON p.id = wo.assigned_to AND p.workspace_id = wo.workspace_id;

COMMENT ON VIEW public.dw_operations IS 'Sprint 19: vista BI operativa. Joins work_orders+orders+profiles con duración calculada.';

-- dw_finance: cotizaciones aprobadas + costos reales
CREATE OR REPLACE VIEW public.dw_finance AS
SELECT
  q.id             AS quote_id,
  q.workspace_id,
  q.client_id,
  q.created_at,
  COALESCE((q.calc_snapshot->>'total')::numeric,      0) AS revenue,
  COALESCE((q.calc_snapshot->>'subtotal')::numeric,   0) AS estimated_direct_cost,
  COALESCE((q.calc_snapshot->>'utilAmt')::numeric,    0) AS estimated_profit,
  COALESCE((q.calc_snapshot->>'adminAmt')::numeric,   0) AS admin_amount,
  COALESCE((q.calc_snapshot->>'ivaAmt')::numeric,     0) AS iva_amount,
  COALESCE((q.calc_snapshot->>'transportAmt')::numeric,0) AS transport_amount,
  -- Costos reales del pedido vinculado (si existe)
  COALESCE(ce_sum.real_cost, 0)    AS real_cost,
  ce_sum.real_cost IS NOT NULL     AS has_real_costs,
  o.id                             AS order_id,
  o.status                         AS order_status
FROM public.quotes q
LEFT JOIN public.orders o ON o.quote_id = q.id AND o.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT SUM(ce.amount) AS real_cost
  FROM public.order_cost_entries ce
  WHERE ce.order_id = o.id
) ce_sum ON true
WHERE q.status = 'Aprobada'
  AND q.deleted_at IS NULL;

COMMENT ON VIEW public.dw_finance IS 'Sprint 19: vista BI financiera. Cotizaciones aprobadas con costos estimados y reales.';

-- dw_marketing: eventos UTM + conversiones de referidos
CREATE OR REPLACE VIEW public.dw_marketing AS
SELECT
  ue.id,
  ue.workspace_id,
  ue.client_id,
  ue.ref_code,
  ue.utm_source,
  ue.utm_medium,
  ue.utm_campaign,
  ue.utm_content,
  ue.utm_term,
  ue.created_at,
  'utm_event'    AS event_type,
  NULL::uuid     AS referral_link_id,
  NULL::text     AS conversion_status
FROM public.utm_events ue
UNION ALL
SELECT
  rc.id,
  rc.workspace_id,
  rc.referee_client_id AS client_id,
  NULL  AS ref_code,
  'referral'   AS utm_source,
  'referral'   AS utm_medium,
  NULL::text   AS utm_campaign,
  NULL::text   AS utm_content,
  NULL::text   AS utm_term,
  rc.created_at,
  'referral_conversion'  AS event_type,
  rc.referral_link_id,
  rc.status    AS conversion_status
FROM public.referral_conversions rc;

COMMENT ON VIEW public.dw_marketing IS 'Sprint 19: vista BI marketing. Une utm_events + referral_conversions para análisis de adquisición unificado.';

-- ─── 2. Índices nuevos para las nuevas queries ────────────────────────────────

-- Para get_sales_by_rep: filtro por workspace + created_by + status + fecha
CREATE INDEX IF NOT EXISTS idx_quotes_created_by_workspace
  ON public.quotes(workspace_id, created_by, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Para get_ops_productivity: filtro por workspace + assigned_to + status
CREATE INDEX IF NOT EXISTS idx_work_orders_ws_assigned_status
  ON public.work_orders(workspace_id, assigned_to, status, finished_at);

-- Para evidence count por operario en productividad
CREATE INDEX IF NOT EXISTS idx_evidence_files_workspace_wo
  ON public.evidence_files(workspace_id, work_order_id)
  WHERE work_order_id IS NOT NULL;

-- ─── 3. RPC: get_sales_by_rep — performance por comercial ────────────────────
-- Responde: ¿qué comercial vende más? ¿Quién cierra más rápido?
-- Agrupa quotes por created_by. PRO+ feature gated.

CREATE OR REPLACE FUNCTION public.get_sales_by_rep(
  p_workspace_id uuid,
  p_period_start date DEFAULT NULL,
  p_period_end   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_start   date;
  v_end     date;
  v_rows    jsonb;
  v_summary jsonb;
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  IF NOT public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Performance por comercial requiere plan PRO o PREMIUM');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  -- Por rep: cotizaciones, aprobadas, valor, conversión, ticket promedio, días promedio cierre
  SELECT jsonb_agg(r ORDER BY (r->>'approved_value')::numeric DESC)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'user_id',           p.id,
      'full_name',         p.full_name,
      'role',              p.role,
      'quotes_created',    COUNT(q.id)::int,
      'quotes_sent',       COUNT(q.id) FILTER (WHERE q.commercial_status != 'borrador')::int,
      'quotes_approved',   COUNT(q.id) FILTER (WHERE q.status = 'Aprobada')::int,
      'quotes_rejected',   COUNT(q.id) FILTER (WHERE q.status = 'Rechazada')::int,
      'quotes_active',     COUNT(q.id) FILTER (WHERE q.commercial_status IN ('enviada','vista','negociacion'))::int,
      'conversion_rate',   CASE
        WHEN COUNT(q.id) FILTER (WHERE q.status IN ('Aprobada','Rechazada')) > 0
        THEN round(COUNT(q.id) FILTER (WHERE q.status = 'Aprobada')::numeric /
                   COUNT(q.id) FILTER (WHERE q.status IN ('Aprobada','Rechazada')) * 100, 1)
        ELSE 0 END,
      'total_value',       round(COALESCE(SUM(s.total), 0)::numeric, 0),
      'approved_value',    round(COALESCE(SUM(s.total) FILTER (WHERE s.quote_status = 'Aprobada'), 0)::numeric, 0),
      'avg_ticket',        CASE WHEN COUNT(q.id) FILTER (WHERE q.status = 'Aprobada') > 0
        THEN round(SUM(s.total) FILTER (WHERE s.quote_status = 'Aprobada') /
                   NULLIF(COUNT(q.id) FILTER (WHERE q.status = 'Aprobada'), 0), 0)
        ELSE 0 END,
      'avg_close_days',    round(AVG(
        EXTRACT(DAY FROM (q.updated_at - q.sent_at))
      ) FILTER (WHERE q.status = 'Aprobada' AND q.sent_at IS NOT NULL)::numeric, 1)
    ) AS r
    FROM public.profiles p
    LEFT JOIN public.quotes q
      ON q.created_by = p.id
      AND q.workspace_id = p_workspace_id
      AND q.deleted_at IS NULL
      AND q.created_at::date BETWEEN v_start AND v_end
    LEFT JOIN public.dw_sales s
      ON s.id = q.id
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'active'
      AND p.role IN ('owner','admin','comercial','supervisor')
    GROUP BY p.id, p.full_name, p.role
    HAVING COUNT(q.id) > 0
  ) sub;

  -- Summary totales del período (para comparar vs equipo)
  SELECT jsonb_build_object(
    'total_value',    round(COALESCE(SUM(s.total), 0)::numeric, 0),
    'approved_value', round(COALESCE(SUM(s.total) FILTER (WHERE s.quote_status = 'Aprobada'), 0)::numeric, 0),
    'total_quotes',   COUNT(*)::int,
    'approved_count', COUNT(*) FILTER (WHERE s.quote_status = 'Aprobada')::int,
    'team_conversion',CASE WHEN COUNT(*) FILTER (WHERE s.quote_status IN ('Aprobada','Rechazada')) > 0
      THEN round(COUNT(*) FILTER (WHERE s.quote_status = 'Aprobada')::numeric /
                 COUNT(*) FILTER (WHERE s.quote_status IN ('Aprobada','Rechazada')) * 100, 1)
      ELSE 0 END
  )
  INTO v_summary
  FROM public.dw_sales s
  WHERE s.workspace_id = p_workspace_id
    AND s.created_at::date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'ok',           true,
    'period_start', v_start,
    'period_end',   v_end,
    'reps',         COALESCE(v_rows, '[]'::jsonb),
    'summary',      COALESCE(v_summary, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_by_rep(uuid, date, date) TO authenticated;

-- ─── 4. RPC: get_ops_productivity — productividad por operario/supervisor ─────
-- Responde: ¿quién finaliza más OTs? ¿quién tiene más retrasos?
-- Agrupa work_orders por assigned_to con evidencias y GPS hours.

CREATE OR REPLACE FUNCTION public.get_ops_productivity(
  p_workspace_id uuid,
  p_period_start date DEFAULT NULL,
  p_period_end   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_start   date;
  v_end     date;
  v_rows    jsonb;
  v_summary jsonb;
BEGIN
  -- Zero Trust: solo owner/admin/supervisor
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin','supervisor','super_admin','support_admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner, admin o supervisor pueden ver productividad del equipo');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  -- Por operario/supervisor: OTs asignadas, finalizadas, duración, retrasos, evidencias
  SELECT jsonb_agg(r ORDER BY (r->>'wos_finished')::int DESC)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'user_id',            p.id,
      'full_name',          p.full_name,
      'role',               p.role,
      'wos_assigned',       COUNT(dwo.id)::int,
      'wos_finished',       COUNT(dwo.id) FILTER (WHERE dwo.wo_status = 'finalizada')::int,
      'wos_active',         COUNT(dwo.id) FILTER (WHERE dwo.wo_status IN ('asignada','en_progreso'))::int,
      'wos_cancelled',      COUNT(dwo.id) FILTER (WHERE dwo.wo_status = 'cancelada')::int,
      'completion_rate',    CASE WHEN COUNT(dwo.id) FILTER (WHERE dwo.wo_status IN ('finalizada','cancelada')) > 0
        THEN round(COUNT(dwo.id) FILTER (WHERE dwo.wo_status = 'finalizada')::numeric /
                   NULLIF(COUNT(dwo.id) FILTER (WHERE dwo.wo_status IN ('finalizada','cancelada')), 0) * 100, 1)
        ELSE 0 END,
      'avg_duration_hours', round(COALESCE(AVG(dwo.duration_hours) FILTER (WHERE dwo.duration_hours IS NOT NULL), 0)::numeric, 1),
      'delayed_count',      COALESCE(SUM(dwo.is_delayed) FILTER (WHERE dwo.wo_status = 'finalizada'), 0)::int,
      'delay_rate_pct',     CASE WHEN COUNT(dwo.id) FILTER (WHERE dwo.wo_status = 'finalizada') > 0
        THEN round(SUM(dwo.is_delayed) FILTER (WHERE dwo.wo_status = 'finalizada')::numeric /
                   NULLIF(COUNT(dwo.id) FILTER (WHERE dwo.wo_status = 'finalizada'), 0) * 100, 1)
        ELSE 0 END,
      -- Evidencias registradas (proxy de calidad documental)
      'evidences_count',    COALESCE((
        SELECT COUNT(*)::int
        FROM public.evidence_files ef
        WHERE ef.workspace_id = p_workspace_id
          AND ef.work_order_id = ANY(ARRAY_AGG(dwo.id))
      ), 0),
      -- GPS horas trabajadas desde check_in/check_out
      'gps_hours',          round(COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (co_e.created_at - ci_e.created_at)) / 3600.0)
        FROM (
          SELECT DISTINCT ON (ge.work_order_id)
            ge.work_order_id, ge.created_at
          FROM public.gps_events ge
          WHERE ge.workspace_id = p_workspace_id
            AND ge.user_id = p.id
            AND ge.event_type = 'check_in'
            AND ge.created_at::date BETWEEN v_start AND v_end
          ORDER BY ge.work_order_id, ge.created_at
        ) ci_e
        JOIN LATERAL (
          SELECT ge2.created_at
          FROM public.gps_events ge2
          WHERE ge2.workspace_id = p_workspace_id
            AND ge2.user_id = p.id
            AND ge2.work_order_id = ci_e.work_order_id
            AND ge2.event_type = 'check_out'
            AND ge2.created_at > ci_e.created_at
          ORDER BY ge2.created_at
          LIMIT 1
        ) co_e ON true
      ), 0)::numeric, 1)
    ) AS r
    FROM public.profiles p
    LEFT JOIN public.dw_operations dwo
      ON dwo.assigned_to = p.id
      AND dwo.workspace_id = p_workspace_id
      AND dwo.created_at::date BETWEEN v_start AND v_end
    WHERE p.workspace_id = p_workspace_id
      AND p.status = 'active'
      AND p.role IN ('operario','supervisor','admin','owner')
    GROUP BY p.id, p.full_name, p.role
    HAVING COUNT(dwo.id) > 0
  ) sub;

  -- Summary operativo del período
  SELECT jsonb_build_object(
    'total_wos',      COUNT(*)::int,
    'finalizadas',    COUNT(*) FILTER (WHERE dwo.wo_status = 'finalizada')::int,
    'delayed',        COALESCE(SUM(dwo.is_delayed) FILTER (WHERE dwo.wo_status = 'finalizada'), 0)::int,
    'avg_duration_h', round(COALESCE(AVG(dwo.duration_hours) FILTER (WHERE dwo.duration_hours IS NOT NULL), 0)::numeric, 1)
  )
  INTO v_summary
  FROM public.dw_operations dwo
  WHERE dwo.workspace_id = p_workspace_id
    AND dwo.created_at::date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'ok',           true,
    'period_start', v_start,
    'period_end',   v_end,
    'team',         COALESCE(v_rows, '[]'::jsonb),
    'summary',      COALESCE(v_summary, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ops_productivity(uuid, date, date) TO authenticated;

-- ─── 5. AI operation costs para BI analítica ─────────────────────────────────
-- Reutilizan el motor existente. Créditos iguales al forecast (3).

INSERT INTO public.ai_operation_costs (operation, credits_cost, description)
VALUES
  ('bi_executive_summary',  3, 'Resumen ejecutivo IA del estado del negocio (Sprint 19)'),
  ('bi_business_forecast',  3, 'Forecast de negocio IA basado en KPIs (Sprint 19)'),
  ('bi_risk_assessment',    3, 'Evaluación de riesgos del negocio IA (Sprint 19)'),
  ('bi_growth_recs',        3, 'Recomendaciones de crecimiento IA basadas en BI (Sprint 19)')
ON CONFLICT (operation) DO UPDATE SET
  credits_cost = excluded.credits_cost,
  description  = excluded.description;

COMMENT ON FUNCTION public.get_sales_by_rep(uuid, date, date)     IS 'Sprint 19: performance por comercial. Agrupa quotes por created_by. PRO+. Period-aware.';
COMMENT ON FUNCTION public.get_ops_productivity(uuid, date, date)  IS 'Sprint 19: productividad por operario/supervisor desde work_orders + GPS. Solo owner/admin/supervisor.';
