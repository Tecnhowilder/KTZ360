-- ============================================================================
-- 0033 — pdf_templates: show_terms + plan_required + seed 3 plantillas globales
-- ============================================================================

-- 1. Agregar show_terms y plan_required a pdf_templates
alter table public.pdf_templates
  add column if not exists show_terms    boolean not null default true,
  add column if not exists plan_required text    not null default 'free'
    check (plan_required in ('free','pro','premium'));

-- 2. Función helper: crear plantillas default para un workspace
create or replace function public.seed_pdf_templates(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo crear si no existen ya
  if exists (select 1 from public.pdf_templates where workspace_id = p_workspace_id) then
    return;
  end if;

  insert into public.pdf_templates
    (workspace_id, created_by, name, is_default, primary_color, logo_position,
     show_qr, show_signature, show_bank_info, show_terms, plan_required, config)
  values
    -- Plantilla Corporativa (FREE)
    (p_workspace_id, p_user_id, 'Corporativa', true,
     '#2563EB', 'left', true, false, false, true, 'free',
     '{"style":"corporate","font":"inter","header_style":"full"}'::jsonb),

    -- Plantilla Moderna (PRO)
    (p_workspace_id, p_user_id, 'Moderna', false,
     '#0F172A', 'center', true, true, false, true, 'pro',
     '{"style":"modern","font":"space_grotesk","header_style":"minimal"}'::jsonb),

    -- Plantilla Minimalista (PREMIUM)
    (p_workspace_id, p_user_id, 'Minimalista', false,
     '#7C3AED', 'right', false, true, true, true, 'premium',
     '{"style":"minimal","font":"inter","header_style":"strip"}'::jsonb);
end;
$$;

-- 3. Actualizar handle_new_user para llamar seed_pdf_templates
-- (buscar la función existente y agregarla)
create or replace function public.patch_existing_workspaces_templates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct w.id as workspace_id, w.created_by as user_id
    from public.workspaces w
    where not exists (
      select 1 from public.pdf_templates t where t.workspace_id = w.id
    )
  loop
    perform public.seed_pdf_templates(r.workspace_id, r.user_id);
  end loop;
end;
$$;

-- Ejecutar seed para workspaces existentes que no tienen plantillas
select public.patch_existing_workspaces_templates();
