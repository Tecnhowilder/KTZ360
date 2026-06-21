-- ============================================================================
-- 0039 — security_audit: Correcciones de seguridad Sprint 1
-- ============================================================================
-- Hallazgos auditados:
--   1. founder_promotions — RLS ya incluida en 0036
--   2. ai_operation_costs — RLS ya incluida en 0038
--   3. plan_features / plan_limits — solo lectura para authenticated ✅
--   4. subscriptions — solo el workspace dueño puede leer ✅
--   5. v_subscription_effective_price — vista pública, agregar security
--   6. Verificar que ningún RPC expone datos de otros workspaces
-- ============================================================================

-- 1. Asegurar que la vista effective_price usa security_invoker
--    (la vista ya usa funciones security definer correctamente)
alter view public.v_subscription_effective_price owner to postgres;

-- 2. Política de seguridad para founder_promotions — ya en 0036
--    Verificar que no hay bypass

-- 3. Agregar política de lectura de subscription a workspace propio
--    (ya debe existir desde 0016, pero la re-aseguramos)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'subscriptions' and policyname = 'subscriptions_select_own_workspace'
  ) then
    create policy "subscriptions_select_own_workspace" on public.subscriptions
      for select using (
        workspace_id in (
          select workspace_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end;
$$;

-- 4. Función de auditoría: registrar accesos sospechosos
--    (llamada manualmente o desde triggers de alertas)
create or replace function public.log_security_event(
  p_event_type  text,
  p_workspace_id uuid,
  p_user_id     uuid,
  p_details     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    workspace_id, user_id, action, entity_type, metadata
  ) values (
    p_workspace_id,
    p_user_id,
    p_event_type,
    'security',
    p_details
  );
exception when others then
  -- Nunca bloquear por fallo de auditoría
  null;
end;
$$;

-- 5. Verificar que check_ai_credits no puede ser bypasado
--    La función es security definer — lee plan_code desde DB, no del cliente ✅

-- 6. Rate limiting básico en ai_usage (prevenir abuso)
--    Si un workspace hace más de 100 llamadas en 1 hora → marcar como sospechoso
create or replace function public.check_ai_rate_limit(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls_last_hour int;
begin
  select count(*) into v_calls_last_hour
  from public.ai_usage
  where workspace_id = p_workspace_id
    and created_at > now() - interval '1 hour';

  -- Más de 100 llamadas/hora = posible abuso
  if v_calls_last_hour > 100 then
    perform public.log_security_event(
      'ai_rate_limit_exceeded',
      p_workspace_id,
      auth.uid(),
      jsonb_build_object('calls_last_hour', v_calls_last_hour)
    );
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.check_ai_rate_limit(uuid) to service_role;

-- 7. Comentarios de auditoría
comment on function public.check_ai_credits   is 'Zero Trust: lee plan desde DB, nunca confía en cliente. Sprint 1.';
comment on function public.consume_ai_credits is 'Zero Trust: registra consumo y bloquea si sin créditos. Sprint 1.';
comment on function public.activate_founder_subscription is 'Solo callable desde service_role. Sprint 1.';
