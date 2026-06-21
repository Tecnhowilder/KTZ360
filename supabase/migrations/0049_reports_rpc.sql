-- ============================================================================
-- 0049 — reports_rpc: RPCs de Reportes Avanzados — Sprint 5
-- ============================================================================
-- ZERO TRUST: todas las RPCs validan auth.uid() + workspace membership.
-- Ningún cálculo crítico queda en el frontend.
--
-- FUENTE DE VERDAD (documentada):
--   · Apertura/vista:    quote_views (Sprint 4) — más completa
--   · Estado embudo:     quotes.commercial_status (canónico)
--   · Aprobación/rechazo legacy: quote_events.proposal_accepted/rejected
--   · KPIs de período:  siempre desde DB, nunca desde caché React
--
-- BUG FIX: chartData() mostraba "valor cotizado" usando solo cotizaciones
--   Aprobadas. Las RPCs aquí distinguen explícitamente:
--   valor_cotizado  → TODAS las cotizaciones del período
--   valor_aprobado  → solo las Aprobadas del período
-- ============================================================================

-- ============================================================================
-- Helper privado: assert_workspace_member (reutilizable)
-- ============================================================================
-- La función assert_workspace_membership ya existe en 0039_security_audit.sql.
-- La utilizamos directamente en cada RPC.

-- ============================================================================
-- RPC 1: get_reports_summary — KPIs por período
-- ============================================================================
-- FREE: acceso con restricción de período (solo mes actual)
-- PRO/PREMIUM: período libre hasta 12 meses
-- ============================================================================

create or replace function public.get_reports_summary(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_plan_code     text;
  v_is_advanced   boolean;
  v_start         date;
  v_end           date;

  -- KPIs período actual
  v_cotizadas_count     int;
  v_cotizado_valor      numeric;
  v_enviadas_count      int;
  v_aprobadas_count     int;
  v_aprobado_valor      numeric;
  v_rechazadas_count    int;
  v_vencidas_count      int;
  v_vistas_count        int;
  v_conversion_rate     numeric;
  v_avg_close_days      numeric;
  v_con_seguimiento     int;

  -- Período anterior (para comparativas)
  v_prev_cotizadas      int;
  v_prev_cotizado_valor numeric;
  v_prev_aprobadas      int;
  v_prev_conversion     numeric;

  v_period_days         int;
begin
  -- ZERO TRUST: validar membresía
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  v_plan_code   := public.get_effective_plan_code(p_workspace_id);
  v_is_advanced := public.check_feature_access(p_workspace_id, 'advanced_reports_enabled');

  -- FREE: siempre mes actual, sin importar parámetros
  if not v_is_advanced then
    v_start := date_trunc('month', now())::date;
    v_end   := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  else
    -- PRO/PREMIUM: validar y aplicar período
    v_start := coalesce(p_period_start, date_trunc('month', now())::date);
    v_end   := coalesce(p_period_end,   (date_trunc('month', now()) + interval '1 month - 1 day')::date);
    -- Límite de seguridad: máximo 12 meses de rango
    if v_end - v_start > 366 then
      return jsonb_build_object('ok', false, 'error', 'El rango máximo permitido es 12 meses');
    end if;
    -- No permitir fechas futuras para el inicio
    if v_start > current_date then
      return jsonb_build_object('ok', false, 'error', 'La fecha de inicio no puede ser futura');
    end if;
  end if;

  v_period_days := (v_end - v_start) + 1;

  -- ── KPIs período seleccionado ──────────────────────────────────────────────

  select
    count(*)::int,
    coalesce(sum((calc_snapshot->>'total')::numeric), 0)
  into v_cotizadas_count, v_cotizado_valor
  from public.quotes
  where workspace_id = p_workspace_id
    and deleted_at is null
    and created_at::date between v_start and v_end;

  select
    count(*) filter (where status = 'Enviada')::int,
    count(*) filter (where status = 'Aprobada')::int,
    coalesce(sum((calc_snapshot->>'total')::numeric) filter (where status = 'Aprobada'), 0),
    count(*) filter (where status = 'Rechazada')::int,
    count(*) filter (where status = 'Vencida')::int
  into v_enviadas_count, v_aprobadas_count, v_aprobado_valor, v_rechazadas_count, v_vencidas_count
  from public.quotes
  where workspace_id = p_workspace_id
    and deleted_at is null
    and created_at::date between v_start and v_end;

  -- Cotizaciones vistas (desde quote_views — fuente primaria)
  select count(distinct qv.quote_id)::int
  into v_vistas_count
  from public.quote_views qv
  join public.quotes q on q.id = qv.quote_id
  where q.workspace_id = p_workspace_id
    and qv.opened_at::date between v_start and v_end;

  -- Tasa de conversión (aprobadas / (aprobadas + rechazadas))
  v_conversion_rate := case
    when (v_aprobadas_count + v_rechazadas_count) = 0 then 0
    else round((v_aprobadas_count::numeric / (v_aprobadas_count + v_rechazadas_count)) * 100, 1)
  end;

  -- Tiempo promedio de cierre (días desde created_at hasta updated_at en aprobadas)
  select coalesce(
    round(avg(extract(epoch from (updated_at - created_at)) / 86400)::numeric, 1),
    0
  )
  into v_avg_close_days
  from public.quotes
  where workspace_id = p_workspace_id
    and status = 'Aprobada'
    and deleted_at is null
    and created_at::date between v_start and v_end;

  -- Cotizaciones con al menos un seguimiento en el período
  select count(distinct q.id)::int
  into v_con_seguimiento
  from public.quotes q
  join public.seguimientos s on s.quote_id = q.id
  where q.workspace_id = p_workspace_id
    and q.deleted_at is null
    and q.created_at::date between v_start and v_end;

  -- ── Período anterior (mismo número de días hacia atrás) ───────────────────
  -- Solo para PRO/PREMIUM
  if v_is_advanced then
    declare
      v_prev_start date := v_start - v_period_days;
      v_prev_end   date := v_end   - v_period_days;
    begin
      select
        count(*)::int,
        coalesce(sum((calc_snapshot->>'total')::numeric), 0)
      into v_prev_cotizadas, v_prev_cotizado_valor
      from public.quotes
      where workspace_id = p_workspace_id
        and deleted_at is null
        and created_at::date between v_prev_start and v_prev_end;

      select count(*) filter (where status = 'Aprobada')::int
      into v_prev_aprobadas
      from public.quotes
      where workspace_id = p_workspace_id
        and deleted_at is null
        and created_at::date between v_prev_start and v_prev_end;

      declare
        v_prev_rechazadas int;
      begin
        select count(*) filter (where status = 'Rechazada')::int
        into v_prev_rechazadas
        from public.quotes
        where workspace_id = p_workspace_id
          and deleted_at is null
          and created_at::date between v_prev_start and v_prev_end;

        v_prev_conversion := case
          when (v_prev_aprobadas + v_prev_rechazadas) = 0 then 0
          else round((v_prev_aprobadas::numeric / (v_prev_aprobadas + v_prev_rechazadas)) * 100, 1)
        end;
      end;
    end;
  end if;

  -- ── Serie mensual (últimos 12 meses) — solo PRO/PREMIUM ──────────────────
  return jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object(
      'start', v_start,
      'end',   v_end,
      'days',  v_period_days,
      'plan',  v_plan_code
    ),
    'kpis', jsonb_build_object(
      'cotizaciones_creadas',  v_cotizadas_count,
      'valor_cotizado',        v_cotizado_valor,
      'cotizaciones_enviadas', v_enviadas_count,
      'cotizaciones_aprobadas',v_aprobadas_count,
      'valor_aprobado',        v_aprobado_valor,
      'cotizaciones_rechazadas',v_rechazadas_count,
      'cotizaciones_vencidas', v_vencidas_count,
      'cotizaciones_vistas',   v_vistas_count,
      'tasa_conversion',       v_conversion_rate,
      'tiempo_promedio_cierre_dias', v_avg_close_days,
      'con_seguimiento',       v_con_seguimiento
    ),
    'vs_periodo_anterior', case when v_is_advanced then jsonb_build_object(
      'cotizaciones_creadas_prev', v_prev_cotizadas,
      'valor_cotizado_prev',       v_prev_cotizado_valor,
      'aprobadas_prev',            v_prev_aprobadas,
      'conversion_prev',           v_prev_conversion
    ) else null end,
    'serie_mensual', (
      select coalesce(jsonb_agg(m order by m->>'month' asc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'month',          to_char(d.month, 'YYYY-MM'),
          'label',          to_char(d.month, 'Mon YY'),
          'valor_cotizado', coalesce(sum((q.calc_snapshot->>'total')::numeric), 0),
          'valor_aprobado', coalesce(sum((q.calc_snapshot->>'total')::numeric) filter (where q.status = 'Aprobada'), 0),
          'count',          count(q.id)::int,
          'aprobadas',      count(q.id) filter (where q.status = 'Aprobada')::int
        ) as m
        from generate_series(
          date_trunc('month', now() - interval '11 months')::date,
          date_trunc('month', now())::date,
          '1 month'::interval
        ) as d(month)
        left join public.quotes q
          on q.workspace_id = p_workspace_id
          and q.deleted_at is null
          and date_trunc('month', q.created_at)::date = d.month
        group by d.month
      ) sub
    )
  );
end;
$$;

grant execute on function public.get_reports_summary(uuid, date, date) to authenticated;

-- ============================================================================
-- RPC 2: get_funnel_report — Embudo comercial real desde commercial_status
-- ============================================================================
-- PRO/PREMIUM: advanced_reports_enabled requerido
-- Fuente de verdad: quotes.commercial_status (canónico)
-- ============================================================================

create or replace function public.get_funnel_report(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_start       date;
  v_end         date;
begin
  -- ZERO TRUST
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  -- Feature gating PRO+
  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Embudo comercial requiere plan PRO o PREMIUM');
  end if;

  -- Período
  v_start := coalesce(p_period_start, (now() - interval '90 days')::date);
  v_end   := coalesce(p_period_end, current_date);

  if v_end - v_start > 366 then
    return jsonb_build_object('ok', false, 'error', 'Rango máximo 12 meses');
  end if;

  return jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'stages', (
      select jsonb_agg(s order by s->>'order' asc)
      from (
        select jsonb_build_object(
          'status',          cs,
          'order',           ord,
          'label',           lbl,
          'count',           coalesce(count(q.id)::int, 0),
          'valor',           coalesce(sum((q.calc_snapshot->>'total')::numeric), 0),
          'conversion_from_total', case
            when total_base > 0
            then round((count(q.id)::numeric / total_base) * 100, 1)
            else 0
          end
        ) as s
        from (
          values
            ('borrador',    1, 'Borrador'),
            ('enviada',     2, 'Enviada'),
            ('vista',       3, 'Vista'),
            ('negociacion', 4, 'Negociación'),
            ('aprobada',    5, 'Aprobada'),
            ('rechazada',   6, 'Rechazada'),
            ('vencida',     7, 'Vencida')
        ) as stages(cs, ord, lbl)
        cross join lateral (
          select count(*) as total_base
          from public.quotes
          where workspace_id = p_workspace_id
            and deleted_at is null
            and created_at::date between v_start and v_end
        ) base
        left join public.quotes q
          on q.workspace_id = p_workspace_id
          and q.deleted_at is null
          and q.commercial_status = cs
          and q.created_at::date between v_start and v_end
        group by cs, ord, lbl, total_base
      ) sub
    ),
    'resumen', (
      select jsonb_build_object(
        'total_en_pipeline',    count(*) filter (where commercial_status in ('enviada','vista','negociacion'))::int,
        'valor_en_pipeline',    coalesce(sum((calc_snapshot->>'total')::numeric) filter (where commercial_status in ('enviada','vista','negociacion')), 0),
        'tasa_vista',           case when count(*) filter (where commercial_status not in ('borrador')) > 0
                                  then round((count(*) filter (where commercial_status in ('vista','negociacion','aprobada'))::numeric /
                                             count(*) filter (where commercial_status not in ('borrador'))) * 100, 1) else 0 end,
        'tasa_cierre',          case when (count(*) filter (where commercial_status in ('aprobada','rechazada'))) > 0
                                  then round((count(*) filter (where commercial_status = 'aprobada')::numeric /
                                             count(*) filter (where commercial_status in ('aprobada','rechazada'))) * 100, 1) else 0 end
      )
      from public.quotes
      where workspace_id = p_workspace_id
        and deleted_at is null
        and created_at::date between v_start and v_end
    )
  );
end;
$$;

grant execute on function public.get_funnel_report(uuid, date, date) to authenticated;

-- ============================================================================
-- RPC 3: get_services_report — Servicios cotizados vs vendidos
-- ============================================================================
-- PRO/PREMIUM: advanced_reports_enabled requerido
-- Fuente: service_lines JSONB en quotes
-- ============================================================================

create or replace function public.get_services_report(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_start   date;
  v_end     date;
begin
  -- ZERO TRUST
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Reporte de servicios requiere plan PRO o PREMIUM');
  end if;

  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end   := coalesce(p_period_end, current_date);

  if v_end - v_start > 366 then
    return jsonb_build_object('ok', false, 'error', 'Rango máximo 12 meses');
  end if;

  return jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'services', (
      select coalesce(jsonb_agg(s order by s->>'veces_cotizado' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'service_name',     service_name,
          'veces_cotizado',   count(*)::int,
          'valor_cotizado',   round(sum(valor_por_servicio)::numeric, 0),
          'veces_vendido',    count(*) filter (where es_aprobada)::int,
          'valor_vendido',    round(sum(valor_por_servicio) filter (where es_aprobada)::numeric, 0),
          'tasa_conversion',  case when count(*) > 0
                               then round((count(*) filter (where es_aprobada)::numeric / count(*)) * 100, 1)
                               else 0 end
        ) as s
        from (
          select
            (sl->>'service_name') as service_name,
            -- Valor aproximado por servicio: total / número de servicios en la cotización
            (q.calc_snapshot->>'total')::numeric / greatest(jsonb_array_length(q.service_lines), 1) as valor_por_servicio,
            q.status = 'Aprobada' as es_aprobada
          from public.quotes q,
               jsonb_array_elements(
                 case jsonb_typeof(q.service_lines)
                   when 'array' then q.service_lines
                   else '[]'::jsonb
                 end
               ) as sl
          where q.workspace_id = p_workspace_id
            and q.deleted_at is null
            and q.created_at::date between v_start and v_end
            and jsonb_array_length(
                  case jsonb_typeof(q.service_lines)
                    when 'array' then q.service_lines
                    else '[]'::jsonb
                  end
                ) > 0
            and (sl->>'service_name') is not null
            and (sl->>'service_name') != ''
        ) raw
        where service_name is not null
        group by service_name
        having count(*) > 0
        order by count(*) desc
        limit 20
      ) sub
    )
  );
end;
$$;

grant execute on function public.get_services_report(uuid, date, date) to authenticated;

-- ============================================================================
-- RPC 4: get_clients_report — Análisis de clientes
-- ============================================================================
-- FREE: solo conteos básicos del mes actual
-- PRO/PREMIUM: análisis completo con histórico
-- ============================================================================

create or replace function public.get_clients_report(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_is_advanced boolean;
  v_start       date;
  v_end         date;
  v_nuevos      int;
  v_activos     int;
  v_inactivos   int;
  v_recurrentes int;
  v_total       int;
begin
  -- ZERO TRUST
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  v_is_advanced := public.check_feature_access(p_workspace_id, 'advanced_reports_enabled');

  if not v_is_advanced then
    v_start := date_trunc('month', now())::date;
    v_end   := current_date;
  else
    v_start := coalesce(p_period_start, date_trunc('month', now() - interval '2 months')::date);
    v_end   := coalesce(p_period_end, current_date);
    if v_end - v_start > 366 then
      return jsonb_build_object('ok', false, 'error', 'Rango máximo 12 meses');
    end if;
  end if;

  -- Clientes nuevos en el período
  select count(*)::int into v_nuevos
  from public.clients
  where workspace_id = p_workspace_id
    and deleted_at is null
    and created_at::date between v_start and v_end;

  -- Clientes activos (con al menos 1 cotización en el período)
  select count(distinct c.id)::int into v_activos
  from public.clients c
  join public.quotes q on q.client_id = c.id
  where c.workspace_id = p_workspace_id
    and c.deleted_at is null
    and q.deleted_at is null
    and q.created_at::date between v_start and v_end;

  -- Total de clientes
  select count(*)::int into v_total
  from public.clients
  where workspace_id = p_workspace_id and deleted_at is null;

  -- Clientes inactivos (sin cotizaciones en últimos 60 días y con historial)
  select count(*)::int into v_inactivos
  from public.clients c
  where c.workspace_id = p_workspace_id
    and c.deleted_at is null
    and c.total_quotes > 0
    and (c.last_activity_at is null or c.last_activity_at < now() - interval '60 days');

  -- Clientes recurrentes (2+ cotizaciones aprobadas)
  select count(*)::int into v_recurrentes
  from public.clients
  where workspace_id = p_workspace_id
    and deleted_at is null
    and total_approved >= 2;

  return jsonb_build_object(
    'ok', true,
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'resumen', jsonb_build_object(
      'total',       v_total,
      'nuevos',      v_nuevos,
      'activos',     v_activos,
      'inactivos',   v_inactivos,
      'recurrentes', v_recurrentes
    ),
    'top_clientes', case when v_is_advanced then (
      select coalesce(jsonb_agg(c order by c->>'valor_aprobado' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id',              cl.id,
          'name',            cl.name,
          'cotizaciones',    count(q.id)::int,
          'valor_cotizado',  coalesce(sum((q.calc_snapshot->>'total')::numeric), 0),
          'aprobadas',       count(q.id) filter (where q.status = 'Aprobada')::int,
          'valor_aprobado',  coalesce(sum((q.calc_snapshot->>'total')::numeric) filter (where q.status = 'Aprobada'), 0),
          'tasa_conversion', case
            when (count(q.id) filter (where q.status in ('Aprobada','Rechazada'))) > 0
            then round((count(q.id) filter (where q.status = 'Aprobada')::numeric /
                        count(q.id) filter (where q.status in ('Aprobada','Rechazada'))) * 100, 0)
            else 0 end,
          'ultima_actividad', cl.last_activity_at
        ) as c
        from public.clients cl
        left join public.quotes q on q.client_id = cl.id
          and q.deleted_at is null
          and q.created_at::date between v_start and v_end
        where cl.workspace_id = p_workspace_id
          and cl.deleted_at is null
        group by cl.id, cl.name, cl.last_activity_at
        having count(q.id) > 0
        order by coalesce(sum((q.calc_snapshot->>'total')::numeric) filter (where q.status = 'Aprobada'), 0) desc
        limit 10
      ) sub
    ) else null end,
    'inactivos_detalle', case when v_is_advanced then (
      select coalesce(jsonb_agg(c order by c->>'dias_sin_actividad' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id',                  cl.id,
          'name',                cl.name,
          'total_aprobado',      cl.total_value,
          'dias_sin_actividad',  extract(day from now() - cl.last_activity_at)::int,
          'ultima_actividad',    cl.last_activity_at
        ) as c
        from public.clients cl
        where cl.workspace_id = p_workspace_id
          and cl.deleted_at is null
          and cl.total_quotes > 0
          and (cl.last_activity_at is null or cl.last_activity_at < now() - interval '60 days')
        order by cl.last_activity_at asc nulls first
        limit 10
      ) sub
    ) else null end
  );
end;
$$;

grant execute on function public.get_clients_report(uuid, date, date) to authenticated;

-- ============================================================================
-- RPC 5: get_executive_dashboard — Vista ejecutiva consolidada
-- ============================================================================
-- PRO/PREMIUM: advanced_reports_enabled requerido
-- Devuelve todo en una sola llamada: KPIs + embudo + clientes + alertas
-- ============================================================================

create or replace function public.get_executive_dashboard(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_plan_code text;
  v_is_premium boolean;
begin
  -- ZERO TRUST
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Dashboard ejecutivo requiere plan PRO o PREMIUM');
  end if;

  v_plan_code  := public.get_effective_plan_code(p_workspace_id);
  v_is_premium := v_plan_code = 'premium';

  return jsonb_build_object(
    'ok', true,
    'plan', v_plan_code,
    -- Últimos 30 días
    'ultimos_30_dias', (
      select jsonb_build_object(
        'valor_cotizado',    coalesce(sum((calc_snapshot->>'total')::numeric), 0),
        'valor_aprobado',    coalesce(sum((calc_snapshot->>'total')::numeric) filter (where status = 'Aprobada'), 0),
        'cotizaciones',      count(*)::int,
        'aprobadas',         count(*) filter (where status = 'Aprobada')::int,
        'rechazadas',        count(*) filter (where status = 'Rechazada')::int,
        'tasa_conversion',   case
          when (count(*) filter (where status in ('Aprobada','Rechazada'))) > 0
          then round((count(*) filter (where status = 'Aprobada')::numeric /
                      count(*) filter (where status in ('Aprobada','Rechazada'))) * 100, 1)
          else 0 end
      )
      from public.quotes
      where workspace_id = p_workspace_id
        and deleted_at is null
        and created_at >= now() - interval '30 days'
    ),
    -- Mes anterior (para comparativa)
    'mes_anterior', (
      select jsonb_build_object(
        'valor_cotizado', coalesce(sum((calc_snapshot->>'total')::numeric), 0),
        'aprobadas',      count(*) filter (where status = 'Aprobada')::int,
        'tasa_conversion', case
          when (count(*) filter (where status in ('Aprobada','Rechazada'))) > 0
          then round((count(*) filter (where status = 'Aprobada')::numeric /
                      count(*) filter (where status in ('Aprobada','Rechazada'))) * 100, 1)
          else 0 end
      )
      from public.quotes
      where workspace_id = p_workspace_id
        and deleted_at is null
        and created_at >= date_trunc('month', now()) - interval '1 month'
        and created_at < date_trunc('month', now())
    ),
    -- Pipeline activo
    'pipeline_activo', (
      select jsonb_build_object(
        'total_oportunidades', count(*)::int,
        'valor_en_juego',      coalesce(sum((calc_snapshot->>'total')::numeric), 0),
        'por_estado', jsonb_object_agg(
          commercial_status,
          jsonb_build_object('count', cnt, 'valor', val)
        )
      )
      from (
        select
          commercial_status,
          count(*)::int as cnt,
          coalesce(sum((calc_snapshot->>'total')::numeric), 0) as val
        from public.quotes
        where workspace_id = p_workspace_id
          and deleted_at is null
          and commercial_status in ('enviada','vista','negociacion')
        group by commercial_status
      ) p
    ),
    -- Clientes activos (30 días)
    'clientes', (
      select jsonb_build_object(
        'total',       (select count(*)::int from public.clients where workspace_id = p_workspace_id and deleted_at is null),
        'activos_30d', count(distinct q.client_id)::int,
        'inactivos',   (select count(*)::int from public.clients where workspace_id = p_workspace_id and deleted_at is null and total_quotes > 0 and (last_activity_at is null or last_activity_at < now() - interval '60 days'))
      )
      from public.quotes q
      where q.workspace_id = p_workspace_id
        and q.client_id is not null
        and q.deleted_at is null
        and q.created_at >= now() - interval '30 days'
    ),
    -- Créditos IA
    'ai_credits', (
      select jsonb_build_object(
        'usado',    coalesce(sum(credits_used), 0)::int,
        'maximo',   (select ai_credits_monthly from public.plan_limits where plan_code = v_plan_code),
        'periodo',  date_trunc('month', now())::date
      )
      from public.ai_usage
      where workspace_id = p_workspace_id
        and period_month = date_trunc('month', now())::date
    ),
    -- PREMIUM: datos adicionales
    'premium_data', case when v_is_premium then jsonb_build_object(
      'tendencia_3m', (
        select coalesce(jsonb_agg(m order by m->>'month'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'month',   to_char(d.m, 'YYYY-MM'),
            'label',   to_char(d.m, 'Mon'),
            'cotizado', coalesce(sum((q.calc_snapshot->>'total')::numeric), 0),
            'aprobado', coalesce(sum((q.calc_snapshot->>'total')::numeric) filter (where q.status = 'Aprobada'), 0)
          ) as m
          from generate_series(
            date_trunc('month', now() - interval '2 months')::date,
            date_trunc('month', now())::date,
            '1 month'::interval
          ) d(m)
          left join public.quotes q on q.workspace_id = p_workspace_id
            and q.deleted_at is null
            and date_trunc('month', q.created_at) = d.m
          group by d.m
        ) sub
      )
    ) else null end
  );
end;
$$;

grant execute on function public.get_executive_dashboard(uuid) to authenticated;

-- ============================================================================
-- RPC 6: get_smart_alerts — Alertas inteligentes de negocio
-- ============================================================================
-- PRO/PREMIUM: advanced_reports_enabled requerido
-- Detecta: caída de conversión, clientes perdidos, anomalías, oportunidades
-- ============================================================================

create or replace function public.get_smart_alerts(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  -- Conversión mes actual
  v_conv_actual   numeric;
  v_conv_anterior numeric;
  -- Contadores
  v_sin_seguimiento int;
  v_por_vencer      int;
  v_clientes_perdidos int;
  v_rechazos_mes    int;
  v_rechazos_anterior int;
begin
  -- ZERO TRUST
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
  end if;

  if not public.check_feature_access(p_workspace_id, 'advanced_reports_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Alertas inteligentes requieren plan PRO o PREMIUM');
  end if;

  -- Tasa de conversión mes actual
  select case
    when (count(*) filter (where status in ('Aprobada','Rechazada'))) > 0
    then round((count(*) filter (where status = 'Aprobada')::numeric /
                count(*) filter (where status in ('Aprobada','Rechazada'))) * 100, 1)
    else null
  end into v_conv_actual
  from public.quotes
  where workspace_id = p_workspace_id
    and deleted_at is null
    and created_at >= date_trunc('month', now());

  -- Tasa de conversión mes anterior
  select case
    when (count(*) filter (where status in ('Aprobada','Rechazada'))) > 0
    then round((count(*) filter (where status = 'Aprobada')::numeric /
                count(*) filter (where status in ('Aprobada','Rechazada'))) * 100, 1)
    else null
  end into v_conv_anterior
  from public.quotes
  where workspace_id = p_workspace_id
    and deleted_at is null
    and created_at >= date_trunc('month', now() - interval '1 month')
    and created_at < date_trunc('month', now());

  -- Cotizaciones sin seguimiento en 3+ días
  select count(*)::int into v_sin_seguimiento
  from public.quotes q
  where q.workspace_id = p_workspace_id
    and q.deleted_at is null
    and q.commercial_status in ('enviada','vista')
    and q.updated_at < now() - interval '3 days'
    and not exists (
      select 1 from public.seguimientos s
      where s.quote_id = q.id
        and s.created_at > now() - interval '3 days'
    );

  -- Cotizaciones por vencer (próximos 3 días)
  select count(*)::int into v_por_vencer
  from public.quotes q
  where q.workspace_id = p_workspace_id
    and q.deleted_at is null
    and q.commercial_status in ('enviada','vista','negociacion')
    and q.sent_at is not null
    and q.sent_at + (q.valid_days || ' days')::interval between now() and now() + interval '3 days';

  -- Clientes que estaban activos y dejaron de serlo (60+ días)
  select count(*)::int into v_clientes_perdidos
  from public.clients
  where workspace_id = p_workspace_id
    and deleted_at is null
    and total_approved >= 1
    and last_activity_at < now() - interval '60 days';

  -- Rechazos mes actual vs mes anterior (alerta si sube >30%)
  select count(*) filter (where created_at >= date_trunc('month', now()))::int,
         count(*) filter (where created_at >= date_trunc('month', now() - interval '1 month')
                              and created_at < date_trunc('month', now()))::int
  into v_rechazos_mes, v_rechazos_anterior
  from public.quotes
  where workspace_id = p_workspace_id
    and deleted_at is null
    and status = 'Rechazada';

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'alerts', (
      select coalesce(jsonb_agg(a order by a->>'severity' desc, a->>'created_at' desc), '[]'::jsonb)
      from (
        -- Alerta: caída de conversión
        select jsonb_build_object(
          'type',      'conversion_drop',
          'severity',  'high',
          'title',     'Caída en tasa de conversión',
          'message',   'Tu conversión bajó de ' || v_conv_anterior || '% a ' || v_conv_actual || '% este mes.',
          'action',    'Revisa las cotizaciones rechazadas y ajusta tu estrategia',
          'value',     v_conv_actual,
          'prev_value',v_conv_anterior,
          'created_at', now()
        )
        where v_conv_actual is not null
          and v_conv_anterior is not null
          and v_conv_actual < v_conv_anterior * 0.8  -- caída >20%

        union all

        -- Alerta: cotizaciones sin seguimiento
        select jsonb_build_object(
          'type',     'overdue_followup',
          'severity', case when v_sin_seguimiento >= 5 then 'high' else 'medium' end,
          'title',    v_sin_seguimiento || ' cotización' || case when v_sin_seguimiento > 1 then 'es sin' else ' sin' end || ' seguimiento',
          'message',  'Llevan más de 3 días sin contacto. Riesgo de pérdida.',
          'action',   'Ir al Pipeline y registrar un seguimiento',
          'value',    v_sin_seguimiento,
          'created_at', now()
        )
        where v_sin_seguimiento > 0

        union all

        -- Alerta: cotizaciones por vencer
        select jsonb_build_object(
          'type',     'expiring_soon',
          'severity', 'high',
          'title',    v_por_vencer || ' cotización' || case when v_por_vencer > 1 then 'es vencen' else ' vence' end || ' en 3 días',
          'message',  'Contacta a los clientes antes de que la propuesta pierda validez.',
          'action',   'Ver en Pipeline → columna Enviada',
          'value',    v_por_vencer,
          'created_at', now()
        )
        where v_por_vencer > 0

        union all

        -- Alerta: clientes perdidos
        select jsonb_build_object(
          'type',     'lost_clients',
          'severity', case when v_clientes_perdidos >= 3 then 'high' else 'medium' end,
          'title',    v_clientes_perdidos || ' cliente' || case when v_clientes_perdidos > 1 then 's inactivos' else ' inactivo' end,
          'message',  'Sin actividad en 60+ días. Podrías estar perdiendo clientes.',
          'action',   'Ir a Clientes → filtrar por Inactivos',
          'value',    v_clientes_perdidos,
          'created_at', now()
        )
        where v_clientes_perdidos > 0

        union all

        -- Alerta: aumento de rechazos
        select jsonb_build_object(
          'type',     'high_rejection',
          'severity', 'medium',
          'title',    'Aumento de rechazos este mes',
          'message',  v_rechazos_mes || ' rechazos este mes vs ' || v_rechazos_anterior || ' el mes anterior.',
          'action',   'Analiza los motivos y ajusta tus propuestas',
          'value',    v_rechazos_mes,
          'prev_value', v_rechazos_anterior,
          'created_at', now()
        )
        where v_rechazos_anterior > 0
          and v_rechazos_mes > v_rechazos_anterior * 1.3  -- aumento >30%
      ) alerts
    ),
    'totals', jsonb_build_object(
      'sin_seguimiento', v_sin_seguimiento,
      'por_vencer',      v_por_vencer,
      'clientes_perdidos', v_clientes_perdidos
    )
  );
end;
$$;

grant execute on function public.get_smart_alerts(uuid) to authenticated;

-- ============================================================================
-- Registrar RPCs en Database interface (comments)
-- ============================================================================

comment on function public.get_reports_summary(uuid, date, date)
  is 'Sprint 5: KPIs de reportes por período. FREE=mes actual, PRO/PREMIUM=período libre hasta 12 meses.';
comment on function public.get_funnel_report(uuid, date, date)
  is 'Sprint 5: Embudo comercial desde commercial_status. PRO+ exclusivo.';
comment on function public.get_services_report(uuid, date, date)
  is 'Sprint 5: Servicios cotizados vs vendidos desde service_lines JSONB. PRO+ exclusivo.';
comment on function public.get_clients_report(uuid, date, date)
  is 'Sprint 5: Análisis de clientes nuevos/activos/inactivos/recurrentes. PRO+ con top 10.';
comment on function public.get_executive_dashboard(uuid)
  is 'Sprint 5: Vista ejecutiva consolidada en una sola llamada. PRO+ exclusivo.';
comment on function public.get_smart_alerts(uuid)
  is 'Sprint 5: Detección automática de anomalías y oportunidades. PRO+ exclusivo.';
