-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0134: Admin Support RPCs — Gestión cross-workspace de sesiones,
--            tokens push, actividad de usuario y revocaciones.
-- ════════════════════════════════════════════════════════════════════════════
-- RPCs nuevas:
--   admin_get_user_sessions(user_id)        → sesiones activas e históricas del usuario
--   admin_revoke_user_session(session_id)   → revocar una sesión específica (cross-ws)
--   admin_revoke_all_user_sessions(user_id) → revocar todas las sesiones del usuario
--   admin_get_user_push_tokens(user_id)     → tokens FCM/APNs del usuario
--   admin_revoke_push_token(token_id)       → desactivar un push token específico
--   admin_get_user_activity(user_id, limit) → historial de audit_log del usuario
--
-- Zero Trust:
--   • Toda RPC verifica is_support_admin() del caller — no acepta params de rol
--   • workspace_id del caller viene del JWT (admin_audit lo extrae)
--   • Operaciones cross-workspace usando SECURITY DEFINER (sin bypassar RLS del caller)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. admin_get_user_sessions ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user_sessions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rows   jsonb;
BEGIN
  -- Solo support_admin o super_admin
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           s.id,
    'workspace_id', s.workspace_id,
    'workspace_name', w.name,
    'device_id',    s.device_id,
    'device_name',  s.device_name,
    'user_agent',   s.user_agent,
    'ip',           s.ip,
    'last_seen_at', s.last_seen_at,
    'created_at',   s.created_at,
    'revoked_at',   s.revoked_at,
    'revoke_reason',s.revoke_reason,
    'is_active',    (s.revoked_at IS NULL)
  ) ORDER BY s.last_seen_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_rows
  FROM public.active_sessions s
  LEFT JOIN public.workspaces w ON w.id = s.workspace_id
  WHERE s.user_id = p_user_id;

  PERFORM public.admin_audit(
    'admin_viewed_user_sessions', 'active_sessions', p_user_id::text, '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true, 'sessions', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_user_sessions(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_get_user_sessions(uuid) IS 'Admin: lista todas las sesiones (activas e históricas) de un usuario. Requiere support_admin.';

-- ─── 2. admin_revoke_user_session ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_user_session(
  p_session_id uuid,
  p_reason     text DEFAULT 'admin_action'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_session record;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT * INTO v_session FROM public.active_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no encontrada');
  END IF;

  IF v_session.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La sesión ya está revocada');
  END IF;

  UPDATE public.active_sessions
  SET revoked_at = now(), revoke_reason = p_reason
  WHERE id = p_session_id;

  PERFORM public.admin_audit(
    'admin_session_revoked', 'active_sessions', p_session_id::text,
    jsonb_build_object(
      'target_user_id', v_session.user_id,
      'device_name',    v_session.device_name,
      'reason',         p_reason
    )
  );

  RETURN jsonb_build_object('ok', true, 'message', 'Sesión revocada. El usuario será desconectado en la próxima validación de heartbeat.');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_session(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.admin_revoke_user_session(uuid, text) IS 'Admin: revoca una sesión específica de cualquier usuario. Requiere support_admin.';

-- ─── 3. admin_revoke_all_user_sessions ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_all_user_sessions(
  p_user_id uuid,
  p_reason  text DEFAULT 'admin_force_logout'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count  int;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  UPDATE public.active_sessions
  SET revoked_at = now(), revoke_reason = p_reason
  WHERE user_id = p_user_id AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.admin_audit(
    'admin_all_sessions_revoked', 'active_sessions', p_user_id::text,
    jsonb_build_object('sessions_revoked', v_count, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'revoked', v_count, 'message', format('%s sesión(es) revocada(s).', v_count));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_user_sessions(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.admin_revoke_all_user_sessions(uuid, text) IS 'Admin: cierra todas las sesiones activas de un usuario. Requiere support_admin.';

-- ─── 4. admin_get_user_push_tokens ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user_push_tokens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',            t.id,
    'workspace_id',  t.workspace_id,
    'workspace_name',w.name,
    'platform',      t.platform,
    'device_id',     t.device_id,
    'app_version',   t.app_version,
    'is_active',     t.is_active,
    'registered_at', t.registered_at,
    'last_used_at',  t.last_used_at
  ) ORDER BY t.registered_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.push_tokens t
  LEFT JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE t.user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'tokens', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_user_push_tokens(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_get_user_push_tokens(uuid) IS 'Admin: lista todos los push tokens de un usuario. Requiere support_admin.';

-- ─── 5. admin_revoke_push_token ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_push_token(p_token_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token record;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT * INTO v_token FROM public.push_tokens WHERE id = p_token_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token no encontrado');
  END IF;

  UPDATE public.push_tokens SET is_active = false WHERE id = p_token_id;

  PERFORM public.admin_audit(
    'admin_push_token_revoked', 'push_tokens', p_token_id::text,
    jsonb_build_object(
      'target_user_id', v_token.user_id,
      'platform',       v_token.platform,
      'device_id',      v_token.device_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'message', 'Token push revocado. El dispositivo no recibirá más notificaciones.');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_push_token(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_revoke_push_token(uuid) IS 'Admin: desactiva un push token específico. Requiere support_admin.';

-- ─── 6. admin_get_user_activity ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user_activity(
  p_user_id uuid,
  p_limit   int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',          a.id,
    'workspace_id',a.workspace_id,
    'workspace_name', w.name,
    'action',      a.action,
    'entity_type', a.entity_type,
    'entity_id',   a.entity_id,
    'metadata',    a.metadata,
    'created_at',  a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.audit_log a
  LEFT JOIN public.workspaces w ON w.id = a.workspace_id
  WHERE a.user_id = p_user_id
  LIMIT p_limit;

  RETURN jsonb_build_object('ok', true, 'activity', COALESCE(v_rows, '[]'::jsonb), 'limit', p_limit);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity(uuid, int) TO authenticated;
COMMENT ON FUNCTION public.admin_get_user_activity(uuid, int) IS 'Admin: historial de actividad de un usuario desde audit_log. Requiere support_admin.';
