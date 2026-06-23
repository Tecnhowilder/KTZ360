-- ============================================================================
-- 0076 — loyalty_surveys_triggers: Triggers automáticos Sprint 16
-- ============================================================================
-- Trigger 1: OT finalizada → puntos de fidelidad (si loyalty_enabled)
-- Trigger 2: OT finalizada → encuesta disponible (anti-duplicate)
-- Trigger 3: Pedido completado → puntos por valor del pedido
-- ============================================================================

-- ─── 1. Asignación automática de puntos al finalizar OT ──────────────────────

create or replace function public.trg_loyalty_on_work_order_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_points    int;
  v_order_id  uuid;
begin
  if old.status = new.status then return new; end if;
  if new.status != 'finalizada' then return new; end if;

  -- Obtener cliente del pedido padre
  select o.client_id, o.id into v_client_id, v_order_id
  from public.orders o where o.id = new.order_id;

  if v_client_id is null then return new; end if;

  -- Asignar puntos por OT finalizada
  select points_on_ot_complete into v_points
  from public.loyalty_programs
  where workspace_id = new.workspace_id and active = true;

  if v_points > 0 then
    perform public.assign_loyalty_points(
      new.workspace_id, v_client_id, v_order_id, new.id,
      v_points, 'Puntos por OT finalizada: ' || new.work_order_number,
      'earned_ot'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_work_order_complete on public.work_orders;
create trigger trg_loyalty_on_work_order_complete
  after update of status on public.work_orders
  for each row execute function public.trg_loyalty_on_work_order_complete();

-- ─── 2. Asignación de puntos al completar pedido (por valor) ─────────────────

create or replace function public.trg_loyalty_on_order_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points       int;
  v_ppc          numeric;  -- points_per_currency
begin
  if old.status = new.status then return new; end if;
  if new.status != 'finalizado' then return new; end if;
  if new.client_id is null then return new; end if;

  select points_per_currency into v_ppc
  from public.loyalty_programs
  where workspace_id = new.workspace_id and active = true;

  if v_ppc is null or v_ppc = 0 then return new; end if;

  -- Puntos = valor_pedido × points_per_currency (redondeado)
  v_points := round(new.total_amount * v_ppc)::int;

  if v_points > 0 then
    perform public.assign_loyalty_points(
      new.workspace_id, new.client_id, new.id, null,
      v_points,
      '$ ' || round(new.total_amount)::text || ' en pedido ' || new.order_number,
      'earned_order'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_order_complete on public.orders;
create trigger trg_loyalty_on_order_complete
  after update of status on public.orders
  for each row execute function public.trg_loyalty_on_order_complete();

-- ─── 3. Encuesta automática al finalizar OT (con delay y anti-duplicate) ─────

create or replace function public.trg_survey_on_work_order_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey_id     uuid;
  v_client_id     uuid;
  v_delay_hours   int;
  v_survey_title  text;
begin
  if old.status = new.status then return new; end if;
  if new.status != 'finalizada' then return new; end if;

  -- Obtener cliente del pedido
  select o.client_id into v_client_id from public.orders o where o.id = new.order_id;
  if v_client_id is null then return new; end if;

  -- Buscar encuesta activa del workspace para este evento
  select id, delay_hours, title
  into v_survey_id, v_delay_hours, v_survey_title
  from public.surveys
  where workspace_id = new.workspace_id
    and active = true
    and trigger_event = 'work_order_completed'
  limit 1;

  if not found then return new; end if;

  -- Anti-duplicate: verificar que el cliente no ya respondió esta encuesta para esta OT
  if exists (
    select 1 from public.survey_responses
    where survey_id = v_survey_id
      and client_id = v_client_id
      and work_order_id = new.id
  ) then
    return new;
  end if;

  -- Encolar evento diferido en integration_events para que el portal muestre la encuesta
  -- Se usa provider='shelwi_internal', event_type='notify_user' con info de encuesta
  perform public.queue_integration_event(
    new.workspace_id,
    'shelwi_internal',
    'notify_user',
    jsonb_build_object(
      'title',            '📋 Tu opinión nos importa',
      'message_template', 'Por favor califica el servicio recibido en la OT ' || new.work_order_number,
      'survey_id',        v_survey_id,
      'work_order_id',    new.id,
      'client_id',        v_client_id,
      'type',             'survey'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_survey_on_work_order_complete on public.work_orders;
create trigger trg_survey_on_work_order_complete
  after update of status on public.work_orders
  for each row execute function public.trg_survey_on_work_order_complete();

-- ─── 4. Actualizar get_client_portal para incluir nuevos config fields ────────

create or replace function public.get_client_portal(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws       uuid;
  v_cl       uuid;
  v_tk       uuid;
  v_cfg      record;
begin
  select * into v_cfg from public._validate_portal_token(p_token, 'portal_opened');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Token inválido, expirado o revocado', 'code', 'invalid_token');
  end if;

  v_ws := v_cfg.workspace_id;
  v_cl := v_cfg.client_id;
  v_tk := v_cfg.token_id;

  if not v_cfg.portal_enabled then
    return jsonb_build_object('ok', false, 'error', 'El portal no está disponible para esta empresa', 'code', 'portal_disabled');
  end if;

  return jsonb_build_object(
    'ok', true,
    'client', (
      select jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone)
      from public.clients c where c.id = v_cl
    ),
    'company', (
      select jsonb_build_object(
        'name', cs.name, 'logo_path', cs.logo_path,
        'color_primary', cs.color_primary, 'color_secondary', cs.color_secondary,
        'color_accent', cs.color_accent, 'phone', cs.phone, 'email', cs.email, 'city', cs.city
      )
      from public.company_settings cs where cs.workspace_id = v_ws
    ),
    'config', jsonb_build_object(
      'show_evidences',   v_cfg.show_evidences,
      'show_responsible', v_cfg.show_responsible,
      'show_comments',    v_cfg.show_comments,
      'show_timeline',    v_cfg.show_timeline,
      -- Sprint 16: nuevos campos de config
      'show_reviews',   (select coalesce(portal_show_reviews, false) from public.company_settings where workspace_id = v_ws),
      'show_loyalty',   (select coalesce(portal_show_loyalty, false) from public.company_settings where workspace_id = v_ws),
      'loyalty_enabled',(select coalesce(loyalty_enabled, false)    from public.company_settings where workspace_id = v_ws),
      -- Encuesta activa disponible para este cliente
      'active_survey', (
        select jsonb_build_object('id', s.id, 'title', s.title)
        from public.surveys s
        where s.workspace_id = v_ws and s.active = true
          and not exists (
            select 1 from public.survey_responses sr
            where sr.survey_id = s.id and sr.client_id = v_cl
          )
        limit 1
      )
    ),
    'summary', (
      select jsonb_build_object(
        'total_quotes',    count(*)::int,
        'approved_quotes', count(*) filter (where status = 'Aprobada')::int,
        'pending_quotes',  count(*) filter (where status in ('Enviada','Borrador'))::int,
        'total_value',     coalesce(sum((calc_snapshot->>'total')::numeric) filter (where status = 'Aprobada'), 0)
      )
      from public.quotes where client_id = v_cl and workspace_id = v_ws and deleted_at is null
    ),
    'active_orders', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id, 'order_number', o.order_number, 'title', o.title,
          'status', o.status, 'scheduled_at', o.scheduled_at, 'total_amount', o.total_amount
        )
        order by o.updated_at desc
      ), '[]'::jsonb)
      from public.orders o
      where o.client_id = v_cl and o.workspace_id = v_ws
        and o.deleted_at is null and o.status not in ('finalizado','cancelado')
    ),
    'recent_quote', (
      select jsonb_build_object(
        'id', q.id, 'quote_number', q.quote_number, 'title', q.title,
        'status', q.status, 'commercial_status', q.commercial_status,
        'total', coalesce((q.calc_snapshot->>'total')::numeric, 0),
        'sent_at', q.sent_at, 'updated_at', q.updated_at
      )
      from public.quotes q
      where q.client_id = v_cl and q.workspace_id = v_ws and q.deleted_at is null
      order by q.updated_at desc limit 1
    )
  );
end;
$$;

comment on function public.trg_loyalty_on_work_order_complete is 'Sprint 16: asigna puntos al finalizar OT (si loyalty_enabled).';
comment on function public.trg_loyalty_on_order_complete      is 'Sprint 16: asigna puntos por valor del pedido al completar.';
comment on function public.trg_survey_on_work_order_complete  is 'Sprint 16: encola notificación de encuesta al finalizar OT (anti-duplicate).';
