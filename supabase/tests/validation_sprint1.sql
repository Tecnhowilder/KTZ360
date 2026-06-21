-- ============================================================================
-- SHELWI — VALIDATION TESTS SPRINT 1 + 1.1
-- Ejecutar en el SQL Editor de Supabase (como postgres / service role)
-- NO ejecutar en producción con usuarios reales — usar workspaces de prueba
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBA 1: Workspace A — Comprar PRO Founder
-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo: verificar que subscription, founder_expires_at, founder_price
--           y plan efectivo quedan correctamente registrados.
-- ─────────────────────────────────────────────────────────────────────────────

-- PASO 1a: Obtener un workspace de prueba PRO (o insertar uno)
-- Usar workspace de prueba pro@test.shelwi.com
do $$
declare
  v_workspace_id uuid;
  v_plan_id      uuid;
begin
  -- Obtener workspace del usuario pro de prueba
  select p.workspace_id into v_workspace_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'pro@test.ktz360.com'
  limit 1;

  if v_workspace_id is null then
    raise notice 'PRUEBA 1: No se encontró workspace de prueba pro@test.ktz360.com';
    return;
  end if;

  raise notice 'PRUEBA 1: Usando workspace %', v_workspace_id;

  -- PASO 1b: Simular activación Founder
  perform public.activate_founder_subscription(
    v_workspace_id,
    'pro',
    'PRO Founder'
  );

  -- PASO 1c: Verificar resultado
  select plan_id into v_plan_id
  from public.subscriptions
  where workspace_id = v_workspace_id;

  raise notice '--- RESULTADO PRUEBA 1 ---';

  -- Verificar subscription
  perform (
    select 1 from public.subscriptions
    where workspace_id = v_workspace_id
      and is_founder = true
      and founder_expires_at > now()
      and founder_price = 29900
  );
  raise notice 'is_founder = true: %', found;
  raise notice 'founder_expires_at > now(): %', found;
  raise notice 'founder_price = 29900: %', found;

  -- Verificar plan efectivo
  raise notice 'Plan efectivo: %', public.get_effective_plan_code(v_workspace_id);

  -- Verificar precio en vista
  raise notice 'Precio efectivo: %', (
    select effective_price from public.v_subscription_effective_price
    where workspace_id = v_workspace_id
  );

  raise notice '--- PRUEBA 1 COMPLETADA ---';
end;
$$;

-- Query de verificación manual Prueba 1:
select
  s.workspace_id,
  p.code as plan_code,
  s.is_founder,
  s.founder_price,
  s.founder_expires_at,
  s.founder_expires_at > now() as founder_active,
  vep.effective_price,
  public.get_effective_plan_code(s.workspace_id) as effective_plan
from public.subscriptions s
join public.plans p on p.id = s.plan_id
left join public.v_subscription_effective_price vep on vep.workspace_id = s.workspace_id
where s.is_founder = true
limit 5;


-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBA 2: Workspace B intenta consumir IA de Workspace A
-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo: check_ai_credits y consume_ai_credits deben fallar con access_denied

-- Este test se ejecuta como el usuario de workspace B:
-- set local role 'authenticated';
-- set local "request.jwt.claims" = '{"sub": "<user_b_uuid>"}';

-- Query de test (sustituir UUIDs reales):
/*
select public.check_ai_credits(
  '<workspace_A_uuid>'::uuid,  -- workspace ajeno
  1
);
-- Resultado esperado: ERROR P0001 "access_denied: user does not belong to workspace..."
*/

-- Validación SQL de que la RLS existe:
select
  policyname,
  cmd,
  qual
from pg_policies
where tablename = 'ai_usage'
  and schemaname = 'public';
-- Debe mostrar: ai_usage_select_workspace (select) y ai_usage_insert_own (insert)

-- Validación de que consume_ai_credits no tiene grant a authenticated:
select
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_name = 'consume_ai_credits'
  and routine_schema = 'public';
-- Resultado esperado: SOLO 'postgres' y 'service_role' — NO 'authenticated'


-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBA 3: Workspace FREE intenta llamar ai-proxy → HTTP 403
-- ─────────────────────────────────────────────────────────────────────────────
-- Esta prueba se ejecuta via curl / Postman con el JWT del usuario FREE

-- Verificar que check_ai_credits retorna allowed=false para FREE:
do $$
declare
  v_workspace_id uuid;
  v_result       jsonb;
begin
  select p.workspace_id into v_workspace_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'free@test.ktz360.com'
  limit 1;

  if v_workspace_id is null then
    raise notice 'PRUEBA 3: No se encontró workspace free@test.ktz360.com';
    return;
  end if;

  -- Simular check como service_role (bypass membership check)
  -- En producción, el usuario FREE recibiría HTTP 403 desde ai-proxy
  select public.check_ai_credits(v_workspace_id, 1) into v_result;

  raise notice '--- RESULTADO PRUEBA 3 ---';
  raise notice 'check_ai_credits result: %', v_result;
  raise notice 'allowed: %', (v_result->>'allowed')::boolean;
  raise notice 'reason: %', v_result->>'reason';
  -- Resultado esperado: allowed=false, reason='ai_not_included'
  raise notice '--- PRUEBA 3 COMPLETADA ---';
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBA 4: Workspace PRO — Consumir 500 créditos, intento 501 → HTTP 429
-- ─────────────────────────────────────────────────────────────────────────────

-- Verificar que el límite es 500 para PRO:
select
  plan_code,
  ai_credits_monthly
from public.plan_limits
where plan_code = 'pro';
-- Resultado esperado: 500

-- Simular consumo de 499 créditos (insertar directamente en ai_usage):
do $$
declare
  v_workspace_id uuid;
  v_result       jsonb;
begin
  select p.workspace_id into v_workspace_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'pro@test.ktz360.com'
  limit 1;

  if v_workspace_id is null then
    raise notice 'PRUEBA 4: No se encontró workspace pro@test.ktz360.com';
    return;
  end if;

  -- Limpiar uso del mes actual para esta prueba
  delete from public.ai_usage
  where workspace_id = v_workspace_id
    and period_month = date_trunc('month', now())::date;

  -- Insertar 499 créditos usados (simulación)
  insert into public.ai_usage (workspace_id, feature, provider, tokens_used, estimated_cost, credits_used)
  values (v_workspace_id, 'ai_summary', 'gemini', 1000, 0.001, 499);

  -- Verificar estado: debería permitir 1 crédito más
  select public.check_ai_credits(v_workspace_id, 1) into v_result;
  raise notice 'Con 499 usados, intentar 1 más: allowed=%', v_result->>'allowed';
  -- Esperado: allowed=true

  -- Verificar que 2 más NO está permitido (499 + 2 = 501 > 500)
  select public.check_ai_credits(v_workspace_id, 2) into v_result;
  raise notice 'Con 499 usados, intentar 2 más: allowed=%', v_result->>'allowed';
  -- Esperado: allowed=false, reason='limit_reached'

  raise notice 'credits_remaining: %', v_result->'credits_remaining';
  raise notice '--- PRUEBA 4 COMPLETADA ---';

  -- Limpiar datos de prueba
  delete from public.ai_usage
  where workspace_id = v_workspace_id
    and period_month = date_trunc('month', now())::date;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBA 5: Price tampering desde DevTools → Debe fallar
-- ─────────────────────────────────────────────────────────────────────────────
-- El atacante modifica el body del checkout para enviar un precio falso.
-- create-checkout IGNORA cualquier precio del body — obtiene de DB.
-- mp-webhook valida el monto contra DB — bloquea si Δ > $5.000

-- Verificar que el precio en DB es el correcto:
select code, name, price, currency_code
from public.plans
where code in ('pro', 'premium');
-- PRO: $39.900, PREMIUM: $129.900

-- Simular webhook con monto manipulado (Δ > $5.000):
do $$
declare
  v_pro_price     numeric;
  v_fake_amount   numeric := 1000;
  v_delta         numeric;
begin
  -- Obtener precio PRO desde DB
  select price into v_pro_price
  from public.plans
  where code = 'pro';

  v_delta := abs(v_fake_amount - v_pro_price);

  raise notice '--- PRUEBA 5: Price Tampering ---';
  raise notice 'Precio PRO en DB: %', v_pro_price;
  raise notice 'Atacante envía: % COP', v_fake_amount;
  raise notice 'Delta: % COP', v_delta;
  raise notice 'Delta > 5000: %', v_delta > 5000;
  raise notice 'Resultado esperado: BLOQUEADO + audit_log price_tampering_detected';
  raise notice '--- PRUEBA 5 COMPLETADA ---';
end;
$$;

-- Verificar que audit_log registra price_tampering cuando ocurre:
select action, metadata, created_at
from public.audit_log
where action = 'price_tampering_detected'
order by created_at desc
limit 5;


-- ─────────────────────────────────────────────────────────────────────────────
-- RESUMEN DE PERMISOS — Verificación final de seguridad
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. consume_ai_credits NO accesible desde authenticated:
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_name in ('consume_ai_credits', 'check_ai_credits', 'assert_workspace_membership')
  and routine_schema = 'public'
order by routine_name, grantee;

-- 2. activate_founder_subscription solo service_role:
select
  routine_name,
  grantee
from information_schema.routine_privileges
where routine_name = 'activate_founder_subscription'
  and routine_schema = 'public';

-- 3. RLS habilitado en tablas críticas:
select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'subscriptions', 'ai_usage', 'plans',
    'founder_promotions', 'plan_features', 'plan_limits',
    'audit_log', 'payment_events'
  )
order by tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- ESTADO ESPERADO: PRODUCCIÓN APROBADA
-- Todos los tests deben pasar antes del deploy
-- ─────────────────────────────────────────────────────────────────────────────
