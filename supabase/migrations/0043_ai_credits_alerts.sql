-- ============================================================================
-- 0043 — ai_credits_alerts: Alertas automáticas al 80%, 90%, 100% de consumo IA
-- ============================================================================

-- 1. Función que evalúa si debe generar alerta de créditos
create or replace function public.notify_ai_credits_threshold(
  p_workspace_id uuid,
  p_credits_used int,
  p_credits_max  int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct           numeric;
  v_alert_type    text;
  v_title         text;
  v_message       text;
  v_already_sent  boolean;
begin
  if p_credits_max is null or p_credits_max = 0 then
    return; -- Sin límite → sin alerta
  end if;

  v_pct := round((p_credits_used::numeric / p_credits_max) * 100, 1);

  -- Determinar umbral
  v_alert_type := case
    when v_pct >= 100 then 'ai_credits_100'
    when v_pct >= 90  then 'ai_credits_90'
    when v_pct >= 80  then 'ai_credits_80'
    else null
  end;

  if v_alert_type is null then
    return; -- Sin alerta necesaria
  end if;

  -- Verificar que no se haya enviado ya esta alerta este mes
  select exists(
    select 1 from public.notifications
    where workspace_id = p_workspace_id
      and type = v_alert_type
      and created_at >= date_trunc('month', now())
  ) into v_already_sent;

  if v_already_sent then
    return; -- Ya se envió este mes
  end if;

  -- Construir mensaje según umbral
  v_title   := case v_alert_type
    when 'ai_credits_80'  then '⚠️ Créditos IA al 80%'
    when 'ai_credits_90'  then '🔶 Créditos IA al 90% — quedan pocos'
    when 'ai_credits_100' then '🔴 Créditos IA agotados — actualiza tu plan'
  end;

  v_message := case v_alert_type
    when 'ai_credits_80'  then format('Usaste %s de %s créditos IA este mes. Considera actualizar a PREMIUM para 2000 créditos.', p_credits_used, p_credits_max)
    when 'ai_credits_90'  then format('Solo quedan %s créditos IA disponibles. Próxima llamada puede ser bloqueada.', p_credits_max - p_credits_used)
    when 'ai_credits_100' then 'Has agotado todos tus créditos IA del mes. Actualiza a PREMIUM o espera hasta el 1 del próximo mes.'
  end;

  -- Insertar notificación
  insert into public.notifications (workspace_id, title, message, type, is_read)
  values (p_workspace_id, v_title, v_message, v_alert_type, false);
end;
$$;

-- Solo service_role puede llamar directamente (la llama consume_ai_credits)
grant execute on function public.notify_ai_credits_threshold(uuid, int, int) to service_role;
-- También authenticated para que la edge function pueda llamarla
grant execute on function public.notify_ai_credits_threshold(uuid, int, int) to authenticated;

-- 2. Actualizar consume_ai_credits para disparar alertas automáticamente
create or replace function public.consume_ai_credits(
  p_workspace_id   uuid,
  p_operation      text,
  p_tokens_used    int default 0,
  p_estimated_cost numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits_cost    int;
  v_check           jsonb;
  v_credits_used    int;
  v_credits_max     int;
begin
  -- ZERO TRUST: solo bypass si es service_role (auth.uid() = null)
  if auth.uid() is not null then
    perform public.assert_workspace_membership(p_workspace_id);
  end if;

  -- Obtener costo de la operación desde tabla configurable
  select credits_cost into v_credits_cost
  from public.ai_operation_costs
  where operation = p_operation and active = true;

  v_credits_cost := coalesce(v_credits_cost, 1);

  -- Verificar créditos disponibles
  select public.check_ai_credits(p_workspace_id, v_credits_cost) into v_check;

  if not (v_check->>'allowed')::boolean then
    return jsonb_build_object(
      'success',           false,
      'reason',            v_check->>'reason',
      'credits_remaining', v_check->'credits_remaining'
    );
  end if;

  -- Registrar consumo
  insert into public.ai_usage
    (workspace_id, feature, provider, tokens_used, estimated_cost, credits_used)
  values
    (p_workspace_id, p_operation, 'gemini', p_tokens_used, p_estimated_cost, v_credits_cost);

  -- Calcular nuevo total usado
  v_credits_max  := (v_check->>'credits_max')::int;
  v_credits_used := (v_check->>'credits_used')::int + v_credits_cost;

  -- Disparar alertas de umbral (80%, 90%, 100%)
  if v_credits_max is not null then
    perform public.notify_ai_credits_threshold(p_workspace_id, v_credits_used, v_credits_max);
  end if;

  return jsonb_build_object(
    'success',           true,
    'credits_consumed',  v_credits_cost,
    'credits_remaining', greatest(0, coalesce(v_credits_max, 0) - v_credits_used),
    'pct_used',          case
      when v_credits_max is null or v_credits_max = 0 then 0
      else round((v_credits_used::numeric / v_credits_max) * 100, 1)
    end
  );
end;
$$;

-- consume_ai_credits: solo service_role puede llamar directamente
grant execute on function public.consume_ai_credits(uuid, text, int, numeric) to service_role;
revoke execute on function public.consume_ai_credits(uuid, text, int, numeric) from authenticated;

comment on function public.notify_ai_credits_threshold is 'Alerta automática al 80/90/100% de créditos IA. Sprint 2.';
comment on function public.consume_ai_credits is 'consume_ai_credits v2: con alertas de umbral integradas. Sprint 2.';
