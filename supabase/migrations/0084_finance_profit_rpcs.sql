-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0084: Finance RPCs Sprint 18 — Rentabilidad por Pedido / Cliente / Servicio / Workspace
-- ════════════════════════════════════════════════════════════════════════════
-- Todos los cálculos ocurren en backend. Frontend solo consume resultados.
-- Zero Trust: workspace_id SIEMPRE del JWT via public.profiles.
-- Todos los RPCs aceptan period_start / period_end (prep Sprint 19 BI).
--
-- Estructura financiera de Shelwi (de calc_snapshot):
--   materials + labor + equipment = subtotal (costo directo estimado)
--   subtotal × admin_pct         = adminAmt  (A de AIU)
--   subtotal × imprevistos_pct   = imprevistosAmt (I de AIU)
--   subtotal × util               = utilAmt   (U = utilidad estimada)
--   subtotal + AIU - discount + IVA + transport = total (precio al cliente)
--
-- Margen bruto estimado = utilAmt / total × 100
-- Margen bruto real     = (total - real_cost) / total × 100 (si hay order_cost_entries)
-- ════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: get_order_profit — rentabilidad de UN pedido
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_order_profit(
  p_workspace_id uuid,
  p_order_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_order           record;
  v_snapshot        jsonb;
  v_revenue         numeric;
  v_mat             numeric; v_lab numeric; v_equip numeric; v_subtotal numeric;
  v_admin_amt       numeric; v_imprevistos_amt numeric; v_util_amt numeric;
  v_aiu_total       numeric; v_transport_amt numeric; v_iva_amt numeric;
  v_est_direct_cost numeric;
  v_real_cost       numeric := 0;
  v_has_real        boolean := false;
  v_cost_by_type    jsonb;
  v_gps_hours       numeric := 0;
  v_labor_gps_cost  numeric := 0;
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  -- Obtener el pedido con sus datos
  SELECT o.*, c.name AS client_name, q.calc_snapshot
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.clients c ON c.id = o.client_id
  LEFT JOIN public.quotes  q ON q.id = o.quote_id
  WHERE o.id = p_order_id AND o.workspace_id = p_workspace_id AND o.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Ingresos = total del pedido (copiado de la cotización aprobada)
  v_revenue := COALESCE(v_order.total_amount, 0);

  -- Extraer desglose del calc_snapshot (cotización congelada)
  v_snapshot         := v_order.calc_snapshot;
  v_mat              := COALESCE((v_snapshot->>'materials')::numeric, 0);
  v_lab              := COALESCE((v_snapshot->>'labor')::numeric, 0);
  v_equip            := COALESCE((v_snapshot->>'equipment')::numeric, 0);
  v_subtotal         := COALESCE((v_snapshot->>'subtotal')::numeric, v_mat + v_lab + v_equip);
  v_admin_amt        := COALESCE((v_snapshot->>'adminAmt')::numeric, 0);
  v_imprevistos_amt  := COALESCE((v_snapshot->>'imprevistosAmt')::numeric, 0);
  v_util_amt         := COALESCE((v_snapshot->>'utilAmt')::numeric, 0);
  v_iva_amt          := COALESCE((v_snapshot->>'ivaAmt')::numeric, 0);
  v_transport_amt    := COALESCE((v_snapshot->>'transportAmt')::numeric, 0);
  v_aiu_total        := v_admin_amt + v_imprevistos_amt + v_util_amt;
  v_est_direct_cost  := v_subtotal; -- materiales+labor+equipo (costo directo estimado)

  -- Costos reales (de order_cost_entries)
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*) > 0
  INTO v_real_cost, v_has_real
  FROM public.order_cost_entries
  WHERE order_id = p_order_id AND workspace_id = p_workspace_id;

  -- Costos reales por tipo
  SELECT COALESCE(jsonb_object_agg(type, total), '{}'::jsonb)
  INTO v_cost_by_type
  FROM (
    SELECT type, SUM(amount) AS total
    FROM public.order_cost_entries
    WHERE order_id = p_order_id AND workspace_id = p_workspace_id
    GROUP BY type
  ) t;

  -- Horas trabajadas desde GPS (check_in / check_out vinculados a OTs del pedido)
  SELECT COALESCE(
    SUM(
      EXTRACT(EPOCH FROM (co_evt.created_at - ci_evt.created_at)) / 3600.0
    ), 0
  )
  INTO v_gps_hours
  FROM (
    SELECT DISTINCT ON (g.user_id, g.work_order_id)
      g.user_id, g.work_order_id, g.created_at, g.id
    FROM public.gps_events g
    JOIN public.work_orders wo ON wo.id = g.work_order_id
    WHERE wo.order_id = p_order_id AND g.source = 'check_in'
    ORDER BY g.user_id, g.work_order_id, g.created_at
  ) ci_evt
  JOIN LATERAL (
    SELECT g2.created_at
    FROM public.gps_events g2
    WHERE g2.user_id = ci_evt.user_id
      AND g2.work_order_id = ci_evt.work_order_id
      AND g2.source = 'check_out'
      AND g2.created_at > ci_evt.created_at
    ORDER BY g2.created_at
    LIMIT 1
  ) co_evt ON true;

  RETURN jsonb_build_object(
    'ok',             true,
    'order_id',       v_order.id,
    'order_number',   v_order.order_number,
    'title',          v_order.title,
    'client_name',    v_order.client_name,
    'status',         v_order.status,
    'started_at',     v_order.started_at,
    'finished_at',    v_order.finished_at,
    -- Ingresos
    'revenue',        v_revenue,
    -- Costos estimados (de calc_snapshot)
    'estimated_materials',   v_mat,
    'estimated_labor',       v_lab,
    'estimated_equipment',   v_equip,
    'estimated_direct_cost', v_est_direct_cost,
    'estimated_aiu',         v_aiu_total,
    'estimated_admin',       v_admin_amt,
    'estimated_contingency', v_imprevistos_amt,
    'estimated_profit_raw',  v_util_amt,
    'iva_amount',            v_iva_amt,
    'transport_amount',      v_transport_amt,
    -- Margen estimado
    'estimated_margin_pct',  CASE WHEN v_revenue > 0
      THEN round((v_util_amt / v_revenue * 100)::numeric, 2) ELSE 0 END,
    'estimated_gross_margin_pct', CASE WHEN v_revenue > 0
      THEN round(((v_revenue - v_est_direct_cost) / v_revenue * 100)::numeric, 2) ELSE 0 END,
    -- Costos reales (de order_cost_entries)
    'has_real_costs',     v_has_real,
    'real_cost_total',    v_real_cost,
    'real_cost_by_type',  v_cost_by_type,
    'real_profit',        CASE WHEN v_has_real THEN v_revenue - v_real_cost ELSE NULL END,
    'real_margin_pct',    CASE WHEN v_has_real AND v_revenue > 0
      THEN round(((v_revenue - v_real_cost) / v_revenue * 100)::numeric, 2) ELSE NULL END,
    -- GPS horas
    'gps_hours_worked',   round(v_gps_hours::numeric, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_profit(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: get_client_profit — rentabilidad de un cliente en un período
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_client_profit(
  p_workspace_id uuid,
  p_client_id    uuid,
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
  v_client   record;
  v_result   record;
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, (date_trunc('year', now()) - interval '1 year')::date);
  v_end   := COALESCE(p_period_end,   CURRENT_DATE);

  -- Datos del cliente
  SELECT id, name, email, phone, total_value, total_approved, total_quotes
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id AND workspace_id = p_workspace_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  -- Agregar pedidos del cliente en el período
  WITH order_data AS (
    SELECT
      o.id, o.total_amount, o.status, o.created_at, o.finished_at,
      -- Extraer estimados del snapshot de la cotización vinculada
      COALESCE((q.calc_snapshot->>'materials')::numeric,   0) AS est_mat,
      COALESCE((q.calc_snapshot->>'labor')::numeric,       0) AS est_lab,
      COALESCE((q.calc_snapshot->>'equipment')::numeric,   0) AS est_equip,
      COALESCE((q.calc_snapshot->>'subtotal')::numeric,    0) AS est_subtotal,
      COALESCE((q.calc_snapshot->>'utilAmt')::numeric,     0) AS est_util,
      -- Costos reales
      COALESCE(ce.real_cost, 0) AS real_cost,
      ce.real_cost IS NOT NULL   AS has_real
    FROM public.orders o
    LEFT JOIN public.quotes q ON q.id = o.quote_id
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS real_cost
      FROM public.order_cost_entries
      WHERE order_id = o.id AND workspace_id = o.workspace_id
    ) ce ON true
    WHERE o.workspace_id = p_workspace_id
      AND o.client_id = p_client_id
      AND o.deleted_at IS NULL
      AND o.created_at::date BETWEEN v_start AND v_end
  )
  SELECT
    COUNT(*)::int                                          AS order_count,
    COALESCE(SUM(total_amount), 0)                        AS total_revenue,
    COALESCE(SUM(est_subtotal), 0)                        AS total_estimated_direct_cost,
    COALESCE(SUM(est_util), 0)                            AS total_estimated_profit,
    COALESCE(SUM(CASE WHEN has_real THEN real_cost END), 0) AS total_real_cost,
    BOOL_OR(has_real)                                      AS has_real_costs,
    COUNT(CASE WHEN status = 'finalizado' THEN 1 END)::int AS finalized,
    COUNT(CASE WHEN status IN ('pendiente','programado','en_ejecucion','pausado') THEN 1 END)::int AS active
  INTO v_result
  FROM order_data;

  RETURN jsonb_build_object(
    'ok',             true,
    'client_id',      v_client.id,
    'client_name',    v_client.name,
    'period_start',   v_start,
    'period_end',     v_end,
    -- Ingresos
    'total_revenue',  v_result.total_revenue,
    'total_orders',   v_result.order_count,
    'finalized_orders', v_result.finalized,
    'active_orders',  v_result.active,
    -- Margen estimado
    'total_estimated_profit', v_result.total_estimated_profit,
    'estimated_margin_pct', CASE WHEN v_result.total_revenue > 0
      THEN round((v_result.total_estimated_profit / v_result.total_revenue * 100)::numeric, 2) ELSE 0 END,
    -- Margen real
    'has_real_costs',   v_result.has_real_costs,
    'total_real_cost',  v_result.total_real_cost,
    'real_profit',      CASE WHEN v_result.has_real_costs
      THEN v_result.total_revenue - v_result.total_real_cost ELSE NULL END,
    'real_margin_pct',  CASE WHEN v_result.has_real_costs AND v_result.total_revenue > 0
      THEN round(((v_result.total_revenue - v_result.total_real_cost) / v_result.total_revenue * 100)::numeric, 2) ELSE NULL END,
    -- Lifetime
    'lifetime_value',   v_client.total_value,
    'lifetime_quotes',  v_client.total_quotes,
    'lifetime_approved', v_client.total_approved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_profit(uuid, uuid, date, date) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 3: get_service_profit — rentabilidad por tipo de servicio
-- Extrae service_lines del calc_snapshot de cotizaciones aprobadas.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_service_profit(
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
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '5 months')::date);
  v_end   := COALESCE(p_period_end,   CURRENT_DATE);

  -- Extraer line-level data de calc_snapshot de cotizaciones aprobadas
  WITH raw AS (
    SELECT
      q.id AS quote_id,
      COALESCE((q.calc_snapshot->>'total')::numeric,    0) AS quote_total,
      COALESCE((q.calc_snapshot->>'subtotal')::numeric, 0) AS quote_subtotal,
      line->>'service_name'                                 AS service_name,
      COALESCE((line->>'lineTotal')::numeric, 0)            AS line_total,
      COALESCE((
        SELECT SUM((m->>'subtotal')::numeric)
        FROM jsonb_array_elements(COALESCE(line->'materials', '[]'::jsonb)) m
      ), 0) AS mat_cost,
      COALESCE((
        SELECT SUM((l->>'subtotal')::numeric)
        FROM jsonb_array_elements(COALESCE(line->'labor', '[]'::jsonb)) l
      ), 0) AS lab_cost
    FROM public.quotes q,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(q.calc_snapshot->'lines') = 'array'
        THEN q.calc_snapshot->'lines' ELSE '[]'::jsonb END
      ) line
    WHERE q.workspace_id = p_workspace_id
      AND q.status = 'Aprobada'
      AND q.deleted_at IS NULL
      AND q.created_at::date BETWEEN v_start AND v_end
      AND (line->>'service_name') IS NOT NULL
      AND COALESCE((line->>'lineTotal')::numeric, 0) > 0
  ),
  grouped AS (
    SELECT
      service_name,
      COUNT(DISTINCT quote_id)::int                     AS quote_count,
      SUM(line_total)                                   AS total_direct_cost,
      SUM(mat_cost)                                     AS total_materials,
      SUM(lab_cost)                                     AS total_labor,
      -- Asignar revenue proporcionalmente al peso de la línea en la cotización
      SUM(
        CASE WHEN quote_subtotal > 0
        THEN (line_total / quote_subtotal) * quote_total
        ELSE line_total END
      )                                                 AS total_revenue_allocated,
      -- Margen promedio
      AVG(
        CASE WHEN quote_subtotal > 0 AND quote_total > 0
        THEN ((quote_total - quote_subtotal) / quote_total * 100)
        ELSE 0 END
      )                                                 AS avg_quote_margin_pct
    FROM raw
    GROUP BY service_name
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'service_name',           g.service_name,
      'quote_count',            g.quote_count,
      'total_revenue',          round(g.total_revenue_allocated::numeric, 0),
      'total_direct_cost',      round(g.total_direct_cost::numeric, 0),
      'total_materials',        round(g.total_materials::numeric, 0),
      'total_labor',            round(g.total_labor::numeric, 0),
      'gross_profit',           round((g.total_revenue_allocated - g.total_direct_cost)::numeric, 0),
      'margin_pct',             round(
        CASE WHEN g.total_revenue_allocated > 0
        THEN (g.total_revenue_allocated - g.total_direct_cost) / g.total_revenue_allocated * 100
        ELSE 0 END
        ::numeric, 2)
    ) ORDER BY g.total_revenue_allocated DESC
  )
  INTO v_rows
  FROM grouped g;

  RETURN jsonb_build_object(
    'ok',          true,
    'period_start', v_start,
    'period_end',   v_end,
    'services',     COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_service_profit(uuid, date, date) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 4: get_workspace_profitability — rentabilidad global del workspace
-- Incluye tendencia mensual. Base para Dashboard Finanzas y BI (Sprint 19).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_workspace_profitability(
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
  v_user_id         uuid := auth.uid();
  v_start           date;
  v_end             date;
  -- Totales
  v_total_revenue   numeric := 0;
  v_total_mat       numeric := 0;
  v_total_lab       numeric := 0;
  v_total_equip     numeric := 0;
  v_total_subtotal  numeric := 0;
  v_total_admin     numeric := 0;
  v_total_imprv     numeric := 0;
  v_total_util      numeric := 0;
  v_total_iva       numeric := 0;
  v_total_transport numeric := 0;
  v_quotes_count    int    := 0;
  v_orders_count    int    := 0;
  v_real_cost_total numeric := 0;
  v_has_real        boolean := false;
  v_monthly         jsonb;
  v_top_clients     jsonb;
  v_top_services    jsonb;
  v_bottom_clients  jsonb;
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now() - interval '5 months')::date);
  v_end   := COALESCE(p_period_end,   CURRENT_DATE);

  -- ── Totales de cotizaciones aprobadas en el período ─────────────────────────
  SELECT
    COUNT(*)::int,
    COALESCE(SUM((calc_snapshot->>'total')::numeric),          0),
    COALESCE(SUM((calc_snapshot->>'materials')::numeric),      0),
    COALESCE(SUM((calc_snapshot->>'labor')::numeric),          0),
    COALESCE(SUM((calc_snapshot->>'equipment')::numeric),      0),
    COALESCE(SUM((calc_snapshot->>'subtotal')::numeric),       0),
    COALESCE(SUM((calc_snapshot->>'adminAmt')::numeric),       0),
    COALESCE(SUM((calc_snapshot->>'imprevistosAmt')::numeric), 0),
    COALESCE(SUM((calc_snapshot->>'utilAmt')::numeric),        0),
    COALESCE(SUM((calc_snapshot->>'ivaAmt')::numeric),         0),
    COALESCE(SUM((calc_snapshot->>'transportAmt')::numeric),   0)
  INTO
    v_quotes_count, v_total_revenue,
    v_total_mat, v_total_lab, v_total_equip, v_total_subtotal,
    v_total_admin, v_total_imprv, v_total_util, v_total_iva, v_total_transport
  FROM public.quotes
  WHERE workspace_id = p_workspace_id
    AND status = 'Aprobada'
    AND deleted_at IS NULL
    AND created_at::date BETWEEN v_start AND v_end;

  -- Pedidos finalizados en el período
  SELECT COUNT(*)::int INTO v_orders_count
  FROM public.orders
  WHERE workspace_id = p_workspace_id
    AND status = 'finalizado'
    AND deleted_at IS NULL
    AND created_at::date BETWEEN v_start AND v_end;

  -- Costos reales registrados en el período
  SELECT
    COALESCE(SUM(ce.amount), 0),
    COUNT(ce.id) > 0
  INTO v_real_cost_total, v_has_real
  FROM public.order_cost_entries ce
  JOIN public.orders o ON o.id = ce.order_id
  WHERE ce.workspace_id = p_workspace_id
    AND o.created_at::date BETWEEN v_start AND v_end;

  -- ── Tendencia mensual (hasta 12 meses) ──────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'month',          to_char(m.month_start, 'YYYY-MM'),
      'month_label',    to_char(m.month_start, 'Mon YYYY'),
      'revenue',        COALESCE(q.revenue, 0),
      'direct_cost',    COALESCE(q.direct_cost, 0),
      'util_amount',    COALESCE(q.util_amount, 0),
      'margin_pct',     CASE WHEN COALESCE(q.revenue,0) > 0
        THEN round((COALESCE(q.util_amount,0) / q.revenue * 100)::numeric, 1) ELSE 0 END,
      'quotes_count',   COALESCE(q.cnt, 0)
    ) ORDER BY m.month_start
  )
  INTO v_monthly
  FROM generate_series(
    date_trunc('month', v_start::timestamp),
    date_trunc('month', v_end::timestamp),
    '1 month'::interval
  ) m(month_start)
  LEFT JOIN (
    SELECT
      date_trunc('month', created_at) AS month_start,
      COUNT(*)::int                   AS cnt,
      SUM((calc_snapshot->>'total')::numeric)    AS revenue,
      SUM((calc_snapshot->>'subtotal')::numeric) AS direct_cost,
      SUM((calc_snapshot->>'utilAmt')::numeric)  AS util_amount
    FROM public.quotes
    WHERE workspace_id = p_workspace_id
      AND status = 'Aprobada'
      AND deleted_at IS NULL
      AND created_at::date BETWEEN v_start AND v_end
    GROUP BY 1
  ) q ON q.month_start = m.month_start;

  -- ── Top 5 clientes por ingreso ───────────────────────────────────────────────
  SELECT jsonb_agg(row ORDER BY row->'revenue' DESC)
  INTO v_top_clients
  FROM (
    SELECT jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'revenue',     COALESCE(SUM((q2.calc_snapshot->>'total')::numeric), 0),
      'util_amount', COALESCE(SUM((q2.calc_snapshot->>'utilAmt')::numeric), 0),
      'margin_pct',  CASE WHEN COALESCE(SUM((q2.calc_snapshot->>'total')::numeric), 0) > 0
        THEN round((SUM((q2.calc_snapshot->>'utilAmt')::numeric) /
                    SUM((q2.calc_snapshot->>'total')::numeric) * 100)::numeric, 2) ELSE 0 END,
      'quote_count', COUNT(q2.id)::int
    ) AS row
    FROM public.clients c
    JOIN public.quotes q2 ON q2.client_id = c.id
    WHERE q2.workspace_id = p_workspace_id
      AND q2.status = 'Aprobada'
      AND q2.deleted_at IS NULL
      AND q2.created_at::date BETWEEN v_start AND v_end
    GROUP BY c.id, c.name
    ORDER BY SUM((q2.calc_snapshot->>'total')::numeric) DESC
    LIMIT 5
  ) sub;

  -- ── Clientes con menor margen (riesgo de no rentabilidad) ───────────────────
  SELECT jsonb_agg(row ORDER BY row->'margin_pct' ASC)
  INTO v_bottom_clients
  FROM (
    SELECT jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'revenue',     COALESCE(SUM((q3.calc_snapshot->>'total')::numeric), 0),
      'margin_pct',  CASE WHEN COALESCE(SUM((q3.calc_snapshot->>'total')::numeric), 0) > 0
        THEN round((SUM((q3.calc_snapshot->>'utilAmt')::numeric) /
                    SUM((q3.calc_snapshot->>'total')::numeric) * 100)::numeric, 2) ELSE 0 END
    ) AS row
    FROM public.clients c
    JOIN public.quotes q3 ON q3.client_id = c.id
    WHERE q3.workspace_id = p_workspace_id
      AND q3.status = 'Aprobada'
      AND q3.deleted_at IS NULL
      AND q3.created_at::date BETWEEN v_start AND v_end
    GROUP BY c.id, c.name
    HAVING SUM((q3.calc_snapshot->>'total')::numeric) > 0
    ORDER BY
      SUM((q3.calc_snapshot->>'utilAmt')::numeric) /
      NULLIF(SUM((q3.calc_snapshot->>'total')::numeric), 0) ASC
    LIMIT 5
  ) sub2;

  RETURN jsonb_build_object(
    'ok',              true,
    'period_start',    v_start,
    'period_end',      v_end,
    -- Ingresos
    'total_revenue',         round(v_total_revenue::numeric, 0),
    'quotes_count',          v_quotes_count,
    'orders_finalized',      v_orders_count,
    'avg_quote_value',       CASE WHEN v_quotes_count > 0
      THEN round((v_total_revenue / v_quotes_count)::numeric, 0) ELSE 0 END,
    -- Costos estimados
    'total_materials',       round(v_total_mat::numeric, 0),
    'total_labor',           round(v_total_lab::numeric, 0),
    'total_equipment',       round(v_total_equip::numeric, 0),
    'total_direct_cost',     round(v_total_subtotal::numeric, 0),
    'total_admin',           round(v_total_admin::numeric, 0),
    'total_contingency',     round(v_total_imprv::numeric, 0),
    'total_aiu',             round((v_total_admin + v_total_imprv + v_total_util)::numeric, 0),
    'total_iva',             round(v_total_iva::numeric, 0),
    'total_transport',       round(v_total_transport::numeric, 0),
    -- Utilidad estimada (la U de AIU)
    'estimated_profit',      round(v_total_util::numeric, 0),
    'estimated_margin_pct',  CASE WHEN v_total_revenue > 0
      THEN round((v_total_util / v_total_revenue * 100)::numeric, 2) ELSE 0 END,
    -- Margen bruto = (ingresos - costo directo) / ingresos
    'gross_margin_pct',      CASE WHEN v_total_revenue > 0
      THEN round(((v_total_revenue - v_total_subtotal) / v_total_revenue * 100)::numeric, 2) ELSE 0 END,
    -- Costos reales
    'has_real_costs',        v_has_real,
    'total_real_cost',       round(v_real_cost_total::numeric, 0),
    'real_profit',           CASE WHEN v_has_real THEN round((v_total_revenue - v_real_cost_total)::numeric, 0) ELSE NULL END,
    'real_margin_pct',       CASE WHEN v_has_real AND v_total_revenue > 0
      THEN round(((v_total_revenue - v_real_cost_total) / v_total_revenue * 100)::numeric, 2) ELSE NULL END,
    -- Tendencia
    'monthly_trend',         COALESCE(v_monthly, '[]'::jsonb),
    -- Rankings
    'top_clients',           COALESCE(v_top_clients, '[]'::jsonb),
    'low_margin_clients',    COALESCE(v_bottom_clients, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_profitability(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_order_profit(uuid, uuid)              IS 'Sprint 18: rentabilidad estimada+real de un pedido. Usa calc_snapshot + order_cost_entries.';
COMMENT ON FUNCTION public.get_client_profit(uuid, uuid, date, date) IS 'Sprint 18: rentabilidad de un cliente en período. Agrega pedidos y costos reales.';
COMMENT ON FUNCTION public.get_service_profit(uuid, date, date)      IS 'Sprint 18: rentabilidad por tipo de servicio desde calc_snapshot.lines. Period-aware.';
COMMENT ON FUNCTION public.get_workspace_profitability(uuid, date, date) IS 'Sprint 18: rentabilidad global del workspace. Incluye tendencia mensual, top clientes, low margin.';
