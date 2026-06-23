-- ============================================================================
-- 0080 — growth_triggers: Triggers automáticos de Growth Sprint 17
-- ============================================================================

-- ─── 1. Trigger: registrar conversión de referido cuando aprueba cotización ──

create or replace function public.trg_referral_on_quote_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_utm record;
begin
  if old.status = new.status then return new; end if;
  if new.status != 'Aprobada' then return new; end if;
  if new.client_id is null then return new; end if;

  -- Buscar si el cliente llegó por referido (en utm_events)
  select * into v_utm
  from public.utm_events
  where client_id = new.client_id
    and workspace_id = new.workspace_id
    and ref_code is not null
  order by created_at asc
  limit 1;

  if found then
    perform public.register_referral_conversion(v_utm.ref_code, new.client_id, 'quote_approved');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_referral_on_quote_approved on public.quotes;
create trigger trg_referral_on_quote_approved
  after update of status on public.quotes
  for each row execute function public.trg_referral_on_quote_approved();

-- ─── 2. Trigger: registrar UTM cuando se crea un cliente nuevo ───────────────
-- Si el cliente llegó de un link de referido, vincular utm_event al client_id

create or replace function public.trg_utm_link_on_client_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Actualizar utm_events recientes con este client_id (si hay sesión activa)
  -- Esto es best-effort: si el UTM llegó en la sesión actual, se vincula
  update public.utm_events
  set client_id = new.id
  where workspace_id = new.workspace_id
    and client_id is null
    and created_at >= now() - interval '1 hour'
    and id = (
      select id from public.utm_events
      where workspace_id = new.workspace_id and client_id is null
      order by created_at desc limit 1
    );

  return new;
end;
$$;

drop trigger if exists trg_utm_link_on_client on public.clients;
create trigger trg_utm_link_on_client
  after insert on public.clients
  for each row execute function public.trg_utm_link_on_client_created();

-- ─── 3. Agregar growth templates al install cuando se activa referidos ────────

create or replace function public.install_growth_templates(p_workspace_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installed int := 0;
  v_tmpl record;
begin
  for v_tmpl in
    select * from public.automation_templates
    where category = 'growth' and active = true
  loop
    if not exists (
      select 1 from public.automation_rules
      where workspace_id = p_workspace_id and template_key = v_tmpl.key
    ) then
      insert into public.automation_rules
        (workspace_id, name, description, template_key, enabled,
         trigger_event, trigger_type, delay_hours, conditions, action_type, action_payload)
      values (
        p_workspace_id, v_tmpl.name, v_tmpl.description, v_tmpl.key,
        false, v_tmpl.trigger_event, v_tmpl.trigger_type, v_tmpl.delay_hours,
        v_tmpl.conditions, v_tmpl.action_type, v_tmpl.action_payload
      );
      v_installed := v_installed + 1;
    end if;
  end loop;
  return v_installed;
end;
$$;

grant execute on function public.install_growth_templates(uuid) to authenticated;

-- ─── 4. Trigger: instalar templates de growth cuando se crea referral_program ─

create or replace function public.trg_install_growth_on_program()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active = true then
    perform public.install_growth_templates(new.workspace_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_install_growth_on_program on public.referral_programs;
create trigger trg_install_growth_on_program
  after insert or update of active on public.referral_programs
  for each row execute function public.trg_install_growth_on_program();

comment on function public.trg_referral_on_quote_approved  is 'Sprint 17: cuando una cotización se aprueba, verifica si el cliente llegó por referido y entrega puntos.';
comment on function public.trg_utm_link_on_client_created  is 'Sprint 17: vincula utm_events recientes al nuevo cliente.';
comment on function public.install_growth_templates         is 'Sprint 17: instala templates de growth category cuando se activa programa de referidos.';
