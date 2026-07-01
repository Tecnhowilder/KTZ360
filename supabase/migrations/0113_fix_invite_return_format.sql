-- ============================================================
-- Migration 0113 — Fix formato de respuesta invite_team_member (8 params)
--
-- Problema: migration 0108 define invite_team_member(8 params) pero retorna
-- to_jsonb(invitation_row) en lugar del formato esperado por el frontend:
--   { ok: true, invitation_id, token, email, role, full_name }
--
-- El frontend team.ts espera ese formato específico (igual al de la versión
-- 4-param de migration 0107). Sin este fix, la función se crea pero el
-- frontend no puede parsear la respuesta.
--
-- Este migration reescribe la función 8-param con el return format correcto.
-- ============================================================

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
  v_caller_id     uuid := auth.uid();
  v_caller_role   text;
  v_caller_ws_id  uuid;
  v_seats         jsonb;
  v_invitation_id uuid;
  v_allowed_roles text[] := ARRAY['admin','supervisor','comercial','operario'];
  v_token         text;
BEGIN
  -- Zero Trust: workspace_id del JWT
  SELECT workspace_id, role
    INTO v_caller_ws_id, v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id;

  -- Verificar que el caller gestiona el workspace correcto
  IF v_caller_ws_id != p_workspace_id
     AND v_caller_role NOT IN ('super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Solo owner/admin/super_admin pueden invitar
  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Feature flag
  IF NOT public.check_feature_access(p_workspace_id, 'multiuser_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available: multiuser_enabled');
  END IF;

  -- Validar rol
  IF NOT (p_role = ANY(v_allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'invalid_role. Permitidos: admin, supervisor, comercial, operario');
  END IF;

  -- Verificar seats disponibles
  v_seats := public.compute_team_seats(p_workspace_id);
  IF (v_seats->>'seats_used')::int >= (v_seats->>'seats_limit')::int THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_limit_exceeded');
  END IF;

  -- Expirar invitaciones viejas
  PERFORM public.expire_stale_invitations(p_workspace_id);

  -- Verificar invitación pendiente duplicada
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations
     WHERE workspace_id = p_workspace_id
       AND email = lower(p_email)
       AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending');
  END IF;

  -- Generar token
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Crear invitación
  INSERT INTO public.workspace_invitations (
    workspace_id, email, role, full_name, token, status,
    phone, city, profession, specialty,
    invited_by, expires_at
  )
  VALUES (
    p_workspace_id, lower(p_email), p_role,
    NULLIF(trim(p_full_name), ''),
    v_token, 'pending',
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_profession), ''),
    NULLIF(p_specialty, ''),
    v_caller_id,
    now() + INTERVAL '7 days'
  )
  RETURNING id INTO v_invitation_id;

  -- Log
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_caller_id, 'invitation_sent', 'workspace_invitations', v_invitation_id,
    jsonb_build_object('email', p_email, 'role', p_role));

  -- *** Retornar en el formato esperado por el frontend ***
  RETURN jsonb_build_object(
    'ok',            true,
    'invitation_id', v_invitation_id,
    'token',         v_token,
    'email',         lower(p_email),
    'role',          p_role,
    'full_name',     COALESCE(trim(p_full_name), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid,text,text,text,text,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.invite_team_member(uuid,text,text,text,text,text,text,text) IS
  '0113: 8-param version con phone/city/profession/specialty. Retorna { ok, invitation_id, token, email, role, full_name }.';
