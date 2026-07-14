-- ============================================================================
-- 0144 — AI User & Role Limits: Presupuestos IA por usuario y por rol
-- ============================================================================
-- Tablas:
--   ai_role_limits    — límites por rol dentro de un workspace
--   ai_user_limits    — override por usuario específico
-- RPCs:
--   check_ai_user_budget(workspace_id, user_id, credits_needed)
--   get_ai_user_budget(workspace_id, user_id)
-- ============================================================================

-- ─── 1. Límites por rol ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_role_limits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role                text        NOT NULL,   -- 'owner','admin','seller','operator','viewer'
  daily_credits       int,        -- NULL = sin límite diario
  monthly_credits     int,        -- NULL = sin límite mensual
  per_operation_max   int         DEFAULT 10, -- máximo créditos por llamada individual
  enabled             boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, role)
);

-- Límites por defecto por rol (owner y admin sin límite, roles operativos con límite)
-- Se insertan al activar la feature desde el Backoffice, no globalmente.

CREATE INDEX IF NOT EXISTS idx_ai_role_limits_workspace ON public.ai_role_limits(workspace_id);

ALTER TABLE public.ai_role_limits ENABLE ROW LEVEL SECURITY;

-- Owners/admins pueden leer y modificar los límites de su workspace
CREATE POLICY "ai_role_limits_admin_manage"
  ON public.ai_role_limits FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = ai_role_limits.workspace_id
        AND id = auth.uid()
        AND role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = ai_role_limits.workspace_id
        AND id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "ai_role_limits_member_select"
  ON public.ai_role_limits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = ai_role_limits.workspace_id AND id = auth.uid()
    )
  );

CREATE POLICY "ai_role_limits_super_admin"
  ON public.ai_role_limits FOR ALL USING (public.is_support_admin());

-- ─── 2. Límites por usuario específico ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_user_limits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_credits       int,        -- NULL = heredar del rol
  monthly_credits     int,        -- NULL = heredar del rol
  per_operation_max   int,        -- NULL = heredar del rol
  enabled             boolean     NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_user_limits_workspace ON public.ai_user_limits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_user_limits_user      ON public.ai_user_limits(user_id);

ALTER TABLE public.ai_user_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_user_limits_admin_manage"
  ON public.ai_user_limits FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = ai_user_limits.workspace_id
        AND id = auth.uid()
        AND role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = ai_user_limits.workspace_id
        AND id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

CREATE POLICY "ai_user_limits_self_select"
  ON public.ai_user_limits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ai_user_limits_super_admin"
  ON public.ai_user_limits FOR ALL USING (public.is_support_admin());

-- ─── 3. RPC: obtener presupuesto efectivo de un usuario ──────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_user_budget(
  p_workspace_id uuid,
  p_user_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role              text;
  v_user_limit        record;
  v_role_limit        record;
  v_daily_limit       int;
  v_monthly_limit     int;
  v_per_op_max        int;
  v_credits_today     int;
  v_credits_month     int;
BEGIN
  -- Obtener rol del usuario en el workspace
  SELECT role INTO v_role
  FROM public.profiles
  WHERE workspace_id = p_workspace_id AND id = p_user_id;

  -- Owners no tienen restricción de usuario
  IF v_role = 'owner' THEN
    RETURN jsonb_build_object(
      'role', v_role, 'daily_limit', null, 'monthly_limit', null,
      'per_op_max', null, 'credits_today', 0, 'credits_month', 0,
      'has_limits', false
    );
  END IF;

  -- Buscar límite específico del usuario
  SELECT * INTO v_user_limit FROM public.ai_user_limits
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND enabled = true;

  -- Buscar límite del rol
  SELECT * INTO v_role_limit FROM public.ai_role_limits
  WHERE workspace_id = p_workspace_id AND role = v_role AND enabled = true;

  -- Resolver: usuario override > rol
  v_daily_limit   := COALESCE(v_user_limit.daily_credits,   v_role_limit.daily_credits);
  v_monthly_limit := COALESCE(v_user_limit.monthly_credits, v_role_limit.monthly_credits);
  v_per_op_max    := COALESCE(v_user_limit.per_operation_max, v_role_limit.per_operation_max);

  -- Contar uso del usuario hoy
  SELECT COALESCE(SUM(credits_used), 0) INTO v_credits_today
  FROM public.ai_usage
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND created_at >= date_trunc('day', now());

  -- Contar uso del usuario este mes
  SELECT COALESCE(SUM(credits_used), 0) INTO v_credits_month
  FROM public.ai_usage
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND period_month = date_trunc('month', now())::date;

  RETURN jsonb_build_object(
    'role',            v_role,
    'daily_limit',     v_daily_limit,
    'monthly_limit',   v_monthly_limit,
    'per_op_max',      v_per_op_max,
    'credits_today',   v_credits_today,
    'credits_month',   v_credits_month,
    'has_limits',      (v_daily_limit IS NOT NULL OR v_monthly_limit IS NOT NULL),
    'daily_remaining', CASE WHEN v_daily_limit IS NOT NULL THEN GREATEST(0, v_daily_limit - v_credits_today) ELSE null END,
    'monthly_remaining', CASE WHEN v_monthly_limit IS NOT NULL THEN GREATEST(0, v_monthly_limit - v_credits_month) ELSE null END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_user_budget(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_user_budget(uuid, uuid) TO service_role;

-- ─── 4. RPC: verificar presupuesto antes de consumir ─────────────────────────

CREATE OR REPLACE FUNCTION public.check_ai_user_budget(
  p_workspace_id   uuid,
  p_user_id        uuid,
  p_credits_needed int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget jsonb;
  v_daily_remaining   int;
  v_monthly_remaining int;
  v_per_op_max        int;
BEGIN
  v_budget := public.get_ai_user_budget(p_workspace_id, p_user_id);

  -- Sin límites → siempre permitido
  IF NOT (v_budget->>'has_limits')::boolean THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_limits');
  END IF;

  -- Límite por operación individual
  v_per_op_max := (v_budget->>'per_op_max')::int;
  IF v_per_op_max IS NOT NULL AND p_credits_needed > v_per_op_max THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'per_op_exceeded',
      'per_op_max', v_per_op_max, 'credits_needed', p_credits_needed);
  END IF;

  -- Límite diario
  IF (v_budget->>'daily_limit') IS NOT NULL THEN
    v_daily_remaining := (v_budget->>'daily_remaining')::int;
    IF p_credits_needed > v_daily_remaining THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit_reached',
        'daily_remaining', v_daily_remaining, 'credits_needed', p_credits_needed);
    END IF;
  END IF;

  -- Límite mensual
  IF (v_budget->>'monthly_limit') IS NOT NULL THEN
    v_monthly_remaining := (v_budget->>'monthly_remaining')::int;
    IF p_credits_needed > v_monthly_remaining THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'user_monthly_limit_reached',
        'monthly_remaining', v_monthly_remaining, 'credits_needed', p_credits_needed);
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_user_budget(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_user_budget(uuid, uuid, int) TO service_role;

-- ─── 5. Agregar user_id a ai_usage (para tracking por usuario) ───────────────

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON public.ai_usage(user_id, period_month DESC);

COMMENT ON COLUMN public.ai_usage.user_id IS
  'Usuario que ejecutó la operación IA. Permite tracking por usuario para presupuestos.';

COMMENT ON TABLE public.ai_role_limits  IS 'Límites IA por rol dentro de un workspace. Admin puede configurar desde el panel.';
COMMENT ON TABLE public.ai_user_limits  IS 'Override de límites IA por usuario específico. Tiene precedencia sobre ai_role_limits.';
