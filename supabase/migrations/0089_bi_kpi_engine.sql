-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0089: Sprint 19 BI — KPI Engine (capa agregadora)
-- ════════════════════════════════════════════════════════════════════════════
-- FILOSOFÍA: Estas RPCs NO recalculan nada. Son orchestrators que llaman
-- las RPCs especializadas existentes y devuelven un modelo unificado.
-- Reducen N+1 del frontend de ~10 llamadas a 1.
-- Todas aceptan period_start / period_end (Sprint 19 requirement).
-- Zero Trust: cada sub-función valida su propio acceso por JWT.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── RPC 1: get_bi_executive_kpis — CEO Dashboard consolidado ────────────────
-- Responde: ¿cómo va el negocio hoy?
-- Consolida: finanzas + dashboard ejecutivo + customer success + alertas

CREATE OR REPLACE FUNCTION public.get_bi_executive_kpis(
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
  v_user_id  uuid := auth.uid();
  v_start    date;
  v_end      date;
  v_finance  jsonb;
  v_executive jsonb;
  v_cs       jsonb;
  v_alerts   jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  -- Llamar RPCs especializadas existentes (cada una valida auth internamente)
  v_finance   := public.get_finance_dashboard(p_workspace_id, v_start, v_end);
  v_executive := public.get_executive_dashboard(p_workspace_id);
  v_cs        := public.get_customer_success_dashboard(p_workspace_id);
  v_alerts    := public.get_smart_alerts(p_workspace_id);

  RETURN jsonb_build_object(
    'ok',             true,
    'period_start',   v_start,
    'period_end',     v_end,
    'generated_at',   now(),
    -- KPIs financieros (period-aware)
    'revenue',             v_finance->'summary'->'total_revenue',
    'profit',              v_finance->'summary'->'estimated_profit',
    'margin_pct',          v_finance->'summary'->'estimated_margin_pct',
    'gross_margin_pct',    v_finance->'summary'->'gross_margin_pct',
    'revenue_change_pct',  v_finance->'summary'->'revenue_change_pct',
    'profit_change_pct',   v_finance->'summary'->'profit_change_pct',
    'quotes_approved',     v_finance->'summary'->'quotes_approved',
    'orders_finalized',    v_finance->'summary'->'orders_finalized',
    -- Pipeline (ejecutivo — siempre 30d)
    'pipeline_value',      v_executive->'pipeline_activo'->'valor_en_juego',
    'pipeline_count',      v_executive->'pipeline_activo'->'total_oportunidades',
    'conversion_rate_30d', v_executive->'ultimos_30_dias'->'tasa_conversion',
    'approved_value_30d',  v_executive->'ultimos_30_dias'->'valor_aprobado',
    -- Customer Success (estado actual — no period)
    'vip_clients',         v_cs->'summary'->'vip',
    'at_risk_clients',     v_cs->'summary'->'at_risk',
    'avg_health_score',    v_cs->'summary'->'avg_score',
    -- Tendencia mensual (de finanzas)
    'monthly_trend',       v_finance->'monthly_trend',
    -- Alertas activas
    'alerts',              v_alerts->'alerts',
    -- Top clientes rentables
    'top_clients',         v_finance->'top_clients',
    'low_margin_clients',  v_finance->'low_margin_clients',
    -- Salud financiera
    'financial_health',    v_finance->'financial_health'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bi_executive_kpis(uuid, date, date) TO authenticated;

-- ─── RPC 2: get_bi_sales_kpis — Dashboard Comercial ─────────────────────────
-- Responde: ¿cómo van las ventas? ¿quién vende más?
-- Consolida: reports_summary + funnel_report + sales_by_rep

CREATE OR REPLACE FUNCTION public.get_bi_sales_kpis(
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
  v_summary jsonb;
  v_funnel  jsonb;
  v_by_rep  jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  v_summary := public.get_reports_summary(p_workspace_id, v_start, v_end);
  v_funnel  := public.get_funnel_report(p_workspace_id, v_start, v_end);
  v_by_rep  := public.get_sales_by_rep(p_workspace_id, v_start, v_end);

  RETURN jsonb_build_object(
    'ok',           true,
    'period_start', v_start,
    'period_end',   v_end,
    'generated_at', now(),
    -- KPIs de resumen
    'total_quoted',      v_summary->'total_cotizado',
    'total_approved',    v_summary->'total_aprobado',
    'quotes_count',      v_summary->'cotizaciones',
    'approved_count',    v_summary->'aprobadas',
    'conversion_rate',   v_summary->'tasa_conversion',
    'avg_close_days',    v_summary->'tiempo_promedio_cierre_dias',
    -- Comparativa período anterior
    'prev_total_quoted', v_summary->'anterior'->'total_cotizado',
    'prev_conversion',   v_summary->'anterior'->'tasa_conversion',
    -- Embudo comercial
    'funnel',            v_funnel->'stages',
    'funnel_summary',    v_funnel->'resumen',
    -- Por comercial
    'by_rep',            v_by_rep->'reps',
    'team_summary',      v_by_rep->'summary'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bi_sales_kpis(uuid, date, date) TO authenticated;

-- ─── RPC 3: get_bi_operations_kpis — Dashboard Operativo ─────────────────────
-- Responde: ¿cómo van las operaciones? ¿quién es más productivo?
-- Consolida: operations_dashboard + ops_productivity + operational_dashboard(GPS)

CREATE OR REPLACE FUNCTION public.get_bi_operations_kpis(
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
  v_user_id     uuid := auth.uid();
  v_start       date;
  v_end         date;
  v_ops         jsonb;
  v_productivity jsonb;
  v_gps         jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  -- Dashboard operativo actual (estado en tiempo real — sin period)
  v_ops          := public.get_operations_dashboard();
  -- Productividad en el período (period-aware, nueva Sprint 19)
  v_productivity := public.get_ops_productivity(p_workspace_id, v_start, v_end);
  -- GPS si disponible (captura error gracefully)
  BEGIN
    v_gps := public.get_operational_dashboard(p_workspace_id);
  EXCEPTION WHEN OTHERS THEN
    v_gps := jsonb_build_object('ok', false, 'error', 'GPS no disponible');
  END;

  RETURN jsonb_build_object(
    'ok',             true,
    'period_start',   v_start,
    'period_end',     v_end,
    'generated_at',   now(),
    -- Estado actual (tiempo real)
    'orders_status',      v_ops->'orders',
    'work_orders_status', v_ops->'work_orders',
    -- Productividad en el período
    'productivity_by_member', v_productivity->'team',
    'productivity_summary',   v_productivity->'summary',
    -- GPS / Campo (si PREMIUM)
    'gps_connected',    (v_gps->>'ok')::boolean,
    'team_in_field',    v_gps->'en_campo',
    'checkins_today',   v_gps->'checkins_hoy',
    'ot_active',        v_gps->'ot_activas'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bi_operations_kpis(uuid, date, date) TO authenticated;

-- ─── RPC 4: get_bi_marketing_kpis — Dashboard Marketing ──────────────────────
-- Responde: ¿qué canal trae mejores clientes? ¿cuánto ROI tienen los referidos?
-- Consolida: growth_dashboard + utm_analytics + referral_dashboard

CREATE OR REPLACE FUNCTION public.get_bi_marketing_kpis(
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
  v_user_id  uuid := auth.uid();
  v_start    date;
  v_end      date;
  v_days     int;
  v_growth   jsonb;
  v_utm      jsonb;
  v_referral jsonb;
  -- CAC aproximado: costo por cliente adquirido desde UTM/referidos
  v_cac      jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);
  v_days  := (v_end - v_start) + 1;

  v_growth   := public.get_growth_dashboard(p_workspace_id);
  v_utm      := public.get_utm_analytics(p_workspace_id, v_days);
  v_referral := public.get_referral_dashboard(p_workspace_id);

  -- CAC estimado por canal: ingresos generados por clientes de ese canal / clientes adquiridos
  -- Nota: ROI real requiere gasto en pauta (no disponible aún → Sprint 20)
  SELECT jsonb_agg(jsonb_build_object(
    'source',         s.utm_source,
    'clients',        s.clients_count,
    'revenue_from_clients', s.revenue,
    'revenue_per_client',   CASE WHEN s.clients_count > 0
      THEN round(s.revenue / s.clients_count, 0) ELSE 0 END
  ) ORDER BY s.revenue DESC)
  INTO v_cac
  FROM (
    SELECT
      ue.utm_source,
      COUNT(DISTINCT ue.client_id) AS clients_count,
      COALESCE(SUM((q.calc_snapshot->>'total')::numeric) FILTER (WHERE q.status = 'Aprobada'), 0) AS revenue
    FROM public.utm_events ue
    LEFT JOIN public.quotes q ON q.client_id = ue.client_id
      AND q.workspace_id = ue.workspace_id
      AND q.deleted_at IS NULL
    WHERE ue.workspace_id = p_workspace_id
      AND ue.client_id IS NOT NULL
      AND ue.created_at::date BETWEEN v_start AND v_end
    GROUP BY ue.utm_source
  ) s;

  RETURN jsonb_build_object(
    'ok',             true,
    'period_start',   v_start,
    'period_end',     v_end,
    'generated_at',   now(),
    -- Adquisición
    'new_clients',        v_growth->'acquisition'->'new_clients',
    'acquisition_by_source', v_growth->'acquisition'->'by_source',
    -- UTM breakdown
    'utm_visits',         v_utm->'total_visits',
    'utm_by_source',      v_utm->'by_source',
    'utm_by_campaign',    v_utm->'by_campaign',
    -- Referidos
    'referral_active',    v_referral->'program' IS NOT NULL,
    'referral_conversions', v_growth->'referrals'->'total_conversions',
    'referral_rewarded',  v_growth->'referrals'->'rewarded',
    -- Revenue por canal (CAC proxy)
    'revenue_by_channel', COALESCE(v_cac, '[]'::jsonb),
    -- Cupones
    'promos_used',        v_growth->'promotions'->'total_used',
    'promos_discount',    v_growth->'promotions'->'total_discount'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bi_marketing_kpis(uuid, date, date) TO authenticated;

-- ─── RPC 5: get_bi_customer_kpis — Dashboard Customer Success ────────────────
-- Responde: ¿cómo está la salud de los clientes? ¿cuál es el NPS?
-- Consolida: customer_success_dashboard + nps_summary + client_cohorts

CREATE OR REPLACE FUNCTION public.get_bi_customer_kpis(
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
  v_cs      jsonb;
  v_nps     jsonb;
  v_cohorts jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '5 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  v_cs      := public.get_customer_success_dashboard(p_workspace_id);
  v_nps     := public.get_nps_summary(p_workspace_id);
  v_cohorts := public.get_client_cohorts(p_workspace_id, 6);

  RETURN jsonb_build_object(
    'ok',             true,
    'period_start',   v_start,
    'period_end',     v_end,
    'generated_at',   now(),
    -- Segmentos de salud
    'health_summary',     v_cs->'summary',
    'vip_clients',        v_cs->'vip_clients',
    'at_risk_clients',    v_cs->'at_risk',
    'repurchase_opps',    v_cs->'repurchase_opportunities',
    -- NPS y satisfacción
    'nps_score',          v_nps->'nps',
    'nps_label',          v_nps->'nps_label',
    'avg_rating',         v_nps->'avg_rating',
    'promoters',          v_nps->'promoters',
    'detractors',         v_nps->'detractors',
    'total_reviews',      v_nps->'total_reviews',
    -- Cohortes de retención
    'cohorts',            v_cohorts->'cohorts',
    'avg_retention',      v_cohorts->'avg_retention',
    'retention_months',   v_cohorts->'months_analyzed'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bi_customer_kpis(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_bi_executive_kpis(uuid, date, date)  IS 'Sprint 19: CEO KPIs. Agrega finance_dashboard + executive_dashboard + cs_dashboard + smart_alerts.';
COMMENT ON FUNCTION public.get_bi_sales_kpis(uuid, date, date)      IS 'Sprint 19: KPIs comerciales. Agrega reports_summary + funnel_report + sales_by_rep.';
COMMENT ON FUNCTION public.get_bi_operations_kpis(uuid, date, date) IS 'Sprint 19: KPIs operativos. Agrega operations_dashboard + ops_productivity + operational_dashboard.';
COMMENT ON FUNCTION public.get_bi_marketing_kpis(uuid, date, date)  IS 'Sprint 19: KPIs marketing. Agrega growth_dashboard + utm_analytics + referral_dashboard + revenue_by_channel.';
COMMENT ON FUNCTION public.get_bi_customer_kpis(uuid, date, date)   IS 'Sprint 19: KPIs CS. Agrega cs_dashboard + nps_summary + client_cohorts.';
