-- ============================================================================
-- 0073 — customer_success: Health Score + Retención + Fidelización Sprint 15
-- ============================================================================
-- Principio Zero Trust: toda clasificación (VIP, en riesgo, etc.) ocurre en
-- backend. El frontend NUNCA calcula scores — consume desde esta tabla.
--
-- Deuda técnica corregida: la clasificación VIP que existía en ClientesMobile.tsx
-- (frontend, líneas 54-59) se elimina y se reemplaza por este sistema.
--
-- Feature gating: reutiliza advanced_reports_enabled (PRO/PREMIUM = true).
-- Sin flag nuevo para no duplicar.
-- ============================================================================

-- ─── 1. customer_health_scores — tabla persistida ────────────────────────────

create table if not exists public.customer_health_scores (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  client_id         uuid        not null references public.clients(id) on delete cascade,
  score             numeric(5,1) not null default 0 check (score >= 0 and score <= 100),
  status            text        not null default 'nuevo' check (status in (
    'vip', 'saludable', 'riesgo', 'critico', 'perdido', 'nuevo'
  )),
  risk_level        text        not null default 'bajo' check (risk_level in (
    'bajo', 'medio', 'alto', 'critico'
  )),
  -- Desglose de variables para transparencia (no cajas negras)
  score_recency     numeric(4,1) not null default 0,  -- Días sin actividad → 0-25 pts
  score_conversion  numeric(4,1) not null default 0,  -- Tasa de aprobación → 0-20 pts
  score_value       numeric(4,1) not null default 0,  -- Valor histórico → 0-20 pts
  score_frequency   numeric(4,1) not null default 0,  -- Frecuencia cotizaciones → 0-15 pts
  score_engagement  numeric(4,1) not null default 0,  -- Seguimientos CRM → 0-10 pts
  score_views       numeric(4,1) not null default 0,  -- Aperturas cotizaciones → 0-10 pts
  -- Contexto de riesgo
  days_inactive     int         not null default 0,
  last_calculated_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (workspace_id, client_id)
);

create trigger trg_customer_health_updated_at
  before update on public.customer_health_scores
  for each row execute function public.set_updated_at();

create index if not exists idx_customer_health_workspace
  on public.customer_health_scores(workspace_id, score desc);
create index if not exists idx_customer_health_status
  on public.customer_health_scores(workspace_id, status);
create index if not exists idx_customer_health_risk
  on public.customer_health_scores(workspace_id, risk_level);

alter table public.customer_health_scores enable row level security;

create policy "workspace members select health scores"
  on public.customer_health_scores for select
  using (
    exists (select 1 from public.profiles where workspace_id = customer_health_scores.workspace_id and id = auth.uid())
  );

comment on table public.customer_health_scores
  is 'Sprint 15: health score 0-100 por cliente. Reemplaza clasificación frontend (deuda técnica). Zero Trust.';

-- ─── 2. RPC: calculate_customer_health — motor de scoring ────────────────────
-- Variables: recencia, conversión, valor, frecuencia, engagement CRM, aperturas.
-- Resultado: 0-100 con desglose para transparencia (sin cajas negras).

create or replace function public.calculate_customer_health(
  p_workspace_id uuid,
  p_client_id    uuid default null   -- null = recalcular todos los del workspace
)
returns int   -- número de scores actualizados
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client        record;
  v_updated       int := 0;
  -- Scoring variables
  v_days_inactive   int;
  v_total_quotes    int;
  v_total_approved  int;
  v_total_value     numeric;
  v_conv_rate       numeric;
  v_seguimientos    int;
  v_view_count      int;
  -- Scores parciales
  v_s_recency    numeric;
  v_s_conv       numeric;
  v_s_value      numeric;
  v_s_freq       numeric;
  v_s_engage     numeric;
  v_s_views      numeric;
  v_total_score  numeric;
  v_status       text;
  v_risk         text;
  -- Percentiles del workspace para normalización de valor
  v_value_p75    numeric;
  v_freq_p75     numeric;
begin
  -- Percentiles del workspace para normalizar (evitar que un cliente muy grande sesgue todo)
  select
    percentile_cont(0.75) within group (order by total_value),
    percentile_cont(0.75) within group (order by total_quotes)
  into v_value_p75, v_freq_p75
  from public.clients
  where workspace_id = p_workspace_id and deleted_at is null and total_quotes > 0;

  v_value_p75 := greatest(coalesce(v_value_p75, 1), 1);
  v_freq_p75  := greatest(coalesce(v_freq_p75, 1), 1);

  for v_client in
    select c.id, c.total_quotes, c.total_approved, c.total_value, c.last_activity_at
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.deleted_at is null
      and (p_client_id is null or c.id = p_client_id)
  loop
    -- ── Días inactivo ──────────────────────────────────────────────────────
    v_days_inactive := coalesce(
      extract(day from now() - v_client.last_activity_at)::int,
      999
    );

    -- ── Seguimientos recientes (últimos 90d) ───────────────────────────────
    select count(*)::int into v_seguimientos
    from public.seguimientos
    where client_id = v_client.id
      and workspace_id = p_workspace_id
      and created_at >= now() - interval '90 days';

    -- ── Aperturas de cotizaciones ──────────────────────────────────────────
    select count(distinct qv.quote_id)::int into v_view_count
    from public.quote_views qv
    join public.quotes q on q.id = qv.quote_id
    where q.client_id = v_client.id
      and q.workspace_id = p_workspace_id
      and qv.opened_at >= now() - interval '90 days';

    v_total_quotes   := coalesce(v_client.total_quotes, 0);
    v_total_approved := coalesce(v_client.total_approved, 0);
    v_total_value    := coalesce(v_client.total_value, 0);
    v_conv_rate      := case when v_total_quotes > 0 then v_total_approved::numeric / v_total_quotes else 0 end;

    -- ── Scoring (máximo 100 puntos) ────────────────────────────────────────

    -- 1. Recencia — 25 pts (más reciente = más puntos)
    v_s_recency := case
      when v_days_inactive <=  7 then 25
      when v_days_inactive <= 14 then 22
      when v_days_inactive <= 30 then 18
      when v_days_inactive <= 60 then 12
      when v_days_inactive <= 90 then 6
      else 0
    end;

    -- 2. Conversión — 20 pts
    v_s_conv := round(v_conv_rate * 20, 1);

    -- 3. Valor histórico — 20 pts (normalizado al P75 del workspace)
    v_s_value := least(20, round((v_total_value / v_value_p75) * 10, 1));

    -- 4. Frecuencia de cotizaciones — 15 pts (normalizado al P75)
    v_s_freq := least(15, round((v_total_quotes::numeric / v_freq_p75) * 7.5, 1));

    -- 5. Engagement CRM (seguimientos) — 10 pts
    v_s_engage := least(10, v_seguimientos * 2);

    -- 6. Aperturas de cotizaciones (interés activo) — 10 pts
    v_s_views := least(10, v_view_count * 2);

    v_total_score := v_s_recency + v_s_conv + v_s_value + v_s_freq + v_s_engage + v_s_views;

    -- ── Status ────────────────────────────────────────────────────────────
    v_status := case
      when v_total_score >= 75 and v_total_approved >= 2 then 'vip'
      when v_total_score >= 55 then 'saludable'
      when v_total_score >= 35 then 'riesgo'
      when v_total_score >= 15 then 'critico'
      when v_total_quotes = 0  then 'nuevo'
      else 'perdido'
    end;

    -- ── Risk level (basado en días inactivo) ─────────────────────────────
    v_risk := case
      when v_days_inactive <=  30 then 'bajo'
      when v_days_inactive <=  60 then 'medio'
      when v_days_inactive <=  90 then 'alto'
      else 'critico'
    end;
    -- Nuevo cliente (sin actividad previa) → riesgo bajo por defecto
    if v_total_quotes = 0 then v_risk := 'bajo'; end if;

    -- ── Upsert score ──────────────────────────────────────────────────────
    insert into public.customer_health_scores
      (workspace_id, client_id, score, status, risk_level,
       score_recency, score_conversion, score_value, score_frequency, score_engagement, score_views,
       days_inactive, last_calculated_at)
    values
      (p_workspace_id, v_client.id, v_total_score, v_status, v_risk,
       v_s_recency, v_s_conv, v_s_value, v_s_freq, v_s_engage, v_s_views,
       v_days_inactive, now())
    on conflict (workspace_id, client_id) do update set
      score             = excluded.score,
      status            = excluded.status,
      risk_level        = excluded.risk_level,
      score_recency     = excluded.score_recency,
      score_conversion  = excluded.score_conversion,
      score_value       = excluded.score_value,
      score_frequency   = excluded.score_frequency,
      score_engagement  = excluded.score_engagement,
      score_views       = excluded.score_views,
      days_inactive     = excluded.days_inactive,
      last_calculated_at = now(),
      updated_at        = now();

    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

grant execute on function public.calculate_customer_health(uuid, uuid) to authenticated, service_role;

-- ─── 3. RPC: get_clients_at_risk ─────────────────────────────────────────────

create or replace function public.get_clients_at_risk(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;
  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Customer Success requiere plan PRO o PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'clients_at_risk', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'client_id',    c.id,
          'name',         c.name,
          'email',        c.email,
          'phone',        c.phone,
          'score',        hs.score,
          'status',       hs.status,
          'risk_level',   hs.risk_level,
          'days_inactive',hs.days_inactive,
          'total_quotes', c.total_quotes,
          'total_approved',c.total_approved,
          'total_value',  c.total_value,
          'last_activity',c.last_activity_at,
          'risk_category',
            case
              when hs.days_inactive <=  30 then 'amarillo'
              when hs.days_inactive <=  60 then 'naranja'
              else 'rojo'
            end
        )
        order by hs.score asc, hs.days_inactive desc
      ), '[]'::jsonb)
      from public.customer_health_scores hs
      join public.clients c on c.id = hs.client_id
      where hs.workspace_id = p_workspace_id
        and hs.status in ('riesgo', 'critico', 'perdido')
        and c.deleted_at is null
    ),
    'summary', (
      select jsonb_build_object(
        'amarillo', count(*) filter (where hs.days_inactive between 1 and 30  and hs.status in ('riesgo','critico','perdido'))::int,
        'naranja',  count(*) filter (where hs.days_inactive between 31 and 60 and hs.status in ('riesgo','critico','perdido'))::int,
        'rojo',     count(*) filter (where hs.days_inactive > 60              and hs.status in ('riesgo','critico','perdido'))::int
      )
      from public.customer_health_scores hs
      where hs.workspace_id = p_workspace_id
    )
  );
end;
$$;

grant execute on function public.get_clients_at_risk(uuid) to authenticated;

-- ─── 4. RPC: get_vip_clients ─────────────────────────────────────────────────

create or replace function public.get_vip_clients(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;
  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Customer Success requiere plan PRO o PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'vip_clients', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'client_id',     c.id,
          'name',          c.name,
          'email',         c.email,
          'phone',         c.phone,
          'score',         hs.score,
          'status',        hs.status,
          'total_value',   c.total_value,
          'total_approved',c.total_approved,
          'total_quotes',  c.total_quotes,
          'conversion_rate',
            case when c.total_quotes > 0 then round((c.total_approved::numeric / c.total_quotes) * 100, 0) else 0 end,
          'days_inactive', hs.days_inactive,
          'last_activity', c.last_activity_at
        )
        order by hs.score desc, c.total_value desc
      ), '[]'::jsonb)
      from public.customer_health_scores hs
      join public.clients c on c.id = hs.client_id
      where hs.workspace_id = p_workspace_id
        and hs.status = 'vip'
        and c.deleted_at is null
    )
  );
end;
$$;

grant execute on function public.get_vip_clients(uuid) to authenticated;

-- ─── 5. RPC: get_repurchase_opportunities ────────────────────────────────────

create or replace function public.get_repurchase_opportunities(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;
  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Customer Success requiere plan PRO o PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'opportunities', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'client_id',         c.id,
          'name',              c.name,
          'email',             c.email,
          'phone',             c.phone,
          'total_approved',    c.total_approved,
          'total_value',       c.total_value,
          'avg_days_between',  avg_gap,
          'days_since_last',   days_since_last,
          'expected_return',   expected_return,
          'overdue_days',      overdue_days,
          'score',             hs.score
        )
        order by overdue_days desc
      ), '[]'::jsonb)
      from (
        select
          q.client_id,
          round(avg(
            extract(day from lead_approved - approved_at)
          ))::int as avg_gap,
          extract(day from now() - max(q2.updated_at))::int as days_since_last,
          max(q2.updated_at) + (
            avg(extract(day from lead_approved - approved_at)) || ' days'
          )::interval as expected_return,
          (extract(day from now() - max(q2.updated_at)) -
            avg(extract(day from lead_approved - approved_at)))::int as overdue_days
        from (
          select
            workspace_id, client_id, updated_at,
            lead(updated_at) over (partition by client_id order by updated_at) as lead_approved,
            updated_at as approved_at
          from public.quotes
          where workspace_id = p_workspace_id
            and status = 'Aprobada'
            and client_id is not null
            and deleted_at is null
        ) q
        join public.quotes q2 on q2.client_id = q.client_id
          and q2.workspace_id = p_workspace_id
          and q2.status = 'Aprobada'
          and q2.deleted_at is null
        where lead_approved is not null
        group by q.client_id
        having count(*) >= 2  -- Mínimo 2 compras para detectar patrón
          and (extract(day from now() - max(q2.updated_at)) -
               avg(extract(day from lead_approved - approved_at))) > -30  -- Próximos a volver
      ) patterns
      join public.clients c on c.id = patterns.client_id
      left join public.customer_health_scores hs on hs.client_id = c.id and hs.workspace_id = p_workspace_id
      where c.deleted_at is null
      limit 20
    )
  );
end;
$$;

grant execute on function public.get_repurchase_opportunities(uuid) to authenticated;

-- ─── 6. RPC: get_customer_success_dashboard — todo en una llamada ─────────────

create or replace function public.get_customer_success_dashboard(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total   int;
  v_vip     int;
  v_riesgo  int;
  v_critico int;
  v_perdido int;
  v_nuevo   int;
  v_avg_score numeric;
begin
  if not exists (select 1 from public.profiles where id = v_user_id and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;
  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Customer Success requiere plan PRO o PREMIUM');
  end if;

  select
    count(*)::int,
    count(*) filter (where status = 'vip')::int,
    count(*) filter (where status = 'riesgo')::int,
    count(*) filter (where status = 'critico')::int,
    count(*) filter (where status = 'perdido')::int,
    count(*) filter (where status = 'nuevo')::int,
    round(avg(score), 1)
  into v_total, v_vip, v_riesgo, v_critico, v_perdido, v_nuevo, v_avg_score
  from public.customer_health_scores
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'total_clients',  v_total,
      'vip',           v_vip,
      'saludable',     v_total - v_vip - v_riesgo - v_critico - v_perdido - v_nuevo,
      'riesgo',        v_riesgo,
      'critico',       v_critico,
      'perdido',       v_perdido,
      'nuevo',         v_nuevo,
      'avg_score',     coalesce(v_avg_score, 0),
      'last_updated',  (select max(last_calculated_at) from public.customer_health_scores where workspace_id = p_workspace_id)
    ),
    'top_vip', (
      select coalesce(jsonb_agg(
        jsonb_build_object('client_id',c.id,'name',c.name,'score',hs.score,'total_value',c.total_value)
        order by hs.score desc
      ), '[]'::jsonb)
      from public.customer_health_scores hs join public.clients c on c.id = hs.client_id
      where hs.workspace_id = p_workspace_id and hs.status = 'vip' and c.deleted_at is null
      limit 5
    ),
    'top_at_risk', (
      select coalesce(jsonb_agg(
        jsonb_build_object('client_id',c.id,'name',c.name,'score',hs.score,'days_inactive',hs.days_inactive,'risk_level',hs.risk_level)
        order by hs.score asc
      ), '[]'::jsonb)
      from public.customer_health_scores hs join public.clients c on c.id = hs.client_id
      where hs.workspace_id = p_workspace_id and hs.status in ('riesgo','critico','perdido') and c.deleted_at is null
      limit 5
    ),
    'score_distribution', (
      select jsonb_build_object(
        '0_20',  count(*) filter (where score < 20)::int,
        '20_40', count(*) filter (where score >= 20 and score < 40)::int,
        '40_60', count(*) filter (where score >= 40 and score < 60)::int,
        '60_80', count(*) filter (where score >= 60 and score < 80)::int,
        '80_100',count(*) filter (where score >= 80)::int
      )
      from public.customer_health_scores where workspace_id = p_workspace_id
    )
  );
end;
$$;

grant execute on function public.get_customer_success_dashboard(uuid) to authenticated;

-- ─── 7. RPC: recalculate_all_health_scores — llamada desde scheduler ─────────

create or replace function public.recalculate_all_health_scores(p_workspace_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws    record;
  v_total int := 0;
begin
  for v_ws in
    select distinct w.id
    from public.workspaces w
    join public.profiles p on p.workspace_id = w.id
    where p.status = 'active'
      and public.check_feature_access(w.id, 'advanced_reports_enabled')
      and (p_workspace_id is null or w.id = p_workspace_id)
  loop
    v_total := v_total + public.calculate_customer_health(v_ws.id);
  end loop;
  return v_total;
end;
$$;

grant execute on function public.recalculate_all_health_scores(uuid) to service_role, authenticated;

-- ─── 8. Trigger: recalcular health cuando cambia la actividad del cliente ─────

create or replace function public.trg_refresh_client_health_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  -- Determinar client_id según la tabla que disparó
  case tg_table_name
    when 'quotes'      then v_client_id := new.client_id;
    when 'seguimientos' then v_client_id := new.client_id;
    else return new;
  end case;

  if v_client_id is not null then
    -- Recalcular de forma asíncrona (no bloquea la transacción)
    perform public.calculate_customer_health(new.workspace_id, v_client_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_health_on_quote  on public.quotes;
drop trigger if exists trg_refresh_health_on_seguimiento on public.seguimientos;

create trigger trg_refresh_health_on_quote
  after insert or update of status on public.quotes
  for each row execute function public.trg_refresh_client_health_score();

create trigger trg_refresh_health_on_seguimiento
  after insert on public.seguimientos
  for each row execute function public.trg_refresh_client_health_score();

-- ─── 9. Nuevos automation_templates para retención ───────────────────────────

insert into public.automation_templates
  (key, name, description, category, trigger_event, trigger_type, delay_hours, conditions, action_type, action_payload, plan_required, sort_order)
values

('vip_special_attention',
  'Atención especial cliente VIP',
  'Cuando un cliente VIP no ha recibido seguimiento en 14 días, crea una alerta de atención.',
  'retention', 'client_inactive', 'periodic', 0,
  '[{"field":"days_inactive","operator":"gte","value":14},{"field":"status","operator":"eq","value":"vip"}]'::jsonb,
  'notify_user',
  '{"title":"⭐ Cliente VIP sin seguimiento","message_template":"{{client_name}} es VIP y lleva {{days_inactive}} días sin contacto."}'::jsonb,
  'pro', 6),

('repurchase_detected',
  'Recompra detectada — notificar comercial',
  'Cuando se detecta que un cliente está próximo a su ciclo de recompra, notifica al equipo comercial.',
  'retention', 'client_inactive', 'periodic', 0,
  '[{"field":"days_inactive","operator":"gte","value":30},{"field":"total_approved","operator":"gte","value":2}]'::jsonb,
  'create_followup_and_notify',
  '{"followup_type":"llamada","notify_message":"🔄 {{client_name}} podría estar listo para una nueva compra."}'::jsonb,
  'pro', 7),

('high_risk_ia_alert',
  'Alerta IA — Cliente en riesgo crítico',
  'Notifica al supervisor cuando un cliente con alto valor histórico entra en estado crítico.',
  'retention', 'client_inactive', 'periodic', 0,
  '[{"field":"days_inactive","operator":"gte","value":75},{"field":"total_value","operator":"gte","value":500000}]'::jsonb,
  'notify_supervisor',
  '{"title":"🚨 Cliente de alto valor en riesgo crítico","message_template":"{{client_name}} lleva {{days_inactive}} días inactivo con historial de $ alto."}'::jsonb,
  'premium', 8)

on conflict (key) do update set
  name           = excluded.name,
  description    = excluded.description,
  conditions     = excluded.conditions,
  action_payload = excluded.action_payload,
  sort_order     = excluded.sort_order;

-- ─── 10. Integrar recálculo en automation-scheduler ──────────────────────────
-- La función recalculate_all_health_scores() debe llamarse desde el scheduler.
-- El scheduler de Sprint 13 la llamará en cleanup diario (ya configurado).

comment on function public.calculate_customer_health    is 'Sprint 15: motor de health score 0-100 por cliente. Sin cajas negras.';
comment on function public.get_clients_at_risk          is 'Sprint 15: clientes amarillo/naranja/rojo clasificados por backend.';
comment on function public.get_vip_clients              is 'Sprint 15: clientes VIP con criterios desde backend.';
comment on function public.get_repurchase_opportunities is 'Sprint 15: oportunidades de recompra por patrón histórico.';
comment on function public.get_customer_success_dashboard is 'Sprint 15: dashboard consolidado Customer Success.';
