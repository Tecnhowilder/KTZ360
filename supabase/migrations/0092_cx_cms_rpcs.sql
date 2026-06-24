-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0092: Customer Experience CMS RPCs
-- Administración de Loyalty · Reviews · Surveys
-- Zero Trust: workspace_id del JWT. Owner/admin siempre.
-- NO duplica: submit_review, respond_to_review, get_reviews, get_nps_summary,
--              get_client_loyalty, assign_loyalty_points, get_survey_responses.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── LOYALTY ─────────────────────────────────────────────────────────────────

-- RPC 1: upsert_loyalty_program — configurar el programa de fidelización
CREATE OR REPLACE FUNCTION public.upsert_loyalty_program(
  p_workspace_id       uuid,
  p_name               text          DEFAULT NULL,
  p_description        text          DEFAULT NULL,
  p_points_per_currency numeric       DEFAULT NULL,
  p_points_on_ot       int           DEFAULT NULL,
  p_points_on_review   int           DEFAULT NULL,
  p_levels             jsonb         DEFAULT NULL,
  p_active             boolean       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prog_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden configurar el programa de fidelización');
  END IF;

  INSERT INTO public.loyalty_programs (
    workspace_id, name, description,
    points_per_currency, points_on_ot_complete, points_on_review,
    levels, active
  )
  VALUES (
    p_workspace_id,
    COALESCE(p_name, 'Programa de Fidelización'),
    p_description,
    COALESCE(p_points_per_currency, 1.0),
    COALESCE(p_points_on_ot,     50),
    COALESCE(p_points_on_review, 100),
    COALESCE(p_levels, '[
      {"name":"Bronce","min":0,"max":499,"color":"#CD7F32","icon":"🥉"},
      {"name":"Plata","min":500,"max":1499,"color":"#94A3B8","icon":"🥈"},
      {"name":"Oro","min":1500,"max":2999,"color":"#D97706","icon":"🥇"},
      {"name":"Diamante","min":3000,"max":null,"color":"#7C3AED","icon":"💎"}
    ]'::jsonb),
    COALESCE(p_active, true)
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    name                 = COALESCE(p_name,               loyalty_programs.name),
    description          = COALESCE(p_description,        loyalty_programs.description),
    points_per_currency  = COALESCE(p_points_per_currency,loyalty_programs.points_per_currency),
    points_on_ot_complete= COALESCE(p_points_on_ot,       loyalty_programs.points_on_ot_complete),
    points_on_review     = COALESCE(p_points_on_review,   loyalty_programs.points_on_review),
    levels               = COALESCE(p_levels,             loyalty_programs.levels),
    active               = COALESCE(p_active,             loyalty_programs.active),
    updated_at           = now()
  RETURNING id INTO v_prog_id;

  RETURN jsonb_build_object('ok', true, 'id', v_prog_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_loyalty_program(uuid,text,text,numeric,int,int,jsonb,boolean) TO authenticated;

-- RPC 2: upsert_loyalty_reward — crear/editar recompensa
CREATE OR REPLACE FUNCTION public.upsert_loyalty_reward(
  p_workspace_id     uuid,
  p_reward_id        uuid     DEFAULT NULL,
  p_name             text     DEFAULT NULL,
  p_description      text     DEFAULT NULL,
  p_points_required  int      DEFAULT NULL,
  p_quantity         int      DEFAULT NULL,
  p_active           boolean  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_id       uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden gestionar recompensas');
  END IF;

  IF p_points_required IS NOT NULL AND p_points_required <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Los puntos requeridos deben ser > 0');
  END IF;

  IF p_reward_id IS NOT NULL THEN
    -- Actualizar existente
    UPDATE public.loyalty_rewards SET
      name             = COALESCE(p_name,            name),
      description      = COALESCE(p_description,     description),
      points_required  = COALESCE(p_points_required, points_required),
      quantity_available = COALESCE(p_quantity,       quantity_available),
      active           = COALESCE(p_active,           active),
      updated_at       = now()
    WHERE id = p_reward_id AND workspace_id = p_workspace_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Recompensa no encontrada');
    END IF;
  ELSE
    -- Crear nueva
    IF p_name IS NULL OR p_points_required IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Nombre y puntos requeridos son obligatorios');
    END IF;
    INSERT INTO public.loyalty_rewards
      (workspace_id, name, description, points_required, quantity_available, active)
    VALUES
      (p_workspace_id, p_name, p_description, p_points_required, p_quantity, COALESCE(p_active, true))
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_loyalty_reward(uuid,uuid,text,text,int,int,boolean) TO authenticated;

-- RPC 3: delete_loyalty_reward — eliminar recompensa
CREATE OR REPLACE FUNCTION public.delete_loyalty_reward(
  p_workspace_id uuid,
  p_reward_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden eliminar recompensas');
  END IF;

  DELETE FROM public.loyalty_rewards
  WHERE id = p_reward_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Recompensa no encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_loyalty_reward(uuid, uuid) TO authenticated;

-- RPC 4: adjust_loyalty_points — ajuste manual de puntos (bonus, corrección)
CREATE OR REPLACE FUNCTION public.adjust_loyalty_points(
  p_workspace_id uuid,
  p_client_id    uuid,
  p_points       int,
  p_description  text DEFAULT 'Ajuste manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden ajustar puntos');
  END IF;

  IF p_points = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El ajuste no puede ser 0 puntos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND workspace_id = p_workspace_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  INSERT INTO public.loyalty_transactions
    (workspace_id, client_id, points, type, description)
  VALUES
    (p_workspace_id, p_client_id, p_points,
     CASE WHEN p_points > 0 THEN 'bonus' ELSE 'adjustment' END,
     p_description);

  RETURN jsonb_build_object('ok', true, 'points_adjusted', p_points);
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_loyalty_points(uuid, uuid, int, text) TO authenticated;

-- RPC 5: get_loyalty_dashboard — dashboard de loyalty para el workspace
CREATE OR REPLACE FUNCTION public.get_loyalty_dashboard(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_program jsonb;
  v_rewards jsonb;
  v_summary jsonb;
  v_top_clients jsonb;
  v_recent_tx   jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  -- Programa actual
  SELECT row_to_json(lp)::jsonb INTO v_program
  FROM public.loyalty_programs lp
  WHERE lp.workspace_id = p_workspace_id
  LIMIT 1;

  -- Recompensas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', lr.id, 'name', lr.name, 'description', lr.description,
    'points_required', lr.points_required,
    'quantity_available', lr.quantity_available,
    'quantity_redeemed', lr.quantity_redeemed,
    'active', lr.active
  ) ORDER BY lr.points_required), '[]'::jsonb)
  INTO v_rewards
  FROM public.loyalty_rewards lr
  WHERE lr.workspace_id = p_workspace_id;

  -- Summary de transacciones
  SELECT jsonb_build_object(
    'total_points_issued',   COALESCE(SUM(points) FILTER (WHERE points > 0), 0)::int,
    'total_points_redeemed', COALESCE(ABS(SUM(points) FILTER (WHERE points < 0)), 0)::int,
    'active_participants',   COUNT(DISTINCT client_id)::int,
    'tx_last_30d',           COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int
  )
  INTO v_summary
  FROM public.loyalty_transactions
  WHERE workspace_id = p_workspace_id;

  -- Top 5 clientes por puntos totales
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'client_id',   c.id,
    'client_name', c.name,
    'total_points', pts.total
  ) ORDER BY pts.total DESC), '[]'::jsonb)
  INTO v_top_clients
  FROM (
    SELECT client_id, SUM(points)::int AS total
    FROM public.loyalty_transactions
    WHERE workspace_id = p_workspace_id
    GROUP BY client_id
    HAVING SUM(points) > 0
    ORDER BY SUM(points) DESC
    LIMIT 5
  ) pts
  JOIN public.clients c ON c.id = pts.client_id;

  -- Últimas 10 transacciones del workspace
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',          lt.id,
    'client_name', c.name,
    'points',      lt.points,
    'type',        lt.type,
    'description', lt.description,
    'created_at',  lt.created_at
  ) ORDER BY lt.created_at DESC), '[]'::jsonb)
  INTO v_recent_tx
  FROM public.loyalty_transactions lt
  JOIN public.clients c ON c.id = lt.client_id
  WHERE lt.workspace_id = p_workspace_id
  LIMIT 10;

  RETURN jsonb_build_object(
    'ok',          true,
    'program',     v_program,
    'rewards',     v_rewards,
    'summary',     v_summary,
    'top_clients', v_top_clients,
    'recent_tx',   v_recent_tx
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_loyalty_dashboard(uuid) TO authenticated;

-- ─── REVIEWS ─────────────────────────────────────────────────────────────────

-- RPC 6: toggle_review_visibility — moderar reseña (ocultar/mostrar)
CREATE OR REPLACE FUNCTION public.toggle_review_visibility(
  p_workspace_id uuid,
  p_review_id    uuid,
  p_visible      boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden moderar reseñas');
  END IF;

  UPDATE public.reviews
  SET visible = p_visible
  WHERE id = p_review_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reseña no encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true, 'visible', p_visible);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_review_visibility(uuid, uuid, boolean) TO authenticated;

-- ─── SURVEYS ─────────────────────────────────────────────────────────────────

-- RPC 7: upsert_survey — crear/actualizar encuesta
CREATE OR REPLACE FUNCTION public.upsert_survey(
  p_workspace_id uuid,
  p_survey_id    uuid     DEFAULT NULL,
  p_title        text     DEFAULT NULL,
  p_description  text     DEFAULT NULL,
  p_questions    jsonb    DEFAULT NULL,
  p_include_nps  boolean  DEFAULT NULL,
  p_trigger      text     DEFAULT NULL,
  p_delay_hours  int      DEFAULT NULL,
  p_active       boolean  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id      uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden gestionar encuestas');
  END IF;

  IF p_trigger IS NOT NULL AND p_trigger NOT IN ('order_completed','work_order_completed','manual') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trigger inválido');
  END IF;

  IF p_survey_id IS NOT NULL THEN
    UPDATE public.surveys SET
      title        = COALESCE(p_title,       title),
      description  = COALESCE(p_description, description),
      questions    = COALESCE(p_questions,   questions),
      include_nps  = COALESCE(p_include_nps, include_nps),
      trigger_event= COALESCE(p_trigger,     trigger_event),
      delay_hours  = COALESCE(p_delay_hours, delay_hours),
      active       = COALESCE(p_active,      active),
      updated_at   = now()
    WHERE id = p_survey_id AND workspace_id = p_workspace_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Encuesta no encontrada');
    END IF;
  ELSE
    INSERT INTO public.surveys
      (workspace_id, title, description, questions, include_nps, trigger_event, delay_hours, active)
    VALUES (
      p_workspace_id,
      COALESCE(p_title, 'Encuesta de Satisfacción'),
      p_description,
      COALESCE(p_questions, '[]'::jsonb),
      COALESCE(p_include_nps, true),
      COALESCE(p_trigger, 'order_completed'),
      COALESCE(p_delay_hours, 24),
      COALESCE(p_active, false)
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_survey(uuid,uuid,text,text,jsonb,boolean,text,int,boolean) TO authenticated;

-- RPC 8: delete_survey — eliminar encuesta
CREATE OR REPLACE FUNCTION public.delete_survey(
  p_workspace_id uuid,
  p_survey_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count   int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id
      AND role IN ('owner','admin') AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin pueden eliminar encuestas');
  END IF;

  SELECT COUNT(*)::int INTO v_count
  FROM public.survey_responses
  WHERE survey_id = p_survey_id AND workspace_id = p_workspace_id;

  IF v_count > 0 THEN
    -- No eliminar si hay respuestas; solo desactivar
    UPDATE public.surveys SET active = false, updated_at = now()
    WHERE id = p_survey_id AND workspace_id = p_workspace_id;
    RETURN jsonb_build_object('ok', true, 'action', 'deactivated',
      'note', 'La encuesta tiene ' || v_count || ' respuestas y fue desactivada en lugar de eliminada');
  END IF;

  DELETE FROM public.surveys WHERE id = p_survey_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Encuesta no encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', 'deleted');
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_survey(uuid, uuid) TO authenticated;

-- RPC 9: get_cx_dashboard — dashboard consolidado de Customer Experience
-- Reutiliza: get_nps_summary + get_reviews + get_loyalty_dashboard
-- NO duplica customer_success (Sprint 15 — health scores)
CREATE OR REPLACE FUNCTION public.get_cx_dashboard(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_nps     jsonb;
  v_reviews jsonb;
  v_loyalty jsonb;
  v_surveys jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  END IF;

  -- NPS y satisfacción (reutiliza RPC existente)
  v_nps     := public.get_nps_summary(p_workspace_id);

  -- Reviews recientes (reutiliza RPC existente)
  v_reviews := public.get_reviews(p_workspace_id, 20);

  -- Loyalty dashboard (nueva RPC)
  v_loyalty := public.get_loyalty_dashboard(p_workspace_id);

  -- Encuestas activas y sus estadísticas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           s.id,
    'title',        s.title,
    'active',       s.active,
    'trigger',      s.trigger_event,
    'include_nps',  s.include_nps,
    'delay_hours',  s.delay_hours,
    'responses',    (SELECT COUNT(*)::int FROM public.survey_responses sr WHERE sr.survey_id = s.id),
    'avg_nps',      (SELECT round(AVG(nps_score)::numeric, 1) FROM public.survey_responses sr WHERE sr.survey_id = s.id AND sr.nps_score IS NOT NULL)
  ) ORDER BY s.active DESC, s.created_at DESC), '[]'::jsonb)
  INTO v_surveys
  FROM public.surveys s
  WHERE s.workspace_id = p_workspace_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'nps',      v_nps,
    'reviews',  v_reviews,
    'loyalty',  v_loyalty,
    'surveys',  v_surveys
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_cx_dashboard(uuid) TO authenticated;

COMMENT ON FUNCTION public.upsert_loyalty_program   IS 'CX CMS: configura el programa de fidelización del workspace. Solo owner/admin.';
COMMENT ON FUNCTION public.upsert_loyalty_reward    IS 'CX CMS: crea/actualiza recompensa en el catálogo de loyalty. Solo owner/admin.';
COMMENT ON FUNCTION public.delete_loyalty_reward    IS 'CX CMS: elimina recompensa del catálogo. Solo owner/admin.';
COMMENT ON FUNCTION public.adjust_loyalty_points    IS 'CX CMS: ajuste manual de puntos de fidelización. Solo owner/admin.';
COMMENT ON FUNCTION public.get_loyalty_dashboard    IS 'CX CMS: dashboard de loyalty por workspace con programa, recompensas, top clientes y transacciones recientes.';
COMMENT ON FUNCTION public.toggle_review_visibility IS 'CX CMS: moderar visibilidad de reseña. Solo owner/admin.';
COMMENT ON FUNCTION public.upsert_survey            IS 'CX CMS: crear/actualizar encuesta de satisfacción. Solo owner/admin.';
COMMENT ON FUNCTION public.delete_survey            IS 'CX CMS: elimina encuesta (o desactiva si tiene respuestas). Solo owner/admin.';
COMMENT ON FUNCTION public.get_cx_dashboard         IS 'CX CMS: dashboard consolidado NPS + Reviews + Loyalty + Surveys. Reutiliza get_nps_summary, get_reviews, get_loyalty_dashboard.';
