-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0085: Finance Dashboard RPC + Admin Finance + Alert Templates Sprint 18
-- ════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: get_finance_dashboard — dashboard consolidado para /app/finanzas
-- Reutiliza: calc_snapshot, clients.total_value, integration_events (Alegra),
--            customer_health_scores, automation_rules.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_finance_dashboard(
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
  -- Resumen
  v_revenue     numeric := 0;
  v_dir_cost    numeric := 0;
  v_util        numeric := 0;
  v_quotes_cnt  int     := 0;
  v_orders_cnt  int     := 0;
  v_real_cost   numeric := 0;
  v_has_real    boolean := false;
  -- Período anterior (comparativa)
  v_prev_revenue numeric := 0;
  v_prev_util    numeric := 0;
  v_period_days  int;
  -- Subresultados
  v_top_clients     jsonb;
  v_low_margin_cl   jsonb;
  v_top_services    jsonb;
  v_low_orders      jsonb;
  v_alegra          jsonb;
  v_monthly         jsonb;
  v_health          text;
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start       := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end         := COALESCE(p_period_end,   CURRENT_DATE);
  v_period_days := (v_end - v_start) + 1;

  -- ── Totales del período ──────────────────────────────────────────────────────
  SELECT
    COUNT(*)::int,
    COALESCE(SUM((calc_snapshot->>'total')::numeric),      0),
    COALESCE(SUM((calc_snapshot->>'subtotal')::numeric),   0),
    COALESCE(SUM((calc_snapshot->>'utilAmt')::numeric),    0)
  INTO v_quotes_cnt, v_revenue, v_dir_cost, v_util
  FROM public.quotes
  WHERE workspace_id = p_workspace_id
    AND status = 'Aprobada'
    AND deleted_at IS NULL
    AND created_at::date BETWEEN v_start AND v_end;

  SELECT COUNT(*)::int INTO v_orders_cnt
  FROM public.orders
  WHERE workspace_id = p_workspace_id AND status = 'finalizado'
    AND deleted_at IS NULL AND created_at::date BETWEEN v_start AND v_end;

  -- Costos reales en el período
  SELECT COALESCE(SUM(ce.amount), 0), COUNT(ce.id) > 0
  INTO v_real_cost, v_has_real
  FROM public.order_cost_entries ce
  JOIN public.orders o ON o.id = ce.order_id
  WHERE ce.workspace_id = p_workspace_id
    AND o.created_at::date BETWEEN v_start AND v_end;

  -- Período anterior (misma duración)
  SELECT
    COALESCE(SUM((calc_snapshot->>'total')::numeric), 0),
    COALESCE(SUM((calc_snapshot->>'utilAmt')::numeric), 0)
  INTO v_prev_revenue, v_prev_util
  FROM public.quotes
  WHERE workspace_id = p_workspace_id AND status = 'Aprobada' AND deleted_at IS NULL
    AND created_at::date BETWEEN (v_start - v_period_days) AND (v_start - 1);

  -- ── Top 5 clientes por ingreso ───────────────────────────────────────────────
  SELECT jsonb_agg(r ORDER BY (r->>'revenue')::numeric DESC)
  INTO v_top_clients
  FROM (
    SELECT jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'revenue',     round(COALESCE(SUM((q.calc_snapshot->>'total')::numeric),    0)::numeric, 0),
      'util_amount', round(COALESCE(SUM((q.calc_snapshot->>'utilAmt')::numeric),  0)::numeric, 0),
      'margin_pct',  CASE WHEN COALESCE(SUM((q.calc_snapshot->>'total')::numeric),0) > 0
        THEN round((SUM((q.calc_snapshot->>'utilAmt')::numeric) /
                    SUM((q.calc_snapshot->>'total')::numeric) * 100)::numeric, 2) ELSE 0 END,
      'quote_count', COUNT(q.id)::int
    ) AS r
    FROM public.clients c
    JOIN public.quotes  q ON q.client_id = c.id
    WHERE q.workspace_id = p_workspace_id AND q.status = 'Aprobada' AND q.deleted_at IS NULL
      AND q.created_at::date BETWEEN v_start AND v_end
    GROUP BY c.id, c.name
    ORDER BY SUM((q.calc_snapshot->>'total')::numeric) DESC
    LIMIT 5
  ) s1;

  -- ── Clientes de bajo margen ──────────────────────────────────────────────────
  SELECT jsonb_agg(r)
  INTO v_low_margin_cl
  FROM (
    SELECT jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'revenue',     round(COALESCE(SUM((q.calc_snapshot->>'total')::numeric),   0)::numeric, 0),
      'margin_pct',  CASE WHEN SUM((q.calc_snapshot->>'total')::numeric) > 0
        THEN round((SUM((q.calc_snapshot->>'utilAmt')::numeric) /
                    SUM((q.calc_snapshot->>'total')::numeric) * 100)::numeric, 2) ELSE 0 END
    ) AS r
    FROM public.clients c
    JOIN public.quotes q ON q.client_id = c.id
    WHERE q.workspace_id = p_workspace_id AND q.status = 'Aprobada' AND q.deleted_at IS NULL
      AND q.created_at::date BETWEEN v_start AND v_end
    GROUP BY c.id, c.name
    HAVING SUM((q.calc_snapshot->>'total')::numeric) > 0
      AND (SUM((q.calc_snapshot->>'utilAmt')::numeric) /
           NULLIF(SUM((q.calc_snapshot->>'total')::numeric),0) * 100) < 10
    ORDER BY (SUM((q.calc_snapshot->>'utilAmt')::numeric) /
              NULLIF(SUM((q.calc_snapshot->>'total')::numeric),0)) ASC
    LIMIT 5
  ) s2;

  -- ── Top 5 servicios por ingreso ──────────────────────────────────────────────
  SELECT jsonb_agg(r ORDER BY (r->>'total_revenue')::numeric DESC)
  INTO v_top_services
  FROM (
    SELECT jsonb_build_object(
      'service_name',   line->>'service_name',
      'quote_count',    COUNT(DISTINCT q.id)::int,
      'total_revenue',  round(SUM(
        CASE WHEN (q.calc_snapshot->>'subtotal')::numeric > 0
        THEN ((line->>'lineTotal')::numeric / (q.calc_snapshot->>'subtotal')::numeric)
             * (q.calc_snapshot->>'total')::numeric
        ELSE COALESCE((line->>'lineTotal')::numeric, 0) END
      )::numeric, 0),
      'total_direct_cost', round(SUM(COALESCE((line->>'lineTotal')::numeric, 0))::numeric, 0),
      'margin_pct', CASE WHEN SUM(
          CASE WHEN (q.calc_snapshot->>'subtotal')::numeric > 0
          THEN ((line->>'lineTotal')::numeric / (q.calc_snapshot->>'subtotal')::numeric)
               * (q.calc_snapshot->>'total')::numeric
          ELSE COALESCE((line->>'lineTotal')::numeric, 0) END) > 0
        THEN round((1 - SUM(COALESCE((line->>'lineTotal')::numeric, 0)) / SUM(
          CASE WHEN (q.calc_snapshot->>'subtotal')::numeric > 0
          THEN ((line->>'lineTotal')::numeric / (q.calc_snapshot->>'subtotal')::numeric)
               * (q.calc_snapshot->>'total')::numeric
          ELSE COALESCE((line->>'lineTotal')::numeric, 0) END)) * 100
        ::numeric, 2) ELSE 0 END
    ) AS r
    FROM public.quotes q,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(q.calc_snapshot->'lines') = 'array'
        THEN q.calc_snapshot->'lines' ELSE '[]'::jsonb END
      ) line
    WHERE q.workspace_id = p_workspace_id AND q.status = 'Aprobada' AND q.deleted_at IS NULL
      AND q.created_at::date BETWEEN v_start AND v_end
      AND (line->>'service_name') IS NOT NULL
      AND COALESCE((line->>'lineTotal')::numeric, 0) > 0
    GROUP BY line->>'service_name'
    ORDER BY SUM(
      CASE WHEN (q.calc_snapshot->>'subtotal')::numeric > 0
      THEN ((line->>'lineTotal')::numeric / (q.calc_snapshot->>'subtotal')::numeric)
           * (q.calc_snapshot->>'total')::numeric
      ELSE COALESCE((line->>'lineTotal')::numeric, 0) END) DESC
    LIMIT 5
  ) s3;

  -- ── Pedidos de bajo margen (< 5%) ────────────────────────────────────────────
  SELECT jsonb_agg(r ORDER BY (r->>'margin_pct')::numeric ASC)
  INTO v_low_orders
  FROM (
    SELECT jsonb_build_object(
      'order_id',      o.id,
      'order_number',  o.order_number,
      'title',         o.title,
      'client_name',   c.name,
      'revenue',       round(o.total_amount::numeric, 0),
      'margin_pct',    CASE WHEN o.total_amount > 0
        THEN round(COALESCE((q.calc_snapshot->>'utilAmt')::numeric, 0) / o.total_amount * 100
          ::numeric, 2) ELSE 0 END
    ) AS r
    FROM public.orders o
    LEFT JOIN public.clients c ON c.id = o.client_id
    LEFT JOIN public.quotes  q ON q.id = o.quote_id
    WHERE o.workspace_id = p_workspace_id AND o.deleted_at IS NULL
      AND o.created_at::date BETWEEN v_start AND v_end
      AND o.total_amount > 0
      AND COALESCE((q.calc_snapshot->>'utilAmt')::numeric, 0) / NULLIF(o.total_amount,0) * 100 < 5
    ORDER BY COALESCE((q.calc_snapshot->>'utilAmt')::numeric, 0) / NULLIF(o.total_amount,0) ASC
    LIMIT 5
  ) s4;

  -- ── Alegra: resumen de facturas (desde integration_events) ───────────────────
  SELECT jsonb_build_object(
    'connected',        EXISTS(
      SELECT 1 FROM public.integration_status
      WHERE workspace_id = p_workspace_id AND provider = 'alegra' AND status = 'connected'
    ),
    'invoices_total',   COUNT(*)::int,
    'invoices_pending', COUNT(CASE WHEN (payload->>'invoice_status') IN ('pending','sent','overdue') THEN 1 END)::int,
    'invoices_paid',    COUNT(CASE WHEN (payload->>'invoice_status') = 'paid' THEN 1 END)::int,
    'amount_pending',   round(COALESCE(SUM(
      CASE WHEN (payload->>'invoice_status') IN ('pending','sent','overdue')
      THEN COALESCE((payload->>'total')::numeric, 0) END
    ), 0)::numeric, 0),
    'amount_paid',      round(COALESCE(SUM(
      CASE WHEN (payload->>'invoice_status') = 'paid'
      THEN COALESCE((payload->>'total')::numeric, 0) END
    ), 0)::numeric, 0)
  )
  INTO v_alegra
  FROM public.integration_events
  WHERE workspace_id = p_workspace_id
    AND provider = 'alegra'
    AND event_type LIKE 'invoice_%'
    AND created_at::date BETWEEN v_start AND v_end;

  -- ── Tendencia mensual ────────────────────────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'month',        to_char(m.ms, 'YYYY-MM'),
      'label',        to_char(m.ms, 'Mon'),
      'revenue',      COALESCE(q_m.revenue, 0),
      'direct_cost',  COALESCE(q_m.direct_cost, 0),
      'util_amount',  COALESCE(q_m.util_amount, 0),
      'margin_pct',   CASE WHEN COALESCE(q_m.revenue,0) > 0
        THEN round((COALESCE(q_m.util_amount,0) / q_m.revenue * 100)::numeric, 1) ELSE 0 END
    ) ORDER BY m.ms
  )
  INTO v_monthly
  FROM generate_series(
    date_trunc('month', v_start::timestamp),
    date_trunc('month', v_end::timestamp),
    '1 month'
  ) m(ms)
  LEFT JOIN (
    SELECT
      date_trunc('month', created_at) AS ms,
      SUM((calc_snapshot->>'total')::numeric)    AS revenue,
      SUM((calc_snapshot->>'subtotal')::numeric) AS direct_cost,
      SUM((calc_snapshot->>'utilAmt')::numeric)  AS util_amount
    FROM public.quotes
    WHERE workspace_id = p_workspace_id AND status = 'Aprobada' AND deleted_at IS NULL
      AND created_at::date BETWEEN v_start AND v_end
    GROUP BY 1
  ) q_m USING (ms);

  -- ── Salud financiera ─────────────────────────────────────────────────────────
  v_health := CASE
    WHEN v_quotes_cnt = 0 THEN 'no_data'
    WHEN v_util / NULLIF(v_revenue,0) < 0.05 THEN 'critical'
    WHEN v_util / NULLIF(v_revenue,0) < 0.12 THEN 'warning'
    ELSE 'good'
  END;

  RETURN jsonb_build_object(
    'ok',           true,
    'period_start', v_start,
    'period_end',   v_end,
    -- KPIs ejecutivos
    'summary', jsonb_build_object(
      'total_revenue',         round(v_revenue::numeric,   0),
      'total_direct_cost',     round(v_dir_cost::numeric,  0),
      'estimated_profit',      round(v_util::numeric,      0),
      'estimated_margin_pct',  CASE WHEN v_revenue > 0
        THEN round((v_util / v_revenue * 100)::numeric, 2) ELSE 0 END,
      'gross_margin_pct',      CASE WHEN v_revenue > 0
        THEN round(((v_revenue - v_dir_cost) / v_revenue * 100)::numeric, 2) ELSE 0 END,
      'has_real_costs',        v_has_real,
      'real_cost_total',       round(v_real_cost::numeric, 0),
      'real_profit',           CASE WHEN v_has_real
        THEN round((v_revenue - v_real_cost)::numeric, 0) ELSE NULL END,
      'real_margin_pct',       CASE WHEN v_has_real AND v_revenue > 0
        THEN round(((v_revenue - v_real_cost) / v_revenue * 100)::numeric, 2) ELSE NULL END,
      'quotes_approved',       v_quotes_cnt,
      'orders_finalized',      v_orders_cnt,
      -- Comparativa período anterior
      'revenue_prev',          round(v_prev_revenue::numeric, 0),
      'revenue_change_pct',    CASE WHEN v_prev_revenue > 0
        THEN round(((v_revenue - v_prev_revenue) / v_prev_revenue * 100)::numeric, 1) ELSE NULL END,
      'profit_prev',           round(v_prev_util::numeric, 0),
      'profit_change_pct',     CASE WHEN v_prev_util > 0
        THEN round(((v_util - v_prev_util) / v_prev_util * 100)::numeric, 1) ELSE NULL END
    ),
    'monthly_trend',     COALESCE(v_monthly,       '[]'::jsonb),
    'top_clients',       COALESCE(v_top_clients,   '[]'::jsonb),
    'low_margin_clients',COALESCE(v_low_margin_cl, '[]'::jsonb),
    'top_services',      COALESCE(v_top_services,  '[]'::jsonb),
    'low_margin_orders', COALESCE(v_low_orders,    '[]'::jsonb),
    'alegra',            COALESCE(v_alegra, jsonb_build_object('connected', false, 'invoices_total', 0)),
    'financial_health',  v_health
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_dashboard(uuid, date, date) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: get_admin_finance_summary — finanzas de Shelwi (super_admin)
-- Reutiliza: get_admin_stats (Sprint 9/Admin), workspace_storage_addons (Sprint 14),
--            ai_usage_logs (Sprint 2/Admin).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_admin_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_is_super   boolean;
  v_plan_prices jsonb := '{"free":0,"pro":149000,"premium":349000}'::jsonb;
  -- SaaS metrics
  v_mrr        numeric := 0;
  v_arr        numeric := 0;
  v_active_subs int   := 0;
  v_free_cnt   int    := 0;
  v_pro_cnt    int    := 0;
  v_prem_cnt   int    := 0;
  -- Addons
  v_storage_revenue numeric := 0;
  v_ai_cost_usd     numeric := 0;
  -- Growth
  v_new_30d    int := 0;
  v_churned_30d int := 0;
  -- Monthly trend (6 months)
  v_monthly    jsonb;
BEGIN
  -- Verificar super_admin
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND role IN ('super_admin','support_admin')
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo super_admin puede acceder');
  END IF;

  -- Suscripciones activas por plan
  SELECT
    COUNT(*) FILTER (WHERE LOWER(w.plan_code) = 'free'),
    COUNT(*) FILTER (WHERE LOWER(w.plan_code) = 'pro'),
    COUNT(*) FILTER (WHERE LOWER(w.plan_code) = 'premium'),
    COUNT(*) FILTER (WHERE w.status = 'active')
  INTO v_free_cnt, v_pro_cnt, v_prem_cnt, v_active_subs
  FROM public.workspaces w
  WHERE w.status IN ('active','trialing');

  v_mrr := v_pro_cnt  * COALESCE((v_plan_prices->>'pro')::numeric,  0)
          + v_prem_cnt * COALESCE((v_plan_prices->>'premium')::numeric, 0);
  v_arr := v_mrr * 12;

  -- Storage addons revenue
  SELECT COALESCE(SUM(wsa.gb * wsa.unit_price), 0)
  INTO v_storage_revenue
  FROM public.workspace_storage_addons wsa
  WHERE wsa.active = true;

  -- IA usage cost (en USD)
  SELECT COALESCE(SUM(estimated_cost), 0)
  INTO v_ai_cost_usd
  FROM public.ai_usage_logs
  WHERE created_at >= now() - interval '30 days';

  -- Nuevos workspaces (30d)
  SELECT COUNT(*)::int INTO v_new_30d
  FROM public.workspaces WHERE created_at >= now() - interval '30 days';

  -- Churned (status inactive en 30d — aproximado)
  SELECT COUNT(*)::int INTO v_churned_30d
  FROM public.workspaces
  WHERE status = 'inactive' AND updated_at >= now() - interval '30 days';

  -- Tendencia mensual MRR (6 meses) — aproximación por suscripciones activas cada mes
  -- Nota: sin tabla de payment_history, aproximamos con snapshot actual
  SELECT jsonb_agg(jsonb_build_object(
    'month',       to_char(m.ms, 'YYYY-MM'),
    'label',       to_char(m.ms, 'Mon YYYY'),
    'mrr',         v_mrr,  -- mismo MRR actual como aproximación
    'workspaces',  v_active_subs
  ) ORDER BY m.ms)
  INTO v_monthly
  FROM generate_series(
    date_trunc('month', now() - interval '5 months'),
    date_trunc('month', now()),
    '1 month'
  ) m(ms);

  RETURN jsonb_build_object(
    'ok', true,
    'saas', jsonb_build_object(
      'mrr',                round(v_mrr::numeric, 0),
      'arr',                round(v_arr::numeric, 0),
      'active_workspaces',  v_active_subs,
      'by_plan', jsonb_build_object(
        'free',    v_free_cnt,
        'pro',     v_pro_cnt,
        'premium', v_prem_cnt
      )
    ),
    'addons', jsonb_build_object(
      'storage_monthly_revenue', round(v_storage_revenue::numeric, 0),
      'ai_cost_usd_30d',         round(v_ai_cost_usd::numeric, 4),
      'total_addon_revenue',     round(v_storage_revenue::numeric, 0)
    ),
    'growth', jsonb_build_object(
      'new_workspaces_30d',     v_new_30d,
      'churned_workspaces_30d', v_churned_30d,
      'net_growth_30d',         v_new_30d - v_churned_30d
    ),
    'monthly_trend',  COALESCE(v_monthly, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_finance_summary() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Templates de alertas financieras (usa motor automation_rules Sprint 13)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Asegurarse que 'finance' es categoría válida
ALTER TABLE public.automation_templates
  DROP CONSTRAINT IF EXISTS automation_templates_category_check;

ALTER TABLE public.automation_templates
  ADD CONSTRAINT automation_templates_category_check
  CHECK (category IN ('crm','operations','retention','billing','growth','finance'));

-- Insertar 3 templates financieros
INSERT INTO public.automation_templates
  (key, name, description, category, trigger_event, trigger_type, delay_hours,
   conditions, action_type, action_payload, plan_required, sort_order)
VALUES

('finance_low_margin',
  'Alerta — Margen bajo',
  'Notifica cuando una cotización aprobada tiene margen estimado menor al 10%.',
  'finance', 'quote_approved', 'event', 0,
  '[{"field":"margin_pct","operator":"lt","value":10}]'::jsonb,
  'notify_user',
  '{"title":"⚠️ Margen bajo","message_template":"La cotización {{quote_number}} tiene margen del {{margin_pct}}%, por debajo del mínimo recomendado (10%).","notify_roles":["owner","admin"]}'::jsonb,
  'pro', 20),

('finance_negative_profit',
  'Alerta — Rentabilidad negativa',
  'Notifica cuando se registran costos reales que generan pérdida en un pedido.',
  'finance', 'order_cost_registered', 'event', 0,
  '[{"field":"real_margin_pct","operator":"lt","value":0}]'::jsonb,
  'notify_user',
  '{"title":"🔴 Pérdida en pedido","message_template":"El pedido {{order_number}} tiene pérdida real: margen {{real_margin_pct}}%. Revisa los costos registrados.","notify_roles":["owner"]}'::jsonb,
  'pro', 21),

('finance_revenue_drop',
  'Alerta — Caída de ingresos',
  'Detecta caída de más del 20% en ingresos vs período anterior.',
  'finance', 'periodic_check', 'periodic', 0,
  '[{"field":"revenue_change_pct","operator":"lt","value":-20}]'::jsonb,
  'notify_user',
  '{"title":"📉 Caída de ingresos","message_template":"Los ingresos del período cayeron {{revenue_change_pct}}% vs el período anterior. Revisa el pipeline comercial.","notify_roles":["owner","admin"]}'::jsonb,
  'premium', 22)

ON CONFLICT (key) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  action_payload = excluded.action_payload,
  category = excluded.category;

COMMENT ON FUNCTION public.get_finance_dashboard(uuid, date, date)
  IS 'Sprint 18: dashboard financiero consolidado. Reutiliza calc_snapshot, Alegra, customer_health.';
COMMENT ON FUNCTION public.get_admin_finance_summary()
  IS 'Sprint 18: finanzas SaaS de Shelwi. Solo super_admin. MRR, ARR, growth, addons.';
