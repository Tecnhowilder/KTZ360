-- ============================================================================
-- 0100 — workspace_ai_addons: Paquetes adicionales de créditos IA Sprint 24
-- ============================================================================
-- Mismo patrón que workspace_storage_addons (migr 0071).
-- Paquetes: 100, 500, 1.000, 5.000 créditos.
-- Los créditos de addon se suman a los créditos del plan en check_ai_credits().
-- Los addons NO se acumulan entre meses — vigencia mensual.
-- ============================================================================

-- ─── 1. Catálogo de packs de créditos IA ─────────────────────────────────────
-- FIX Sprint 24: ai_credit_packs fue creada en 0097_sprint24_schema.sql con
-- columnas: pack_key (NOT NULL UNIQUE), name, credits, price_cop, active.
-- Esta migración NO recrea la tabla (IF NOT EXISTS), solo asegura los datos
-- y usa los nombres de columna correctos: "active" (no "is_active"), "price_cop" (no "price").

-- La tabla ya existe si se ejecutó 0097 primero. Si no, la creamos con el schema correcto.
CREATE TABLE IF NOT EXISTS public.ai_credit_packs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key    text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  credits     int         NOT NULL CHECK (credits > 0),
  price_cop   int         NOT NULL CHECK (price_cop > 0),
  active      boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Insertar packs usando columnas reales: pack_key, price_cop, active
INSERT INTO public.ai_credit_packs (pack_key, name, credits, price_cop, sort_order)
VALUES
  ('pack_100',  'Starter IA',    100,   9900,   1),
  ('pack_500',  'Pro IA',        500,   39900,  2),
  ('pack_1000', 'Premium IA',    1000,  69900,  3),
  ('pack_5000', 'Enterprise IA', 5000,  249900, 4)
ON CONFLICT (pack_key) DO UPDATE SET
  name      = excluded.name,
  credits   = excluded.credits,
  price_cop = excluded.price_cop;

ALTER TABLE public.ai_credit_packs ENABLE ROW LEVEL SECURITY;

-- Eliminar policies previas si existen (idempotente)
DROP POLICY IF EXISTS "ai_packs_select_all" ON public.ai_credit_packs;
DROP POLICY IF EXISTS "ai_packs_admin"      ON public.ai_credit_packs;

-- FIX: usar "active" (no "is_active")
CREATE POLICY "ai_packs_select_all" ON public.ai_credit_packs
  FOR SELECT USING (active = true);

CREATE POLICY "ai_packs_admin" ON public.ai_credit_packs
  FOR ALL USING (public.is_support_admin());

-- ─── 2. Tabla de addons activos por workspace ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_ai_addons (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pack_id         uuid        REFERENCES public.ai_credit_packs(id),
  credits         int         NOT NULL CHECK (credits > 0),
  unit_price      numeric(12,2) NOT NULL CHECK (unit_price > 0),
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'expired')),
  activated_at    timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_ai_addons IS
  'Sprint 24: Paquetes adicionales de créditos IA por workspace. Vigencia mensual.';
COMMENT ON COLUMN public.workspace_ai_addons.valid_until IS
  'Los créditos de addon expiran al inicio del siguiente mes calendario.';

CREATE INDEX IF NOT EXISTS idx_ai_addons_workspace
  ON public.workspace_ai_addons(workspace_id);

CREATE INDEX IF NOT EXISTS idx_ai_addons_active
  ON public.workspace_ai_addons(workspace_id, valid_until)
  WHERE status = 'active';

ALTER TABLE public.workspace_ai_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members select ai_addons"
  ON public.workspace_ai_addons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = workspace_ai_addons.workspace_id AND id = auth.uid()
    )
  );

CREATE POLICY "admins manage ai_addons"
  ON public.workspace_ai_addons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = workspace_ai_addons.workspace_id
        AND id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = workspace_ai_addons.workspace_id
        AND id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ─── 3. Actualizar check_ai_credits para incluir créditos de addons ───────────

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
  v_addon_credits  int;
BEGIN
  -- Verificar que el plan tiene IA habilitada
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  SELECT ai_enabled
  INTO v_ai_enabled
  FROM public.plan_features
  WHERE plan_code = v_plan_code;

  IF NOT COALESCE(v_ai_enabled, false) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'ai_not_included',
      'plan',    v_plan_code,
      'credits_used', 0,
      'credits_max',  0,
      'credits_remaining', 0
    );
  END IF;

  -- Obtener límite mensual del plan
  SELECT ai_credits_monthly INTO v_credits_max
  FROM public.plan_limits
  WHERE plan_code = v_plan_code;

  IF v_credits_max IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason',  'unlimited',
      'credits_used', 0,
      'credits_max',  NULL,
      'credits_remaining', NULL
    );
  END IF;

  -- Sumar créditos de addons activos y vigentes este mes
  SELECT COALESCE(SUM(credits), 0)
  INTO v_addon_credits
  FROM public.workspace_ai_addons
  WHERE workspace_id = p_workspace_id
    AND status = 'active'
    AND valid_until >= now();

  v_credits_max := v_credits_max + v_addon_credits;

  -- Contar créditos usados en el mes actual
  SELECT COALESCE(SUM(credits_used), 0) INTO v_credits_used
  FROM public.ai_usage
  WHERE workspace_id = p_workspace_id
    AND period_month = date_trunc('month', now())::date;

  RETURN jsonb_build_object(
    'allowed',           (v_credits_used + p_credits_needed) <= v_credits_max,
    'reason',            CASE WHEN (v_credits_used + p_credits_needed) <= v_credits_max
                           THEN 'ok' ELSE 'limit_reached' END,
    'plan',              v_plan_code,
    'credits_used',      v_credits_used,
    'credits_max',       v_credits_max,
    'credits_remaining', GREATEST(0, v_credits_max - v_credits_used),
    'credits_needed',    p_credits_needed,
    'addon_credits',     v_addon_credits
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_credits(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_credits(uuid, int) TO service_role;

-- ─── 4. RPC: activar addon de créditos IA ────────────────────────────────────

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
  v_user_id    uuid := auth.uid();
  v_pack       record;
  v_addon_id   uuid;
  v_valid_until timestamptz;
BEGIN
  -- Solo owners/admins
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = p_workspace_id AND id = v_user_id AND role IN ('owner','admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin puede activar addons');
  END IF;

  -- Obtener pack (FIX: columna es "active", no "is_active")
  SELECT * INTO v_pack FROM public.ai_credit_packs
  WHERE id = p_pack_id AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pack de créditos no encontrado');
  END IF;

  -- Vigencia: hasta inicio del próximo mes
  v_valid_until := date_trunc('month', now()) + interval '1 month';

  INSERT INTO public.workspace_ai_addons
    (workspace_id, pack_id, credits, unit_price, status, valid_until)
  VALUES
    -- FIX: columna es "price_cop" (no "price")
    (p_workspace_id, p_pack_id, v_pack.credits, v_pack.price_cop, 'active', v_valid_until)
  RETURNING id INTO v_addon_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'addon_id', v_addon_id,
    'credits',  v_pack.credits,
    'price',    v_pack.price_cop,  -- FIX: columna es price_cop
    'valid_until', v_valid_until,
    'message',  format('+%s créditos IA activados hasta %s', v_pack.credits, v_valid_until::date)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_ai_addon(uuid, uuid) TO authenticated;

-- ─── 5. RPC: listar addons activos del workspace ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_addons(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = p_workspace_id AND id = v_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'addons', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',           a.id,
          'credits',      a.credits,
          'unit_price',   a.unit_price,
          'status',       a.status,
          'valid_until',  a.valid_until,
          'activated_at', a.activated_at
        ) ORDER BY a.activated_at DESC
      ), '[]')
      FROM public.workspace_ai_addons a
      WHERE a.workspace_id = p_workspace_id
        AND a.status = 'active'
        AND a.valid_until >= now()
    ),
    'total_addon_credits', (
      SELECT COALESCE(SUM(credits), 0)
      FROM public.workspace_ai_addons
      WHERE workspace_id = p_workspace_id
        AND status = 'active'
        AND valid_until >= now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_addons(uuid) TO authenticated;

-- ─── 6. RPC: expirar addons vencidos (llamar desde cron) ─────────────────────

CREATE OR REPLACE FUNCTION public.expire_ai_addons()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.workspace_ai_addons
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND valid_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_ai_addons() TO service_role;

COMMENT ON FUNCTION public.activate_ai_addon IS
  'Sprint 24: Activa un paquete adicional de créditos IA para el workspace.';
COMMENT ON FUNCTION public.get_ai_addons IS
  'Sprint 24: Lista addons activos y créditos totales de addon del workspace.';
COMMENT ON FUNCTION public.expire_ai_addons IS
  'Sprint 24: Expira addons vencidos. Llamar desde automation-scheduler diario.';
