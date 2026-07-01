-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0105: IA Crear Flujo — Operaciones IA + create_direct_order
-- ════════════════════════════════════════════════════════════════════════════
-- Nuevas operaciones IA para el Agente Operativo:
--   ia_voice_interpret  — interpreta voz/texto → cotización/pedido (2 créditos)
--   ia_photo_interpret  — interpreta imagen    → cotización/pedido (3 créditos)
--   ia_full_create      — generación completa con verificación     (4 créditos)
--
-- Nueva RPC: create_direct_order — pedido sin cotización previa
-- Zero Trust | Multi Tenant | Feature-gated PREMIUM
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Registrar operaciones IA en ai_operation_costs ────────────────────────

INSERT INTO public.ai_operation_costs (operation, credits_cost, description)
VALUES
  ('ia_voice_interpret', 2, 'Agente IA: interpreta solicitud de voz/texto para crear cotización o pedido'),
  ('ia_photo_interpret', 3, 'Agente IA: interpreta imagen/foto para crear cotización'),
  ('ia_full_create',     4, 'Agente IA: generación completa con búsqueda en catálogo y clientes')
ON CONFLICT (operation) DO UPDATE SET
  credits_cost = excluded.credits_cost,
  description  = excluded.description;

-- ─── 2. create_direct_order — pedido sin cotización previa ───────────────────
-- Permite crear pedidos directos (mantenimiento, visitas técnicas, instalaciones)
-- sin necesidad de generar primero una cotización.
-- Zero Trust: workspace_id del JWT. Feature gated: orders_enabled (PREMIUM).

CREATE OR REPLACE FUNCTION public.create_direct_order(
  p_client_id       uuid,
  p_title           text,
  p_description     text          DEFAULT NULL,
  p_items_snapshot  jsonb         DEFAULT '[]'::jsonb,
  p_total_amount    numeric(14,2) DEFAULT 0,
  p_notes           text          DEFAULT NULL,
  p_assigned_to     uuid          DEFAULT NULL,
  p_scheduled_at    timestamptz   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_order_id     uuid;
BEGIN
  -- Zero Trust
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.profiles WHERE id = v_user_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  END IF;

  -- Feature gate: PREMIUM (orders_enabled)
  IF NOT public.check_feature_access(v_workspace_id, 'orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'orders_not_included', 'plan_required', 'premium');
  END IF;

  -- Validar cliente pertenece al workspace
  IF p_client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = p_client_id AND workspace_id = v_workspace_id AND deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado en este workspace');
    END IF;
  END IF;

  -- Validar título
  IF TRIM(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El título del pedido es obligatorio');
  END IF;

  -- Crear pedido directo (quote_id = NULL → pedido sin cotización)
  INSERT INTO public.orders (
    workspace_id, quote_id, client_id, created_by,
    title, description, status,
    order_snapshot, total_amount,
    assigned_to, scheduled_at, notes
  ) VALUES (
    v_workspace_id, NULL, p_client_id, v_user_id,
    p_title, p_description, 'pendiente',
    jsonb_build_object(
      'items',  p_items_snapshot,
      'source', 'direct_order',
      'total',  p_total_amount
    ),
    COALESCE(p_total_amount, 0),
    p_assigned_to, p_scheduled_at, p_notes
  )
  RETURNING id INTO v_order_id;

  -- Auditoría
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_user_id, 'direct_order_created', 'order', v_order_id,
    jsonb_build_object('title', p_title, 'source', 'direct_order', 'client_id', p_client_id));

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_direct_order(uuid, text, text, jsonb, numeric, text, uuid, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.create_direct_order IS
  'Migr 0105: crea pedido sin cotización previa. Úsase para pedidos directos (mantenimiento, visitas). Zero Trust. PREMIUM.';
