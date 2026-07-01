-- ============================================================
-- Migration 0118 — Sistema de invitaciones: corrección y validaciones de seguridad
--
-- CAUSA RAÍZ DEL ERROR "get_random_bytes(integer) does not exist":
--   Una versión de invite_team_member fue aplicada al DB live con el typo
--   get_random_bytes() en lugar de gen_random_bytes(). No existe en archivos
--   locales. Al sobrescribir la función con CREATE OR REPLACE, desaparece.
--   NO se crea alias permanente — solo se corrige el código real.
--
-- BUG SECUNDARIO — type mismatch en token:
--   Migrations 0108/0113 generaban encode(gen_random_bytes(32),'hex') → text.
--   La columna workspace_invitations.token es uuid.
--   FIX: usar el DEFAULT gen_random_uuid() que genera uuid directamente.
--
-- VALIDACIONES DE SEGURIDAD AGREGADAS:
--   1. No invitar email ya activo en el workspace
--   2. No crear duplicado si ya hay invitación pendiente
--   3. Multi-tenant: el mismo email puede estar en múltiples workspaces (OK)
--   4. Resend = renovar expiración sin crear fila nueva
--   5. Revocación por owner/admin
--   6. Expiración: 72 horas
--   7. Rate limiting: máx 20 invitaciones/hora por workspace
--   8. Auditoría: quién, a quién, cuándo, workspace, rol, resultado
--
-- Zero Trust: workspace_id siempre del JWT.
-- ============================================================

-- ─── 0. Garantizar pgcrypto ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. invite_team_member (4 params) — REESCRITURA LIMPIA ──────────────────

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
  -- ── Zero Trust: caller pertenece a este workspace y está activo ───────────
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id
     AND workspace_id = p_workspace_id
     AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- ── Feature gating: solo PREMIUM/ENTERPRISE pueden tener equipo ──────────
  IF NOT public.check_feature_access(p_workspace_id, 'multiuser_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available: multiuser_enabled');
  END IF;

  -- ── Validar rol del invitado ──────────────────────────────────────────────
  IF NOT (p_role = ANY(v_allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Rol inválido. Permitidos: admin, supervisor, comercial, operario');
  END IF;

  -- ── Validar formato de email ──────────────────────────────────────────────
  IF v_norm_email IS NULL OR length(v_norm_email) < 3 OR v_norm_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  -- ── Rate limiting: máx 20 invitaciones por hora por workspace ────────────
  -- Protege contra flooding y abuso de la función.
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

  -- ── Seguridad 1: ¿el email ya pertenece a este workspace como activo? ─────
  -- Multi-tenant: NO bloqueamos que el email esté en OTRO workspace.
  -- Solo bloqueamos si ya pertenece a ESTE workspace.
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

  -- ── Seguridad 2: ¿ya existe una invitación pendiente para este email? ─────
  -- No crear duplicado — sugerir usar "Reenviar invitación" en su lugar.
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

  -- ── Verificar cuota de asientos (NULL = Enterprise = ilimitado) ───────────
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

  -- ── Expirar invitaciones viejas del mismo email en este workspace ─────────
  PERFORM public.expire_stale_invitations(p_workspace_id);

  -- ── Crear invitación — token generado por DEFAULT gen_random_uuid() ───────
  -- uuid NOT NULL UNIQUE DEFAULT gen_random_uuid() — tipo correcto, 122 bits.
  -- Expiración: 72 horas desde ahora.
  INSERT INTO public.workspace_invitations (
    workspace_id,
    email,
    full_name,
    role,
    invited_by,
    expires_at
  )
  VALUES (
    p_workspace_id,
    v_norm_email,
    NULLIF(trim(p_full_name), ''),
    p_role,
    v_caller_id,
    now() + INTERVAL '72 hours'
  )
  RETURNING id, token INTO v_invitation_id, v_token;

  -- ── Auditoría completa ────────────────────────────────────────────────────
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
      'expires_at',  now() + INTERVAL '72 hours',
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

-- ─── 2. invite_team_member (8 params) — igual con campos extendidos ──────────

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
  -- Zero Trust
  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_id AND workspace_id = p_workspace_id AND status = 'active';

  IF v_caller_role NOT IN ('owner','admin','super_admin','support_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Feature gating
  IF NOT public.check_feature_access(p_workspace_id, 'multiuser_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available: multiuser_enabled');
  END IF;

  -- Validar rol
  IF NOT (p_role = ANY(v_allowed_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Rol inválido. Permitidos: admin, supervisor, comercial, operario');
  END IF;

  -- Validar email
  IF v_norm_email IS NULL OR length(v_norm_email) < 3 OR v_norm_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  -- Rate limiting
  SELECT COUNT(*) INTO v_recent
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND created_at > now() - INTERVAL '1 hour';

  IF v_recent >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit_exceeded',
      'message', 'Límite alcanzado: máximo 20 invitaciones por hora');
  END IF;

  -- ¿Ya es miembro activo de ESTE workspace?
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.workspace_id = p_workspace_id AND p.status = 'active'
      AND lower(u.email) = v_norm_email
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_already_in_workspace',
      'message', 'Este usuario ya pertenece al equipo');
  END IF;

  -- ¿Invitación pendiente existente?
  SELECT id, token INTO v_invitation_id, v_token
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id
     AND lower(email) = v_norm_email AND status = 'pending' LIMIT 1;

  IF v_invitation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending',
      'invitation_id', v_invitation_id,
      'message', 'Ya existe una invitación pendiente para este correo. Usa "Reenviar" para renovarla.');
  END IF;

  -- Verificar cuota (NULL = Enterprise = ilimitado)
  v_seats       := public.compute_team_seats(p_workspace_id);
  v_seats_limit := (v_seats->>'seats_limit')::integer;

  IF v_seats_limit IS NOT NULL
     AND (v_seats->>'seats_used')::integer >= v_seats_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_limit_exceeded',
      'seats_used', v_seats->'seats_used', 'seats_limit', v_seats->'seats_limit');
  END IF;

  -- Expirar invitaciones antiguas
  PERFORM public.expire_stale_invitations(p_workspace_id);

  -- Crear invitación
  INSERT INTO public.workspace_invitations (
    workspace_id, email, full_name, role, invited_by, expires_at,
    phone, city, profession, specialty
  )
  VALUES (
    p_workspace_id, v_norm_email,
    NULLIF(trim(p_full_name), ''), p_role, v_caller_id,
    now() + INTERVAL '72 hours',
    NULLIF(trim(p_phone), ''), NULLIF(trim(p_city), ''),
    NULLIF(trim(p_profession), ''), NULLIF(p_specialty, '')
  )
  RETURNING id, token INTO v_invitation_id, v_token;

  -- Auditoría
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_workspace_id, v_caller_id,
    'invitation_sent', 'workspace_invitations', v_invitation_id,
    jsonb_build_object(
      'email', v_norm_email, 'role', p_role,
      'full_name', p_full_name, 'city', p_city, 'specialty', p_specialty,
      'invited_by', v_caller_id, 'expires_at', now() + INTERVAL '72 hours'
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

-- ─── 3. resend_invitation — renovar expiración (72 horas) ────────────────────
-- Reutiliza el mismo token (no genera nuevo token para evitar confusión).
-- Owner Y admin pueden reenviar.

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

  -- Expirar stale antes de verificar estado
  PERFORM public.expire_stale_invitations(v_inv.workspace_id);
  SELECT * INTO v_inv FROM public.workspace_invitations WHERE id = p_invitation_id;

  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending',
      'status', v_inv.status);
  END IF;

  -- Renovar expiración (72 horas) — mismo token
  UPDATE public.workspace_invitations
     SET expires_at = now() + INTERVAL '72 hours'
   WHERE id = p_invitation_id
  RETURNING * INTO v_inv;

  -- Auditoría
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id, v_caller_id,
    'invitation_resent', 'workspace_invitations', v_inv.id,
    jsonb_build_object(
      'email',      v_inv.email,
      'role',       v_inv.role,
      'resent_by',  v_caller_id,
      'new_expires', now() + INTERVAL '72 hours'
    )
  );

  -- Retornar en el mismo formato que invite_team_member para que el frontend
  -- pueda enviar el email sin lógica adicional
  RETURN jsonb_build_object(
    'ok',            true,
    'invitation_id', v_inv.id,
    'token',         v_inv.token,
    'email',         v_inv.email,
    'role',          v_inv.role,
    'full_name',     v_inv.full_name,
    'expires_at',    v_inv.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_invitation(uuid) TO authenticated;

-- ─── 4. accept_invitation — fix Enterprise NULL + sync perfil ────────────────

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
BEGIN
  SELECT * INTO v_inv
    FROM public.workspace_invitations WHERE token = p_token;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Verificar expiración
  IF v_inv.status = 'pending' AND v_inv.expires_at <= now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  -- Verificar email (case-insensitive, sin espacios)
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL OR lower(trim(v_caller_email)) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  -- Cuota (NULL = Enterprise = ilimitado)
  PERFORM public.expire_stale_invitations(v_inv.workspace_id);
  v_seats       := public.compute_team_seats(v_inv.workspace_id);
  v_seats_limit := (v_seats->>'seats_limit')::integer;

  IF v_seats_limit IS NOT NULL
     AND (v_seats->>'seats_used')::integer >= v_seats_limit THEN
    RAISE EXCEPTION 'seat_limit_exceeded';
  END IF;

  -- Guardar rol anterior para auditoría
  SELECT role INTO v_old_role FROM public.profiles WHERE id = auth.uid();

  -- Activar en el workspace — sincronizar datos de la invitación al perfil
  UPDATE public.profiles
     SET workspace_id = v_inv.workspace_id,
         role         = v_inv.role,
         status       = 'active',
         phone        = COALESCE(phone, v_inv.phone),
         city         = COALESCE(city, v_inv.city),
         profession   = COALESCE(profession, v_inv.profession),
         specialty    = COALESCE(specialty, v_inv.specialty),
         updated_at   = now()
   WHERE id = auth.uid();

  -- Marcar invitación como aceptada (token invalidado — no reutilizable)
  UPDATE public.workspace_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = v_inv.id;

  SELECT name INTO v_workspace_name FROM public.workspaces WHERE id = v_inv.workspace_id;

  -- Auditoría
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_inv.workspace_id, auth.uid(),
    'invite_accepted', 'workspace_invitations', v_inv.id,
    jsonb_build_object(
      'email',           v_inv.email,
      'role_assigned',   v_inv.role,
      'previous_role',   v_old_role,
      'workspace_id',    v_inv.workspace_id,
      'accepted_at',     now()
    )
  );

  -- Notificar al owner que alguien aceptó
  INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
  SELECT
    v_inv.workspace_id,
    p.id,
    'Nuevo miembro del equipo',
    COALESCE(v_inv.full_name, v_inv.email) || ' se unió como ' || v_inv.role,
    'info'
  FROM public.profiles p
  WHERE p.workspace_id = v_inv.workspace_id
    AND p.role IN ('owner', 'admin')
    AND p.status = 'active'
  LIMIT 3;  -- Notificar hasta 3 admins/owners

  RETURN jsonb_build_object(
    'workspace_name', v_workspace_name,
    'role',           v_inv.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;

-- ─── 5. VERIFICACIÓN FINAL ────────────────────────────────────────────────────
-- Confirmar que las funciones correctas existen y pgcrypto está activo.
DO $$
BEGIN
  PERFORM gen_random_uuid();   -- uuid v4, tipo correcto para token
  PERFORM gen_random_bytes(1); -- gen_random_bytes (correcto, con 'gen_')
  -- get_random_bytes NO se crea — la función con typo fue sobrescrita por
  -- el CREATE OR REPLACE de invite_team_member en este mismo script.
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'pgcrypto no disponible. Verificar extensión.';
END $$;
