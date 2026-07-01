-- ============================================================
-- Migration 0108 — Equipo: Production Ready
--
-- CAMBIOS:
--   1. Columnas phone, city, profession, specialty en profiles
--   2. Columnas phone, city, profession, specialty en workspace_invitations
--   3. RPC invite_team_member actualizada con nuevos campos
--   4. Tabla attendance_records (asistencia operarios)
--   5. RPCs de asistencia con validaciones
--   6. Eliminar usuarios de demostración del workspace de pruebas
--   7. Cleanup: profiles sin workspace real (huérfanos)
--
-- Zero Trust: workspace_id siempre del JWT
-- RLS: tablas nuevas siguen el mismo patrón
-- ============================================================

-- ─── 1. COLUMNAS EN PROFILES ──────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city        text DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profession  text DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS specialty   text DEFAULT NULL;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_specialty_check
    CHECK (specialty IN (
      'electricista','cctv','redes','fibra_optica','paneles_solares',
      'aires_acondicionados','plomeria','soldadura','mantenimiento','otro'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. COLUMNAS EN WORKSPACE_INVITATIONS ─────────────────────────────────────

ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS phone      text DEFAULT NULL;
ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS city       text DEFAULT NULL;
ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS profession text DEFAULT NULL;
ALTER TABLE public.workspace_invitations ADD COLUMN IF NOT EXISTS specialty  text DEFAULT NULL;

-- ─── 3. RPC invite_team_member ACTUALIZADA ────────────────────────────────────
-- Eliminar la versión de 4 parámetros (0020/0056/0107) antes de crear la de 8.
-- Sin este DROP coexisten dos overloads y las operaciones futuras sobre la función
-- sin especificar firma dan error 42725 ("function name is not unique").
DROP FUNCTION IF EXISTS public.invite_team_member(uuid, text, text, text);

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
  IF v_caller_ws_id != p_workspace_id AND v_caller_role NOT IN ('super_admin','support_admin') THEN
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

  -- Expirar invitaciones antiguas
  PERFORM public.expire_stale_invitations(p_workspace_id);

  -- Verificar que no existe ya una invitación pendiente para este email
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations
     WHERE workspace_id = p_workspace_id
       AND email = lower(p_email)
       AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending');
  END IF;

  -- Generar token único
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Crear invitación con todos los campos
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

  -- Log en audit
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_caller_id, 'invitation_sent', 'workspace_invitations', v_invitation_id,
    jsonb_build_object('email', p_email, 'role', p_role));

  RETURN (
    SELECT to_jsonb(i) FROM public.workspace_invitations i WHERE id = v_invitation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid,text,text,text,text,text,text,text) TO authenticated;

-- ─── 4. Sync campos al aceptar invitación ─────────────────────────────────────
-- Cuando el usuario acepta la invitación, copiar phone/city/profession/specialty a profiles

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv    public.workspace_invitations;
  v_caller uuid := auth.uid();
BEGIN
  -- Solo puede aceptar el propio usuario
  IF v_caller IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Buscar invitación válida
  SELECT * INTO v_inv
    FROM public.workspace_invitations
   WHERE token = p_token
     AND status = 'pending'
     AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_invitation');
  END IF;

  -- Actualizar perfil del usuario con datos de la invitación
  UPDATE public.profiles
     SET workspace_id = v_inv.workspace_id,
         role         = v_inv.role,
         status       = 'active',
         full_name    = COALESCE(full_name, v_inv.full_name),
         phone        = COALESCE(phone, v_inv.phone),
         city         = COALESCE(city, v_inv.city),
         profession   = COALESCE(profession, v_inv.profession),
         specialty    = COALESCE(specialty, v_inv.specialty),
         updated_at   = now()
   WHERE id = p_user_id;

  -- Marcar invitación como aceptada
  UPDATE public.workspace_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = v_inv.id;

  -- Log
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_inv.workspace_id, p_user_id, 'invitation_accepted', 'workspace_invitations', v_inv.id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'workspace_id', v_inv.workspace_id, 'role', v_inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated;

-- ─── 5. TABLA ATTENDANCE_RECORDS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid          NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id        uuid          NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  date           date          NOT NULL,
  check_in_at    timestamptz,
  lunch_start_at timestamptz,
  lunch_end_at   timestamptz,
  check_out_at   timestamptz,
  hours_worked   numeric(5,2),  -- auto-calculado por trigger
  lunch_minutes  integer,        -- auto-calculado
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','present','absent','late','partial')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, date)
);

-- RLS en attendance_records
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "workspace_isolation" ON public.attendance_records
    USING (workspace_id = public.current_workspace_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON public.attendance_records(workspace_id, user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON public.attendance_records(workspace_id, date DESC);

-- Trigger: calcular horas trabajadas automáticamente
CREATE OR REPLACE FUNCTION _calc_attendance_hours()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.check_in_at IS NOT NULL AND NEW.check_out_at IS NOT NULL THEN
    -- Minutos totales de almuerzo
    NEW.lunch_minutes := CASE
      WHEN NEW.lunch_start_at IS NOT NULL AND NEW.lunch_end_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NEW.lunch_end_at - NEW.lunch_start_at)) / 60
      ELSE 0
    END;

    -- Horas trabajadas = total - almuerzo
    NEW.hours_worked := ROUND(
      (EXTRACT(EPOCH FROM (NEW.check_out_at - NEW.check_in_at)) / 3600
        - COALESCE(NEW.lunch_minutes, 0)::numeric / 60),
      2
    );

    -- Status
    NEW.status := CASE
      WHEN NEW.hours_worked >= 8 THEN 'present'
      WHEN NEW.hours_worked > 0  THEN 'partial'
      ELSE 'pending'
    END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_hours ON public.attendance_records;
CREATE TRIGGER trg_attendance_hours
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION _calc_attendance_hours();

-- ─── 6. RPCs DE ASISTENCIA ────────────────────────────────────────────────────

-- record_attendance: registra un evento de asistencia
CREATE OR REPLACE FUNCTION public.record_attendance(
  p_event text  -- 'check_in' | 'lunch_start' | 'lunch_end' | 'check_out'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_today        date := current_date;
  v_rec          public.attendance_records;
  v_ts           timestamptz := now();
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM public.profiles WHERE id = v_user_id;

  -- Obtener o crear registro de hoy
  INSERT INTO public.attendance_records (workspace_id, user_id, date, status)
  VALUES (v_workspace_id, v_user_id, v_today, 'pending')
  ON CONFLICT (workspace_id, user_id, date) DO NOTHING;

  SELECT * INTO v_rec
    FROM public.attendance_records
   WHERE workspace_id = v_workspace_id AND user_id = v_user_id AND date = v_today;

  -- Aplicar evento con validaciones
  CASE p_event
    WHEN 'check_in' THEN
      IF v_rec.check_in_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya registraste ingreso hoy');
      END IF;
      UPDATE public.attendance_records SET check_in_at = v_ts
       WHERE id = v_rec.id;

    WHEN 'lunch_start' THEN
      IF v_rec.check_in_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar ingreso primero');
      END IF;
      IF v_rec.lunch_start_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Almuerzo ya iniciado');
      END IF;
      UPDATE public.attendance_records SET lunch_start_at = v_ts
       WHERE id = v_rec.id;

    WHEN 'lunch_end' THEN
      IF v_rec.lunch_start_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No has iniciado el almuerzo');
      END IF;
      IF v_rec.lunch_end_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Almuerzo ya finalizado');
      END IF;
      UPDATE public.attendance_records SET lunch_end_at = v_ts
       WHERE id = v_rec.id;

    WHEN 'check_out' THEN
      IF v_rec.check_in_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar ingreso primero');
      END IF;
      IF v_rec.check_out_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya registraste salida hoy');
      END IF;
      UPDATE public.attendance_records SET check_out_at = v_ts
       WHERE id = v_rec.id;

    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Evento inválido');
  END CASE;

  -- Log
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_user_id, 'attendance_' || p_event, 'attendance_records', v_rec.id,
    jsonb_build_object('event', p_event, 'timestamp', v_ts));

  -- Retornar estado actualizado
  SELECT to_jsonb(r) INTO v_rec FROM public.attendance_records r
   WHERE workspace_id = v_workspace_id AND user_id = v_user_id AND date = v_today;

  RETURN jsonb_build_object('ok', true, 'record', to_jsonb(v_rec));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_attendance(text) TO authenticated;

-- get_attendance: consulta el historial de asistencia
CREATE OR REPLACE FUNCTION public.get_attendance(
  p_date_from date DEFAULT current_date,
  p_date_to   date DEFAULT current_date,
  p_user_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_workspace_id uuid;
  v_role         text;
  v_records      jsonb;
BEGIN
  SELECT workspace_id, role INTO v_workspace_id, v_role
    FROM public.profiles WHERE id = v_caller_id;

  -- Operarios solo ven sus propios registros
  IF v_role IN ('operario', 'comercial') THEN
    p_user_id := v_caller_id;
  END IF;

  SELECT COALESCE(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'user_name', (SELECT full_name FROM profiles WHERE id = r.user_id),
      'user_role', (SELECT role       FROM profiles WHERE id = r.user_id)
    )
    ORDER BY r.date DESC, r.check_in_at DESC
  ), '[]'::jsonb)
  INTO v_records
  FROM public.attendance_records r
  WHERE r.workspace_id = v_workspace_id
    AND r.date BETWEEN p_date_from AND p_date_to
    AND (p_user_id IS NULL OR r.user_id = p_user_id);

  RETURN jsonb_build_object('ok', true, 'records', v_records);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance(date, date, uuid) TO authenticated;

-- get_today_attendance: estado de asistencia de hoy del usuario actual
CREATE OR REPLACE FUNCTION public.get_today_attendance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_rec          jsonb;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM public.profiles WHERE id = v_user_id;

  SELECT to_jsonb(r) INTO v_rec
    FROM public.attendance_records r
   WHERE workspace_id = v_workspace_id AND user_id = v_user_id AND date = current_date;

  RETURN jsonb_build_object('ok', true, 'record', v_rec);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_today_attendance() TO authenticated;

-- ─── 7. ELIMINAR USUARIOS DE DEMOSTRACIÓN ─────────────────────────────────────
-- Solo elimina usuarios del workspace de pruebas KTZ360, nunca los de producción.
-- Los emails de demostración tienen dominio @test.ktz360.com

DO $$
DECLARE
  v_test_workspace_id uuid;
BEGIN
  -- Encontrar el workspace de pruebas por nombre
  SELECT id INTO v_test_workspace_id
    FROM public.workspaces
   WHERE name = 'Workspace de Pruebas KTZ360'
   LIMIT 1;

  IF v_test_workspace_id IS NOT NULL THEN
    -- Soft-delete (status='removed') los perfiles de demo en ese workspace específico
    UPDATE public.profiles
       SET status = 'removed', updated_at = now()
     WHERE workspace_id = v_test_workspace_id
       AND email LIKE '%@test.ktz360.com'
       AND role != 'owner';
  END IF;
END $$;

-- ─── 8. PRESENCIA: columna last_seen_at en profiles ───────────────────────────
-- Complementa Realtime presence — persistir la última vez visto

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT NULL;

-- RPC update_presence: llamado por el cliente en heartbeat
CREATE OR REPLACE FUNCTION public.update_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET last_seen_at = now(), updated_at = now()
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_presence() TO authenticated;

-- ─── 9. RPC set_team_member_status: actualizar para reflejar eliminación real ─

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
  v_target_ws    uuid;
  v_action       text;
BEGIN
  SELECT workspace_id, role INTO v_workspace_id, v_caller_role
    FROM public.profiles WHERE id = v_caller_id;

  -- Solo owner/admin pueden modificar
  IF v_caller_role NOT IN ('owner', 'admin', 'super_admin', 'support_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Verificar target pertenece al mismo workspace
  SELECT workspace_id INTO v_target_ws FROM public.profiles WHERE id = p_profile_id;
  IF v_target_ws != v_workspace_id AND v_caller_role NOT IN ('super_admin', 'support_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- No puede modificar al owner
  IF (SELECT role FROM public.profiles WHERE id = p_profile_id) = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner';
  END IF;

  -- No puede modificarse a sí mismo
  IF p_profile_id = v_caller_id THEN
    RAISE EXCEPTION 'cannot_modify_self';
  END IF;

  IF p_status NOT IN ('active', 'inactive', 'removed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Actualizar
  UPDATE public.profiles
     SET status = p_status, updated_at = now()
   WHERE id = p_profile_id;

  -- Log
  v_action := CASE p_status
    WHEN 'removed'  THEN 'user_removed'
    WHEN 'inactive' THEN 'user_deactivated'
    WHEN 'active'   THEN 'user_reactivated'
  END;

  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_caller_id, v_action, 'profiles', p_profile_id,
    jsonb_build_object('reason', p_reason, 'new_status', p_status));

  -- Notificar al afectado (si tiene user_id)
  IF p_status IN ('removed', 'inactive') THEN
    INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
    VALUES (v_workspace_id, p_profile_id,
      CASE p_status WHEN 'removed' THEN 'Acceso eliminado' ELSE 'Cuenta desactivada' END,
      CASE p_status
        WHEN 'removed'  THEN 'Tu cuenta ha sido eliminada del equipo.'
        WHEN 'inactive' THEN 'Tu cuenta ha sido desactivada. Contacta al administrador.'
      END,
      'warning'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_team_member_status(uuid, text, text) TO authenticated;
