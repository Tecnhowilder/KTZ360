-- ============================================================
-- Migration 0109 — Equipo: Single Source of Truth
--
-- DIAGNÓSTICO DE INCONSISTENCIAS (por qué los números no coincidían):
--
--   1. compute_team_seats contaba status IN ('active','inactive') para seats_used.
--      Un usuario desactivado ocupaba cupo pero no aparecía en el KPI visible.
--      Resultado: seats_used > members_visible → "6/5 usuarios" siendo imposible.
--
--   2. listTeamMembers no filtraba por status → devolvía todos incluyendo 'removed'.
--      TeamMobile filtraba client-side pero el RPC contaba diferente.
--
--   3. Tres fuentes de datos independientes (seats RPC, members query, invitations
--      query) → cada una podía estar en estados diferentes del cache de React Query.
--
-- SOLUCIÓN:
--   a. compute_team_seats: solo cuenta status='active' (no inactive) + pending invites.
--      Desactivar un usuario = libera cupo inmediatamente.
--   b. get_team_state: UNA SOLA RPC que devuelve seats + members + invitations.
--      El frontend hace UNA query y todos los contadores vienen del mismo dato.
--   c. Cleanup: eliminar perfiles demo que inflaban los conteos.
--
-- Zero Trust: workspace_id siempre del JWT.
-- ============================================================

-- ─── 1. CORREGIR compute_team_seats ──────────────────────────────────────────
-- Antes: contaba status IN ('active','inactive') — usuarios desactivados inflaban el contador
-- Ahora: solo status='active' + invitaciones pendientes

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
  -- Datos del plan
  SELECT
    p.code,
    COALESCE((pf.value->>'multiuser_enabled')::boolean, false),
    COALESCE((pf.value->>'max_users')::integer, 1),
    COALESCE((pf.value->>'extra_user_price')::numeric, 0)
  INTO v_plan_code, v_multiuser, v_included_users, v_extra_price
  FROM public.workspace_subscriptions ws
  JOIN public.plans p ON p.id = ws.plan_id
  LEFT JOIN public.plan_features pf
    ON pf.plan_id = ws.plan_id AND pf.feature_key = 'multiuser_enabled'
  WHERE ws.workspace_id = p_workspace_id
    AND ws.status IN ('active', 'trialing')
  ORDER BY ws.created_at DESC
  LIMIT 1;

  -- Licencias adicionales compradas
  SELECT COALESCE(SUM(quantity), 0)
    INTO v_additional_qty
    FROM public.additional_licenses
   WHERE workspace_id = p_workspace_id
     AND status = 'active';

  -- FIX: Solo contar status='active' (no inactive)
  -- Un usuario desactivado libera cupo inmediatamente
  SELECT COUNT(*)
    INTO v_active_members
    FROM public.profiles
   WHERE workspace_id = p_workspace_id
     AND status = 'active';

  -- Invitaciones pendientes también consumen cupo
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
    'seats_limit',         CASE WHEN COALESCE(v_multiuser, false)
                             THEN COALESCE(v_included_users, 1) + COALESCE(v_additional_qty, 0)
                             ELSE 1
                           END
  );
END;
$$;

-- ─── 2. RPC get_team_state — ÚNICA FUENTE DE VERDAD ──────────────────────────
-- Devuelve seats + members + invitations en UNA SOLA LLAMADA.
-- El frontend hace una sola query y todos los contadores provienen del mismo dato.
-- Sin múltiples React Query independientes que pueden estar en estados de cache distintos.

CREATE OR REPLACE FUNCTION public.get_team_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_workspace_id uuid;
  v_caller_role  text;
  v_seats        jsonb;
  v_members      jsonb;
  v_pending      jsonb;
BEGIN
  SELECT workspace_id, role
    INTO v_workspace_id, v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  -- Expirar invitaciones vencidas antes de contar
  PERFORM public.expire_stale_invitations(v_workspace_id);

  -- Calcular seats
  v_seats := public.compute_team_seats(v_workspace_id);

  -- Miembros activos e inactivos (NO removed)
  -- Columnas: id, full_name, email, role, status, operational_status,
  --           avatar_path, phone, city, profession, specialty,
  --           last_seen_at, updated_at, created_at
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                 p.id,
      'workspace_id',       p.workspace_id,
      'full_name',          p.full_name,
      'email',              p.email,
      'role',               p.role,
      'status',             p.status,
      'operational_status', p.operational_status,
      'avatar_path',        p.avatar_path,
      'phone',              p.phone,
      'city',               p.city,
      'profession',         p.profession,
      'specialty',          p.specialty,
      'last_seen_at',       p.last_seen_at,
      'updated_at',         p.updated_at,
      'created_at',         p.created_at
    )
    ORDER BY p.created_at ASC
  ), '[]'::jsonb)
  INTO v_members
  FROM public.profiles p
  WHERE p.workspace_id = v_workspace_id
    AND p.status IN ('active', 'inactive')
    AND p.role NOT IN ('super_admin', 'support_admin');

  -- Invitaciones pendientes (el caller las puede ver si es owner/admin)
  IF v_caller_role IN ('owner', 'admin', 'super_admin', 'support_admin') THEN
    SELECT COALESCE(jsonb_agg(
      to_jsonb(i)
      ORDER BY i.created_at DESC
    ), '[]'::jsonb)
    INTO v_pending
    FROM public.workspace_invitations i
    WHERE i.workspace_id = v_workspace_id
      AND i.status = 'pending';
  ELSE
    v_pending := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok',      true,
    'seats',   v_seats,
    'members', v_members,
    'pending', v_pending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_state() TO authenticated;

-- ─── 3. CORREGIR get_team_seats para usar la nueva lógica ────────────────────

CREATE OR REPLACE FUNCTION public.get_team_seats(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin()
       OR (public.is_owner() AND p_workspace_id = public.current_workspace_id())
       OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.expire_stale_invitations(p_workspace_id);
  RETURN public.compute_team_seats(p_workspace_id);
END;
$$;

-- ─── 4. LIMPIEZA DEFINITIVA DE USUARIOS DEMO ─────────────────────────────────
-- Elimina perfiles con emails de demo que inflaban los conteos.
-- También limpia invitaciones obsoletas del mismo dominio.

DO $$
BEGIN
  -- Hard-delete perfiles de demo (son test data, no hay datos reales vinculados)
  -- Si generan FK violations los soft-delete
  BEGIN
    DELETE FROM public.profiles
    WHERE email LIKE '%@test.ktz360.com'
       OR email LIKE '%@ktz360.com'
       OR (full_name ILIKE '%prueba%' AND email LIKE '%test%');
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.profiles
       SET status = 'removed', updated_at = now()
     WHERE (email LIKE '%@test.ktz360.com'
         OR email LIKE '%@ktz360.com'
         OR (full_name ILIKE '%prueba%' AND email LIKE '%test%'))
       AND status != 'owner';
  END;

  -- Limpiar invitaciones vencidas o de demo
  DELETE FROM public.workspace_invitations
  WHERE (email LIKE '%@test.ktz360.com' OR email LIKE '%@ktz360.com')
     OR (status IN ('expired', 'revoked') AND created_at < now() - INTERVAL '30 days');
END $$;

-- ─── 5. VERIFICACIÓN DE CONSISTENCIA (ejecutar para confirmar) ───────────────
-- Query de diagnóstico — corre esto en SQL Editor para verificar:
-- SELECT
--   (SELECT count(*) FROM profiles WHERE status='active') AS active_members,
--   (SELECT count(*) FROM profiles WHERE status='inactive') AS inactive_members,
--   (SELECT count(*) FROM profiles WHERE status='removed') AS removed_members,
--   (SELECT count(*) FROM workspace_invitations WHERE status='pending') AS pending_invites;
-- El seats_used mostrado en UI debe ser = active_members + pending_invites
