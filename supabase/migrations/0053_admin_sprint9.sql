-- ============================================================================
-- 0053 — admin_sprint9: RPCs administrativas para Backoffice Sprint 9
-- Permisos: is_super_admin() → solo super_admin
--           is_support_admin() → super_admin + support_admin
-- Toda acción escribe audit_log. Zero Trust.
-- ============================================================================

-- ─── Helpers internos ────────────────────────────────────────────────────────

-- Función para escribir audit log desde contexto admin
create or replace function public.admin_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.profiles where id = v_actor_id;
  insert into public.audit_log
    (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values
    (coalesce(v_workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
     v_actor_id, p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;

-- ─── RPC 1: admin_update_plan — super_admin only ─────────────────────────────

create or replace function public.admin_update_plan(
  p_plan_id    uuid,
  p_price      numeric default null,
  p_name       text    default null,
  p_description text   default null,
  p_active     boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before record;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  select * into v_before from public.plans where id = p_plan_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Plan no encontrado');
  end if;

  update public.plans set
    price       = coalesce(p_price,       price),
    name        = coalesce(p_name,        name),
    description = coalesce(p_description, description),
    active      = coalesce(p_active,      active)
  where id = p_plan_id;

  perform public.admin_audit('admin_plan_updated', 'plans', p_plan_id::text,
    jsonb_build_object('before', row_to_json(v_before),
      'price', p_price, 'name', p_name, 'description', p_description, 'active', p_active));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_update_plan(uuid, numeric, text, text, boolean) to authenticated;

-- ─── RPC 2: admin_update_plan_feature — super_admin only ─────────────────────

create or replace function public.admin_update_plan_feature(
  p_plan_code text,
  p_feature   text,
  p_value     boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'ai_enabled','photo_quote_enabled','templates_enabled','branding_enabled',
    'custom_qr_enabled','advanced_reports_enabled','multiuser_enabled',
    'quote_editing_enabled','pipeline_enabled','orders_enabled',
    'work_orders_enabled','gps_enabled','ai_credits_enabled',
    'founder_eligible','storage_enabled'
  ];
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  if not (p_feature = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'Feature no permitida: ' || p_feature);
  end if;

  execute format('update public.plan_features set %I = $1 where plan_code = $2', p_feature)
  using p_value, p_plan_code;

  perform public.admin_audit('admin_feature_updated', 'plan_features', p_plan_code,
    jsonb_build_object('feature', p_feature, 'value', p_value));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_update_plan_feature(text, text, boolean) to authenticated;

-- Permitir UPDATE en plan_features para super_admin
create policy "super_admin_update_plan_features"
  on public.plan_features for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─── RPC 3: admin_update_plan_limit — super_admin only ───────────────────────

create or replace function public.admin_update_plan_limit(
  p_plan_code text,
  p_field     text,
  p_value     int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'max_quotes_month','max_clients','max_catalog_items','max_storage_gb',
    'ai_credits_monthly','included_users'
  ];
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  if not (p_field = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'Campo no permitido: ' || p_field);
  end if;

  execute format('update public.plan_limits set %I = $1 where plan_code = $2', p_field)
  using p_value, p_plan_code;

  perform public.admin_audit('admin_limit_updated', 'plan_limits', p_plan_code,
    jsonb_build_object('field', p_field, 'value', p_value));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_update_plan_limit(text, text, int) to authenticated;

create policy "super_admin_update_plan_limits"
  on public.plan_limits for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─── RPC 4: admin_suspend_workspace — support_admin+ ─────────────────────────

create or replace function public.admin_suspend_workspace(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_support_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_support_admin');
  end if;

  update public.workspaces set status = 'suspended' where id = p_workspace_id;
  update public.subscriptions set status = 'suspended' where workspace_id = p_workspace_id;

  perform public.admin_audit('admin_workspace_suspended', 'workspaces', p_workspace_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_suspend_workspace(uuid) to authenticated;

-- ─── RPC 5: admin_reactivate_workspace — super_admin only ────────────────────

create or replace function public.admin_reactivate_workspace(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  update public.workspaces set status = 'active' where id = p_workspace_id;
  update public.subscriptions set status = 'active'
  where workspace_id = p_workspace_id and status = 'suspended';

  perform public.admin_audit('admin_workspace_reactivated', 'workspaces', p_workspace_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_reactivate_workspace(uuid) to authenticated;

-- ─── RPC 6: admin_change_user_role — super_admin only ────────────────────────

create or replace function public.admin_change_user_role(
  p_user_id uuid,
  p_new_role text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array['owner','admin','employee'];
  v_old_role text;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  if not (p_new_role = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'error', 'Rol no permitido: ' || p_new_role);
  end if;

  select role into v_old_role from public.profiles where id = p_user_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Usuario no encontrado'); end if;

  if v_old_role in ('super_admin', 'support_admin') then
    return jsonb_build_object('ok', false, 'error', 'No se puede cambiar el rol de un administrador del sistema');
  end if;

  update public.profiles set role = p_new_role where id = p_user_id;

  perform public.admin_audit('admin_role_changed', 'profiles', p_user_id::text,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_new_role));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_change_user_role(uuid, text) to authenticated;

-- ─── RPC 7: admin_set_user_status — super_admin only ─────────────────────────

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status  text  -- 'active' | 'inactive'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old_status text;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  if p_status not in ('active', 'inactive') then
    return jsonb_build_object('ok', false, 'error', 'Estado inválido');
  end if;

  select status into v_old_status from public.profiles where id = p_user_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Usuario no encontrado'); end if;

  update public.profiles set status = p_status where id = p_user_id;

  perform public.admin_audit('admin_user_status_changed', 'profiles', p_user_id::text,
    jsonb_build_object('old_status', v_old_status, 'new_status', p_status));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;

-- ─── RPC 8: admin_send_notification — support_admin+ ─────────────────────────

create or replace function public.admin_send_notification(
  p_workspace_id uuid,
  p_title        text,
  p_message      text,
  p_type         text default 'info'
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_support_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_support_admin');
  end if;

  if p_type not in ('info','success','warning','danger') then
    return jsonb_build_object('ok', false, 'error', 'Tipo inválido');
  end if;

  insert into public.notifications (workspace_id, title, message, type, is_read)
  values (p_workspace_id, p_title, p_message, p_type, false);

  perform public.admin_audit('admin_notification_sent', 'notifications', p_workspace_id::text,
    jsonb_build_object('title', p_title, 'type', p_type));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_send_notification(uuid, text, text, text) to authenticated;

-- ─── RPC 9: admin_update_ai_cost — super_admin only ──────────────────────────

create or replace function public.admin_update_ai_cost(
  p_operation   text,
  p_credits_cost int,
  p_active      boolean default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before record;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  select * into v_before from public.ai_operation_costs where operation = p_operation;
  if not found then return jsonb_build_object('ok', false, 'error', 'Operación no encontrada'); end if;

  update public.ai_operation_costs set
    credits_cost = p_credits_cost,
    active       = coalesce(p_active, active)
  where operation = p_operation;

  perform public.admin_audit('admin_ai_cost_updated', 'ai_operation_costs', p_operation,
    jsonb_build_object('before_credits', v_before.credits_cost, 'new_credits', p_credits_cost));

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_update_ai_cost(text, int, boolean) to authenticated;

create policy "super_admin_update_ai_costs"
  on public.ai_operation_costs for update
  using (public.is_super_admin());

-- ─── RPC 10: admin_upsert_founder_promotion — super_admin only ───────────────

create or replace function public.admin_upsert_founder_promotion(
  p_id              uuid    default null,
  p_plan_code       text    default null,
  p_name            text    default null,
  p_founder_price   numeric default null,
  p_regular_price   numeric default null,
  p_duration_months int     default 12,
  p_max_redemptions int     default null,
  p_active          boolean default true,
  p_valid_until     timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;

  if p_id is null then
    -- CREATE
    if p_plan_code is null or p_name is null or p_founder_price is null or p_regular_price is null then
      return jsonb_build_object('ok', false, 'error', 'plan_code, name, founder_price y regular_price son requeridos');
    end if;
    insert into public.founder_promotions
      (plan_code, name, founder_price, regular_price, duration_months, max_redemptions, active, valid_until)
    values
      (p_plan_code, p_name, p_founder_price, p_regular_price, p_duration_months, p_max_redemptions, p_active, p_valid_until)
    returning id into v_id;
    perform public.admin_audit('admin_founder_promotion_created', 'founder_promotions', v_id::text,
      jsonb_build_object('plan_code', p_plan_code, 'name', p_name, 'founder_price', p_founder_price));
  else
    -- UPDATE
    v_id := p_id;
    update public.founder_promotions set
      founder_price   = coalesce(p_founder_price,   founder_price),
      regular_price   = coalesce(p_regular_price,   regular_price),
      duration_months = coalesce(p_duration_months, duration_months),
      max_redemptions = coalesce(p_max_redemptions, max_redemptions),
      active          = coalesce(p_active,          active),
      valid_until     = coalesce(p_valid_until,     valid_until),
      name            = coalesce(p_name,            name)
    where id = p_id;
    perform public.admin_audit('admin_founder_promotion_updated', 'founder_promotions', p_id::text, '{}'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
grant execute on function public.admin_upsert_founder_promotion(uuid, text, text, numeric, numeric, int, int, boolean, timestamptz) to authenticated;

-- ─── RPC 11: admin_activate_founder — super_admin only ───────────────────────

create or replace function public.admin_activate_founder(
  p_workspace_id  uuid,
  p_promotion_id  uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  end if;
  -- Reutiliza la función existente de 0036
  perform public.activate_founder_subscription(p_workspace_id, null, null, p_promotion_id);
  perform public.admin_audit('admin_founder_activated', 'subscriptions', p_workspace_id::text,
    jsonb_build_object('promotion_id', p_promotion_id));
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;
grant execute on function public.admin_activate_founder(uuid, uuid) to authenticated;

-- ─── RPC 12: admin_get_ai_usage_global — support_admin+ ──────────────────────

create or replace function public.admin_get_ai_usage_global(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_support_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_support_admin');
  end if;

  select jsonb_agg(row) into v_result from (
    select
      w.id           as workspace_id,
      w.name         as workspace_name,
      count(*)       as total_calls,
      sum(u.credits_used) as total_credits,
      sum(u.estimated_cost) as total_cost_usd,
      max(u.created_at)    as last_used
    from public.ai_usage u
    join public.workspaces w on w.id = u.workspace_id
    group by w.id, w.name
    order by total_credits desc nulls last
    limit p_limit
  ) row;

  return jsonb_build_object('ok', true, 'data', coalesce(v_result, '[]'::jsonb));
end;
$$;
grant execute on function public.admin_get_ai_usage_global(int) to authenticated;

-- ─── RPC 13: admin_get_storage_global — support_admin+ ───────────────────────

create or replace function public.admin_get_storage_global(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_support_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_support_admin');
  end if;

  -- Usa la tabla de evidencias si existe, de lo contrario retorna workspace list
  select jsonb_agg(row) into v_result from (
    select
      w.id      as workspace_id,
      w.name    as workspace_name,
      coalesce(ev.total_size_bytes, 0)      as total_bytes,
      coalesce(ev.total_files,      0)      as total_files,
      round(coalesce(ev.total_size_bytes, 0) / 1048576.0, 2) as total_mb
    from public.workspaces w
    left join (
      select workspace_id,
             sum(file_size)  as total_size_bytes,
             count(*)        as total_files
      from public.work_order_evidences
      group by workspace_id
    ) ev on ev.workspace_id = w.id
    order by total_bytes desc nulls last
    limit p_limit
  ) row;

  return jsonb_build_object('ok', true, 'data', coalesce(v_result, '[]'::jsonb));
end;
$$;
grant execute on function public.admin_get_storage_global(int) to authenticated;

-- ─── RPC 14: admin_get_audit_log — support_admin+ con filtros ────────────────

create or replace function public.admin_get_audit_log(
  p_limit         int         default 100,
  p_offset        int         default 0,
  p_action_filter text        default null,
  p_workspace_id  uuid        default null,
  p_user_id       uuid        default null,
  p_from_date     timestamptz default null,
  p_to_date       timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows  jsonb;
  v_total bigint;
begin
  if not public.is_support_admin() then
    return jsonb_build_object('ok', false, 'error', 'requires_support_admin');
  end if;

  select count(*) into v_total from public.audit_log
  where (p_action_filter is null or action = p_action_filter)
    and (p_workspace_id  is null or workspace_id = p_workspace_id)
    and (p_user_id       is null or user_id      = p_user_id)
    and (p_from_date     is null or created_at  >= p_from_date)
    and (p_to_date       is null or created_at  <= p_to_date);

  select jsonb_agg(row order by created_at desc) into v_rows from (
    select id, workspace_id, user_id, action, entity_type, entity_id, created_at
    from public.audit_log
    where (p_action_filter is null or action = p_action_filter)
      and (p_workspace_id  is null or workspace_id = p_workspace_id)
      and (p_user_id       is null or user_id      = p_user_id)
      and (p_from_date     is null or created_at  >= p_from_date)
      and (p_to_date       is null or created_at  <= p_to_date)
    order by created_at desc
    limit p_limit offset p_offset
  ) row;

  return jsonb_build_object('ok', true, 'rows', coalesce(v_rows, '[]'::jsonb), 'total', v_total);
end;
$$;
grant execute on function public.admin_get_audit_log(int, int, text, uuid, uuid, timestamptz, timestamptz) to authenticated;

-- ─── Comments ────────────────────────────────────────────────────────────────

comment on function public.admin_update_plan              is 'Sprint 9: editar plan (precio, nombre, descripción). Solo super_admin.';
comment on function public.admin_update_plan_feature      is 'Sprint 9: editar feature flag por plan. Solo super_admin.';
comment on function public.admin_update_plan_limit        is 'Sprint 9: editar límite por plan. Solo super_admin.';
comment on function public.admin_suspend_workspace        is 'Sprint 9: suspender workspace. support_admin+.';
comment on function public.admin_reactivate_workspace     is 'Sprint 9: reactivar workspace. Solo super_admin.';
comment on function public.admin_change_user_role         is 'Sprint 9: cambiar rol de usuario. Solo super_admin.';
comment on function public.admin_set_user_status          is 'Sprint 9: activar/desactivar usuario. Solo super_admin.';
comment on function public.admin_send_notification        is 'Sprint 9: enviar notificación a workspace. support_admin+.';
comment on function public.admin_update_ai_cost           is 'Sprint 9: editar costo IA por operación. Solo super_admin.';
comment on function public.admin_upsert_founder_promotion is 'Sprint 9: crear/editar promoción Founder. Solo super_admin.';
comment on function public.admin_activate_founder         is 'Sprint 9: activar Founder para workspace. Solo super_admin.';
comment on function public.admin_get_ai_usage_global      is 'Sprint 9: consumo IA global cross-workspace. support_admin+.';
comment on function public.admin_get_storage_global       is 'Sprint 9: storage global cross-workspace. support_admin+.';
comment on function public.admin_get_audit_log            is 'Sprint 9: audit_log con filtros y paginación real. support_admin+.';
