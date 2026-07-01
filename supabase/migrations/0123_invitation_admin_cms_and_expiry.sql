-- ============================================================================
-- 0123 — invitation_admin_cms_and_expiry
-- ============================================================================
-- Dos cambios solicitados por el usuario:
--
--   1. Expiración de invitaciones: 72 horas → 8 horas. Se redefinen
--      invite_team_member (ambos overloads) y resend_invitation
--      cambiando únicamente el INTERVAL — el resto del cuerpo es idéntico
--      al de las migraciones 0118/0119 (no se tocan validaciones,
--      rate limiting, auditoría, etc.).
--
--   2. CMS de super_admin: visibilidad y gestión de TODAS las invitaciones
--      de TODOS los workspaces, para poder eliminar invitaciones lanzadas
--      por error. Sigue el mismo patrón ya usado en 0016 para
--      workspaces_select_support_admin / subscriptions_select_support_admin
--      (RLS gateada por is_support_admin()/is_super_admin(), SECURITY
--      DEFINER para la acción de revocar con auditoría).
--
-- Zero Trust / Multi-Tenant: el resto de la app sigue viendo únicamente
-- las invitaciones de su propio workspace (políticas existentes de 0020
-- no se tocan). Esta migración solo AGREGA visibilidad cross-tenant para
-- los roles administrativos internos de Shelwi.
-- ============================================================================

-- ─── 1. invite_team_member (4 params) — expiración 8 horas ──────────────────

CREATE OR REPLACE FUNCTION public.invite_team_member(
  p_workspace_id uuid,
  p_email        text,
  p_role         text,
  p_full_name    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid    := auth.uid();
  v_caller_role   text;
  v_seats         jsonb;
  v_seats_limit   integer;
  v_invitation_id uuid;
  v_token         uuid;
  v_recent        integer;
  v_allowed_roles text[]  := ARRAY['admin','supervisor','comercial','operario'];
  v_norm_email    text    := lower(trim(p_email));
BEGIN
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id
     AND workspace_id = p_workspace_id
     AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT public.check_feature_access(p_workspace_id, 'multiuser_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available: multiuser_enabled');
  END IF;

  IF NOT (p_role = ANY(v_allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Rol inválido. Permitidos: admin, supervisor, comercial, operario');
  END IF;

  IF v_norm_email IS NULL OR length(v_norm_email) < 3 OR v_norm_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  SELECT COUNT(*) INTO v_recent
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND created_at > now() - INTERVAL '1 hour';

  IF v_recent >= 20 THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'error',   'rate_limit_exceeded',
      'message', 'Límite alcanzado: máximo 20 invitaciones por hora'
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE p.workspace_id = p_workspace_id
       AND p.status       = 'active'
       AND lower(u.email) = v_norm_email
  ) THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'error',   'user_already_in_workspace',
      'message', 'Este usuario ya pertenece al equipo'
    );
  END IF;

  SELECT id, token INTO v_invitation_id, v_token
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND lower(email)  = v_norm_email
     AND status        = 'pending'
   LIMIT 1;

  IF v_invitation_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',            false,
      'error',         'invitation_already_pending',
      'invitation_id', v_invitation_id,
      'message',       'Ya existe una invitación pendiente para este correo. Usa "Reenviar" para renovarla.'
    );
  END IF;

  v_seats       := public.compute_team_seats(p_workspace_id);
  v_seats_limit := (v_seats->>'seats_limit')::integer;

  IF v_seats_limit IS NOT NULL
     AND (v_seats->>'seats_used')::integer >= v_seats_limit THEN
    RETURN jsonb_build_object(
      'ok',          false,
      'error',       'seat_limit_exceeded',
      'seats_used',  v_seats->'seats_used',
      'seats_limit', v_seats->'seats_limit'
    );
  END IF;

  PERFORM public.expire_stale_invitations(p_workspace_id);

  -- Expiración: 8 horas desde ahora (antes 72h).
  INSERT INTO public.workspace_invitations (
    workspace_id, email, full_name, role, invited_by, expires_at
  )
  VALUES (
    p_workspace_id, v_norm_email, NULLIF(trim(p_full_name), ''), p_role, v_caller_id,
    now() + INTERVAL '8 hours'
  )
  RETURNING id, token INTO v_invitation_id, v_token;

  INSERT INTO public.audit_log (
    workspace_id, user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id, v_caller_id,
    'invitation_sent', 'workspace_invitations', v_invitation_id,
    jsonb_build_object(
      'email',       v_norm_email,
      'role',        p_role,
      'full_name',   p_full_name,
      'invited_by',  v_caller_id,
      'expires_at',  now() + INTERVAL '8 hours',
      'workspace_id', p_workspace_id
    )
  );

  RETURN jsonb_build_object(
    'ok',            true,
    'invitation_id', v_invitation_id,
    'token',         v_token,
    'email',         v_norm_email,
    'role',          p_role,
    'full_name',     NULLIF(trim(p_full_name), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid, text, text, text) TO authenticated;

-- ─── 2. invite_team_member (8 params) — expiración 8 horas ──────────────────

CREATE OR REPLACE FUNCTION public.invite_team_member(
  p_workspace_id uuid,
  p_email        text,
  p_role         text,
  p_full_name    text DEFAULT NULL,
  p_phone        text DEFAULT NULL,
  p_city         text DEFAULT NULL,
  p_profession   text DEFAULT NULL,
  p_specialty    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid    := auth.uid();
  v_caller_role   text;
  v_seats         jsonb;
  v_seats_limit   integer;
  v_invitation_id uuid;
  v_token         uuid;
  v_recent        integer;
  v_allowed_roles text[]  := ARRAY['admin','supervisor','comercial','operario'];
  v_norm_email    text    := lower(trim(p_email));
BEGIN
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id AND workspace_id = p_workspace_id AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT public.check_feature_access(p_workspace_id, 'multiuser_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available: multiuser_enabled');
  END IF;

  IF NOT (p_role = ANY(v_allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Rol inválido. Permitidos: admin, supervisor, comercial, operario');
  END IF;

  IF v_norm_email IS NULL OR length(v_norm_email) < 3 OR v_norm_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  SELECT COUNT(*) INTO v_recent
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND created_at > now() - INTERVAL '1 hour';

  IF v_recent >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit_exceeded',
      'message', 'Límite alcanzado: máximo 20 invitaciones por hora');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.workspace_id = p_workspace_id AND p.status = 'active'
      AND lower(u.email) = v_norm_email
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_already_in_workspace',
      'message', 'Este usuario ya pertenece al equipo');
  END IF;

  SELECT id, token INTO v_invitation_id, v_token
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND lower(email) = v_norm_email AND status = 'pending' LIMIT 1;

  IF v_invitation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending',
      'invitation_id', v_invitation_id,
      'message', 'Ya existe una invitación pendiente para este correo. Usa "Reenviar" para renovarla.');
  END IF;

  v_seats       := public.compute_team_seats(p_workspace_id);
  v_seats_limit := (v_seats->>'seats_limit')::integer;

  IF v_seats_limit IS NOT NULL
     AND (v_seats->>'seats_used')::integer >= v_seats_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_limit_exceeded',
      'seats_used', v_seats->'seats_used', 'seats_limit', v_seats->'seats_limit');
  END IF;

  PERFORM public.expire_stale_invitations(p_workspace_id);

  -- Expiración: 8 horas desde ahora (antes 72h).
  INSERT INTO public.workspace_invitations (
    workspace_id, email, full_name, role, invited_by, expires_at,
    phone, city, profession, specialty
  )
  VALUES (
    p_workspace_id, v_norm_email,
    NULLIF(trim(p_full_name), ''), p_role, v_caller_id,
    now() + INTERVAL '8 hours',
    NULLIF(trim(p_phone), ''), NULLIF(trim(p_city), ''),
    NULLIF(trim(p_profession), ''), NULLIF(p_specialty, '')
  )
  RETURNING id, token INTO v_invitation_id, v_token;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_workspace_id, v_caller_id,
    'invitation_sent', 'workspace_invitations', v_invitation_id,
    jsonb_build_object(
      'email', v_norm_email, 'role', p_role,
      'full_name', p_full_name, 'city', p_city, 'specialty', p_specialty,
      'invited_by', v_caller_id, 'expires_at', now() + INTERVAL '8 hours'
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'invitation_id', v_invitation_id,
    'token', v_token, 'email', v_norm_email,
    'role', p_role, 'full_name', NULLIF(trim(p_full_name), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid,text,text,text,text,text,text,text) TO authenticated;

-- ─── 3. resend_invitation — expiración 8 horas ───────────────────────────────

CREATE OR REPLACE FUNCTION public.resend_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_inv         public.workspace_invitations;
  v_new_token   uuid;
  v_ip          text := public._get_request_ip();
BEGIN
  SELECT * INTO v_inv FROM public.workspace_invitations WHERE id = p_invitation_id;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id AND workspace_id = v_inv.workspace_id AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  PERFORM public.expire_stale_invitations(v_inv.workspace_id);
  SELECT * INTO v_inv FROM public.workspace_invitations WHERE id = p_invitation_id;

  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending', 'status', v_inv.status);
  END IF;

  v_new_token := gen_random_uuid();

  -- Expiración: 8 horas desde ahora (antes 72h).
  UPDATE public.workspace_invitations
     SET token      = v_new_token,
         expires_at = now() + INTERVAL '8 hours'
   WHERE id = p_invitation_id
  RETURNING * INTO v_inv;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id, v_caller_id,
    'invitation_resent', 'workspace_invitations', v_inv.id,
    jsonb_build_object(
      'email',       v_inv.email,
      'role',        v_inv.role,
      'resent_by',   v_caller_id,
      'new_expires', now() + INTERVAL '8 hours',
      'ip',          v_ip
    )
  );

  RETURN jsonb_build_object(
    'ok',            true,
    'invitation_id', v_inv.id,
    'token',         v_new_token,
    'email',         v_inv.email,
    'role',          v_inv.role,
    'full_name',     v_inv.full_name,
    'expires_at',    v_inv.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_invitation(uuid) TO authenticated;

-- Alinear el DEFAULT de columna también (defensivo — invite_team_member ya
-- siempre setea expires_at explícitamente, pero evita confusión futura si
-- algún INSERT manual confía en el default).
ALTER TABLE public.workspace_invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '8 hours');

-- ============================================================================
-- 4. CMS de super_admin — visibilidad y gestión cross-workspace
-- ============================================================================

-- Mismo patrón que workspaces_select_support_admin (0016): RLS adicional,
-- NO reemplaza las políticas existentes que ya dan acceso al propio workspace.
DO $$ BEGIN
  CREATE POLICY "workspace_invitations_select_admin_panel"
    ON public.workspace_invitations
    FOR SELECT
    TO authenticated
    USING (public.is_super_admin() OR public.is_support_admin());
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy workspace_invitations_select_admin_panel already exists — skipping';
END $$;

-- Revocar cualquier invitación de cualquier workspace. Solo super_admin
-- (support_admin es de solo lectura, igual que en el resto del backoffice).
-- No hace DELETE — solo cambia status, igual que el resto del sistema
-- (nunca se borra una invitación, queda trazable en audit_log/history).
CREATE OR REPLACE FUNCTION public.admin_revoke_invitation(
  p_invitation_id uuid,
  p_reason        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_inv       public.workspace_invitations;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_inv FROM public.workspace_invitations WHERE id = p_invitation_id;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending', 'status', v_inv.status);
  END IF;

  UPDATE public.workspace_invitations
     SET status = 'revoked'
   WHERE id = p_invitation_id;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id, v_caller_id,
    'invitation_revoked_by_admin', 'workspace_invitations', v_inv.id,
    jsonb_build_object(
      'email',          v_inv.email,
      'role',           v_inv.role,
      'reason',         p_reason,
      'revoked_by',     v_caller_id,
      'original_invited_by', v_inv.invited_by
    )
  );

  RETURN jsonb_build_object('ok', true, 'invitation_id', v_inv.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_invitation(uuid, text) TO authenticated;
