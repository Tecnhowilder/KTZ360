-- ============================================================================
-- 0079 — growth_rpc: RPCs de Growth Sprint 17
-- ============================================================================
-- Zero Trust: workspace_id siempre del JWT o del token.
-- Recompensas vía loyalty_transactions (Sprint 16) — sin duplicar sistema.
-- Campañas vía automation_rules (Sprint 13) — sin duplicar motor.
-- ============================================================================

-- ─── Helper: generar código corto único ──────────────────────────────────────

create or replace function public.generate_ref_code()
returns text
language sql
as $$
  select substring(encode(gen_random_bytes(6), 'hex'), 1, 8);
$$;

-- ============================================================================
-- RPC 1: create_referral_link — cliente genera su link de referido
-- ============================================================================

create or replace function public.create_referral_link(
  p_workspace_id uuid,
  p_client_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_code     text;
  v_link_id  uuid;
  v_program  record;
begin
  -- Validar acceso al workspace
  if not exists (
    select 1 from public.profiles where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Verificar que hay un programa activo
  select * into v_program from public.referral_programs
  where workspace_id = p_workspace_id and active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No hay un programa de referidos activo');
  end if;

  -- Si el cliente ya tiene un link activo, devolverlo
  select id, ref_code into v_link_id, v_code
  from public.referral_links
  where workspace_id = p_workspace_id
    and (p_client_id is null or client_id = p_client_id)
    and active = true
  limit 1;

  if not found then
    -- Generar código único (reintenta si colisión)
    loop
      v_code := public.generate_ref_code();
      exit when not exists (select 1 from public.referral_links where ref_code = v_code);
    end loop;

    insert into public.referral_links (workspace_id, client_id, ref_code)
    values (p_workspace_id, p_client_id, v_code)
    returning id into v_link_id;
  end if;

  return jsonb_build_object(
    'ok',       true,
    'link_id',  v_link_id,
    'ref_code', v_code,
    'ref_url',  '/ref/' || v_code,
    'program',  jsonb_build_object(
      'referrer_points', v_program.referrer_points,
      'referee_points',  v_program.referee_points
    )
  );
end;
$$;

grant execute on function public.create_referral_link(uuid, uuid) to authenticated;

-- ============================================================================
-- RPC 2: track_referral_visit — registrar visita con UTM (sin auth)
-- ============================================================================

create or replace function public.track_referral_visit(
  p_ref_code   text,
  p_utm_source  text default null,
  p_utm_medium  text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term    text default null,
  p_landing_url text default null,
  p_referrer_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link     record;
begin
  -- Buscar el link
  select * into v_link
  from public.referral_links
  where ref_code = p_ref_code and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Link de referido inválido');
  end if;

  -- Incrementar visitas
  update public.referral_links
  set visits_count = visits_count + 1
  where id = v_link.id;

  -- Registrar evento UTM
  insert into public.utm_events
    (workspace_id, ref_code, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_url, referrer_url)
  values (
    v_link.workspace_id, p_ref_code,
    coalesce(p_utm_source, 'referral'), p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_landing_url, p_referrer_url
  );

  return jsonb_build_object(
    'ok',          true,
    'workspace_id',v_link.workspace_id,
    'referrer_id', v_link.client_id
  );
end;
$$;

-- Público: puede llamarse sin auth
grant execute on function public.track_referral_visit(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ============================================================================
-- RPC 3: register_referral_conversion — cuando un referido hace su primera compra
-- ============================================================================

create or replace function public.register_referral_conversion(
  p_ref_code        text,
  p_referee_client_id uuid,
  p_trigger_event   text default 'quote_approved'  -- 'client_created'|'quote_created'|'quote_approved'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link          record;
  v_program       record;
  v_conv_id       uuid;
  v_current_status text;
  v_new_status    text;
begin
  -- Obtener el link
  select * into v_link from public.referral_links
  where ref_code = p_ref_code and active = true;
  if not found then return jsonb_build_object('ok', false, 'error', 'Link inválido'); end if;

  -- Obtener programa
  select * into v_program from public.referral_programs
  where workspace_id = v_link.workspace_id and active = true;
  if not found then return jsonb_build_object('ok', false, 'error', 'Programa no activo'); end if;

  -- Determinar nuevo status
  v_new_status := p_trigger_event;

  -- Si ya existe una conversión, actualizar estado
  select id, status into v_conv_id, v_current_status
  from public.referral_conversions
  where workspace_id = v_link.workspace_id and referee_client_id = p_referee_client_id;

  if found then
    -- Solo avanzar estado (nunca retroceder)
    if (v_current_status = 'registered' and v_new_status in ('quote_created','quote_approved'))
    or (v_current_status = 'quote_created' and v_new_status = 'quote_approved') then
      update public.referral_conversions
      set status = v_new_status
      where id = v_conv_id;
    end if;
  else
    -- Crear conversión
    insert into public.referral_conversions
      (workspace_id, referral_link_id, referrer_client_id, referee_client_id, status)
    values
      (v_link.workspace_id, v_link.id, v_link.client_id, p_referee_client_id, v_new_status)
    returning id into v_conv_id;

    -- Incrementar conversiones en el link
    update public.referral_links set conversions_count = conversions_count + 1 where id = v_link.id;
  end if;

  -- Si es aprobación: entregar puntos (usa loyalty de Sprint 16)
  if p_trigger_event = 'quote_approved' and v_current_status != 'rewarded' then
    -- Puntos para el referidor
    if v_link.client_id is not null and v_program.referrer_points > 0 then
      perform public.assign_loyalty_points(
        v_link.workspace_id, v_link.client_id, null, null,
        v_program.referrer_points,
        'Puntos por referir a un nuevo cliente',
        'bonus'
      );
    end if;

    -- Puntos para el referido
    if p_referee_client_id is not null and v_program.referee_points > 0 then
      perform public.assign_loyalty_points(
        v_link.workspace_id, p_referee_client_id, null, null,
        v_program.referee_points,
        'Puntos de bienvenida por llegar referido',
        'bonus'
      );
    end if;

    -- Marcar como recompensado
    update public.referral_conversions
    set status = 'rewarded',
        referrer_points_awarded = v_program.referrer_points,
        referee_points_awarded  = v_program.referee_points,
        rewarded_at = now()
    where id = v_conv_id;

    -- Notificar al referidor
    if v_link.client_id is not null then
      insert into public.notifications (workspace_id, title, message, type)
      values (
        v_link.workspace_id,
        '🎉 ¡Tu referido compró!',
        'Uno de tus referidos realizó su primera compra. ¡Recibiste ' || v_program.referrer_points || ' puntos!',
        'success'
      );
    end if;
  end if;

  return jsonb_build_object('ok', true, 'conversion_id', v_conv_id, 'status', v_new_status);
end;
$$;

grant execute on function public.register_referral_conversion(text, uuid, text) to service_role, authenticated;

-- ============================================================================
-- RPC 4: validate_coupon — validar cupón (solo valida, no aplica)
-- ============================================================================

create or replace function public.validate_coupon(
  p_workspace_id uuid,
  p_code         text,
  p_quote_total  numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo record;
  v_discount_amount numeric;
begin
  -- Validar acceso
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id)
    and auth.role() != 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  -- Buscar cupón activo
  select * into v_promo
  from public.promotions
  where workspace_id = p_workspace_id
    and upper(code) = upper(trim(p_code))
    and active = true
    and valid_from <= now()
    and (valid_until is null or valid_until >= now())
    and (max_redemptions is null or current_redemptions < max_redemptions);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cupón inválido, expirado o agotado', 'valid', false);
  end if;

  -- Verificar monto mínimo
  if p_quote_total < v_promo.min_quote_amount then
    return jsonb_build_object(
      'ok', false, 'valid', false,
      'error', format('Monto mínimo para este cupón: $ %s', round(v_promo.min_quote_amount, 0))
    );
  end if;

  -- Calcular descuento
  v_discount_amount := case v_promo.type
    when 'percentage'   then round(p_quote_total * (v_promo.value / 100), 0)
    when 'fixed_amount' then least(v_promo.value, p_quote_total)
    else 0
  end;

  return jsonb_build_object(
    'ok', true, 'valid', true,
    'promotion_id',     v_promo.id,
    'code',             v_promo.code,
    'type',             v_promo.type,
    'value',            v_promo.value,
    'discount_amount',  v_discount_amount,
    'description',      v_promo.description
  );
end;
$$;

grant execute on function public.validate_coupon(uuid, text, numeric) to authenticated;

-- ============================================================================
-- RPC 5: apply_promotion — aplicar cupón a cotización
-- ============================================================================

create or replace function public.apply_promotion(
  p_workspace_id uuid,
  p_code         text,
  p_quote_id     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_quote_total  numeric;
  v_validation   jsonb;
  v_promo_id     uuid;
  v_discount     numeric;
  v_client_id    uuid;
begin
  -- Validar acceso + obtener cotización
  select
    coalesce((calc_snapshot->>'total')::numeric, 0),
    client_id
  into v_quote_total, v_client_id
  from public.quotes q
  join public.profiles p on p.workspace_id = q.workspace_id
  where q.id = p_quote_id and q.workspace_id = p_workspace_id
    and q.deleted_at is null and p.id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
  end if;

  -- Validar cupón
  v_validation := public.validate_coupon(p_workspace_id, p_code, v_quote_total);
  if not (v_validation->>'valid')::boolean then
    return jsonb_build_object('ok', false, 'error', v_validation->>'error');
  end if;

  v_promo_id := (v_validation->>'promotion_id')::uuid;
  v_discount  := (v_validation->>'discount_amount')::numeric;

  -- Anti-duplicate: un cupón por cotización
  if exists (select 1 from public.promotion_redemptions where promotion_id = v_promo_id and quote_id = p_quote_id) then
    return jsonb_build_object('ok', false, 'error', 'Ya aplicaste este cupón a esta cotización');
  end if;

  -- Registrar uso
  insert into public.promotion_redemptions
    (workspace_id, promotion_id, client_id, quote_id, discount_amount)
  values
    (p_workspace_id, v_promo_id, v_client_id, p_quote_id, v_discount);

  -- Incrementar usos del cupón
  update public.promotions
  set current_redemptions = current_redemptions + 1
  where id = v_promo_id;

  return jsonb_build_object(
    'ok', true,
    'discount_amount', v_discount,
    'message', 'Descuento de $ ' || round(v_discount, 0) || ' aplicado'
  );
end;
$$;

grant execute on function public.apply_promotion(uuid, text, uuid) to authenticated;

-- ============================================================================
-- RPC 6: track_utm — registrar UTM event para un cliente/lead autenticado
-- ============================================================================

create or replace function public.track_utm(
  p_workspace_id uuid,
  p_utm_source   text default null,
  p_utm_medium   text default null,
  p_utm_campaign text default null,
  p_utm_content  text default null,
  p_utm_term     text default null,
  p_lead_id      uuid default null,
  p_client_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.utm_events
    (workspace_id, lead_id, client_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
  values
    (p_workspace_id, p_lead_id, p_client_id, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term)
  returning id into v_event_id;
  return v_event_id;
end;
$$;

grant execute on function public.track_utm(uuid, text, text, text, text, text, uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- RPC 7: get_referral_dashboard — métricas de referidos
-- ============================================================================

create or replace function public.get_referral_dashboard(p_workspace_id uuid)
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
    'program', (select row_to_json(rp) from public.referral_programs rp where workspace_id = p_workspace_id),
    'summary', (
      select jsonb_build_object(
        'total_links',       count(distinct rl.id)::int,
        'total_visits',      coalesce(sum(rl.visits_count), 0)::int,
        'total_conversions', coalesce(sum(rl.conversions_count), 0)::int,
        'rewarded',          count(rc.id) filter (where rc.status = 'rewarded')::int,
        'conversion_rate',   case when sum(rl.visits_count) > 0
          then round((sum(rl.conversions_count)::numeric / sum(rl.visits_count)) * 100, 1)
          else 0 end
      )
      from public.referral_links rl
      left join public.referral_conversions rc on rc.referral_link_id = rl.id
      where rl.workspace_id = p_workspace_id
    ),
    'top_referrers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'client_name', c.name,
          'visits',      rl.visits_count,
          'conversions', rl.conversions_count,
          'ref_code',    rl.ref_code
        )
        order by rl.conversions_count desc
      ), '[]'::jsonb)
      from public.referral_links rl
      left join public.clients c on c.id = rl.client_id
      where rl.workspace_id = p_workspace_id and rl.conversions_count > 0
      limit 10
    ),
    'recent_conversions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'referee_name',  cr.name,
          'status',        rc.status,
          'points_awarded',rc.referrer_points_awarded,
          'created_at',    rc.created_at
        )
        order by rc.created_at desc
      ), '[]'::jsonb)
      from public.referral_conversions rc
      left join public.clients cr on cr.id = rc.referee_client_id
      where rc.workspace_id = p_workspace_id
      limit 10
    )
  );
end;
$$;

grant execute on function public.get_referral_dashboard(uuid) to authenticated;

-- ============================================================================
-- RPC 8: get_utm_analytics — análisis de fuentes de adquisición
-- ============================================================================

create or replace function public.get_utm_analytics(
  p_workspace_id uuid,
  p_days         int default 30
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
    'period_days', p_days,
    'by_source', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'source',    coalesce(utm_source, 'direct'),
          'visits',    count(*)::int,
          'clients',   count(distinct client_id) filter (where client_id is not null)::int,
          'leads',     count(distinct lead_id) filter (where lead_id is not null)::int
        )
        order by count(*) desc
      ), '[]'::jsonb)
      from public.utm_events
      where workspace_id = p_workspace_id
        and created_at >= now() - (p_days || ' days')::interval
      group by utm_source
    ),
    'by_campaign', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'campaign', coalesce(utm_campaign, 'sin campaña'),
          'source',   coalesce(utm_source, 'direct'),
          'visits',   count(*)::int
        )
        order by count(*) desc
      ), '[]'::jsonb)
      from public.utm_events
      where workspace_id = p_workspace_id
        and utm_campaign is not null
        and created_at >= now() - (p_days || ' days')::interval
      group by utm_campaign, utm_source
      limit 20
    ),
    'total_visits', (
      select count(*)::int from public.utm_events
      where workspace_id = p_workspace_id and created_at >= now() - (p_days || ' days')::interval
    )
  );
end;
$$;

grant execute on function public.get_utm_analytics(uuid, int) to authenticated;

-- ============================================================================
-- RPC 9: get_growth_dashboard — consolidado para /app/growth
-- ============================================================================

create or replace function public.get_growth_dashboard(p_workspace_id uuid)
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
    -- Adquisición (30 días)
    'acquisition', (
      select jsonb_build_object(
        'new_clients',    count(*)::int,
        'by_source', (
          select coalesce(jsonb_object_agg(
            coalesce(u.utm_source, 'direct'), cnt
          ), '{}'::jsonb)
          from (
            select utm_source, count(*)::int as cnt
            from public.utm_events
            where workspace_id = p_workspace_id
              and created_at >= now() - interval '30 days'
            group by utm_source
          ) u
        )
      )
      from public.clients
      where workspace_id = p_workspace_id
        and created_at >= now() - interval '30 days'
        and deleted_at is null
    ),
    -- Referidos
    'referrals', (
      select jsonb_build_object(
        'total_conversions', count(*) filter (where rc.status in ('quote_approved','rewarded'))::int,
        'rewarded',          count(*) filter (where rc.status = 'rewarded')::int
      )
      from public.referral_conversions rc
      where rc.workspace_id = p_workspace_id
    ),
    -- Cupones (30 días)
    'promotions', (
      select jsonb_build_object(
        'total_used',       count(*)::int,
        'total_discount',   coalesce(sum(discount_amount), 0),
        'active_promotions',(select count(*)::int from public.promotions
          where workspace_id = p_workspace_id and active = true
          and (valid_until is null or valid_until >= now()))
      )
      from public.promotion_redemptions
      where workspace_id = p_workspace_id
        and created_at >= now() - interval '30 days'
    ),
    -- Customer Success (reutiliza Sprint 15)
    'health_summary', (
      select jsonb_build_object(
        'avg_score', round(avg(score), 1),
        'vip',       count(*) filter (where status = 'vip')::int,
        'at_risk',   count(*) filter (where status in ('riesgo','critico'))::int
      )
      from public.customer_health_scores
      where workspace_id = p_workspace_id
    ),
    -- Automatizaciones activas de growth
    'growth_automations', (
      select count(*)::int
      from public.automation_rules ar
      join public.automation_templates at on at.key = ar.template_key
      where ar.workspace_id = p_workspace_id
        and ar.enabled = true
        and at.category = 'growth'
    )
  );
end;
$$;

grant execute on function public.get_growth_dashboard(uuid) to authenticated;

comment on function public.create_referral_link        is 'Sprint 17: genera link de referido. Recompensas via loyalty_transactions Sprint 16.';
comment on function public.track_referral_visit        is 'Sprint 17: registra visita con UTM. Pública (sin auth).';
comment on function public.register_referral_conversion is 'Sprint 17: registra conversión y entrega puntos de loyalty.';
comment on function public.validate_coupon             is 'Sprint 17: valida cupón sin aplicarlo. Zero Trust.';
comment on function public.apply_promotion             is 'Sprint 17: aplica cupón a cotización con anti-duplicate.';
comment on function public.track_utm                  is 'Sprint 17: registra UTM event para un cliente o lead.';
comment on function public.get_referral_dashboard     is 'Sprint 17: métricas del programa de referidos.';
comment on function public.get_utm_analytics          is 'Sprint 17: análisis de fuentes de adquisición por UTM.';
comment on function public.get_growth_dashboard       is 'Sprint 17: dashboard consolidado de Growth (adquisición + referidos + cupones + CS).';
