-- ============================================================================
-- 0107 — invite_team_member_return_token: Retornar token + full_name en RPC
-- ============================================================================
-- Bug: el RPC invite_team_member solo retornaba invitation_id, email, role.  
-- El token (necesario para la URL de invitación) quedaba undefined en el
-- frontend → send-email recibía token=undefined → 400 Bad Request.
-- Fix: retornar también el token y el full_name generados en DB.
-- Zero Trust: el token es read-only, se genera en el servidor.
-- ============================================================================

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
  v_caller_id     uuid := auth.uid();
  v_caller_role   text;
  v_seats         jsonb;
  v_invitation_id uuid;
  v_token         uuid;
  v_allowed_roles text[] := ARRAY['admin','supervisor','comercial','operario'];
BEGIN
  -- Validar rol permitido
  IF NOT (p_role = ANY(v_allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Rol inválido. Permitidos: admin, supervisor, comercial, operario');
  END IF;

  -- Solo owner/admin pueden invitar
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id AND workspace_id = p_workspace_id AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Feature gating: multiuser_enabled (PREMIUM)
  IF NOT public.check_feature_access(p_workspace_id, 'multiuser_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available');
  END IF;

  -- Verificar cuota de asientos
  v_seats := public.get_team_seats(p_workspace_id);
  IF (v_seats->>'seats_used')::int >= (v_seats->>'seats_limit')::int THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_limit_exceeded',
      'seats_used', v_seats->'seats_used', 'seats_limit', v_seats->'seats_limit');
  END IF;

  -- Validar email
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  -- Revocar invitaciones pendientes previas del mismo email
  UPDATE public.workspace_invitations
  SET status = 'revoked'
  WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(trim(p_email))
    AND status = 'pending';

  -- Crear nueva invitación y capturar id + token
  INSERT INTO public.workspace_invitations
    (workspace_id, email, full_name, role, invited_by)
  VALUES
    (p_workspace_id, lower(trim(p_email)), p_full_name, p_role, v_caller_id)
  RETURNING id, token INTO v_invitation_id, v_token;

  -- Log de auditoría
  INSERT INTO public.audit_log
    (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_workspace_id, v_caller_id,
    'invited', 'workspace_invitations', v_invitation_id,
    jsonb_build_object('email', p_email, 'role', p_role, 'performed_by', v_caller_id)
  );

  -- FIX: retornar token para que el frontend pueda construir la URL de invitación
  RETURN jsonb_build_object(
    'ok',            true,
    'invitation_id', v_invitation_id,
    'token',         v_token,          -- ← NUEVO: necesario para send-email
    'email',         p_email,
    'role',          p_role,
    'full_name',     p_full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid, text, text, text) TO authenticated;

-- Especificar la firma exacta para evitar error 42725 si en el futuro existen overloads
COMMENT ON FUNCTION public.invite_team_member(uuid, text, text, text) IS
  '0107 fix: retorna token en la respuesta para construir URL de invitación. Antes era undefined.';
