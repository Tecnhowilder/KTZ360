-- BRIVIA ENGINE V2 — RLS del catálogo maestro global
-- Las tablas catalog_* son de solo lectura para usuarios autenticados (y anon,
-- igual que `plans`): se administran vía SQL Editor / Supabase Studio con rol
-- postgres (que ignora RLS), permitiendo agregar/editar servicios sin redeploy.

do $$
declare
  t text;
  tables text[] := array[
    'catalog_categories', 'catalog_services', 'catalog_variants',
    'catalog_questions', 'catalog_question_options', 'catalog_materials',
    'catalog_material_rules', 'catalog_labor_rules', 'catalog_equipment_rules'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      create policy "%I_select_all" on public.%I for select
        to anon, authenticated
        using (true)
    $f$, t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- workspace_price_overrides — CRUD estándar por workspace
-- ---------------------------------------------------------------------------
alter table public.workspace_price_overrides enable row level security;

create policy "workspace_price_overrides_select_workspace"
  on public.workspace_price_overrides for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

create policy "workspace_price_overrides_insert_workspace"
  on public.workspace_price_overrides for insert
  to authenticated
  with check (workspace_id = public.current_workspace_id());

create policy "workspace_price_overrides_update_workspace"
  on public.workspace_price_overrides for update
  to authenticated
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());

create policy "workspace_price_overrides_delete_workspace"
  on public.workspace_price_overrides for delete
  to authenticated
  using (workspace_id = public.current_workspace_id());
