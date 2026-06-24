-- ============================================================================
-- 0101 — active_sessions: Session Security Zero Trust Sprint 24
-- ============================================================================
-- PROBLEMA: 1 licencia = N sesiones concurrentes abusivas
-- SOLUCIÓN: active_sessions + create_session() + validate_session() + heartbeat
--
-- MODELO:
--   Una licencia = una sesión activa por usuario (configurable en ENTERPRISE)
--   Login nuevo → revocar sesiones anteriores (plan FREE/PRO/PREMIUM)
--   ENTERPRISE → configurable (max_sessions en workspace_settings)
--
-- FLUJO:
--   1. Usuario hace signIn() → JWT de Supabase
--   2. Frontend llama create_session(device_id, device_name, user_agent)
--   3. Backend revoca sesiones anteriores si plan lo requiere
--   4. Frontend subscribe a Realtime o usa heartbeat para detectar revocación
--   5. Si sesión revocada → signOut() inmediato
-- ============================================================================

-- ─── 1. Tabla active_sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text        NOT NULL,      -- UUID v4 generado en cliente, guardado en localStorage
  device_name   text,                      -- "iPhone 14 Pro", "Chrome / Windows 11", etc.
  ip            text,                      -- IP del cliente (desde frontend o edge function)
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,               -- NULL = activa | NOT NULL = revocada
  revoke_reason text                       -- 'new_login' | 'admin_revoke' | 'logout' | 'expired'
);

COMMENT ON TABLE public.active_sessions IS
  'Sprint 24: Sesiones activas por usuario/workspace. Zero Trust: 1 licencia = 1 sesión activa.';
COMMENT ON COLUMN public.active_sessions.device_id IS
  'UUID v4 generado en el cliente y persistido en localStorage. Identifica el dispositivo sin datos personales.';
COMMENT ON COLUMN public.active_sessions.revoked_at IS
  'NULL = sesión activa. NOT NULL = sesión revocada. El frontend debe hacer signOut() al detectar revocación.';

-- ─── 2. Índices de sesiones ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_active
  ON public.active_sessions(user_id, workspace_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_sessions_workspace_active
  ON public.active_sessions(workspace_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_sessions_device
  ON public.active_sessions(user_id, device_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen
  ON public.active_sessions(last_seen_at)
  WHERE revoked_at IS NULL;

-- ─── 3. RLS — active_sessions ─────────────────────────────────────────────────

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve solo sus propias sesiones activas
CREATE POLICY "users see own sessions"
  ON public.active_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Solo backend (service_role) puede insertar/actualizar/eliminar
CREATE POLICY "service_role manage sessions"
  ON public.active_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 4. RPC: crear sesión al login ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_session(
  p_device_id   text,
  p_device_name text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_workspace_id   uuid;
  v_plan_code      text;
  v_max_sessions   int;
  v_session_id     uuid;
  v_revoked_count  int;
BEGIN
  -- Validar autenticación
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_id requerido');
  END IF;

  -- Obtener workspace del usuario
  SELECT workspace_id INTO v_workspace_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Workspace no encontrado');
  END IF;

  -- Obtener plan
  v_plan_code := public.get_effective_plan_code(v_workspace_id);

  -- Determinar máximo de sesiones simultáneas por usuario según plan
  v_max_sessions := CASE v_plan_code
    WHEN 'free'       THEN 1
    WHEN 'pro'        THEN 1
    WHEN 'premium'    THEN 1   -- 1 por usuario (cada usuario tiene 1 sesión)
    WHEN 'enterprise' THEN 3   -- configurable; default 3 para enterprise
    ELSE 1
  END;

  -- Si el device_id ya tiene una sesión activa para este usuario,
  -- actualizarla en vez de crear una nueva (reconexión del mismo device)
  UPDATE public.active_sessions SET
    last_seen_at = now(),
    ip           = COALESCE(p_ip, ip),
    user_agent   = COALESCE(p_user_agent, user_agent)
  WHERE user_id   = v_user_id
    AND device_id = p_device_id
    AND revoked_at IS NULL
  RETURNING id INTO v_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',         true,
      'session_id', v_session_id,
      'action',     'resumed',
      'plan',       v_plan_code
    );
  END IF;

  -- Contar sesiones activas actuales del usuario
  -- Si supera el límite, revocar las más antiguas
  SELECT COUNT(*) INTO v_revoked_count
  FROM public.active_sessions
  WHERE user_id     = v_user_id
    AND revoked_at  IS NULL;

  IF v_revoked_count >= v_max_sessions THEN
    -- Revocar sesiones más antiguas dejando espacio para la nueva
    -- Para planes 1-sesión: revoca TODAS
    UPDATE public.active_sessions SET
      revoked_at    = now(),
      revoke_reason = 'new_login'
    WHERE user_id    = v_user_id
      AND revoked_at IS NULL
      AND id IN (
        SELECT id FROM public.active_sessions
        WHERE user_id    = v_user_id
          AND revoked_at IS NULL
        ORDER BY last_seen_at ASC   -- revoca las más inactivas primero
        LIMIT v_revoked_count - v_max_sessions + 1
      );
  END IF;

  -- Crear nueva sesión
  INSERT INTO public.active_sessions
    (workspace_id, user_id, device_id, device_name, ip, user_agent)
  VALUES
    (v_workspace_id, v_user_id, p_device_id, p_device_name, p_ip, p_user_agent)
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'session_id',     v_session_id,
    'action',         'created',
    'plan',           v_plan_code,
    'max_sessions',   v_max_sessions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_session(text, text, text, text) TO authenticated;

-- ─── 5. RPC: heartbeat — mantener sesión activa ───────────────────────────────

CREATE OR REPLACE FUNCTION public.session_heartbeat(
  p_session_id uuid,
  p_device_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_session  record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth', 'action', 'logout');
  END IF;

  SELECT * INTO v_session
  FROM public.active_sessions
  WHERE id = p_session_id
    AND user_id   = v_user_id
    AND device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found', 'action', 'logout');
  END IF;

  -- Sesión revocada → forzar logout
  IF v_session.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',          false,
      'error',       'session_revoked',
      'reason',      v_session.revoke_reason,
      'action',      'logout'
    );
  END IF;

  -- Actualizar last_seen_at
  UPDATE public.active_sessions SET
    last_seen_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'action', 'continue');
END;
$$;

GRANT EXECUTE ON FUNCTION public.session_heartbeat(uuid, text) TO authenticated;

-- ─── 6. RPC: revocar sesión (logout manual o revocación admin) ───────────────

CREATE OR REPLACE FUNCTION public.revoke_session(
  p_session_id uuid,
  p_reason     text DEFAULT 'logout'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Validar: solo el dueño o un admin del workspace puede revocar
  IF NOT EXISTS (
    SELECT 1 FROM public.active_sessions s
    JOIN public.profiles p ON p.workspace_id = s.workspace_id AND p.id = v_user_id
    WHERE s.id = p_session_id
      AND (s.user_id = v_user_id OR p.role IN ('owner','admin'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para revocar esta sesión');
  END IF;

  UPDATE public.active_sessions SET
    revoked_at    = now(),
    revoke_reason = p_reason
  WHERE id = p_session_id
    AND revoked_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_session(uuid, text) TO authenticated;

-- ─── 7. RPC: listar sesiones activas del usuario ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'sessions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',           s.id,
          'device_name',  s.device_name,
          'device_id',    s.device_id,
          'ip',           s.ip,
          'created_at',   s.created_at,
          'last_seen_at', s.last_seen_at,
          'is_current',   false  -- frontend marca cuál es la suya
        ) ORDER BY s.last_seen_at DESC
      ), '[]')
      FROM public.active_sessions s
      WHERE s.user_id    = v_user_id
        AND s.revoked_at IS NULL
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_sessions() TO authenticated;

-- ─── 8. RPC: revocar todas las otras sesiones (cerrar en otros dispositivos) ──

CREATE OR REPLACE FUNCTION public.revoke_other_sessions(p_current_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count   int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  UPDATE public.active_sessions SET
    revoked_at    = now(),
    revoke_reason = 'admin_revoke'
  WHERE user_id    = v_user_id
    AND revoked_at IS NULL
    AND id        != p_current_session_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',      true,
    'revoked', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_other_sessions(uuid) TO authenticated;

-- ─── 9. Limpieza automática de sesiones antiguas revocadas ────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Eliminar sesiones revocadas con más de 30 días
  DELETE FROM public.active_sessions
  WHERE revoked_at IS NOT NULL
    AND revoked_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Revocar sesiones sin heartbeat por más de 7 días (zombies)
  UPDATE public.active_sessions SET
    revoked_at    = now(),
    revoke_reason = 'expired'
  WHERE revoked_at IS NULL
    AND last_seen_at < now() - interval '7 days';

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_sessions() TO service_role;

-- ─── 10. Agregar cleanup al automation-scheduler (via Supabase cron) ──────────
-- INSTRUCCIÓN MANUAL: En Supabase Dashboard → Database → Extensions → pg_cron
-- Ejecutar: SELECT cron.schedule('cleanup-sessions', '0 2 * * *',
--           'SELECT public.cleanup_old_sessions()');

-- Fix: COMMENT ON FUNCTION requiere la firma completa cuando hay sobrecarga
COMMENT ON FUNCTION public.create_session(text, text, text, text) IS
  'Sprint 24: Crea sesión al login. Revoca sesiones previas si plan lo requiere (FREE/PRO/PREMIUM = 1 sesión).';
COMMENT ON FUNCTION public.session_heartbeat(uuid, text) IS
  'Sprint 24: Heartbeat de sesión. Retorna action=logout si la sesión fue revocada.';
COMMENT ON FUNCTION public.revoke_session(uuid, text) IS
  'Sprint 24: Revoca una sesión específica. Dueño o admin del workspace.';
COMMENT ON FUNCTION public.revoke_other_sessions(uuid) IS
  'Sprint 24: Revoca todas las sesiones del usuario excepto la actual.';
COMMENT ON FUNCTION public.cleanup_old_sessions() IS
  'Sprint 24: Limpieza de sesiones antiguas. Llamar desde cron diario.';
