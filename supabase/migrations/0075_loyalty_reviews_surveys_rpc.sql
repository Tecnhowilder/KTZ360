-- ============================================================================
-- 0075 — loyalty_reviews_surveys_rpc: RPCs Sprint 16
-- ============================================================================
-- Zero Trust: tokens validados en cada RPC pública.
-- Workspace isolation: nunca datos cruzados.
-- ============================================================================

-- ─── Helper interno: validar token portal (reutiliza _validate_portal_token) ─
-- La función _validate_portal_token ya existe desde Sprint 10.

-- ============================================================================
-- RPC 1: submit_review — cliente deja reseña desde portal (sin auth)
-- ============================================================================

create or replace function public.submit_review(
  p_token    uuid,
  p_order_id uuid,
  p_rating   int,
  p_comment  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      record;
  v_review_id uuid;
  v_client_id uuid;
  v_token_id  uuid;
begin
  -- Validar token
  select * into v_cfg from public._validate_portal_token(p_token, 'quote_viewed');
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Token inválido o portal desactivado');
  end if;

  -- Verificar que la empresa permite reseñas
  if not exists (
    select 1 from public.company_settings
    where workspace_id = v_cfg.workspace_id and portal_show_reviews = true
  ) then
    return jsonb_build_object('ok', false, 'error', 'Las reseñas no están habilitadas en este portal');
  end if;

  -- Validar rating
  if p_rating not between 1 and 5 then
    return jsonb_build_object('ok', false, 'error', 'La calificación debe ser entre 1 y 5');
  end if;

  -- Verificar que el pedido pertenece a este cliente
  if not exists (
    select 1 from public.orders
    where id = p_order_id and client_id = v_cfg.client_id
      and workspace_id = v_cfg.workspace_id and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;

  -- Obtener token_id para la ref
  select id into v_token_id
  from public.client_portal_tokens
  where token = p_token and revoked_at is null;

  -- Insertar reseña (anti-duplicate por UNIQUE constraint)
  begin
    insert into public.reviews
      (workspace_id, client_id, order_id, rating, comment, created_via_token)
    values
      (v_cfg.workspace_id, v_cfg.client_id, p_order_id, p_rating, p_comment, v_token_id)
    returning id into v_review_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Ya dejaste una reseña para este pedido');
  end;

  -- Notificar a owner/admin
  insert into public.notifications (workspace_id, user_id, title, message, type)
  select v_cfg.workspace_id, p.id,
    '⭐ Nueva reseña ' || repeat('★', p_rating) || repeat('☆', 5 - p_rating),
    coalesce(p_comment, 'Sin comentario'),
    'info'
  from public.profiles p
  where p.workspace_id = v_cfg.workspace_id and p.role in ('owner','admin') and p.status = 'active';

  -- Asignar puntos bonus si hay loyalty activo
  if exists (
    select 1 from public.loyalty_programs
    where workspace_id = v_cfg.workspace_id and active = true and points_on_review > 0
  ) then
    perform public.assign_loyalty_points(
      v_cfg.workspace_id, v_cfg.client_id, p_order_id, null,
      (select points_on_review from public.loyalty_programs where workspace_id = v_cfg.workspace_id and active = true),
      'Puntos por dejar reseña'
    );
  end if;

  return jsonb_build_object('ok', true, 'review_id', v_review_id, 'rating', p_rating);
end;
$$;

-- ============================================================================
-- RPC 2: respond_to_review — empresa responde una reseña (autenticado)
-- ============================================================================

create or replace function public.respond_to_review(
  p_review_id uuid,
  p_response  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.reviews where id = p_review_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Reseña no encontrada'); end if;

  if not exists (
    select 1 from public.profiles
    where workspace_id = v_workspace_id and id = v_user_id
      and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos');
  end if;

  insert into public.review_responses (review_id, workspace_id, responded_by, response)
  values (p_review_id, v_workspace_id, v_user_id, p_response)
  on conflict (review_id) do update set response = excluded.response;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.respond_to_review(uuid, text) to authenticated;

-- ============================================================================
-- RPC 3: get_reviews — empresa ve sus reseñas con estadísticas
-- ============================================================================

create or replace function public.get_reviews(
  p_workspace_id uuid,
  p_limit        int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'stats', (
      select jsonb_build_object(
        'total',   count(*)::int,
        'avg',     round(avg(rating), 1),
        'stars_5', count(*) filter (where rating = 5)::int,
        'stars_4', count(*) filter (where rating = 4)::int,
        'stars_3', count(*) filter (where rating = 3)::int,
        'stars_2', count(*) filter (where rating = 2)::int,
        'stars_1', count(*) filter (where rating = 1)::int
      )
      from public.reviews where workspace_id = p_workspace_id and visible = true
    ),
    'reviews', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',        r.id,
          'rating',    r.rating,
          'comment',   r.comment,
          'created_at',r.created_at,
          'client_name',c.name,
          'order_number',o.order_number,
          'response',  rr.response,
          'responded_at',rr.created_at
        )
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.reviews r
      left join public.clients c on c.id = r.client_id
      left join public.orders o  on o.id = r.order_id
      left join public.review_responses rr on rr.review_id = r.id
      where r.workspace_id = p_workspace_id and r.visible = true
      limit p_limit
    )
  );
end;
$$;

grant execute on function public.get_reviews(uuid, int) to authenticated;

-- ============================================================================
-- RPC 4: submit_survey_response — cliente responde encuesta (sin auth, con token)
-- ============================================================================

create or replace function public.submit_survey_response(
  p_token      uuid,
  p_survey_id  uuid,
  p_answers    jsonb,
  p_nps_score  int default null,
  p_order_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      record;
  v_token_id uuid;
  v_resp_id  uuid;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'portal_opened');
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Token inválido');
  end if;

  -- Validar NPS si se envía
  if p_nps_score is not null and p_nps_score not between 0 and 10 then
    return jsonb_build_object('ok', false, 'error', 'NPS debe ser entre 0 y 10');
  end if;

  -- Verificar que la encuesta pertenece al workspace y está activa
  if not exists (
    select 1 from public.surveys
    where id = p_survey_id and workspace_id = v_cfg.workspace_id and active = true
  ) then
    return jsonb_build_object('ok', false, 'error', 'Encuesta no disponible');
  end if;

  select id into v_token_id from public.client_portal_tokens where token = p_token;

  begin
    insert into public.survey_responses
      (survey_id, workspace_id, client_id, order_id, answers, nps_score, created_via_token)
    values
      (p_survey_id, v_cfg.workspace_id, v_cfg.client_id, p_order_id, p_answers, p_nps_score, v_token_id)
    returning id into v_resp_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Ya respondiste esta encuesta');
  end;

  return jsonb_build_object('ok', true, 'response_id', v_resp_id);
end;
$$;

-- ============================================================================
-- RPC 5: get_survey_responses — empresa ve respuestas con NPS
-- ============================================================================

create or replace function public.get_survey_responses(
  p_workspace_id uuid,
  p_survey_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'surveys', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', s.id, 'title', s.title, 'active', s.active)
      ), '[]'::jsonb)
      from public.surveys s
      where s.workspace_id = p_workspace_id
    ),
    'responses', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           sr.id,
          'survey_id',    sr.survey_id,
          'nps_score',    sr.nps_score,
          'answers',      sr.answers,
          'client_name',  c.name,
          'order_number', o.order_number,
          'created_at',   sr.created_at
        )
        order by sr.created_at desc
      ), '[]'::jsonb)
      from public.survey_responses sr
      left join public.clients c on c.id = sr.client_id
      left join public.orders o  on o.id = sr.order_id
      where sr.workspace_id = p_workspace_id
        and (p_survey_id is null or sr.survey_id = p_survey_id)
    )
  );
end;
$$;

grant execute on function public.get_survey_responses(uuid, uuid) to authenticated;

-- ============================================================================
-- RPC 6: assign_loyalty_points — asignar puntos (security definer)
-- ============================================================================

create or replace function public.assign_loyalty_points(
  p_workspace_id  uuid,
  p_client_id     uuid,
  p_order_id      uuid,
  p_work_order_id uuid,
  p_points        int,
  p_description   text  default null,
  p_type          text  default 'earned_order'
)
returns uuid  -- transaction id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
begin
  -- Verificar que el programa está activo
  if not exists (
    select 1 from public.loyalty_programs
    where workspace_id = p_workspace_id and active = true
  ) then
    return null;
  end if;

  -- Verificar que el loyalty está habilitado para el workspace
  if not exists (
    select 1 from public.company_settings
    where workspace_id = p_workspace_id and loyalty_enabled = true
  ) then
    return null;
  end if;

  insert into public.loyalty_transactions
    (workspace_id, client_id, order_id, work_order_id, points, type, description)
  values
    (p_workspace_id, p_client_id, p_order_id, p_work_order_id, p_points, p_type, p_description)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

grant execute on function public.assign_loyalty_points(uuid, uuid, uuid, uuid, int, text, text) to authenticated, service_role;

-- ============================================================================
-- RPC 7: get_client_loyalty — cliente ve sus puntos en portal (sin auth)
-- ============================================================================

create or replace function public.get_client_loyalty(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg         record;
  v_total_pts   int;
  v_program     record;
  v_level       jsonb;
  v_next_level  jsonb;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'portal_opened');
  if not found or not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'Token inválido');
  end if;

  if not exists (
    select 1 from public.company_settings
    where workspace_id = v_cfg.workspace_id and portal_show_loyalty = true
  ) then
    return jsonb_build_object('ok', false, 'error', 'Loyalty no disponible en este portal');
  end if;

  -- Calcular puntos totales del cliente
  select coalesce(sum(points), 0)::int into v_total_pts
  from public.loyalty_transactions
  where workspace_id = v_cfg.workspace_id and client_id = v_cfg.client_id;

  -- Obtener programa y nivel actual
  select * into v_program
  from public.loyalty_programs
  where workspace_id = v_cfg.workspace_id and active = true;

  if found then
    -- Determinar nivel actual desde JSONB levels
    select level into v_level
    from jsonb_array_elements(v_program.levels) as level
    where (level->>'min')::int <= v_total_pts
      and (level->>'max' is null or (level->>'max')::int >= v_total_pts)
    limit 1;

    -- Siguiente nivel
    select level into v_next_level
    from jsonb_array_elements(v_program.levels) as level
    where (level->>'min')::int > v_total_pts
    order by (level->>'min')::int asc
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'total_points', v_total_pts,
    'current_level', v_level,
    'next_level', v_next_level,
    'points_to_next', case when v_next_level is not null
      then ((v_next_level->>'min')::int - v_total_pts)
      else 0 end,
    'transactions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'points',      lt.points,
          'type',        lt.type,
          'description', lt.description,
          'created_at',  lt.created_at
        )
        order by lt.created_at desc
      ), '[]'::jsonb)
      from public.loyalty_transactions lt
      where lt.workspace_id = v_cfg.workspace_id and lt.client_id = v_cfg.client_id
      limit 20
    ),
    'rewards', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',             lr.id,
          'name',           lr.name,
          'description',    lr.description,
          'points_required',lr.points_required,
          'can_redeem',     v_total_pts >= lr.points_required,
          'available',      lr.quantity_available is null or lr.quantity_available > lr.quantity_redeemed
        )
        order by lr.points_required asc
      ), '[]'::jsonb)
      from public.loyalty_rewards lr
      where lr.workspace_id = v_cfg.workspace_id and lr.active = true
    )
  );
end;
$$;

-- ============================================================================
-- RPC 8: get_nps_summary — NPS + satisfacción por workspace
-- ============================================================================

create or replace function public.get_nps_summary(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total       int;
  v_promoters   int;   -- NPS 9-10
  v_passives    int;   -- NPS 7-8
  v_detractors  int;   -- NPS 0-6
  v_nps         int;
  v_avg_rating  numeric;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  -- NPS desde survey_responses
  select
    count(*)::int,
    count(*) filter (where nps_score >= 9)::int,
    count(*) filter (where nps_score between 7 and 8)::int,
    count(*) filter (where nps_score <= 6)::int
  into v_total, v_promoters, v_passives, v_detractors
  from public.survey_responses
  where workspace_id = p_workspace_id and nps_score is not null;

  -- NPS = (promotores% - detractores%) × 100
  v_nps := case when v_total > 0
    then round(((v_promoters::numeric - v_detractors) / v_total) * 100)::int
    else null
  end;

  -- Satisfacción promedio desde reviews
  select round(avg(rating), 1) into v_avg_rating
  from public.reviews where workspace_id = p_workspace_id and visible = true;

  return jsonb_build_object(
    'ok', true,
    'nps', v_nps,
    'nps_total_responses', v_total,
    'promoters',   v_promoters,
    'passives',    v_passives,
    'detractors',  v_detractors,
    'avg_rating',  v_avg_rating,
    'total_reviews',(select count(*)::int from public.reviews where workspace_id = p_workspace_id and visible = true),
    'nps_label', case
      when v_nps is null then 'Sin datos'
      when v_nps >= 50   then 'Excelente'
      when v_nps >= 0    then 'Bueno'
      else 'Mejorar'
    end
  );
end;
$$;

grant execute on function public.get_nps_summary(uuid) to authenticated;

-- Permisos RPCs públicas (sin auth — usan token)
grant execute on function public.submit_review(uuid, uuid, int, text)      to anon, authenticated;
grant execute on function public.submit_survey_response(uuid, uuid, jsonb, int, uuid) to anon, authenticated;
grant execute on function public.get_client_loyalty(uuid)                  to anon, authenticated;

comment on function public.submit_review          is 'Sprint 16: cliente deja reseña desde portal (token). Anti-duplicate.';
comment on function public.respond_to_review      is 'Sprint 16: empresa responde reseña. Una sola respuesta.';
comment on function public.get_reviews            is 'Sprint 16: reseñas con estadísticas para la empresa.';
comment on function public.submit_survey_response is 'Sprint 16: cliente responde encuesta + NPS (token). Anti-duplicate.';
comment on function public.get_survey_responses   is 'Sprint 16: respuestas de encuestas para la empresa.';
comment on function public.assign_loyalty_points  is 'Sprint 16: asignar puntos de fidelidad. Solo ejecutable si loyalty_enabled=true.';
comment on function public.get_client_loyalty     is 'Sprint 16: puntos, nivel y recompensas del cliente (token).';
comment on function public.get_nps_summary        is 'Sprint 16: NPS + satisfacción promedio del workspace.';
