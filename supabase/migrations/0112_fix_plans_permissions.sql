-- ============================================================
-- Migration 0112 — Fix Sistema de Planes y Permisos
--
-- CAUSA RAÍZ DEL BUG "Actualizar a PREMIUM" para usuarios PREMIUM:
--   compute_team_seats() en migration 0109 tiene errores fatales de esquema:
--   1. Referencia 'workspace_subscriptions' (no existe → es 'subscriptions')
--   2. JOIN plan_features ON pf.plan_id (no existe → PK es plan_code)
--   3. pf.value->>'multiuser_enabled' trata booleano como JSONB
--   Resultado: SELECT falla silenciosamente → NULL coalesced a false
--   → multiuser_enabled siempre false → todos ven UpgradeLocked
--
-- FIXES EN ESTA MIGRACIÓN:
--   1. compute_team_seats() corregida usando get_effective_plan_code() (que SÍ funciona)
--   2. Columnas faltantes en plan_features: gps_enabled, orders_enabled, etc.
--   3. check_feature_access() extendida para reconocer todos los feature flags
--   4. Valores por plan según matriz oficial
--   5. get_team_seats() simplificada para no requerir permisos de owner
--
-- Zero Trust: workspace_id siempre del JWT.
-- ============================================================

-- ─── 1. COLUMNAS FALTANTES EN plan_features ──────────────────────────────────
-- El frontend usa estos feature flags pero no existían como columnas.
-- Sin ellos, check_feature_access lanzaba 'invalid_feature' → error capturado
-- silenciosamente → módulo aparecía disponible (permissive by accident).

ALTER TABLE public.plan_features
  ADD COLUMN IF NOT EXISTS quote_editing_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gps_enabled            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orders_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_orders_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_enabled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pipeline_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automation_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_enabled        boolean NOT NULL DEFAULT false;

-- ─── 2. MATRIZ OFICIAL DE PERMISOS POR PLAN ──────────────────────────────────
--
-- FREE:     Cotizaciones básicas, clientes, catálogo, dashboard
-- PRO:      + Pedidos, OTs, GPS, Storage, Pipeline, reportes avanzados, IA
-- PREMIUM:  + Equipo/multiuser, Automatizaciones, Webhooks, foto-cotización
-- ENTERPRISE: Todo PREMIUM (mayor capacidad)
--
-- Regla: si el módulo está en tu plan → nunca ves "Actualizar a X"

-- FREE: solo funciones básicas
UPDATE public.plan_features SET
  quote_editing_enabled  = true,     -- siempre habilitado
  templates_enabled      = false,
  branding_enabled       = false,
  custom_qr_enabled      = false,
  advanced_reports_enabled = false,
  ai_enabled             = false,
  photo_quote_enabled    = false,
  gps_enabled            = false,
  orders_enabled         = false,
  work_orders_enabled    = false,
  storage_enabled        = false,
  pipeline_enabled       = false,
  multiuser_enabled      = false,
  automation_enabled     = false,
  webhook_enabled        = false,
  pdf_tier               = 'free'
WHERE plan_code = 'free';

-- PRO: CRM + operaciones básicas (sin equipo/multiuser)
UPDATE public.plan_features SET
  quote_editing_enabled  = true,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  ai_enabled             = true,     -- con límite de créditos
  photo_quote_enabled    = false,    -- PREMIUM only
  gps_enabled            = true,
  orders_enabled         = true,
  work_orders_enabled    = true,
  storage_enabled        = true,
  pipeline_enabled       = true,
  multiuser_enabled      = false,    -- PREMIUM only
  automation_enabled     = false,    -- PREMIUM only
  webhook_enabled        = false,    -- PREMIUM only
  pdf_tier               = 'pro'
WHERE plan_code = 'pro';

-- PREMIUM: todo lo operativo + equipo + automatizaciones
UPDATE public.plan_features SET
  quote_editing_enabled  = true,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  ai_enabled             = true,
  photo_quote_enabled    = true,
  gps_enabled            = true,
  orders_enabled         = true,
  work_orders_enabled    = true,
  storage_enabled        = true,
  pipeline_enabled       = true,
  multiuser_enabled      = true,     -- ← KEY: debe ser TRUE
  automation_enabled     = true,
  webhook_enabled        = true,
  pdf_tier               = 'pro'
WHERE plan_code = 'premium';

-- ENTERPRISE: todo PREMIUM (mismo feature set, más capacidad)
UPDATE public.plan_features SET
  quote_editing_enabled  = true,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  ai_enabled             = true,
  photo_quote_enabled    = true,
  gps_enabled            = true,
  orders_enabled         = true,
  work_orders_enabled    = true,
  storage_enabled        = true,
  pipeline_enabled       = true,
  multiuser_enabled      = true,
  automation_enabled     = true,
  webhook_enabled        = true,
  pdf_tier               = 'pro'       -- enterprise usa el mismo tier PDF que premium
WHERE plan_code = 'enterprise';

-- ─── 3. check_feature_access() EXTENDIDA ────────────────────────────────────
-- Antes: solo reconocía 7 features → lanzaba 'invalid_feature' para el resto
-- Ahora: reconoce todos los features de la matriz oficial
-- Approach: en lugar de una lista hardcodeada, verificar que la columna exista

CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_workspace_id uuid,
  p_feature      text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_value     boolean;
  v_col_exists boolean;
BEGIN
  -- Verificar acceso al workspace
  IF p_workspace_id <> public.current_workspace_id()
     AND NOT public.is_support_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Super admin: acceso total
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- Verificar que la columna exista en plan_features
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'plan_features'
      AND column_name  = p_feature
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    -- Feature no implementada → no disponible (secure by default, no error)
    RETURN false;
  END IF;

  -- Obtener el plan vigente del workspace
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  -- Leer el valor de la columna de forma dinámica
  EXECUTE format(
    'SELECT %I FROM public.plan_features WHERE plan_code = $1',
    p_feature
  )
  INTO v_value
  USING v_plan_code;

  RETURN COALESCE(v_value, false);
END;
$$;

-- ─── 4. compute_team_seats() CORREGIDA ───────────────────────────────────────
-- BUG en migration 0109: usaba workspace_subscriptions (no existe),
-- plan_features.plan_id (no existe), pf.value (no es JSONB).
-- FIX: usar get_effective_plan_code() + JOIN correcto a plan_features/plan_limits

CREATE OR REPLACE FUNCTION public.compute_team_seats(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code       text;
  v_multiuser       boolean;
  v_included_users  integer;
  v_extra_price     numeric;
  v_additional_qty  integer;
  v_active_members  integer;
  v_pending_invites integer;
BEGIN
  -- get_effective_plan_code() ya usa la tabla correcta (subscriptions)
  -- y devuelve el plan vigente. Es la misma función que check_feature_access usa.
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  -- Obtener features y límites de las tablas correctas
  SELECT
    COALESCE(pf.multiuser_enabled, false),
    COALESCE(pl.included_users, 1),
    COALESCE(pl.extra_user_price, 0)
  INTO v_multiuser, v_included_users, v_extra_price
  FROM public.plan_features pf
  JOIN public.plan_limits   pl ON pl.plan_code = pf.plan_code
  WHERE pf.plan_code = v_plan_code;

  -- Licencias adicionales compradas por el workspace
  SELECT COALESCE(SUM(quantity), 0)
    INTO v_additional_qty
    FROM public.additional_licenses
   WHERE workspace_id = p_workspace_id
     AND status = 'active';

  -- Miembros activos (solo status='active', excluyendo removed/inactive)
  SELECT COUNT(*)
    INTO v_active_members
    FROM public.profiles
   WHERE workspace_id = p_workspace_id
     AND status = 'active';

  -- Invitaciones pendientes (también consumen cupo)
  SELECT COUNT(*)
    INTO v_pending_invites
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND status = 'pending';

  RETURN jsonb_build_object(
    'plan_code',           COALESCE(v_plan_code, 'free'),
    'multiuser_enabled',   COALESCE(v_multiuser, false),
    'included_users',      COALESCE(v_included_users, 1),
    'extra_user_price',    COALESCE(v_extra_price, 0),
    'additional_licenses', COALESCE(v_additional_qty, 0),
    'active_members',      v_active_members,
    'pending_invites',     v_pending_invites,
    'seats_used',          v_active_members + v_pending_invites,
    'seats_limit',         CASE
                             WHEN COALESCE(v_multiuser, false)
                             THEN COALESCE(v_included_users, 1) + COALESCE(v_additional_qty, 0)
                             ELSE 1
                           END
  );
END;
$$;

-- ─── 5. get_team_seats() — accesible para owner Y admin ─────────────────────
-- Antes: solo owner o super_admin podían llamarla
-- Ahora: también admin (necesario para la vista de TeamMobile con rol admin)

CREATE OR REPLACE FUNCTION public.get_team_seats(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = auth.uid() AND workspace_id = p_workspace_id;

  IF NOT (public.is_super_admin()
       OR v_role IN ('owner', 'admin')
       OR public.is_support_admin())
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.expire_stale_invitations(p_workspace_id);
  RETURN public.compute_team_seats(p_workspace_id);
END;
$$;

-- ─── 6. VERIFICACIÓN (correr en SQL Editor para confirmar) ───────────────────
-- SELECT compute_team_seats(
--   (SELECT workspace_id FROM profiles WHERE role='owner' LIMIT 1)
-- );
-- Debe retornar: { "multiuser_enabled": true, "included_users": 5, ... }
-- para un workspace con plan PREMIUM.
