-- ============================================================================
-- 0069 — automations_rpc: RPCs del Motor de Automatizaciones Sprint 13
-- ============================================================================

-- ─── Helper: evaluar condiciones JSON ────────────────────────────────────────

create or replace function public.evaluate_automation_conditions(
  p_conditions  jsonb,
  p_entity_type text,
  p_entity_id   uuid,
  p_extra_data  jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cond       jsonb;
  field_name text;
  operator   text;
  val_json   jsonb;
  field_val  jsonb;
begin
  -- Sin condiciones → siempre true
  if p_conditions = '[]'::jsonb or p_conditions is null then
    return true;
  end if;

  -- Evaluar cada condición (AND lógico)
  for cond in select * from jsonb_array_elements(p_conditions) loop
    field_name := cond->>'field';
    operator   := cond->>'operator';
    val_json   := cond->'value';

    -- Resolver valor del campo
    field_val := null;

    -- Desde extra_data (datos pasados en tiempo de ejecución)
    if p_extra_data ? field_name then
      field_val := p_extra_data->field_name;
    end if;

    -- Desde la entidad (quote, order, client, work_order)
    if field_val is null then
      case p_entity_type
        when 'quote' then
          field_val := case field_name
            when 'commercial_status' then to_jsonb((select commercial_status::text from public.quotes where id = p_entity_id))
            when 'status'            then to_jsonb((select status::text from public.quotes where id = p_entity_id))
            when 'days_since_sent'   then to_jsonb(extract(day from now() - (select sent_at from public.quotes where id = p_entity_id))::int)
            else null
          end;
        when 'client' then
          field_val := case field_name
            when 'days_inactive' then to_jsonb(
              extract(day from now() - (select last_activity_at from public.clients where id = p_entity_id))::int
            )
            else null
          end;
        when 'work_order' then
          field_val := case field_name
            when 'status'        then to_jsonb((select status::text from public.work_orders where id = p_entity_id))
            when 'hours_overdue' then to_jsonb(
              extract(epoch from (now() - (select scheduled_at from public.work_orders where id = p_entity_id))) / 3600
            )
            else null
          end;
        else null;
      end case;
    end if;

    if field_val is null then continue; end if;

    -- Evaluar operador
    case operator
      when 'eq'     then if field_val != val_json then return false; end if;
      when 'neq'    then if field_val = val_json  then return false; end if;
      when 'gte'    then if (field_val#>>'{}')::numeric < (val_json#>>'{}')::numeric then return false; end if;
      when 'lte'    then if (field_val#>>'{}')::numeric > (val_json#>>'{}')::numeric then return false; end if;
      when 'in'     then
        if not (field_val#>>'{}' = any(select jsonb_array_elements_text(val_json))) then
          return false;
        end if;
      when 'not_in' then
        if (field_val#>>'{}' = any(select jsonb_array_elements_text(val_json))) then
          return false;
        end if;
      else null;
    end case;
  end loop;

  return true;
end;
$$;

-- ============================================================================
-- RPC 1: evaluate_and_queue_automations — evalúa y encola reglas activas
-- ============================================================================

create or replace function public.evaluate_and_queue_automations(
  p_workspace_id   uuid,
  p_trigger_event  text,
  p_entity_type    text,
  p_entity_id      uuid,
  p_payload        jsonb default '{}'::jsonb,
  p_execution_depth int default 0,
  p_parent_event_id uuid default null
)
returns int   -- número de reglas encoladas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule     record;
  v_queued   int := 0;
  v_event_id uuid;
  v_log_id   uuid;
  v_execute_after timestamptz;
  v_ai_budget_ok  boolean;
begin
  -- Anti-loop: no procesar si depth >= 3
  if p_execution_depth >= 3 then
    insert into public.automation_logs
      (workspace_id, trigger_event, entity_type, entity_id, status, execution_depth, error_message, created_at)
    values
      (p_workspace_id, p_trigger_event, p_entity_type, p_entity_id,
       'blocked_loop', p_execution_depth, 'Profundidad máxima alcanzada (3)', now());
    return 0;
  end if;

  -- Feature gating
  if not public.check_feature_access(p_workspace_id, 'automation_enabled') then
    return 0;
  end if;

  -- Evaluar cada regla activa para este trigger
  for v_rule in
    select r.*
    from public.automation_rules r
    where r.workspace_id = p_workspace_id
      and r.enabled = true
      and r.trigger_event = p_trigger_event
      and r.trigger_type = 'event'
    order by r.created_at asc
  loop
    -- Verificar anti-spam (min_interval_hours entre ejecuciones para la misma entidad)
    if v_rule.min_interval_hours > 0 then
      if exists (
        select 1 from public.automation_logs
        where rule_id = v_rule.id and entity_id = p_entity_id
          and status in ('queued','executed')
          and created_at > now() - (v_rule.min_interval_hours || ' hours')::interval
      ) then
        continue;  -- Skip — muy reciente
      end if;
    end if;

    -- Verificar límite de ejecuciones por entidad
    if v_rule.max_executions_per_entity is not null then
      if (
        select count(*) from public.automation_logs
        where rule_id = v_rule.id and entity_id = p_entity_id and status in ('queued','executed')
      ) >= v_rule.max_executions_per_entity then
        continue;
      end if;
    end if;

    -- Evaluar condiciones inmediatas (las diferidas se evalúan al ejecutar)
    if v_rule.delay_hours = 0 then
      if not public.evaluate_automation_conditions(v_rule.conditions, p_entity_type, p_entity_id, p_payload) then
        continue;
      end if;
    end if;

    -- Verificar presupuesto IA si la acción usa IA
    if v_rule.action_type like '%ai%' or v_rule.action_type like '%analyze%' then
      declare
        v_plan_code text;
        v_ai_pct    int;
        v_ai_used   int;
        v_ai_max    int;
        v_ai_budget int;
      begin
        v_plan_code := public.get_effective_plan_code(p_workspace_id);
        select ai_credits_monthly, automation_ai_credits_pct
        into v_ai_max, v_ai_pct
        from public.plan_limits where plan_code = v_plan_code;

        v_ai_budget := coalesce(v_ai_max, 0) * coalesce(v_ai_pct, 0) / 100;

        select coalesce(sum(credits_used), 0) into v_ai_used
        from public.ai_usage
        where workspace_id = p_workspace_id
          and period_month = date_trunc('month', now())::date
          and metadata->>'source' = 'automation';

        if v_ai_used >= v_ai_budget then
          insert into public.automation_logs
            (workspace_id, rule_id, rule_name, trigger_event, entity_type, entity_id,
             action_type, status, execution_depth, error_message)
          values
            (p_workspace_id, v_rule.id, v_rule.name, p_trigger_event, p_entity_type, p_entity_id,
             v_rule.action_type, 'blocked_credits', p_execution_depth,
             'Presupuesto IA de automatizaciones agotado para este mes');
          continue;
        end if;
      end;
    end if;

    -- Calcular execute_after
    v_execute_after := case
      when v_rule.delay_hours > 0 then now() + (v_rule.delay_hours || ' hours')::interval
      else null  -- null = inmediato
    end;

    -- Encolar en integration_events con provider='shelwi_internal'
    insert into public.integration_events
      (workspace_id, provider, event_type, payload, execute_after,
       source_rule_id, execution_depth, parent_event_id)
    values (
      p_workspace_id,
      'shelwi_internal',
      v_rule.action_type,
      p_payload || jsonb_build_object(
        'rule_id',     v_rule.id,
        'entity_type', p_entity_type,
        'entity_id',   p_entity_id,
        'conditions',  v_rule.conditions,
        'action_payload', v_rule.action_payload
      ),
      v_execute_after,
      v_rule.id,
      p_execution_depth,
      p_parent_event_id
    )
    returning id into v_event_id;

    -- Log de creación
    insert into public.automation_logs
      (workspace_id, rule_id, rule_name, trigger_event, entity_type, entity_id,
       action_type, status, execution_depth, parent_log_id, event_id)
    values
      (p_workspace_id, v_rule.id, v_rule.name, p_trigger_event, p_entity_type, p_entity_id,
       v_rule.action_type, 'queued', p_execution_depth, null, v_event_id)
    returning id into v_log_id;

    -- Incrementar contador
    update public.automation_rules set executions_count = executions_count + 1 where id = v_rule.id;

    v_queued := v_queued + 1;
  end loop;

  return v_queued;
end;
$$;

-- ============================================================================
-- RPC 2: install_automation_templates — instala templates predefinidos en workspace
-- ============================================================================

create or replace function public.install_automation_templates(
  p_workspace_id uuid,
  p_template_keys text[] default null  -- null = instalar todos los elegibles por plan
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_plan_code  text;
  v_installed  int := 0;
  v_tmpl       record;
begin
  if not exists (
    select 1 from public.profiles where id = v_user_id and workspace_id = p_workspace_id
      and status = 'active' and role in ('owner','admin','super_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos');
  end if;

  if not public.check_feature_access(p_workspace_id, 'automation_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Automatizaciones requieren plan PRO o PREMIUM');
  end if;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  for v_tmpl in
    select * from public.automation_templates
    where active = true
      and (p_template_keys is null or key = any(p_template_keys))
      and (v_plan_code = 'premium'
           or (v_plan_code = 'pro' and plan_required in ('pro'))
           or v_plan_code = plan_required)
    order by sort_order
  loop
    -- Solo instalar si no existe ya para este workspace
    if not exists (
      select 1 from public.automation_rules
      where workspace_id = p_workspace_id and template_key = v_tmpl.key
    ) then
      insert into public.automation_rules
        (workspace_id, name, description, template_key, enabled,
         trigger_event, trigger_type, delay_hours, conditions,
         action_type, action_payload, created_by)
      values (
        p_workspace_id, v_tmpl.name, v_tmpl.description, v_tmpl.key,
        false,  -- Empieza desactivado — el usuario lo activa
        v_tmpl.trigger_event, v_tmpl.trigger_type, v_tmpl.delay_hours, v_tmpl.conditions,
        v_tmpl.action_type, v_tmpl.action_payload, v_user_id
      );
      v_installed := v_installed + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'installed', v_installed);
end;
$$;

grant execute on function public.install_automation_templates(uuid, text[]) to authenticated;

-- ============================================================================
-- RPC 3: create_automation_rule — crear regla personalizada
-- ============================================================================

create or replace function public.create_automation_rule(
  p_workspace_id  uuid,
  p_name          text,
  p_trigger_event text,
  p_action_type   text,
  p_action_payload jsonb  default '{}'::jsonb,
  p_delay_hours   int     default 0,
  p_conditions    jsonb   default '[]'::jsonb,
  p_description   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_rule_id  uuid;
  v_count    int;
  v_max      int;
  v_plan_code text;
begin
  if not exists (
    select 1 from public.profiles where id = v_user_id and workspace_id = p_workspace_id
      and status = 'active' and role in ('owner','admin','super_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos');
  end if;

  if not public.check_feature_access(p_workspace_id, 'automation_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Automatizaciones requieren plan PRO o PREMIUM');
  end if;

  -- Verificar límite de reglas del plan
  v_plan_code := public.get_effective_plan_code(p_workspace_id);
  select max_automations into v_max from public.plan_limits where plan_code = v_plan_code;

  if v_max is not null then
    select count(*) into v_count from public.automation_rules
    where workspace_id = p_workspace_id and enabled = true;
    if v_count >= v_max then
      return jsonb_build_object(
        'ok', false, 'error',
        'Límite de automatizaciones alcanzado. Plan ' || v_plan_code || ' permite máximo ' || v_max || ' reglas activas.'
      );
    end if;
  end if;

  insert into public.automation_rules
    (workspace_id, name, description, trigger_event, trigger_type, delay_hours,
     conditions, action_type, action_payload, created_by)
  values (
    p_workspace_id, p_name, p_description, p_trigger_event, 'event', p_delay_hours,
    p_conditions, p_action_type, p_action_payload, v_user_id
  )
  returning id into v_rule_id;

  return jsonb_build_object('ok', true, 'rule_id', v_rule_id);
end;
$$;

grant execute on function public.create_automation_rule(uuid,text,text,text,jsonb,int,jsonb,text) to authenticated;

-- ============================================================================
-- RPC 4: toggle_automation_rule — activar/desactivar regla
-- ============================================================================

create or replace function public.toggle_automation_rule(
  p_rule_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_count        int;
  v_max          int;
  v_plan_code    text;
begin
  select workspace_id into v_workspace_id from public.automation_rules where id = p_rule_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Regla no encontrada'); end if;

  if not exists (
    select 1 from public.profiles where id = v_user_id and workspace_id = v_workspace_id
      and status = 'active' and role in ('owner','admin','super_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin permisos');
  end if;

  -- Verificar límite si se está activando
  if p_enabled then
    v_plan_code := public.get_effective_plan_code(v_workspace_id);
    select max_automations into v_max from public.plan_limits where plan_code = v_plan_code;
    if v_max is not null then
      select count(*) into v_count from public.automation_rules
      where workspace_id = v_workspace_id and enabled = true and id != p_rule_id;
      if v_count >= v_max then
        return jsonb_build_object('ok', false, 'error',
          'Límite de ' || v_max || ' reglas activas alcanzado para este plan');
      end if;
    end if;
  end if;

  update public.automation_rules set enabled = p_enabled, updated_at = now() where id = p_rule_id;
  return jsonb_build_object('ok', true, 'enabled', p_enabled);
end;
$$;

grant execute on function public.toggle_automation_rule(uuid, boolean) to authenticated;

-- ============================================================================
-- RPC 5: list_automation_rules — listar reglas del workspace
-- ============================================================================

create or replace function public.list_automation_rules(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_max       int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and workspace_id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);
  select max_automations into v_max from public.plan_limits where plan_code = v_plan_code;

  return jsonb_build_object(
    'ok', true,
    'plan_code', v_plan_code,
    'max_automations', v_max,
    'rules', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',             r.id,
          'name',           r.name,
          'description',    r.description,
          'template_key',   r.template_key,
          'enabled',        r.enabled,
          'trigger_event',  r.trigger_event,
          'trigger_type',   r.trigger_type,
          'delay_hours',    r.delay_hours,
          'conditions',     r.conditions,
          'action_type',    r.action_type,
          'action_payload', r.action_payload,
          'executions_count', r.executions_count,
          'created_at',     r.created_at
        )
        order by r.enabled desc, r.created_at asc
      ), '[]'::jsonb)
      from public.automation_rules r
      where r.workspace_id = p_workspace_id
    ),
    'templates', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'key',          t.key,
          'name',         t.name,
          'description',  t.description,
          'category',     t.category,
          'trigger_event',t.trigger_event,
          'delay_hours',  t.delay_hours,
          'action_type',  t.action_type,
          'plan_required',t.plan_required,
          'installed',    exists (
            select 1 from public.automation_rules
            where workspace_id = p_workspace_id and template_key = t.key
          )
        )
        order by t.sort_order
      ), '[]'::jsonb)
      from public.automation_templates t
      where t.active = true
        and (v_plan_code = 'premium'
             or (v_plan_code = 'pro' and t.plan_required = 'pro'))
    ),
    'recent_logs', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           l.id,
          'rule_name',    l.rule_name,
          'trigger_event',l.trigger_event,
          'action_type',  l.action_type,
          'status',       l.status,
          'entity_type',  l.entity_type,
          'created_at',   l.created_at,
          'executed_at',  l.executed_at,
          'error_message',l.error_message
        )
        order by l.created_at desc
      ), '[]'::jsonb)
      from public.automation_logs l
      where l.workspace_id = p_workspace_id
      limit 20
    )
  );
end;
$$;

grant execute on function public.list_automation_rules(uuid) to authenticated;

-- ============================================================================
-- RPC 6: evaluate_periodic_automations — ejecutada por el scheduler
-- Evalúa reglas periódicas: client_inactive, work_order_delayed
-- ============================================================================

create or replace function public.evaluate_periodic_automations(p_workspace_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule      record;
  v_client    record;
  v_wo        record;
  v_queued    int := 0;
begin
  -- Procesar reglas periódicas activas
  for v_rule in
    select r.*
    from public.automation_rules r
    where r.trigger_type = 'periodic'
      and r.enabled = true
      and public.check_feature_access(r.workspace_id, 'automation_enabled')
      and (p_workspace_id is null or r.workspace_id = p_workspace_id)
  loop
    case v_rule.trigger_event

      when 'client_inactive' then
        for v_client in
          select c.id, c.workspace_id, c.name,
                 extract(day from now() - c.last_activity_at)::int as days_inactive
          from public.clients c
          where c.workspace_id = v_rule.workspace_id
            and c.deleted_at is null
            and c.total_quotes > 0
            and c.last_activity_at < now() - interval '1 day'  -- mínimo 1 día sin actividad
        loop
          if public.evaluate_automation_conditions(
            v_rule.conditions, 'client', v_client.id,
            jsonb_build_object('days_inactive', v_client.days_inactive, 'client_name', v_client.name)
          ) then
            -- Anti-spam: no ejecutar más de 1 vez cada 7 días por cliente
            if not exists (
              select 1 from public.automation_logs
              where rule_id = v_rule.id and entity_id = v_client.id
                and created_at > now() - interval '7 days'
            ) then
              v_queued := v_queued + (
                select public.evaluate_and_queue_automations(
                  v_rule.workspace_id, v_rule.trigger_event, 'client', v_client.id,
                  jsonb_build_object('client_id', v_client.id, 'client_name', v_client.name,
                                     'days_inactive', v_client.days_inactive)
                )
              );
            end if;
          end if;
        end loop;

      when 'work_order_delayed' then
        for v_wo in
          select wo.id, wo.workspace_id, wo.work_order_number, wo.title, wo.assigned_to,
                 extract(epoch from (now() - wo.scheduled_at)) / 3600 as hours_overdue
          from public.work_orders wo
          where wo.workspace_id = v_rule.workspace_id
            and wo.status in ('asignada','en_progreso')
            and wo.scheduled_at is not null
            and wo.scheduled_at < now()
        loop
          if public.evaluate_automation_conditions(
            v_rule.conditions, 'work_order', v_wo.id,
            jsonb_build_object('hours_overdue', v_wo.hours_overdue, 'work_order_number', v_wo.work_order_number)
          ) then
            if not exists (
              select 1 from public.automation_logs
              where rule_id = v_rule.id and entity_id = v_wo.id
                and created_at > now() - interval '8 hours'
            ) then
              v_queued := v_queued + (
                select public.evaluate_and_queue_automations(
                  v_rule.workspace_id, v_rule.trigger_event, 'work_order', v_wo.id,
                  jsonb_build_object('work_order_id', v_wo.id, 'work_order_number', v_wo.work_order_number,
                                     'hours_overdue', v_wo.hours_overdue, 'assigned_to', v_wo.assigned_to)
                )
              );
            end if;
          end if;
        end loop;

      else null;
    end case;
  end loop;

  return v_queued;
end;
$$;

grant execute on function public.evaluate_periodic_automations(uuid)   to service_role;

comment on function public.evaluate_and_queue_automations is 'Sprint 13: evalúa reglas activas y encola acciones. Anti-loop depth<=3.';
comment on function public.install_automation_templates   is 'Sprint 13: instala templates predefinidos en el workspace.';
comment on function public.evaluate_periodic_automations  is 'Sprint 13: evalúa reglas periódicas (client_inactive, work_order_delayed). Llamada por scheduler.';
