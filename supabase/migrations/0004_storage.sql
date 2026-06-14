-- BRIVIA — Storage
-- Buckets 'logos' (logo de empresa para el PDF) y 'attachments' (fotos/evidencias de
-- proyectos y cotizaciones). Cada archivo se guarda bajo el prefijo
-- `<workspace_id>/...`, y las políticas restringen el acceso a ese prefijo.

insert into storage.buckets (id, name, public)
values
  ('logos', 'logos', true),
  ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- logos — lectura pública (se usan directamente en el PDF), escritura del workspace
-- ---------------------------------------------------------------------------
create policy "logos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'logos');

create policy "logos_insert_own_workspace"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

create policy "logos_update_own_workspace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

create policy "logos_delete_own_workspace"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

-- ---------------------------------------------------------------------------
-- attachments — privado, solo miembros del workspace propietario del prefijo
-- ---------------------------------------------------------------------------
create policy "attachments_select_own_workspace"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

create policy "attachments_insert_own_workspace"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

create policy "attachments_update_own_workspace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

create policy "attachments_delete_own_workspace"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );
