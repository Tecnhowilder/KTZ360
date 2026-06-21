-- ============================================================================
-- 0042 — ai_credits_dashboard: RPC y vistas para dashboard de créditos IA
-- ============================================================================

-- 1. RPC optimizada para el dashboard de créditos del usuario
create or replace function public.get_ai_credits_summary(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code        text;
  v_credits_max      int;
  v_credits_used     int;
  v_credits_remaining int;
  v_period_start     date;
  v_period_end       date;
  v_by_operation     jsonb;
begin
  -- ZERO TRUST: validar pertenencia
  perform public.assert_workspace_membership(p_workspace_id);

  v_plan_code    := public.get_effective_plan_code(p_workspace_id);
  v_period_start := date_trunc('month', now())::date;
  v_period_end   := (date_trunc('month', now()) + interval '1 month - 1 day')::date;

  -- Obtener límite del plan
  select ai_credits_monthly into v_credits_max
  from public.plan_limits
  where plan_code = v_plan_code;

  -- Créditos usados este mes
  select coalesce(sum(credits_used), 0) into v_credits_used
  from public.ai_usage
  where workspace_id = p_workspace_id
    and period_month = v_period_start;

  v_credits_remaining := case
    when v_credits_max is null then null
    else greatest(0, v_credits_max - v_credits_used)
  end;

  -- Consumo por operación este mes
  select coalesce(
    jsonb_object_agg(feature, credits),
    '{}'::jsonb
  ) into v_by_operation
  from (
    select feature, sum(credits_used) as credits
    from public.ai_usage
    where workspace_id = p_workspace_id
      and period_month = v_period_start
    group by feature
  ) t;

  return jsonb_build_object(
    'plan_code',          v_plan_code,
    'credits_max',        v_credits_max,
    'credits_used',       v_credits_used,
    'credits_remaining',  v_credits_remaining,
    'pct_used',           case
      when v_credits_max is null or v_credits_max = 0 then 0
      else round((v_credits_used::numeric / v_credits_max) * 100, 1)
    end,
    'period_start',       v_period_start,
    'period_end',         v_period_end,
    'by_operation',       v_by_operation,
    'ai_enabled',         (select ai_enabled from public.plan_features where plan_code = v_plan_code)
  );
end;
$$;

grant execute on function public.get_ai_credits_summary(uuid) to authenticated;

-- 2. RPC para historial de consumo IA (últimos 30 días)
create or replace function public.get_ai_usage_history(
  p_workspace_id uuid,
  p_days         int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_history jsonb;
begin
  perform public.assert_workspace_membership(p_workspace_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date',            created_at::date,
        'operation',       feature,
        'credits_used',    credits_used,
        'tokens_used',     tokens_used,
        'estimated_cost',  estimated_cost
      ) order by created_at desc
    ),
    '[]'::jsonb
  ) into v_history
  from public.ai_usage
  where workspace_id = p_workspace_id
    and created_at >= now() - (p_days || ' days')::interval;

  return v_history;
end;
$$;

grant execute on function public.get_ai_usage_history(uuid, int) to authenticated;

comment on function public.get_ai_credits_summary is 'Dashboard de créditos IA: usado/restante/por-operación. Sprint 2.';
comment on function public.get_ai_usage_history  is 'Historial de consumo IA últimos N días. Sprint 2.';
