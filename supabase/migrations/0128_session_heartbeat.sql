-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0128: session_heartbeat — fusión de update_presence + check_session_valid
-- ════════════════════════════════════════════════════════════════════════════
-- Antes: usePresence llamaba update_presence() cada 30 s (UPDATE profiles)
--         useSessionGuard llamaba check_session_valid() cada 30 s
--         (SELECT active_sessions + UPDATE active_sessions)
--         Total: 4 ops de DB cada 30 s por usuario activo.
--
-- Ahora: session_heartbeat() hace todo en una sola llamada:
--        1. UPDATE profiles SET last_seen_at (visibility en el equipo)
--        2. SELECT + UPDATE active_sessions (validar y registrar heartbeat)
--        Total: 1 llamada RPC → 2 writes por 30 s por usuario activo.
--
-- Backward compatible: update_presence() y check_session_valid() siguen
-- existiendo para compatibilidad; session_heartbeat() los reemplaza en cliente.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.session_heartbeat(uuid, text);

CREATE OR REPLACE FUNCTION public.session_heartbeat(
  p_workspace_id uuid,
  p_device_id    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_auth');
  END IF;

  -- 1. Actualizar presencia en profiles (visible en mapa del equipo)
  UPDATE public.profiles
     SET last_seen_at = now(), updated_at = now()
   WHERE id = v_user_id;

  -- 2. Verificar y actualizar sesión activa
  SELECT * INTO v_session
    FROM public.active_sessions
   WHERE user_id     = v_user_id
     AND workspace_id = p_workspace_id
     AND device_id   = p_device_id
   LIMIT 1;

  IF NOT FOUND THEN
    -- Sin sesión registrada → usuario con login previo a Sprint 24 → ok, no revocar
    RETURN jsonb_build_object('valid', true, 'reason', 'legacy_session');
  END IF;

  IF v_session.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid',         false,
      'reason',        'session_revoked',
      'revoke_reason', v_session.revoke_reason,
      'revoked_at',    v_session.revoked_at
    );
  END IF;

  -- 3. Heartbeat en sesión activa
  UPDATE public.active_sessions
     SET last_seen_at = now()
   WHERE user_id = v_user_id AND device_id = p_device_id;

  RETURN jsonb_build_object('valid', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.session_heartbeat(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.session_heartbeat(uuid, text)
  IS 'IT-5: reemplaza update_presence() + check_session_valid() en una sola llamada. '
     'Actualiza profiles.last_seen_at y active_sessions.last_seen_at, y valida que '
     'la sesión no esté revocada. Backward compatible: funciones previas siguen activas.';
