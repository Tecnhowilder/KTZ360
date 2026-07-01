-- ============================================================
-- Migration 0114 — Crear tabla additional_licenses + fix compute_team_seats
--
-- Problema: compute_team_seats (migration 0112) referencia
-- public.additional_licenses que no existe → ERROR 42P01
-- (relation "public.additional_licenses" does not exist)
--
-- Solución:
--   1. Crear additional_licenses si no existe
--   2. Reescribir compute_team_seats con manejo resiliente de la tabla
-- ============================================================

-- ─── 1. TABLA additional_licenses ────────────────────────────────────────────
-- Registra licencias de usuario adicionales compradas por un workspace.
-- Por defecto: 0 licencias adicionales (el plan base ya incluye included_users).

CREATE TABLE IF NOT EXISTS public.additional_licenses (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid          NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  quantity     integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price        numeric(12,2) NOT NULL DEFAULT 0,
  status       text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.additional_licenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "workspace_isolation" ON public.additional_licenses
    USING (workspace_id = public.current_workspace_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice
CREATE INDEX IF NOT EXISTS idx_additional_licenses_workspace
  ON public.additional_licenses(workspace_id)
  WHERE status = 'active';

-- ─── 2. compute_team_seats RESILIENTE ────────────────────────────────────────
-- Igual que la versión de 0112 pero con manejo de excepción si
-- additional_licenses no existe (entornos sin la tabla migrada).

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
  v_additional_qty  integer := 0;
  v_active_members  integer;
  v_pending_invites integer;
BEGIN
  -- get_effective_plan_code ya usa la tabla correcta (subscriptions)
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

  -- Licencias adicionales — resiliente si la tabla no existe
  BEGIN
    SELECT COALESCE(SUM(quantity), 0)
      INTO v_additional_qty
      FROM public.additional_licenses
     WHERE workspace_id = p_workspace_id
       AND status = 'active';
  EXCEPTION WHEN undefined_table THEN
    v_additional_qty := 0;
  END;

  -- Miembros activos
  SELECT COUNT(*)
    INTO v_active_members
    FROM public.profiles
   WHERE workspace_id = p_workspace_id
     AND status = 'active';

  -- Invitaciones pendientes (consumen cupo)
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
    'additional_licenses', v_additional_qty,
    'active_members',      v_active_members,
    'pending_invites',     v_pending_invites,
    'seats_used',          v_active_members + v_pending_invites,
    'seats_limit',         CASE
                             WHEN COALESCE(v_multiuser, false)
                             THEN COALESCE(v_included_users, 1) + v_additional_qty
                             ELSE 1
                           END
  );
END;
$$;
