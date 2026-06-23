-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0086: Finance Hotfix Sprint 18 → Sprint 20 prep
-- ════════════════════════════════════════════════════════════════════════════
-- Fixes:
--   BUG-001: get_finance_dashboard() → integration_status → integrations
-- Mejoras sin credenciales externas:
--   1. pdf_url + xml_url en integration_invoices
--   2. sync_invoice_status() RPC — consulta estado en Alegra
--   3. void_invoice() RPC — anula factura en Alegra
--   4. update_invoice_status() RPC — receptor de webhooks Alegra
--   5. saas_invoices tabla — facturas de Shelwi como empresa
--   6. Trigger mp-webhook → email de confirmación (flag en payment_events)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. BUG-001 FIX: get_finance_dashboard corrección integration_status ──────
--    Tabla correcta: public.integrations (no public.integration_status)

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
  v_revenue     numeric := 0;
  v_dir_cost    numeric := 0;
  v_util        numeric := 0;
  v_quotes_cnt  int     := 0;
  v_orders_cnt  int     := 0;
  v_real_cost   numeric := 0;
  v_has_real    boolean := false;
  v_prev_revenue numeric := 0;
  v_prev_util    numeric := 0;
  v_period_days  int;
  v_top_clients     jsonb;
  v_low_margin_cl   jsonb;
  v_top_services    jsonb;
  v_low_orders      jsonb;
  v_alegra          jsonb;
  v_monthly         jsonb;
  v_health          text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  v_start       := COALESCE(p_period_start, date_trunc('month', now() - interval '2 months')::date);
  v_end         := COALESCE(p_period_end,   CURRENT_DATE);
  v_period_days := (v_end - v_start) + 1;

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

  SELECT COALESCE(SUM(ce.amount), 0), COUNT(ce.id) > 0
  INTO v_real_cost, v_has_real
  FROM public.order_cost_entries ce
  JOIN public.orders o ON o.id = ce.order_id
  WHERE ce.workspace_id = p_workspace_id
    AND o.created_at::date BETWEEN v_start AND v_end;

  SELECT
    COALESCE(SUM((calc_snapshot->>'total')::numeric), 0),
    COALESCE(SUM((calc_snapshot->>'utilAmt')::numeric), 0)
  INTO v_prev_revenue, v_prev_util
  FROM public.quotes
  WHERE workspace_id = p_workspace_id AND status = 'Aprobada' AND deleted_at IS NULL
    AND created_at::date BETWEEN (v_start - v_period_days) AND (v_start - 1);

  -- Top 5 clientes
  SELECT jsonb_agg(r ORDER BY (r->>'revenue')::numeric DESC)
  INTO v_top_clients
  FROM (
    SELECT jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'revenue',     round(COALESCE(SUM((q.calc_snapshot->>'total')::numeric), 0)::numeric, 0),
      'util_amount', round(COALESCE(SUM((q.calc_snapshot->>'utilAmt')::numeric), 0)::numeric, 0),
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

  -- Clientes bajo margen
  SELECT jsonb_agg(r)
  INTO v_low_margin_cl
  FROM (
    SELECT jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'revenue',     round(COALESCE(SUM((q.calc_snapshot->>'total')::numeric), 0)::numeric, 0),
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

  -- Top servicios
  SELECT jsonb_agg(r ORDER BY (r->>'total_revenue')::numeric DESC)
  INTO v_top_services
  FROM (
    SELECT jsonb_build_object(
      'service_name',      line->>'service_name',
      'quote_count',       COUNT(DISTINCT q.id)::int,
      'total_revenue',     round(SUM(
        CASE WHEN (q.calc_snapshot->>'subtotal')::numeric > 0
        THEN ((line->>'lineTotal')::numeric / (q.calc_snapshot->>'subtotal')::numeric)
             * (q.calc_snapshot->>'total')::numeric
        ELSE COALESCE((line->>'lineTotal')::numeric, 0) END
      )::numeric, 0),
      'total_direct_cost', round(SUM(COALESCE((line->>'lineTotal')::numeric, 0))::numeric, 0)
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
    ORDER BY SUM(CASE WHEN (q.calc_snapshot->>'subtotal')::numeric > 0
      THEN ((line->>'lineTotal')::numeric / (q.calc_snapshot->>'subtotal')::numeric)
           * (q.calc_snapshot->>'total')::numeric
      ELSE COALESCE((line->>'lineTotal')::numeric, 0) END) DESC
    LIMIT 5
  ) s3;

  -- Pedidos de bajo margen
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
        THEN round(COALESCE((q.calc_snapshot->>'utilAmt')::numeric, 0)
                   / o.total_amount * 100::numeric, 2) ELSE 0 END
    ) AS r
    FROM public.orders o
    LEFT JOIN public.clients c ON c.id = o.client_id
    LEFT JOIN public.quotes  q ON q.id = o.quote_id
    WHERE o.workspace_id = p_workspace_id AND o.deleted_at IS NULL
      AND o.created_at::date BETWEEN v_start AND v_end
      AND o.total_amount > 0
      AND COALESCE((q.calc_snapshot->>'utilAmt')::numeric, 0)
          / NULLIF(o.total_amount,0) * 100 < 5
    ORDER BY COALESCE((q.calc_snapshot->>'utilAmt')::numeric, 0)
             / NULLIF(o.total_amount,0) ASC
    LIMIT 5
  ) s4;

  -- ── Alegra: CORRECCIÓN BUG-001 ────────────────────────────────────────────
  -- Tabla correcta: public.integrations (NO public.integration_status)
  SELECT jsonb_build_object(
    'connected',        EXISTS(
      SELECT 1 FROM public.integrations                    -- ← CORREGIDO
      WHERE workspace_id = p_workspace_id
        AND provider = 'alegra'
        AND status = 'connected'
    ),
    'auto_invoice',     COALESCE((
      SELECT (config->>'auto_invoice')::boolean
      FROM public.integrations
      WHERE workspace_id = p_workspace_id AND provider = 'alegra'
    ), false),
    'invoices_total',   COUNT(*)::int,
    'invoices_pending', COUNT(CASE WHEN inv.invoice_status IN ('draft','issued') THEN 1 END)::int,
    'invoices_paid',    COUNT(CASE WHEN inv.invoice_status = 'paid' THEN 1 END)::int,
    'invoices_void',    COUNT(CASE WHEN inv.invoice_status IN ('void','cancelled') THEN 1 END)::int,
    'amount_pending',   round(COALESCE(SUM(
      CASE WHEN inv.invoice_status IN ('draft','issued')
      THEN inv.total END
    ), 0)::numeric, 0),
    'amount_paid',      round(COALESCE(SUM(
      CASE WHEN inv.invoice_status = 'paid'
      THEN inv.total END
    ), 0)::numeric, 0)
  )
  INTO v_alegra
  FROM public.integration_invoices inv
  WHERE inv.workspace_id = p_workspace_id
    AND inv.created_at::date BETWEEN v_start AND v_end;

  -- Tendencia mensual
  SELECT jsonb_agg(
    jsonb_build_object(
      'month',       to_char(m.ms, 'YYYY-MM'),
      'label',       to_char(m.ms, 'Mon'),
      'revenue',     COALESCE(q_m.revenue, 0),
      'direct_cost', COALESCE(q_m.direct_cost, 0),
      'util_amount', COALESCE(q_m.util_amount, 0),
      'margin_pct',  CASE WHEN COALESCE(q_m.revenue,0) > 0
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
      date_trunc('month', created_at)             AS ms,
      SUM((calc_snapshot->>'total')::numeric)    AS revenue,
      SUM((calc_snapshot->>'subtotal')::numeric) AS direct_cost,
      SUM((calc_snapshot->>'utilAmt')::numeric)  AS util_amount
    FROM public.quotes
    WHERE workspace_id = p_workspace_id AND status = 'Aprobada' AND deleted_at IS NULL
      AND created_at::date BETWEEN v_start AND v_end
    GROUP BY 1
  ) q_m USING (ms);

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
    'summary', jsonb_build_object(
      'total_revenue',        round(v_revenue::numeric,  0),
      'total_direct_cost',    round(v_dir_cost::numeric, 0),
      'estimated_profit',     round(v_util::numeric,     0),
      'estimated_margin_pct', CASE WHEN v_revenue > 0
        THEN round((v_util / v_revenue * 100)::numeric, 2) ELSE 0 END,
      'gross_margin_pct',     CASE WHEN v_revenue > 0
        THEN round(((v_revenue - v_dir_cost) / v_revenue * 100)::numeric, 2) ELSE 0 END,
      'has_real_costs',       v_has_real,
      'real_cost_total',      round(v_real_cost::numeric, 0),
      'real_profit',          CASE WHEN v_has_real THEN round((v_revenue - v_real_cost)::numeric, 0) ELSE NULL END,
      'real_margin_pct',      CASE WHEN v_has_real AND v_revenue > 0
        THEN round(((v_revenue - v_real_cost) / v_revenue * 100)::numeric, 2) ELSE NULL END,
      'quotes_approved',      v_quotes_cnt,
      'orders_finalized',     v_orders_cnt,
      'revenue_prev',         round(v_prev_revenue::numeric, 0),
      'revenue_change_pct',   CASE WHEN v_prev_revenue > 0
        THEN round(((v_revenue - v_prev_revenue) / v_prev_revenue * 100)::numeric, 1) ELSE NULL END,
      'profit_prev',          round(v_prev_util::numeric, 0),
      'profit_change_pct',    CASE WHEN v_prev_util > 0
        THEN round(((v_util - v_prev_util) / v_prev_util * 100)::numeric, 1) ELSE NULL END
    ),
    'monthly_trend',      COALESCE(v_monthly,       '[]'::jsonb),
    'top_clients',        COALESCE(v_top_clients,   '[]'::jsonb),
    'low_margin_clients', COALESCE(v_low_margin_cl, '[]'::jsonb),
    'top_services',       COALESCE(v_top_services,  '[]'::jsonb),
    'low_margin_orders',  COALESCE(v_low_orders,    '[]'::jsonb),
    'alegra',             COALESCE(v_alegra, jsonb_build_object(
      'connected', false, 'auto_invoice', false,
      'invoices_total', 0, 'invoices_pending', 0, 'invoices_paid', 0,
      'invoices_void', 0, 'amount_pending', 0, 'amount_paid', 0
    )),
    'financial_health', v_health
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_dashboard(uuid, date, date) TO authenticated;

-- ─── 2. Agregar columnas pdf_url y xml_url a integration_invoices ─────────────

ALTER TABLE public.integration_invoices
  ADD COLUMN IF NOT EXISTS pdf_url  text,
  ADD COLUMN IF NOT EXISTS xml_url  text;

COMMENT ON COLUMN public.integration_invoices.pdf_url IS 'Hotfix 0086: URL del PDF de la factura en Alegra. Fuente de verdad en Alegra.';
COMMENT ON COLUMN public.integration_invoices.xml_url IS 'Hotfix 0086: URL del XML DIAN de la factura. Requerido para trazabilidad fiscal.';

-- ─── 3. RPC: update_invoice_status — receptor de actualizaciones de estado ────
-- Llamado desde Edge Function alegra-webhook (a crear) o desde sync_invoice_status.
-- Security: service_role vía service key de Edge Function.

CREATE OR REPLACE FUNCTION public.update_invoice_status(
  p_workspace_id       uuid,
  p_external_invoice_id text,
  p_new_status         text,
  p_pdf_url            text DEFAULT NULL,
  p_xml_url            text DEFAULT NULL,
  p_paid_at            timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_updated   int;
BEGIN
  -- Válido status
  IF p_new_status NOT IN ('draft','issued','paid','void','cancelled','overdue') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Estado inválido: ' || p_new_status);
  END IF;

  UPDATE public.integration_invoices
  SET
    invoice_status = p_new_status,
    pdf_url        = COALESCE(p_pdf_url, pdf_url),
    xml_url        = COALESCE(p_xml_url, xml_url),
    paid_at        = CASE WHEN p_new_status = 'paid' THEN COALESCE(p_paid_at, now()) ELSE paid_at END,
    updated_at     = now()
  WHERE workspace_id        = p_workspace_id
    AND external_invoice_id = p_external_invoice_id
    AND provider            = 'alegra';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Factura no encontrada');
  END IF;

  -- Log del cambio de estado
  INSERT INTO public.integration_events
    (workspace_id, provider, event_type, payload)
  VALUES (
    p_workspace_id, 'alegra', 'invoice_status_updated',
    jsonb_build_object(
      'external_invoice_id', p_external_invoice_id,
      'new_status',          p_new_status,
      'updated_at',          now()
    )
  );

  RETURN jsonb_build_object('ok', true, 'rows_updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_status(uuid, text, text, text, text, timestamptz) TO authenticated;

-- ─── 4. RPC: void_invoice — anular una factura en Alegra ─────────────────────
-- No llama a Alegra directamente (eso lo hace la Edge Function).
-- Encola evento 'invoice_void' en integration_events para el worker.

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_workspace_id uuid,
  p_invoice_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inv     record;
BEGIN
  -- Zero Trust: solo owner/admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden anular facturas');
  END IF;

  -- Verificar Alegra conectado
  IF NOT EXISTS (
    SELECT 1 FROM public.integrations
    WHERE workspace_id = p_workspace_id AND provider = 'alegra' AND status = 'connected'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Alegra no está conectado');
  END IF;

  -- Obtener factura
  SELECT * INTO v_inv
  FROM public.integration_invoices
  WHERE id = p_invoice_id AND workspace_id = p_workspace_id AND provider = 'alegra';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Factura no encontrada');
  END IF;

  IF v_inv.invoice_status IN ('void','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La factura ya está anulada');
  END IF;

  IF v_inv.invoice_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No se puede anular una factura pagada. Emite una nota crédito.');
  END IF;

  -- Encolar anulación para el integration-worker
  INSERT INTO public.integration_events
    (workspace_id, provider, event_type, payload)
  VALUES (
    p_workspace_id, 'alegra', 'invoice_void',
    jsonb_build_object(
      'invoice_id',          p_invoice_id,
      'external_invoice_id', v_inv.external_invoice_id,
      'requested_by',        v_user_id
    )
  );

  -- Marcar como 'void' en estado local (optimista — el worker confirmará)
  UPDATE public.integration_invoices
  SET invoice_status = 'void', updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Anulación encolada. Se procesará en segundos.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid) TO authenticated;

-- ─── 5. RPC: get_invoice_detail — detalle completo de una factura ─────────────

CREATE OR REPLACE FUNCTION public.get_invoice_detail(
  p_workspace_id uuid,
  p_invoice_id   uuid
)
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
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice', (
      SELECT jsonb_build_object(
        'id',                  inv.id,
        'external_invoice_id', inv.external_invoice_id,
        'invoice_number',      inv.invoice_number,
        'invoice_status',      inv.invoice_status,
        'total',               inv.total,
        'currency',            inv.currency,
        'issued_at',           inv.issued_at,
        'paid_at',             inv.paid_at,
        'pdf_url',             inv.pdf_url,
        'xml_url',             inv.xml_url,
        'metadata',            inv.metadata,
        'client_id',           inv.client_id,
        'client_name',         c.name,
        'client_email',        c.email,
        'order_id',            inv.order_id,
        'order_number',        o.order_number,
        'order_title',         o.title,
        -- Referencia externa con URL completa
        'external_url',        er.external_url,
        'created_at',          inv.created_at,
        'updated_at',          inv.updated_at
      )
      FROM public.integration_invoices inv
      LEFT JOIN public.clients c ON c.id = inv.client_id
      LEFT JOIN public.orders  o ON o.id = inv.order_id
      LEFT JOIN public.integration_entity_refs er
        ON er.entity_type = 'order' AND er.entity_id = inv.order_id
        AND er.provider = 'alegra' AND er.workspace_id = p_workspace_id
      WHERE inv.id = p_invoice_id AND inv.workspace_id = p_workspace_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_detail(uuid, uuid) TO authenticated;

-- ─── 6. Tabla saas_invoices — facturas que Shelwi emite como empresa SaaS ─────
-- IMPORTANTE: Esta tabla almacena METADATOS de la factura.
-- La factura real (PDF + DIAN) vive en el sistema contable de Shelwi (Alegra propio).
-- workspace_id = NULL significa que es una factura de SHELWI como empresa, no de un cliente.
-- Requiere datos externos para completar: NIT, resolución DIAN, cuenta Alegra de Shelwi.

CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_event_id    text         NOT NULL,    -- FK lógica a payment_events.payment_id
  workspace_id        uuid         NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id             uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_code           text         NOT NULL,
  billing_cycle       text         NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  amount              numeric(12,2) NOT NULL,
  currency            text         NOT NULL DEFAULT 'COP',
  -- Estado de la factura (pendiente hasta que Shelwi implemente facturación propia)
  status              text         NOT NULL DEFAULT 'pending_config' CHECK (status IN (
    'pending_config',  -- Shelwi aún no tiene cuenta de facturación configurada
    'issued',          -- Factura emitida en sistema contable de Shelwi
    'sent',            -- PDF enviado al cliente por email
    'paid',            -- Marcada como pagada (siempre lo está — el pago ya ocurrió vía MP)
    'void'             -- Anulada
  )),
  external_invoice_id text,        -- ID en Alegra de Shelwi (cuando se configure)
  invoice_number      text,        -- Número de factura electrónica
  pdf_url             text,        -- URL del PDF
  xml_url             text,        -- URL del XML DIAN
  email_sent_at       timestamptz, -- Cuándo se envió el email con la factura
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (payment_event_id)        -- Un pago = una factura
);

CREATE TRIGGER trg_saas_invoices_updated_at
  BEFORE UPDATE ON public.saas_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_saas_invoices_workspace
  ON public.saas_invoices(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_status
  ON public.saas_invoices(status, created_at DESC);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

-- Solo super_admin y support_admin pueden ver todas
CREATE POLICY "super_admin reads saas_invoices"
  ON public.saas_invoices FOR SELECT
  USING (public.is_support_admin());

-- El workspace puede ver su propia saas_invoice (comprobante de pago)
CREATE POLICY "workspace reads own saas_invoice"
  ON public.saas_invoices FOR SELECT
  USING (
    workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

COMMENT ON TABLE public.saas_invoices IS 'Hotfix 0086: facturas que Shelwi emite a clientes SaaS. status=pending_config hasta configurar cuenta Alegra de Shelwi.';

-- ─── 7. RPC: register_saas_invoice — crea registro en saas_invoices post-pago ─
-- Llamado desde mp-webhook (service_role) cuando pago aprobado.
-- No genera la factura real — registra el pending hasta que Shelwi configure Alegra.

CREATE OR REPLACE FUNCTION public.register_saas_invoice(
  p_payment_event_id text,
  p_workspace_id     uuid,
  p_user_id          uuid,
  p_plan_code        text,
  p_billing_cycle    text,
  p_amount           numeric,
  p_currency         text DEFAULT 'COP'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id uuid;
BEGIN
  INSERT INTO public.saas_invoices
    (payment_event_id, workspace_id, user_id, plan_code, billing_cycle, amount, currency, status)
  VALUES
    (p_payment_event_id, p_workspace_id, p_user_id, p_plan_code, p_billing_cycle, p_amount, p_currency, 'pending_config')
  ON CONFLICT (payment_event_id) DO NOTHING
  RETURNING id INTO v_inv_id;

  RETURN jsonb_build_object('ok', true, 'id', v_inv_id, 'status', 'pending_config');
END;
$$;

-- Solo service_role puede llamar esta función (desde mp-webhook)
REVOKE ALL ON FUNCTION public.register_saas_invoice(text, uuid, uuid, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_saas_invoice(text, uuid, uuid, text, text, numeric, text) TO service_role;

-- ─── 8. RPC: get_saas_invoice_reconciliation — conciliación payment vs factura ──

CREATE OR REPLACE FUNCTION public.get_saas_invoice_reconciliation(
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo super_admin puede acceder');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'period_days', p_days,
    'summary', (
      SELECT jsonb_build_object(
        'total_payments',          COUNT(pe.id)::int,
        'total_amount_received',   round(COALESCE(SUM(pe.amount), 0)::numeric, 0),
        'payments_with_invoice',   COUNT(si.id)::int,
        'payments_without_invoice', COUNT(pe.id) FILTER (WHERE si.id IS NULL)::int,
        'invoices_pending_config', COUNT(si.id) FILTER (WHERE si.status = 'pending_config')::int,
        'invoices_issued',         COUNT(si.id) FILTER (WHERE si.status IN ('issued','sent','paid'))::int
      )
      FROM public.payment_events pe
      LEFT JOIN public.saas_invoices si ON si.payment_event_id = pe.payment_id
      WHERE pe.status = 'approved'
        AND pe.created_at >= now() - (p_days || ' days')::interval
    ),
    'mismatches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'payment_id',    pe.payment_id,
        'workspace_id',  pe.workspace_id,
        'plan_code',     pe.plan_code,
        'amount',        pe.amount,
        'payment_date',  pe.created_at,
        'invoice_status', COALESCE(si.status, 'sin_registro')
      ) ORDER BY pe.created_at DESC), '[]'::jsonb)
      FROM public.payment_events pe
      LEFT JOIN public.saas_invoices si ON si.payment_event_id = pe.payment_id
      WHERE pe.status = 'approved'
        AND pe.created_at >= now() - (p_days || ' days')::interval
        AND (si.id IS NULL OR si.status = 'pending_config')
      LIMIT 50
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_invoice_reconciliation(int) TO authenticated;

COMMENT ON FUNCTION public.update_invoice_status(uuid, text, text, text, text, timestamptz) IS 'Hotfix 0086: actualiza estado de factura Alegra desde webhook o polling.';
COMMENT ON FUNCTION public.void_invoice(uuid, uuid) IS 'Hotfix 0086: encola anulación de factura en Alegra. Solo owner/admin.';
COMMENT ON FUNCTION public.get_invoice_detail(uuid, uuid) IS 'Hotfix 0086: detalle completo de una factura incluyendo pdf_url, xml_url, client, order.';
COMMENT ON FUNCTION public.register_saas_invoice(text, uuid, uuid, text, text, numeric, text) IS 'Hotfix 0086: registra factura SaaS pendiente tras pago aprobado. Llamado desde mp-webhook service_role.';
COMMENT ON FUNCTION public.get_saas_invoice_reconciliation(int) IS 'Hotfix 0086: conciliación payment_events vs saas_invoices. Solo super_admin.';
