-- ============================================================================
-- 0145 — AI Addons Permanentes: Los créditos comprados NO vencen
-- ============================================================================
-- CAMBIO: workspace_ai_addons.valid_until → NULL = nunca vence
--
-- COMPORTAMIENTO ANTERIOR: addons expiraban al inicio del siguiente mes.
-- NUEVO COMPORTAMIENTO:
--   - Créditos del PLAN: sí vencen mensualmente (sin cambio).
--   - Créditos de ADDON (comprados): permanecen hasta consumirse.
--
-- ORDEN DE CONSUMO:
--   1. Primero se consumen los créditos del plan (son los que vencen).
--   2. Luego se consumen los créditos de addon (permanentes).
--   Así el usuario siempre aprovecha sus créditos de plan antes que los pagados.
--
-- MIGRACIÓN IDEMPOTENTE: actualiza addons activos existentes para no expirar.
-- ============================================================================

-- 1. Permitir NULL en valid_until (NULL = nunca vence)
ALTER TABLE public.workspace_ai_addons
  ALTER COLUMN valid_until DROP NOT NULL;

-- 2. Migrar addons activos existentes → no vencen (el usuario los pagó)
UPDATE public.workspace_ai_addons
SET valid_until = NULL, updated_at = now()
WHERE status = 'active'
  AND valid_until >= now();

-- 3. Reescribir check_ai_credits para nuevo orden de consumo y addons permanentes
CREATE OR REPLACE FUNCTION public.check_ai_credits(
  p_workspace_id uuid,
  p_credits_needed int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code      text;
  v_credits_max    int;
  v_credits_used   int;
  v_ai_enabled     boolean;
  v_plan_credits   int;    -- créditos disponibles del plan este mes
  v_addon_credits  int;    -- créditos de addons activos (permanentes)
  v_total_credits  int;
BEGIN
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  SELECT ai_enabled INTO v_ai_enabled
  FROM public.plan_features
  WHERE plan_code = v_plan_code;

  IF NOT COALESCE(v_ai_enabled, false) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'ai_not_included', 'plan', v_plan_code,
      'credits_used', 0, 'credits_max', 0, 'credits_remaining', 0
    );
  END IF;

  -- Créditos del plan (vencen mensualmente)
  SELECT ai_credits_monthly INTO v_credits_max
  FROM public.plan_limits WHERE plan_code = v_plan_code;

  IF v_credits_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'unlimited', 'credits_used', 0, 'credits_max', null, 'credits_remaining', null);
  END IF;

  -- Uso del mes actual
  SELECT COALESCE(SUM(credits_used), 0) INTO v_credits_used
  FROM public.ai_usage
  WHERE workspace_id = p_workspace_id
    AND period_month = date_trunc('month', now())::date;

  -- Créditos de plan restantes este mes
  v_plan_credits := GREATEST(0, v_credits_max - v_credits_used);

  -- Créditos de addons activos: NULL valid_until = permanente; fecha futura = vigente
  SELECT COALESCE(SUM(credits), 0) INTO v_addon_credits
  FROM public.workspace_ai_addons
  WHERE workspace_id = p_workspace_id
    AND status = 'active'
    AND (valid_until IS NULL OR valid_until >= now());

  -- Total disponible = plan restante + addons permanentes
  v_total_credits := v_plan_credits + v_addon_credits;

  RETURN jsonb_build_object(
    'allowed',           p_credits_needed <= v_total_credits,
    'reason',            CASE WHEN p_credits_needed <= v_total_credits THEN 'ok' ELSE 'limit_reached' END,
    'plan',              v_plan_code,
    'credits_used',      v_credits_used,
    'credits_max',       v_credits_max,
    'plan_remaining',    v_plan_credits,
    'addon_credits',     v_addon_credits,
    'credits_remaining', v_total_credits,
    'credits_needed',    p_credits_needed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_credits(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_credits(uuid, int) TO service_role;

-- 4. Reescribir activate_ai_addon para que los nuevos addons sean permanentes
CREATE OR REPLACE FUNCTION public.activate_ai_addon(
  p_workspace_id uuid,
  p_pack_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pack    record;
  v_addon_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = p_workspace_id AND id = v_user_id AND role IN ('owner','admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin puede activar addons');
  END IF;

  SELECT * INTO v_pack FROM public.ai_credit_packs
  WHERE id = p_pack_id AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pack de créditos no encontrado');
  END IF;

  -- valid_until = NULL → los créditos comprados son permanentes
  INSERT INTO public.workspace_ai_addons
    (workspace_id, pack_id, credits, unit_price, status, valid_until)
  VALUES
    (p_workspace_id, p_pack_id, v_pack.credits, v_pack.price_cop, 'active', NULL)
  RETURNING id INTO v_addon_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'addon_id', v_addon_id,
    'credits',  v_pack.credits,
    'price',    v_pack.price_cop,
    'permanent', true,
    'message',  format('+%s créditos IA activados (no vencen)', v_pack.credits)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_ai_addon(uuid, uuid) TO authenticated;

COMMENT ON COLUMN public.workspace_ai_addons.valid_until IS
  'NULL = addon permanente (créditos comprados no vencen). Fecha = addon vigente hasta esa fecha.';
COMMENT ON FUNCTION public.check_ai_credits IS
  'Verifica créditos. Consume plan primero (vencen), luego addons (permanentes).';
