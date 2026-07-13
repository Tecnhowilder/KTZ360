-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0129: GPS Haversine + distancia mínima + detección de mock location
-- ════════════════════════════════════════════════════════════════════════════
-- Mejoras sobre update_location_if_active (0125):
--   1. Solo escribe si el usuario se movió > MIN_DISTANCE_M metros (evita
--      escrituras por ruido GPS cuando el operario está quieto).
--   2. Rechaza coordenadas con patrones de mock location:
--      - accuracy = 0.0 exacto (imposible en GPS real)
--      - lat = 0 AND lng = 0 (coordenada nula — Ocean of Null)
--      - lat y lng ambos con 0 decimales y accuracy = 1.0 exacto
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Helper: distancia Haversine en metros ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.haversine_distance_m(
  p_lat1 numeric, p_lng1 numeric,
  p_lat2 numeric, p_lng2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r      constant numeric := 6371000; -- radio de la Tierra en metros
  dlat   numeric := radians(p_lat2 - p_lat1);
  dlng   numeric := radians(p_lng2 - p_lng1);
  a      numeric;
BEGIN
  a := sin(dlat/2)^2
     + cos(radians(p_lat1)) * cos(radians(p_lat2)) * sin(dlng/2)^2;
  RETURN r * 2 * atan2(sqrt(a), sqrt(1 - a));
END;
$$;

GRANT EXECUTE ON FUNCTION public.haversine_distance_m(numeric, numeric, numeric, numeric)
  TO authenticated, service_role;

-- ─── Helper: detección de mock location ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_mock_location(
  p_lat      numeric,
  p_lng      numeric,
  p_accuracy numeric
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Coordenada nula (0,0) — punto en el Océano Atlántico, imposible para operarios
  IF p_lat = 0 AND p_lng = 0 THEN RETURN true; END IF;

  -- Precisión exactamente 0 — imposible en GPS real
  IF p_accuracy IS NOT NULL AND p_accuracy = 0 THEN RETURN true; END IF;

  -- Lat y lng sin decimales + accuracy exactamente 1.0 → patrón de emulador
  IF p_lat = trunc(p_lat) AND p_lng = trunc(p_lng)
     AND p_accuracy IS NOT NULL AND p_accuracy = 1.0 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_mock_location(numeric, numeric, numeric)
  TO authenticated, service_role;

-- ─── update_location_if_active mejorado ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_location_if_active(
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_ws_id          uuid;
  v_consent        timestamptz;
  v_coord_ok       jsonb;
  v_has_active_ot  boolean;
  v_prev_lat       numeric;
  v_prev_lng       numeric;
  v_dist_m         numeric;
  MIN_DISTANCE_M   constant numeric := 50.0;
BEGIN
  SELECT workspace_id, gps_consent_at
    INTO v_ws_id, v_consent
    FROM public.profiles
   WHERE id = v_user_id AND status = 'active';

  IF NOT FOUND OR v_consent IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;

  IF NOT public.check_feature_access(v_ws_id, 'gps_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'no_feature');
  END IF;

  -- Detección de mock location
  IF public.is_mock_location(p_latitude, p_longitude, p_accuracy) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'mock_location_detected');
  END IF;

  v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
  IF NOT (v_coord_ok->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
  END IF;

  -- Solo actualiza si hay OT activa asignada
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders
     WHERE assigned_to  = v_user_id
       AND workspace_id = v_ws_id
       AND status IN ('asignada', 'en_progreso')
  ) INTO v_has_active_ot;

  IF NOT v_has_active_ot THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_active_ot');
  END IF;

  -- Leer posición anterior (si existe)
  SELECT latitude, longitude INTO v_prev_lat, v_prev_lng
    FROM public.member_locations
   WHERE workspace_id = v_ws_id AND user_id = v_user_id;

  -- Si hay posición anterior, calcular distancia
  IF FOUND AND v_prev_lat IS NOT NULL AND v_prev_lng IS NOT NULL THEN
    v_dist_m := public.haversine_distance_m(
      v_prev_lat, v_prev_lng, p_latitude, p_longitude
    );
    IF v_dist_m < MIN_DISTANCE_M THEN
      RETURN jsonb_build_object(
        'ok',        true,
        'skipped',   'below_threshold',
        'distance_m', ROUND(v_dist_m, 1)
      );
    END IF;
  END IF;

  -- UPSERT ubicación (sin histórico en gps_events = protege batería y storage)
  INSERT INTO public.member_locations
    (workspace_id, user_id, latitude, longitude, accuracy_meters, source)
  VALUES
    (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy, 'auto')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    latitude        = excluded.latitude,
    longitude       = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    source          = 'auto',
    recorded_at     = now();

  RETURN jsonb_build_object(
    'ok',         true,
    'updated',    true,
    'distance_m', ROUND(COALESCE(v_dist_m, 0)::numeric, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_location_if_active(numeric, numeric, numeric)
  TO authenticated;

COMMENT ON FUNCTION public.update_location_if_active IS
  '0129: Añade Haversine (umbral 50m), detección de mock location y '
  'source="auto" para tracking automático vs "manual" para acciones del usuario.';
