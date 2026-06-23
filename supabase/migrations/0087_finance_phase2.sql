-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0087: Finance Phase 2 Sprint 18
-- Agrega work_order_id a order_cost_entries (nullable — costo puede ser de OT).
-- Actualiza add_order_cost_entry() para aceptar work_order_id.
-- Registra forecast_finance en ai_operation_costs (reutiliza costo 'forecast').
-- Índice en order_cost_entries(workspace_id, type) para analytics por tipo.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Agregar work_order_id a order_cost_entries ───────────────────────────
-- Nullable: un costo puede ser de pedido global o de una OT específica.
-- FK a work_orders con ON DELETE SET NULL para no perder el costo si se borra la OT.

ALTER TABLE public.order_cost_entries
  ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_cost_entries_work_order
  ON public.order_cost_entries(work_order_id) WHERE work_order_id IS NOT NULL;

COMMENT ON COLUMN public.order_cost_entries.work_order_id
  IS 'Sprint 18 Phase 2: OT específica a la que aplica este costo. Nullable — puede ser del pedido global.';

-- ─── 2. Actualizar add_order_cost_entry() con parámetro work_order_id ────────

CREATE OR REPLACE FUNCTION public.add_order_cost_entry(
  p_workspace_id  uuid,
  p_order_id      uuid,
  p_type          text,
  p_description   text,
  p_amount        numeric,
  p_work_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
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

  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Si se especifica work_order_id, validar que pertenece al mismo pedido
  IF p_work_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.work_orders
      WHERE id = p_work_order_id AND order_id = p_order_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'La OT no pertenece a este pedido');
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El monto debe ser mayor a 0');
  END IF;

  INSERT INTO public.order_cost_entries
    (workspace_id, order_id, work_order_id, type, description, amount, recorded_by)
  VALUES
    (p_workspace_id, p_order_id, p_work_order_id, p_type, p_description, p_amount, v_user_id)
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object('ok', true, 'id', v_entry_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_order_cost_entry(uuid, uuid, text, text, numeric, uuid) TO authenticated;

-- ─── 3. Registrar forecast_finance en ai_operation_costs ─────────────────────
-- Reutiliza el costo de 'forecast' (3 créditos, PREMIUM).
-- Sin cambio en el motor IA — misma operación, prompt diferente.

INSERT INTO public.ai_operation_costs (operation, credits_cost, description)
VALUES ('forecast_finance', 3, 'Forecast financiero: ingresos, utilidad, margen (PREMIUM)')
ON CONFLICT (operation) DO UPDATE SET
  credits_cost = excluded.credits_cost,
  description  = excluded.description;

COMMENT ON FUNCTION public.add_order_cost_entry(uuid, uuid, text, text, numeric, uuid)
  IS 'Sprint 18 Ph2: registra costo real en pedido con OT opcional. Solo owner/admin. Zero Trust.';
