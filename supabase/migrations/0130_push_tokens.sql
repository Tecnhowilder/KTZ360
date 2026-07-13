-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0130: FCM — push_tokens + notification_delivery_log + RPCs
-- ════════════════════════════════════════════════════════════════════════════
-- Arquitectura:
--   push_tokens              → tokens FCM/APNs por dispositivo/usuario
--   notification_delivery_log → registro de entrega de cada push enviado
--   register_push_token()    → RPC para registrar/renovar token desde app
--   unregister_push_token()  → RPC para revocar token al hacer logout
--
-- Zero Trust:
--   • workspace_id SIEMPRE del JWT, nunca del cliente
--   • La edge function send-push autentica con service_role para leer tokens
--   • RLS: cada usuario solo puede ver/modificar sus propios tokens
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla push_tokens ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  token        text        NOT NULL,
  platform     text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id    text        NOT NULL,  -- mismo device_id que active_sessions
  app_version  text,
  is_active    boolean     NOT NULL DEFAULT true,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  CONSTRAINT push_tokens_device_unique UNIQUE (workspace_id, user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON public.push_tokens(workspace_id, user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_token
  ON public.push_tokens(token) WHERE is_active = true;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Lectura: solo los propios tokens
CREATE POLICY "push_tokens_select_own"
  ON public.push_tokens FOR SELECT
  USING (user_id = auth.uid() AND workspace_id = public.current_workspace_id());

-- Escritura: solo vía RPCs SECURITY DEFINER (este bloque impide inserción directa)
-- RPCs usan postgres superuser → bypass RLS

-- ─── 2. Tabla notification_delivery_log ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES auth.users(id)        ON DELETE SET NULL,
  notification_id uuid        REFERENCES public.notifications(id) ON DELETE SET NULL,
  token_id        uuid        REFERENCES public.push_tokens(id)   ON DELETE SET NULL,
  platform        text,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed', 'dedup_skipped')),
  fcm_message_id  text,       -- ID devuelto por FCM al enviar exitosamente
  error_code      text,       -- error FCM si falló
  attempt         smallint    NOT NULL DEFAULT 1,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_log_notification
  ON public.notification_delivery_log(notification_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_log_user
  ON public.notification_delivery_log(workspace_id, user_id, created_at DESC);

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Lectura: admin/owner/supervisor pueden ver logs de su workspace
CREATE POLICY "delivery_log_select_manager"
  ON public.notification_delivery_log FOR SELECT
  USING (
    workspace_id = public.current_workspace_id()
    AND public.current_user_role() IN ('owner','admin','supervisor','super_admin','support_admin')
  );

-- ─── 3. RPC register_push_token ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_id   text,
  p_app_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth');
  END IF;

  IF p_platform NOT IN ('ios', 'android', 'web') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_platform');
  END IF;

  -- Zero Trust: workspace_id del JWT
  SELECT workspace_id INTO v_workspace_id
    FROM public.profiles
   WHERE id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  -- Upsert: si el mismo device ya tiene token, actualizarlo
  INSERT INTO public.push_tokens
    (workspace_id, user_id, token, platform, device_id, app_version, is_active, registered_at)
  VALUES
    (v_workspace_id, v_user_id, p_token, p_platform, p_device_id, p_app_version, true, now())
  ON CONFLICT (workspace_id, user_id, device_id) DO UPDATE SET
    token        = excluded.token,
    platform     = excluded.platform,
    app_version  = excluded.app_version,
    is_active    = true,
    registered_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, text) TO authenticated;

-- ─── 4. RPC unregister_push_token ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unregister_push_token(
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth');
  END IF;

  UPDATE public.push_tokens
     SET is_active = false
   WHERE user_id = v_user_id AND device_id = p_device_id;

  RETURN jsonb_build_object('ok', true, 'affected', (SELECT count(*) FROM public.push_tokens WHERE user_id = v_user_id AND device_id = p_device_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;
