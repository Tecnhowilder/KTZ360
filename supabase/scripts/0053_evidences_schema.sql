-- ============================================================================
-- 0053 — evidences_schema: Sistema de Evidencias Sprint 7
-- ============================================================================
-- Decisiones de arquitectura aprobadas:
--   - Feature flag: storage_enabled (existente, PREMIUM=true)
--   - Bucket: 'evidences' nuevo, privado
--   - Tracking: storage_used_bytes en workspaces (O(1), actualizado por trigger)
--   - Compresión: cliente (Canvas API) + validación backend (Zero Trust)
--   - Bucket path: {workspace_id}/{order|work_order}/{entity_id}/{uuid}.{ext}
-- ============================================================================

-- ─── 1. Agregar storage_used_bytes a workspaces ───────────────────────────────

alter table public.workspaces
  add column if not exists storage_used_bytes bigint not null default 0;

comment on column public.workspaces.storage_used_bytes
  is 'Bytes consumidos en evidencias (Sprint 7). Actualizado por trigger en evidence_files.';

-- ─── 2. Crear bucket 'evidences' privado ─────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidences',
  'evidences',
  false,
  52428800,   -- 50 MB máximo por archivo
  array[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg',
    'application/pdf',
    'image/svg+xml'
  ]
)
on conflict (id) do nothing;

-- ─── 3. RLS del bucket 'evidences' ───────────────────────────────────────────
-- Isolación por workspace_id (primer folder del path)
-- Feature gating: storage_enabled = PREMIUM
-- La cuota real se verifica en register_evidence_file RPC (post-upload).

create policy "evidences_select_own_workspace"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidences'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
    and public.check_feature_access(public.current_workspace_id(), 'storage_enabled')
  );

create policy "evidences_insert_own_workspace"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidences'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
    and public.check_feature_access(public.current_workspace_id(), 'storage_enabled')
  );

create policy "evidences_update_own_workspace"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'evidences'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  )
  with check (
    bucket_id = 'evidences'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

create policy "evidences_delete_own_workspace"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'evidences'
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
    and public.check_feature_access(public.current_workspace_id(), 'storage_enabled')
  );

-- ─── 4. Tabla evidence_files ──────────────────────────────────────────────────

create table if not exists public.evidence_files (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  -- Entidad padre — uno de los dos debe estar presente (no ambos null)
  order_id        uuid        references public.orders(id)      on delete cascade,
  work_order_id   uuid        references public.work_orders(id) on delete cascade,
  uploaded_by     uuid        not null references auth.users(id),

  -- Metadata del archivo
  file_name       text        not null,
  file_size       bigint      not null check (file_size > 0 and file_size <= 52428800),
  mime_type       text        not null,
  storage_path    text        not null unique,  -- path completo en bucket 'evidences'

  -- Tipo de archivo (categoría)
  file_type       text        not null check (file_type in (
    'image', 'video', 'audio', 'document', 'signature'
  )),

  -- Metadata adicional
  caption         text,
  is_signature    boolean     not null default false,
  duration_sec    int,                   -- audio/video
  thumbnail_path  text,                  -- path en bucket (generado por cliente)
  metadata        jsonb       not null default '{}'::jsonb,

  -- Soft delete
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),

  -- Al menos un padre requerido
  constraint evidence_has_parent check (
    order_id is not null or work_order_id is not null
  )
);

create index if not exists idx_evidence_workspace
  on public.evidence_files(workspace_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_evidence_order
  on public.evidence_files(order_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_evidence_work_order
  on public.evidence_files(work_order_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_evidence_type
  on public.evidence_files(workspace_id, file_type)
  where deleted_at is null;

-- ─── RLS — evidence_files ────────────────────────────────────────────────────

alter table public.evidence_files enable row level security;

create policy "members select evidence_files"
  on public.evidence_files for select
  using (
    exists (
      select 1 from public.profiles
      where workspace_id = evidence_files.workspace_id and id = auth.uid()
    )
    and deleted_at is null
  );

-- INSERT solo vía RPC (security definer) — no directo desde cliente
create policy "members insert evidence_files"
  on public.evidence_files for insert
  with check (
    exists (
      select 1 from public.profiles
      where workspace_id = evidence_files.workspace_id and id = auth.uid()
    )
    and uploaded_by = auth.uid()
    and public.check_feature_access(workspace_id, 'storage_enabled')
  );

-- UPDATE solo caption y thumbnail (vía RPC)
create policy "uploader can update evidence_files"
  on public.evidence_files for update
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where workspace_id = evidence_files.workspace_id
        and id = auth.uid()
        and role in ('owner', 'admin', 'super_admin', 'support_admin')
    )
  );

-- DELETE soft (vía RPC)
create policy "member delete evidence_files"
  on public.evidence_files for delete
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where workspace_id = evidence_files.workspace_id
        and id = auth.uid()
        and role in ('owner', 'admin', 'super_admin', 'support_admin')
    )
  );

-- ─── 5. Función helper: MIME → file_type ─────────────────────────────────────

create or replace function public.mime_to_file_type(p_mime text)
returns text
language sql
immutable
as $$
  select case
    when p_mime in ('image/jpeg','image/jpg','image/png','image/webp') then 'image'
    when p_mime in ('video/mp4','video/quicktime','video/webm')        then 'video'
    when p_mime in ('audio/mpeg','audio/wav','audio/mp4','audio/ogg') then 'audio'
    when p_mime = 'application/pdf'                                    then 'document'
    when p_mime = 'image/svg+xml'                                      then 'signature'
    else null
  end;
$$;

-- ─── 6. Función helper: verificar cuota ──────────────────────────────────────

create or replace function public.check_evidence_quota(
  p_workspace_id uuid,
  p_additional_bytes bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used_bytes bigint;
  v_max_bytes  bigint;
  v_plan_code  text;
begin
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  select
    w.storage_used_bytes,
    coalesce(pl.max_storage_gb, 0) * 1073741824  -- GB to bytes
  into v_used_bytes, v_max_bytes
  from public.workspaces w
  join public.plan_limits pl on pl.plan_code = v_plan_code
  where w.id = p_workspace_id;

  -- max_storage_gb = 0 (o null en plan_limits) = sin storage
  if v_max_bytes = 0 then
    return jsonb_build_object(
      'allowed', false,
      'error', 'Plan sin almacenamiento incluido',
      'used_bytes', v_used_bytes,
      'max_bytes', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', (v_used_bytes + p_additional_bytes) <= v_max_bytes,
    'used_bytes', v_used_bytes,
    'max_bytes', v_max_bytes,
    'available_bytes', greatest(0, v_max_bytes - v_used_bytes),
    'pct_used', case when v_max_bytes > 0
      then round((v_used_bytes::numeric / v_max_bytes) * 100, 1)
      else 100 end
  );
end;
$$;

grant execute on function public.check_evidence_quota(uuid, bigint) to authenticated;

comment on table public.evidence_files  is 'Evidencias Sprint 7: fotos, videos, audios, PDFs, firmas. PREMIUM only.';
comment on column public.evidence_files.storage_path is 'Path completo en bucket evidences: {workspace_id}/{order|work_order}/{entity_id}/{uuid}.{ext}';
