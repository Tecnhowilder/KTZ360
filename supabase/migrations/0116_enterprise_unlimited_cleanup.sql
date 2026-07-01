-- ============================================================
-- Migration 0116 — Enterprise ilimitado + Limpieza de invitaciones
--
-- 1. Enterprise: included_users = 9999 (ilimitado en UI)
-- 2. Limpiar invitaciones pendientes del workspace de prueba
-- 3. compute_team_seats: manejar 9999 como ilimitado
-- ============================================================

-- ─── 1. ENTERPRISE = USUARIOS ILIMITADOS ──────────────────────────────────────
-- Usamos 9999 en lugar de NULL para que el CASE/cálculo de seats funcione sin
-- necesidad de manejar NULL en el frontend.

UPDATE public.plan_limits
   SET included_users = 9999,
       updated_at     = now()
 WHERE plan_code = 'enterprise';

-- ─── 2. LIMPIAR INVITACIONES PENDIENTES ───────────────────────────────────────
-- Cancela TODAS las invitaciones actualmente en estado 'pending' para dejar el
-- contador de cupos limpio. Los usuarios ya activos NO se ven afectados.
-- Después de esto, seats_used = solo miembros activos (sin pendientes).

UPDATE public.workspace_invitations
   SET status = 'revoked'
 WHERE status = 'pending';

-- ─── 3. compute_team_seats: manejar 9999 como cupo ilimitado ─────────────────
-- Cuando included_users = 9999, devolvemos 9999 como seats_limit.
-- El frontend muestra "Ilimitado" cuando seats_limit >= 9999.

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
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  SELECT
    COALESCE(pf.multiuser_enabled, false),
    COALESCE(pl.included_users, 1),
    COALESCE(pl.extra_user_price, 0)
  INTO v_multiuser, v_included_users, v_extra_price
  FROM public.plan_features pf
  JOIN public.plan_limits   pl ON pl.plan_code = pf.plan_code
  WHERE pf.plan_code = v_plan_code;

  BEGIN
    SELECT COALESCE(SUM(quantity), 0)
      INTO v_additional_qty
      FROM public.additional_licenses
     WHERE workspace_id = p_workspace_id
       AND status = 'active';
  EXCEPTION WHEN undefined_table THEN
    v_additional_qty := 0;
  END;

  SELECT COUNT(*) INTO v_active_members
    FROM public.profiles
   WHERE workspace_id = p_workspace_id AND status = 'active';

  SELECT COUNT(*) INTO v_pending_invites
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id AND status = 'pending';

  RETURN jsonb_build_object(
    'plan_code',           COALESCE(v_plan_code, 'free'),
    'multiuser_enabled',   COALESCE(v_multiuser, false),
    'included_users',      COALESCE(v_included_users, 1),
    'extra_user_price',    COALESCE(v_extra_price, 0),
    'additional_licenses', v_additional_qty,
    'active_members',      v_active_members,
    'pending_invites',     v_pending_invites,
    'seats_used',          v_active_members + v_pending_invites,
    -- 9999 = ilimitado (Enterprise). El frontend muestra "∞" cuando >= 9999.
    'seats_limit',         CASE
                             WHEN NOT COALESCE(v_multiuser, false) THEN 1
                             WHEN COALESCE(v_included_users, 1) >= 9999 THEN 9999
                             ELSE COALESCE(v_included_users, 1) + v_additional_qty
                           END
  );
END;
$$;
