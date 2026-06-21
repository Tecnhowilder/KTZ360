-- ============================================================================
-- 0040 — security_rpc_ownership: Corrección BUG-1
-- VULNERABILIDAD: consume_ai_credits y check_ai_credits aceptaban cualquier
-- workspace_id sin verificar que el caller sea miembro del workspace.
-- FIX: Ambas RPCs ahora validan auth.uid() → profiles → workspace_id.
-- ============================================================================

-- ── FUNCIÓN HELPER: validar pertenencia al workspace ─────────────────────────

create or replace function public.assert_workspace_membership(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bypass 1: Sin sesión JWT (postgres / service_role directo desde SQL Editor o backend)
  -- auth.uid() = NULL significa que la llamada viene de un contexto privilegiado interno.
  if auth.uid() is null then
    return;
  end if;

  -- Bypass 2: Super/support admin con JWT válido
  if public.is_support_admin() then
    return;
  end if;

  -- Para usuarios autenticados: verificar que pertenecen al workspace
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and workspace_id = p_workspace_id
  ) then
    -- Registrar intento sospechoso
    begin
      insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
      values (
        p_workspace_id,
        auth.uid(),
        'unauthorized_workspace_access',
        'security',
        jsonb_build_object(
          'attempted_workspace', p_workspace_id,
          'caller_uid', auth.uid(),
          'function', 'assert_workspace_membership'
        )
      );
    exception when others then null; end;

    raise exception 'access_denied: user does not belong to workspace %', p_workspace_id
      using errcode = 'P0001';
  end if;
end;
$$;

-- Otorgar solo a authenticated (la función internamente valida pertenencia)
grant execute on function public.assert_workspace_membership(uuid) to authenticated;

-- ── BUG-1 FIX: check_ai_credits con ownership validation ─────────────────────

create or replace function public.check_ai_credits(
  p_workspace_id uuid,
  p_credits_needed int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code      text;
  v_credits_max    int;
  v_credits_used   int;
  v_ai_enabled     boolean;
  v_credits_enabled boolean;
begin
  -- ZERO TRUST: validar que el caller pertenece al workspace
  perform public.assert_workspace_membership(p_workspace_id);

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  select ai_enabled, ai_credits_enabled
  into v_ai_enabled, v_credits_enabled
  from public.plan_features
  where plan_code = v_plan_code;

  if not coalesce(v_ai_enabled, false) then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'ai_not_included',
      'plan', v_plan_code,
      'credits_used', 0,
      'credits_max', 0,
      'credits_remaining', 0
    );
  end if;

  select ai_credits_monthly into v_credits_max
  from public.plan_limits
  where plan_code = v_plan_code;

  if v_credits_max is null then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'unlimited',
      'credits_used', 0,
      'credits_max', null,
      'credits_remaining', null
    );
  end if;

  select coalesce(sum(credits_used), 0) into v_credits_used
  from public.ai_usage
  where workspace_id = p_workspace_id
    and period_month = date_trunc('month', now())::date;

  return jsonb_build_object(
    'allowed',           (v_credits_used + p_credits_needed) <= v_credits_max,
    'reason',            case
      when (v_credits_used + p_credits_needed) <= v_credits_max then 'ok'
      else 'limit_reached'
    end,
    'plan',              v_plan_code,
    'credits_used',      v_credits_used,
    'credits_max',       v_credits_max,
    'credits_remaining', greatest(0, v_credits_max - v_credits_used),
    'credits_needed',    p_credits_needed
  );
end;
$$;

grant execute on function public.check_ai_credits(uuid, int) to authenticated;

-- ── BUG-1 FIX: consume_ai_credits con ownership validation ───────────────────

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
  v_credits_cost  int;
  v_check         jsonb;
begin
  -- ZERO TRUST: validar pertenencia (solo skip para service_role via ai-proxy)
  -- La función se llama desde service_role (ai-proxy) o authenticated
  -- En modo service_role auth.uid() es NULL → is_support_admin() lo bypasea
  if auth.uid() is not null then
    perform public.assert_workspace_membership(p_workspace_id);
  end if;

  -- Obtener costo de la operación desde tabla configurable
  select credits_cost into v_credits_cost
  from public.ai_operation_costs
  where operation = p_operation and active = true;

  v_credits_cost := coalesce(v_credits_cost, 1);

  -- Verificar créditos disponibles
  -- Si auth.uid() es null (service_role), pasamos la validación de ownership directamente
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

  return jsonb_build_object(
    'success',           true,
    'credits_consumed',  v_credits_cost,
    'credits_remaining', greatest(0, (v_check->'credits_remaining')::int - v_credits_cost)
  );
end;
$$;

-- consume_ai_credits: solo service_role (lo llama ai-proxy, no el frontend directo)
grant execute on function public.consume_ai_credits(uuid, text, int, numeric) to service_role;
-- Revocar acceso de authenticated (BUG-1 principal fix)
revoke execute on function public.consume_ai_credits(uuid, text, int, numeric) from authenticated;

comment on function public.assert_workspace_membership is
  'ZERO TRUST: valida que auth.uid() pertenece al workspace. Registra accesos no autorizados. Sprint 1.1.';
comment on function public.check_ai_credits is
  'BUG-1 FIXED: ahora valida ownership del workspace. Sprint 1.1.';
comment on function public.consume_ai_credits is
  'BUG-1 FIXED: solo service_role puede llamar. Sprint 1.1.';
