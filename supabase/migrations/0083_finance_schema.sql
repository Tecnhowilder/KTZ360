-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0083: Finance Schema Sprint 18
-- Fuente única de verdad para costos reales de ejecución.
-- Reutiliza: calc_snapshot (costos estimados), gps_events (horas),
--            clients.total_value (ingreso acumulado), customer_health_scores.
-- NO duplica: invoices locales, labor_costs, material_costs, overhead_costs separadas.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tasa horaria en profiles ─────────────────────────────────────────────
-- Permite calcular costo real de mano de obra desde GPS check-in/check-out.
-- cost_rate_type: 'hourly' = por hora, 'fixed' = precio fijo por OT, 'commission' = % del pedido.
-- Nullable: si no se configura, costo de mano de obra = 0 (visible en UI como aviso).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_rate    numeric(10,2),
  ADD COLUMN IF NOT EXISTS cost_rate_type text NOT NULL DEFAULT 'hourly'
    CHECK (cost_rate_type IN ('hourly', 'fixed', 'commission'));

COMMENT ON COLUMN public.profiles.hourly_rate    IS 'Sprint 18: tasa para calcular costo de mano de obra real. Unidad según cost_rate_type.';
COMMENT ON COLUMN public.profiles.cost_rate_type IS 'Sprint 18: hourly=por hora desde GPS, fixed=precio fijo por OT, commission=% del pedido.';

-- ─── 2. order_cost_entries — costos reales de ejecución por pedido ────────────
-- Registro OPCIONAL de costos que ocurrieron en ejecución.
-- type cubre: materiales usados, mano de obra real, equipo alquilado,
--             gastos generales, subcontratistas, transporte.
-- Si no hay entradas → margen se calcula solo con calc_snapshot (estimado).
-- Si hay entradas → se reporta margen real vs estimado.

CREATE TABLE IF NOT EXISTS public.order_cost_entries (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid         NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id     uuid         NOT NULL REFERENCES public.orders(id)     ON DELETE CASCADE,
  type         text         NOT NULL CHECK (type IN (
    'materials',      -- materiales físicos usados en obra
    'labor',          -- mano de obra (puede ser calculada o manual)
    'equipment',      -- equipo alquilado o usado
    'overhead',       -- gastos generales (papelería, comunicaciones, etc.)
    'subcontractor',  -- servicios subcontratados
    'transport'       -- transporte de materiales/personal
  )),
  description  text         NOT NULL,
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  recorded_by  uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_cost_entries_order
  ON public.order_cost_entries(order_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_cost_entries_workspace
  ON public.order_cost_entries(workspace_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_cost_entries_type
  ON public.order_cost_entries(workspace_id, type, recorded_at DESC);

ALTER TABLE public.order_cost_entries ENABLE ROW LEVEL SECURITY;

-- Todos los miembros del workspace pueden ver los costos
CREATE POLICY "workspace members select cost entries"
  ON public.order_cost_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = order_cost_entries.workspace_id AND id = auth.uid()
  ));

-- Solo owner/admin pueden registrar/editar/eliminar costos
CREATE POLICY "owner admin manage cost entries"
  ON public.order_cost_entries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = order_cost_entries.workspace_id
      AND id = auth.uid()
      AND role IN ('owner','admin','super_admin','support_admin')
      AND status = 'active'
  ));

COMMENT ON TABLE public.order_cost_entries IS 'Sprint 18: costos reales de ejecución por pedido. Permite calcular margen real vs estimado de calc_snapshot.';

-- ─── 3. RPC: get_order_cost_entries ──────────────────────────────────────────
-- Obtiene costos reales de un pedido con resumen por tipo.

CREATE OR REPLACE FUNCTION public.get_order_cost_entries(
  p_workspace_id uuid,
  p_order_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Zero Trust
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',          e.id,
        'type',        e.type,
        'description', e.description,
        'amount',      e.amount,
        'recorded_at', e.recorded_at
      ) ORDER BY e.recorded_at DESC)
      FROM public.order_cost_entries e
      WHERE e.order_id = p_order_id AND e.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'summary', COALESCE((
      SELECT jsonb_object_agg(type, COALESCE(total, 0))
      FROM (
        SELECT type, SUM(amount) AS total
        FROM public.order_cost_entries
        WHERE order_id = p_order_id AND workspace_id = p_workspace_id
        GROUP BY type
      ) s
    ), '{}'::jsonb),
    'total_real_cost', COALESCE((
      SELECT SUM(amount) FROM public.order_cost_entries
      WHERE order_id = p_order_id AND workspace_id = p_workspace_id
    ), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_cost_entries(uuid, uuid) TO authenticated;

-- ─── 4. RPC: add_order_cost_entry ────────────────────────────────────────────
-- Registra un costo real en un pedido.

CREATE OR REPLACE FUNCTION public.add_order_cost_entry(
  p_workspace_id uuid,
  p_order_id     uuid,
  p_type         text,
  p_description  text,
  p_amount       numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
BEGIN
  -- Zero Trust: solo owner/admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden registrar costos');
  END IF;

  -- Validar que el pedido pertenece al workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El monto debe ser mayor a 0');
  END IF;

  INSERT INTO public.order_cost_entries (workspace_id, order_id, type, description, amount, recorded_by)
  VALUES (p_workspace_id, p_order_id, p_type, p_description, p_amount, v_user_id)
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object('ok', true, 'id', v_entry_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_order_cost_entry(uuid, uuid, text, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.get_order_cost_entries(uuid, uuid) IS 'Sprint 18: obtiene costos reales de un pedido agrupados por tipo.';
COMMENT ON FUNCTION public.add_order_cost_entry(uuid, uuid, text, text, numeric) IS 'Sprint 18: registra costo real en pedido. Solo owner/admin. Zero Trust.';
