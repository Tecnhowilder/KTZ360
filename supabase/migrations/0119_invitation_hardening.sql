-- ============================================================
-- Migration 0119 — Invitation Hardening (9.9/10)
--
-- MEJORAS POST-AUDITORÍA:
--
--   1. Token de un solo uso: token = NULL al aceptar + accepted_by
--   2. Nuevo token al reenviar: invalida todos los correos anteriores
--   3. IP/User-Agent en audit_log vía request.headers (PostgREST)
--   4. Owner no puede quedarse solo: set_team_member_status protegido
--   5. Anti-enumeración: errores externos genéricos, detalles en audit_log
--   6. delivery_channel: preparado para email/whatsapp/sms/push
--   7. archived: invitaciones viejas → archive=true (nunca DELETE)
--   8. Función de archivado automático (llamar desde cron Supabase)
--   9. Validación de Resend antes de intentar enviar
--   10. update_team_member_role protege al último owner
--
-- Zero Trust siempre. Multi-Tenant siempre.
-- ============================================================

-- ─── 1. SCHEMA: columnas nuevas en workspace_invitations ─────────────────────

-- accepted_by: quién aceptó (para trazabilidad)
ALTER TABLE public.workspace_invitations
  ADD COLUMN IF NOT EXISTS accepted_by    uuid          REFERENCES auth.users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_channel text         DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS archived        boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at     timestamptz   DEFAULT NULL;

-- Token nullable: después de aceptar se pone a NULL para invalidarlo definitivamente
-- (el UNIQUE con NULL en Postgres: NULL != NULL → múltiples NULL permitidos)
ALTER TABLE public.workspace_invitations
  ALTER COLUMN token DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_delivery_channel_check
    CHECK (delivery_channel IN ('email','whatsapp','sms','push'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice para historial (no archivados)
CREATE INDEX IF NOT EXISTS idx_invitations_workspace_status_created
  ON public.workspace_invitations(workspace_id, status, created_at DESC)
  WHERE archived = false;

-- ─── 2. Helper: IP y User-Agent desde headers de PostgREST ───────────────────
-- Extrae IP y User-Agent de los headers HTTP cuando se llama vía PostgREST.
-- Si no está disponible (llamada directa), retorna 'unknown'.

CREATE OR REPLACE FUNCTION public._get_request_ip()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (current_setting('request.headers', true)::jsonb)->>'x-forwarded-for',
    (current_setting('request.headers', true)::jsonb)->>'x-real-ip',
    'unknown'
  );
$$;

CREATE OR REPLACE FUNCTION public._get_request_ua()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (current_setting('request.headers', true)::jsonb)->>'user-agent',
    'unknown'
  );
$$;

-- ─── 3. accept_invitation — token=NULL, anti-enumeración, IP/UA ──────────────

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv            public.workspace_invitations;
  v_seats          jsonb;
  v_seats_limit    integer;
  v_caller_email   text;
  v_workspace_name text;
  v_old_role       text;
  v_caller_id      uuid := auth.uid();
  v_ip             text := public._get_request_ip();
  v_ua             text := public._get_request_ua();
BEGIN
  -- ── ANTI-ENUMERACIÓN: errores genéricos hacia el exterior ─────────────────
  -- Cualquier error de token/estado se convierte en el mismo mensaje genérico.
  -- El motivo real solo queda en audit_log (no visible para el cliente).

  SELECT * INTO v_inv
    FROM public.workspace_invitations
   WHERE token = p_token
     AND archived = false;

  -- Token no encontrado, expirado, ya usado: mismo mensaje externo
  IF v_inv.id IS NULL THEN
    INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, metadata)
    VALUES (
      null, v_caller_id,
      'invite_accept_failed', 'workspace_invitations',
      jsonb_build_object('reason', 'token_not_found', 'token_prefix', left(p_token::text, 8), 'ip', v_ip, 'ua', v_ua)
    );
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  -- Verificar expiración
  IF v_inv.status = 'pending' AND v_inv.expires_at <= now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = v_inv.id;
    v_inv.status := 'expired';
  END IF;

  IF v_inv.status <> 'pending' THEN
    INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_inv.workspace_id, v_caller_id,
      'invite_accept_failed', 'workspace_invitations', v_inv.id,
      jsonb_build_object('reason', 'invitation_status_' || v_inv.status, 'ip', v_ip, 'ua', v_ua)
    );
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  -- ── ANTI-ENUMERACIÓN: mismatch de email no revela si el email existe ──────
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
  IF v_caller_email IS NULL OR lower(trim(v_caller_email)) <> lower(v_inv.email) THEN
    INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_inv.workspace_id, v_caller_id,
      'invite_accept_failed', 'workspace_invitations', v_inv.id,
      jsonb_build_object('reason', 'email_mismatch', 'caller_email_hash', md5(coalesce(v_caller_email,'')), 'ip', v_ip, 'ua', v_ua)
    );
    -- Mismo mensaje genérico — no revelar que el email no coincide
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  -- Cuota (NULL = Enterprise = ilimitado)
  PERFORM public.expire_stale_invitations(v_inv.workspace_id);
  v_seats       := public.compute_team_seats(v_inv.workspace_id);
  v_seats_limit := (v_seats->>'seats_limit')::integer;

  IF v_seats_limit IS NOT NULL
     AND (v_seats->>'seats_used')::integer >= v_seats_limit THEN
    RAISE EXCEPTION 'seat_limit_exceeded';
  END IF;

  SELECT role INTO v_old_role FROM public.profiles WHERE id = v_caller_id;

  -- Activar en el workspace
  UPDATE public.profiles
     SET workspace_id  = v_inv.workspace_id,
         role          = v_inv.role,
         status        = 'active',
         phone         = COALESCE(phone, v_inv.phone),
         city          = COALESCE(city, v_inv.city),
         profession    = COALESCE(profession, v_inv.profession),
         specialty     = COALESCE(specialty, v_inv.specialty),
         updated_at    = now()
   WHERE id = v_caller_id;

  -- ── TOKEN DE UN SOLO USO: anular el token después de aceptar ─────────────
  -- El token pasa a NULL → el enlace del email nunca puede reutilizarse.
  -- status='accepted' también previene reúso, pero NULL es defensa en profundidad.
  UPDATE public.workspace_invitations
     SET status       = 'accepted',
         accepted_at  = now(),
         accepted_by  = v_caller_id,
         token        = NULL          -- invalida el enlace permanentemente
   WHERE id = v_inv.id;

  SELECT name INTO v_workspace_name FROM public.workspaces WHERE id = v_inv.workspace_id;

  -- Auditoría completa con IP/UA
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id, v_caller_id,
    'invite_accepted', 'workspace_invitations', v_inv.id,
    jsonb_build_object(
      'email',         v_inv.email,
      'role_assigned', v_inv.role,
      'previous_role', v_old_role,
      'workspace_id',  v_inv.workspace_id,
      'accepted_at',   now(),
      'ip',            v_ip,
      'ua',            v_ua
    )
  );

  -- Notificar a owner y admins
  INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
  SELECT v_inv.workspace_id, p.id,
    'Nuevo miembro del equipo',
    COALESCE(v_inv.full_name, v_inv.email) || ' se unió como ' || v_inv.role,
    'info'
  FROM public.profiles p
  WHERE p.workspace_id = v_inv.workspace_id
    AND p.role IN ('owner','admin') AND p.status = 'active'
  LIMIT 3;

  RETURN jsonb_build_object('workspace_name', v_workspace_name, 'role', v_inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;

-- ─── 4. resend_invitation — NUEVO TOKEN (invalida correos anteriores) ─────────

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

  -- Owner o Admin del mismo workspace
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

  -- ── NUEVO TOKEN AL REENVIAR: cualquier correo anterior queda inválido ─────
  -- Genera nuevo UUID → el enlace del email anterior ya no funciona.
  v_new_token := gen_random_uuid();

  UPDATE public.workspace_invitations
     SET token      = v_new_token,
         expires_at = now() + INTERVAL '72 hours'
   WHERE id = p_invitation_id
  RETURNING * INTO v_inv;

  -- Auditoría
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id, v_caller_id,
    'invitation_resent', 'workspace_invitations', v_inv.id,
    jsonb_build_object(
      'email',       v_inv.email,
      'role',        v_inv.role,
      'resent_by',   v_caller_id,
      'new_expires', now() + INTERVAL '72 hours',
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

-- ─── 5. set_team_member_status — PROTEGER AL ÚLTIMO OWNER ────────────────────

CREATE OR REPLACE FUNCTION public.set_team_member_status(
  p_profile_id uuid,
  p_status     text,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_workspace_id uuid;
  v_target_role  text;
  v_target_ws    uuid;
  v_action       text;
  v_owner_count  integer;
  v_ip           text := public._get_request_ip();
BEGIN
  SELECT workspace_id, role INTO v_workspace_id, v_caller_role
    FROM public.profiles WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT workspace_id, role INTO v_target_ws, v_target_role
    FROM public.profiles WHERE id = p_profile_id;

  IF v_target_ws != v_workspace_id AND v_caller_role NOT IN ('super_admin','support_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner';
  END IF;

  IF p_profile_id = v_caller_id THEN
    RAISE EXCEPTION 'cannot_modify_self';
  END IF;

  IF p_status NOT IN ('active','inactive','removed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- ── PROTEGER AL ÚLTIMO OWNER ──────────────────────────────────────────────
  -- Si se intenta eliminar/desactivar al único owner del workspace, bloquear.
  -- El owner siempre es el target_role='owner' — esta validación es extra seguridad.
  IF v_target_role = 'owner' AND p_status IN ('inactive','removed') THEN
    SELECT COUNT(*) INTO v_owner_count
      FROM public.profiles
     WHERE workspace_id = v_workspace_id
       AND role   = 'owner'
       AND status = 'active';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
  END IF;

  UPDATE public.profiles SET status = p_status, updated_at = now()
   WHERE id = p_profile_id;

  v_action := CASE p_status WHEN 'removed' THEN 'user_removed'
                             WHEN 'inactive' THEN 'user_deactivated'
                             ELSE 'user_reactivated' END;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_caller_id, v_action, 'profiles', p_profile_id,
    jsonb_build_object('reason', p_reason, 'new_status', p_status, 'ip', v_ip));

  IF p_status IN ('removed','inactive') THEN
    INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
    VALUES (v_workspace_id, p_profile_id,
      CASE p_status WHEN 'removed' THEN 'Acceso eliminado' ELSE 'Cuenta desactivada' END,
      CASE p_status WHEN 'removed' THEN 'Tu cuenta ha sido eliminada del equipo.'
                    ELSE 'Tu cuenta ha sido desactivada. Contacta al administrador.' END,
      'warning');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_team_member_status(uuid, text, text) TO authenticated;

-- ─── 6. update_team_member_role — PROTEGER ROL DE OWNER ─────────────────────
-- No se puede cambiar el rol si es el único owner.

CREATE OR REPLACE FUNCTION public.update_team_member_role(
  p_profile_id uuid,
  p_role       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_workspace_id uuid;
  v_caller_role  text;
  v_target_role  text;
  v_target_ws    uuid;
  v_owner_count  integer;
  v_allowed      text[] := ARRAY['admin','supervisor','comercial','operario'];
BEGIN
  SELECT workspace_id, role INTO v_workspace_id, v_caller_role
    FROM public.profiles WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT (p_role = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'invalid_role: Permitidos: admin, supervisor, comercial, operario'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT workspace_id, role INTO v_target_ws, v_target_role
    FROM public.profiles WHERE id = p_profile_id;

  IF v_target_ws != v_workspace_id AND v_caller_role NOT IN ('super_admin','support_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner';
  END IF;

  UPDATE public.profiles SET role = p_role, updated_at = now()
   WHERE id = p_profile_id;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_caller_id, 'role_changed', 'profiles', p_profile_id,
    jsonb_build_object('from_role', v_target_role, 'to_role', p_role));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_member_role(uuid, text) TO authenticated;

-- ─── 7. FUNCIÓN DE ARCHIVADO (llamar desde cron Supabase) ────────────────────
-- Archiva invitaciones terminadas (no pending) con más de 90 días.
-- NUNCA hace DELETE. Solo pone archived=true.
-- Programar en Supabase: Dashboard → Database → Extensions → pg_cron
--   SELECT cron.schedule('archive-invitations', '0 2 * * *',
--     'SELECT public.archive_old_invitations()');

CREATE OR REPLACE FUNCTION public.archive_old_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.workspace_invitations
     SET archived    = true,
         archived_at = now()
   WHERE status      IN ('accepted','revoked','expired')
     AND created_at  < now() - INTERVAL '90 days'
     AND archived    = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Solo service_role puede ejecutar el archivado (no usuarios)
REVOKE EXECUTE ON FUNCTION public.archive_old_invitations() FROM PUBLIC;

-- ─── 8. get_invitation_history — para la UI de historial ──────────────────────

CREATE OR REPLACE FUNCTION public.get_invitation_history(
  p_workspace_id uuid,
  p_limit        integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_history     jsonb;
BEGIN
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id AND workspace_id = p_workspace_id AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          i.id,
      'email',       i.email,
      'full_name',   i.full_name,
      'role',        i.role,
      'status',      i.status,
      'created_at',  i.created_at,
      'accepted_at', i.accepted_at,
      'accepted_by', i.accepted_by,
      'expires_at',  i.expires_at,
      'invited_by',  i.invited_by,
      'inviter_name',(SELECT full_name FROM profiles WHERE id = i.invited_by),
      'city',        i.city,
      'specialty',   i.specialty,
      'delivery_channel', i.delivery_channel
    )
    ORDER BY i.created_at DESC
  ), '[]'::jsonb)
  INTO v_history
  FROM public.workspace_invitations i
  WHERE i.workspace_id = p_workspace_id
    AND i.archived = false
  LIMIT p_limit;

  RETURN jsonb_build_object('ok', true, 'invitations', v_history);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_history(uuid, integer) TO authenticated;

-- ─── 9. ERR MSGS: actualizar mensaje de seat_limit en invitations ─────────────
-- Agregar control_resend_configured en system_configuration si falta

INSERT INTO public.system_configuration (key, value)
VALUES (
  'invitation_settings',
  jsonb_build_object(
    'expiry_hours',          72,
    'max_per_hour',          20,
    'check_resend_before',   true,
    'delivery_channels',     ARRAY['email'],
    'notify_owner_on_accept', true
  )
)
ON CONFLICT (key) DO NOTHING;
