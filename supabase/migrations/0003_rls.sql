-- BRIVIA — Row Level Security
-- Aísla los datos de cada workspace. `public.current_workspace_id()` resuelve el
-- workspace del usuario autenticado vía profiles.workspace_id (auth.uid()).

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('owner', 'admin')
$$;

-- ---------------------------------------------------------------------------
-- plans — catálogo público (landing / pricing)
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;

create policy "plans_select_all"
  on public.plans for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;

create policy "workspaces_select_own"
  on public.workspaces for select
  to authenticated
  using (id = public.current_workspace_id());

create policy "workspaces_update_own"
  on public.workspaces for update
  to authenticated
  using (id = public.current_workspace_id() and public.is_admin())
  with check (id = public.current_workspace_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- subscriptions (solo lectura para miembros; escritura por servicio/backend)
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

-- ---------------------------------------------------------------------------
-- workspace_features (solo lectura para miembros; escritura por servicio/backend)
-- ---------------------------------------------------------------------------
alter table public.workspace_features enable row level security;

create policy "workspace_features_select_own"
  on public.workspace_features for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_workspace"
  on public.profiles for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

create policy "profiles_update_self_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or (workspace_id = public.current_workspace_id() and public.is_admin()))
  with check (id = auth.uid() or (workspace_id = public.current_workspace_id() and public.is_admin()));

-- ---------------------------------------------------------------------------
-- company_settings
-- ---------------------------------------------------------------------------
alter table public.company_settings enable row level security;

create policy "company_settings_select_workspace"
  on public.company_settings for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

create policy "company_settings_write_admin"
  on public.company_settings for all
  to authenticated
  using (workspace_id = public.current_workspace_id() and public.is_admin())
  with check (workspace_id = public.current_workspace_id() and public.is_admin());

-- ---------------------------------------------------------------------------
-- Tablas estándar con CRUD por workspace
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'clients', 'projects', 'leads', 'materials', 'service_types',
    'quote_templates', 'pdf_templates', 'quotes', 'attachments'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      create policy "%I_select_workspace" on public.%I for select
        to authenticated
        using (workspace_id = public.current_workspace_id())
    $f$, t, t);

    execute format($f$
      create policy "%I_insert_workspace" on public.%I for insert
        to authenticated
        with check (workspace_id = public.current_workspace_id())
    $f$, t, t);

    execute format($f$
      create policy "%I_update_workspace" on public.%I for update
        to authenticated
        using (workspace_id = public.current_workspace_id())
        with check (workspace_id = public.current_workspace_id())
    $f$, t, t);

    execute format($f$
      create policy "%I_delete_workspace" on public.%I for delete
        to authenticated
        using (workspace_id = public.current_workspace_id())
    $f$, t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- service_materials (sin workspace_id directo; depende de service_types)
-- ---------------------------------------------------------------------------
alter table public.service_materials enable row level security;

create policy "service_materials_select_workspace"
  on public.service_materials for select
  to authenticated
  using (exists (
    select 1 from public.service_types st
    where st.id = service_materials.service_type_id
      and st.workspace_id = public.current_workspace_id()
  ));

create policy "service_materials_write_workspace"
  on public.service_materials for all
  to authenticated
  using (exists (
    select 1 from public.service_types st
    where st.id = service_materials.service_type_id
      and st.workspace_id = public.current_workspace_id()
  ))
  with check (exists (
    select 1 from public.service_types st
    where st.id = service_materials.service_type_id
      and st.workspace_id = public.current_workspace_id()
  ));

-- ---------------------------------------------------------------------------
-- workspace_quote_counters (solo lectura informativa)
-- ---------------------------------------------------------------------------
alter table public.workspace_quote_counters enable row level security;

create policy "workspace_quote_counters_select_own"
  on public.workspace_quote_counters for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

-- ---------------------------------------------------------------------------
-- notifications (por usuario, dentro del workspace)
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid() and workspace_id = public.current_workspace_id());

create policy "notifications_insert_workspace"
  on public.notifications for insert
  to authenticated
  with check (workspace_id = public.current_workspace_id());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid() and workspace_id = public.current_workspace_id())
  with check (user_id = auth.uid() and workspace_id = public.current_workspace_id());

create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid() and workspace_id = public.current_workspace_id());

-- ---------------------------------------------------------------------------
-- ai_usage (lectura y registro propio dentro del workspace)
-- ---------------------------------------------------------------------------
alter table public.ai_usage enable row level security;

create policy "ai_usage_select_workspace"
  on public.ai_usage for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

create policy "ai_usage_insert_own"
  on public.ai_usage for insert
  to authenticated
  with check (workspace_id = public.current_workspace_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_log (lectura del workspace, registro propio)
-- ---------------------------------------------------------------------------
alter table public.audit_log enable row level security;

create policy "audit_log_select_workspace"
  on public.audit_log for select
  to authenticated
  using (workspace_id = public.current_workspace_id());

create policy "audit_log_insert_own"
  on public.audit_log for insert
  to authenticated
  with check (workspace_id = public.current_workspace_id() and user_id = auth.uid());
