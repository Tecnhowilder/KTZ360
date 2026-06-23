-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0090: Sprint 19 BI — Cohortes + Embudo completo
-- ════════════════════════════════════════════════════════════════════════════

-- ─── RPC: get_client_cohorts — análisis de retención por mes de adquisición ──
-- Responde: ¿qué % de clientes adquiridos en cada mes siguen activos?
-- Un cliente es "activo" si tiene al menos una cotización o pedido en ese mes.
-- Retorna hasta 6 meses de retención por cohorte mensual.
-- Period: los últimos p_months meses de cohortes.

CREATE OR REPLACE FUNCTION public.get_client_cohorts(
  p_workspace_id uuid,
  p_months       int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
  v_avg     jsonb;
  v_months  int := LEAST(GREATEST(p_months, 3), 12); -- entre 3 y 12 meses
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  IF NOT public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Análisis de cohortes requiere plan PRO o PREMIUM');
  END IF;

  -- Cohortes: clientes agrupados por mes de creación
  -- Retención M+N: tuvo actividad (quote o order) en el mes cohorte + N meses
  WITH cohort_base AS (
    SELECT
      id AS client_id,
      date_trunc('month', created_at)::date AS cohort_month
    FROM public.clients
    WHERE workspace_id = p_workspace_id
      AND deleted_at IS NULL
      AND created_at >= (now() - (v_months || ' months')::interval)
  ),
  activity AS (
    SELECT DISTINCT client_id, date_trunc('month', created_at)::date AS month
    FROM public.quotes
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL AND client_id IS NOT NULL
    UNION
    SELECT DISTINCT client_id, date_trunc('month', created_at)::date AS month
    FROM public.orders
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL AND client_id IS NOT NULL
  ),
  retention AS (
    SELECT
      cb.cohort_month,
      COUNT(DISTINCT cb.client_id)::int AS cohort_size,
      -- M+0 a M+5 (6 periodos de retención)
      COUNT(DISTINCT CASE WHEN a.month = cb.cohort_month THEN cb.client_id END)::int AS m0,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '1 month'::interval)::date THEN cb.client_id END)::int AS m1,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '2 months'::interval)::date THEN cb.client_id END)::int AS m2,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '3 months'::interval)::date THEN cb.client_id END)::int AS m3,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '4 months'::interval)::date THEN cb.client_id END)::int AS m4,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '5 months'::interval)::date THEN cb.client_id END)::int AS m5
    FROM cohort_base cb
    LEFT JOIN activity a ON a.client_id = cb.client_id
    GROUP BY cb.cohort_month
    HAVING COUNT(DISTINCT cb.client_id) > 0
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'cohort',       to_char(r.cohort_month, 'YYYY-MM'),
      'label',        to_char(r.cohort_month, 'Mon YYYY'),
      'size',         r.cohort_size,
      -- Retención % por mes (solo los meses que ya pasaron)
      'retention_pct', jsonb_build_array(
        100,  -- M0 siempre 100%
        CASE WHEN r.cohort_size > 0 THEN round(r.m1::numeric/r.cohort_size*100) ELSE NULL END,
        CASE WHEN r.cohort_size > 0 THEN round(r.m2::numeric/r.cohort_size*100) ELSE NULL END,
        CASE WHEN r.cohort_size > 0 THEN round(r.m3::numeric/r.cohort_size*100) ELSE NULL END,
        CASE WHEN r.cohort_size > 0 THEN round(r.m4::numeric/r.cohort_size*100) ELSE NULL END,
        CASE WHEN r.cohort_size > 0 THEN round(r.m5::numeric/r.cohort_size*100) ELSE NULL END
      ),
      -- Valores absolutos
      'retention_abs', jsonb_build_array(r.m0, r.m1, r.m2, r.m3, r.m4, r.m5)
    ) ORDER BY r.cohort_month ASC
  )
  INTO v_result
  FROM retention r;

  -- Promedio de retención por mes (media de todas las cohortes)
  WITH cohort_base AS (
    SELECT id AS client_id, date_trunc('month', created_at)::date AS cohort_month
    FROM public.clients
    WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
      AND created_at >= (now() - (v_months || ' months')::interval)
  ),
  activity AS (
    SELECT DISTINCT client_id, date_trunc('month', created_at)::date AS month
    FROM public.quotes WHERE workspace_id = p_workspace_id AND deleted_at IS NULL AND client_id IS NOT NULL
    UNION
    SELECT DISTINCT client_id, date_trunc('month', created_at)::date AS month
    FROM public.orders WHERE workspace_id = p_workspace_id AND deleted_at IS NULL AND client_id IS NOT NULL
  ),
  retention AS (
    SELECT
      cb.cohort_month,
      COUNT(DISTINCT cb.client_id) AS sz,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '1 month'::interval)::date THEN cb.client_id END)::numeric AS m1,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '2 months'::interval)::date THEN cb.client_id END)::numeric AS m2,
      COUNT(DISTINCT CASE WHEN a.month = (cb.cohort_month + '3 months'::interval)::date THEN cb.client_id END)::numeric AS m3
    FROM cohort_base cb LEFT JOIN activity a ON a.client_id = cb.client_id
    GROUP BY cb.cohort_month
    HAVING COUNT(DISTINCT cb.client_id) > 0
  )
  SELECT jsonb_build_array(
    100,
    round(AVG(CASE WHEN sz > 0 THEN m1/sz*100 ELSE 0 END), 1),
    round(AVG(CASE WHEN sz > 0 THEN m2/sz*100 ELSE 0 END), 1),
    round(AVG(CASE WHEN sz > 0 THEN m3/sz*100 ELSE 0 END), 1)
  )
  INTO v_avg
  FROM retention;

  RETURN jsonb_build_object(
    'ok',             true,
    'months_analyzed', v_months,
    'cohorts',        COALESCE(v_result, '[]'::jsonb),
    'avg_retention',  COALESCE(v_avg, '[]'::jsonb),
    'labels',         jsonb_build_array('M+0 (Adq.)','M+1','M+2','M+3','M+4','M+5')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_cohorts(uuid, int) TO authenticated;

-- ─── RPC: get_full_funnel — embudo completo Lead → OT → Factura ──────────────
-- Extiende get_funnel_report (Solo cotizaciones) para incluir:
-- Clientes → Cotizaciones → Pedidos → OTs → Facturas Alegra
-- Responde: ¿cuánto se pierde en cada etapa del ciclo de vida?

CREATE OR REPLACE FUNCTION public.get_full_funnel(
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
  -- Conteos por etapa
  v_clients      int; v_clients_val   numeric := 0;
  v_quotes       int; v_quotes_val    numeric := 0;
  v_sent         int; v_sent_val      numeric := 0;
  v_approved     int; v_approved_val  numeric := 0;
  v_orders       int; v_orders_val    numeric := 0;
  v_wos          int;
  v_invoices     int; v_invoices_val  numeric := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end   := COALESCE(p_period_end, CURRENT_DATE);

  -- Etapa 1: Clientes creados en período
  SELECT COUNT(*)::int INTO v_clients
  FROM public.clients
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
    AND created_at::date BETWEEN v_start AND v_end;

  -- Etapa 2: Cotizaciones creadas
  SELECT COUNT(*)::int, COALESCE(SUM((calc_snapshot->>'total')::numeric), 0)
  INTO v_quotes, v_quotes_val
  FROM public.quotes
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
    AND created_at::date BETWEEN v_start AND v_end;

  -- Etapa 3: Cotizaciones enviadas
  SELECT COUNT(*)::int, COALESCE(SUM((calc_snapshot->>'total')::numeric), 0)
  INTO v_sent, v_sent_val
  FROM public.quotes
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
    AND commercial_status != 'borrador'
    AND created_at::date BETWEEN v_start AND v_end;

  -- Etapa 4: Cotizaciones aprobadas
  SELECT COUNT(*)::int, COALESCE(SUM((calc_snapshot->>'total')::numeric), 0)
  INTO v_approved, v_approved_val
  FROM public.quotes
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
    AND status = 'Aprobada'
    AND created_at::date BETWEEN v_start AND v_end;

  -- Etapa 5: Pedidos creados en período
  SELECT COUNT(*)::int, COALESCE(SUM(total_amount), 0)
  INTO v_orders, v_orders_val
  FROM public.orders
  WHERE workspace_id = p_workspace_id AND deleted_at IS NULL
    AND created_at::date BETWEEN v_start AND v_end;

  -- Etapa 6: OTs creadas en período
  SELECT COUNT(*)::int INTO v_wos
  FROM public.work_orders wo
  JOIN public.orders o ON o.id = wo.order_id AND o.deleted_at IS NULL
  WHERE wo.workspace_id = p_workspace_id
    AND wo.created_at::date BETWEEN v_start AND v_end;

  -- Etapa 7: Facturas Alegra emitidas en período
  SELECT COUNT(*)::int, COALESCE(SUM(total), 0)
  INTO v_invoices, v_invoices_val
  FROM public.integration_invoices
  WHERE workspace_id = p_workspace_id
    AND invoice_status NOT IN ('void','cancelled')
    AND created_at::date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'ok',           true,
    'period_start', v_start,
    'period_end',   v_end,
    'stages', jsonb_build_array(
      jsonb_build_object('step', 1, 'label', 'Clientes nuevos',        'count', v_clients,  'value', 0,              'icon', '👥'),
      jsonb_build_object('step', 2, 'label', 'Cotizaciones creadas',   'count', v_quotes,   'value', v_quotes_val,   'icon', '📝'),
      jsonb_build_object('step', 3, 'label', 'Cotizaciones enviadas',  'count', v_sent,     'value', v_sent_val,     'icon', '✉️'),
      jsonb_build_object('step', 4, 'label', 'Cotizaciones aprobadas', 'count', v_approved, 'value', v_approved_val, 'icon', '✅'),
      jsonb_build_object('step', 5, 'label', 'Pedidos creados',        'count', v_orders,   'value', v_orders_val,   'icon', '📦'),
      jsonb_build_object('step', 6, 'label', 'OTs ejecutadas',         'count', v_wos,      'value', 0,              'icon', '🔧'),
      jsonb_build_object('step', 7, 'label', 'Facturas emitidas',      'count', v_invoices, 'value', v_invoices_val, 'icon', '🧾')
    ),
    -- Tasas de conversión entre etapas
    'conversion', jsonb_build_object(
      'client_to_quote',    CASE WHEN v_clients > 0  THEN round(v_quotes::numeric/v_clients*100,1)   ELSE NULL END,
      'quote_to_sent',      CASE WHEN v_quotes > 0   THEN round(v_sent::numeric/v_quotes*100,1)      ELSE NULL END,
      'sent_to_approved',   CASE WHEN v_sent > 0     THEN round(v_approved::numeric/v_sent*100,1)    ELSE NULL END,
      'approved_to_order',  CASE WHEN v_approved > 0 THEN round(v_orders::numeric/v_approved*100,1)  ELSE NULL END,
      'order_to_invoice',   CASE WHEN v_orders > 0   THEN round(v_invoices::numeric/v_orders*100,1)  ELSE NULL END,
      'overall_close_rate', CASE WHEN v_quotes > 0   THEN round(v_approved::numeric/v_quotes*100,1)  ELSE NULL END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_full_funnel(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_client_cohorts(uuid, int)         IS 'Sprint 19: análisis de cohortes de retención. PRO+. Agrupa clientes por mes de adquisición.';
COMMENT ON FUNCTION public.get_full_funnel(uuid, date, date)     IS 'Sprint 19: embudo completo Lead→OT→Factura. Extiende get_funnel_report con pedidos, OTs y facturas.';
