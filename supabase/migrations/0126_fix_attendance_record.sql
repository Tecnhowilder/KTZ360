-- Migration 0126: Fix record_attendance RPC
--
-- Problemas corregidos:
--   1. check_out no computaba hours_worked ni lunch_minutes (quedaban NULL)
--   2. status nunca se actualizaba (siempre quedaba 'pending' después del check_in)
--   3. check_out no bloqueaba si hay almuerzo iniciado pero no terminado
--      (ahora permite salida sin almuerzo — almuerzo es opcional)
--
-- Backward compatible: misma firma, mismos errores externos.

CREATE OR REPLACE FUNCTION public.record_attendance(p_event text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_today        date := current_date;
  v_rec          public.attendance_records;
  v_ts           timestamptz := now();
  v_hours        numeric;
BEGIN
  -- Zero Trust: workspace_id del perfil propio, nunca del cliente
  SELECT workspace_id INTO v_workspace_id
    FROM public.profiles WHERE id = v_user_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  END IF;

  -- Obtener o crear registro de hoy (idempotente)
  INSERT INTO public.attendance_records (workspace_id, user_id, date, status)
  VALUES (v_workspace_id, v_user_id, v_today, 'pending')
  ON CONFLICT (workspace_id, user_id, date) DO NOTHING;

  SELECT * INTO v_rec
    FROM public.attendance_records
   WHERE workspace_id = v_workspace_id AND user_id = v_user_id AND date = v_today;

  CASE p_event

    WHEN 'check_in' THEN
      IF v_rec.check_in_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya registraste ingreso hoy');
      END IF;
      UPDATE public.attendance_records
         SET check_in_at = v_ts,
             status      = 'present'
       WHERE id = v_rec.id;

    WHEN 'lunch_start' THEN
      IF v_rec.check_in_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar ingreso primero');
      END IF;
      IF v_rec.lunch_start_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Almuerzo ya iniciado');
      END IF;
      IF v_rec.check_out_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya registraste salida hoy');
      END IF;
      UPDATE public.attendance_records
         SET lunch_start_at = v_ts
       WHERE id = v_rec.id;

    WHEN 'lunch_end' THEN
      IF v_rec.lunch_start_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No has iniciado el almuerzo');
      END IF;
      IF v_rec.lunch_end_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Almuerzo ya finalizado');
      END IF;
      UPDATE public.attendance_records
         SET lunch_end_at = v_ts
       WHERE id = v_rec.id;

    WHEN 'check_out' THEN
      IF v_rec.check_in_at IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Debes registrar ingreso primero');
      END IF;
      IF v_rec.check_out_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya registraste salida hoy');
      END IF;
      -- Si el almuerzo inició pero no terminó: cerrar almuerzo automáticamente
      IF v_rec.lunch_start_at IS NOT NULL AND v_rec.lunch_end_at IS NULL THEN
        UPDATE public.attendance_records SET lunch_end_at = v_ts WHERE id = v_rec.id;
        v_rec.lunch_end_at := v_ts;
      END IF;

      -- Calcular horas trabajadas (total − almuerzo)
      v_hours := EXTRACT(EPOCH FROM (v_ts - v_rec.check_in_at)) / 3600.0;
      IF v_rec.lunch_start_at IS NOT NULL AND v_rec.lunch_end_at IS NOT NULL THEN
        v_hours := v_hours
                 - EXTRACT(EPOCH FROM (v_rec.lunch_end_at - v_rec.lunch_start_at)) / 3600.0;
      END IF;

      UPDATE public.attendance_records
         SET check_out_at   = v_ts,
             hours_worked   = GREATEST(0, ROUND(v_hours::numeric, 2)),
             lunch_minutes  = CASE
               WHEN v_rec.lunch_start_at IS NOT NULL AND v_rec.lunch_end_at IS NOT NULL
               THEN ROUND(EXTRACT(EPOCH FROM (v_rec.lunch_end_at - v_rec.lunch_start_at)) / 60)::integer
               ELSE 0
             END,
             status = 'present'
       WHERE id = v_rec.id;

    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Evento inválido: ' || p_event);

  END CASE;

  -- Audit log
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_workspace_id, v_user_id,
    'attendance_' || p_event, 'attendance_records', v_rec.id,
    jsonb_build_object('event', p_event, 'timestamp', v_ts)
  );

  -- Retornar estado actualizado
  SELECT to_jsonb(r) INTO v_rec
    FROM public.attendance_records r
   WHERE workspace_id = v_workspace_id AND user_id = v_user_id AND date = v_today;

  RETURN jsonb_build_object('ok', true, 'record', to_jsonb(v_rec));
END;
$$;
