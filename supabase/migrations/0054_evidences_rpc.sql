-- ============================================================================
-- 0054 — evidences_rpc: RPCs de Evidencias Zero Trust
-- ============================================================================
-- Flujo aprobado:
--   1. check_evidence_upload_allowed() → valida y devuelve path autorizado
--   2. Cliente sube a bucket 'evidences' (RLS enforced)
--   3. register_evidence_file() → registra, actualiza cuota, loga
--   4. delete_evidence_file() → soft delete, decrementa cuota, limpia storage
-- ============================================================================

-- ============================================================================
-- RPC 1: check_evidence_upload_allowed — validación previa al upload
-- ============================================================================

create or replace function public.check_evidence_upload_allowed(
  p_order_id      uuid    default null,
  p_work_order_id uuid    default null,
  p_file_name     text    default '',
  p_file_size     bigint  default 0,
  p_mime_type     text    default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_file_type    text;
  v_ext          text;
  v_uuid         text;
  v_entity_type  text;
  v_entity_id    uuid;
  v_upload_path  text;
  v_quota        jsonb;
  v_max_file     bigint := 52428800; -- 50 MB
begin
  -- Validar que al menos un padre esté presente
  if p_order_id is null and p_work_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'Se requiere order_id o work_order_id');
  end if;

  -- Obtener workspace_id desde el padre
  if p_order_id is not null then
    select o.workspace_id into v_workspace_id
    from public.orders o
    join public.profiles p on p.workspace_id = o.workspace_id
    where o.id = p_order_id and o.deleted_at is null and p.id = v_user_id;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado o sin acceso');
    end if;
    v_entity_type := 'order';
    v_entity_id   := p_order_id;
  else
    select wo.workspace_id into v_workspace_id
    from public.work_orders wo
    join public.profiles p on p.workspace_id = wo.workspace_id
    where wo.id = p_work_order_id and p.id = v_user_id;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'OT no encontrada o sin acceso');
    end if;
    v_entity_type := 'work_order';
    v_entity_id   := p_work_order_id;
  end if;

  -- Feature gating: PREMIUM únicamente
  if not public.check_feature_access(v_workspace_id, 'storage_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Evidencias requieren plan PREMIUM');
  end if;

  -- Validar tamaño (50 MB máximo por archivo)
  if p_file_size <= 0 or p_file_size > v_max_file then
    return jsonb_build_object(
      'ok', false,
      'error', format('Tamaño de archivo inválido. Máximo 50 MB por archivo (recibido: %s bytes)', p_file_size)
    );
  end if;

  -- Validar MIME type
  v_file_type := public.mime_to_file_type(p_mime_type);
  if v_file_type is null then
    return jsonb_build_object('ok', false, 'error', 'Tipo de archivo no permitido: ' || p_mime_type);
  end if;

  -- Verificar cuota
  v_quota := public.check_evidence_quota(v_workspace_id, p_file_size);
  if not (v_quota->>'allowed')::boolean then
    return jsonb_build_object(
      'ok', false,
      'error', 'Espacio de almacenamiento insuficiente',
      'quota', v_quota
    );
  end if;

  -- Generar path autorizado
  v_uuid        := replace(gen_random_uuid()::text, '-', '');
  v_ext         := lower(reverse(split_part(reverse(p_file_name), '.', 1)));
  v_ext         := case when length(v_ext) between 2 and 5 then '.' || v_ext else '' end;
  v_upload_path := v_workspace_id::text || '/' || v_entity_type || '/' || v_entity_id::text || '/' || v_uuid || v_ext;

  return jsonb_build_object(
    'ok',          true,
    'upload_path', v_upload_path,
    'file_type',   v_file_type,
    'workspace_id',v_workspace_id,
    'quota',       v_quota
  );
end;
$$;

grant execute on function public.check_evidence_upload_allowed(uuid, uuid, text, bigint, text) to authenticated;

-- ============================================================================
-- RPC 2: register_evidence_file — post-upload, actualiza cuota y loga
-- ============================================================================

create or replace function public.register_evidence_file(
  p_storage_path  text,
  p_order_id      uuid    default null,
  p_work_order_id uuid    default null,
  p_file_name     text    default '',
  p_file_size     bigint  default 0,
  p_mime_type     text    default '',
  p_caption       text    default null,
  p_is_signature  boolean default false,
  p_duration_sec  int     default null,
  p_thumbnail_path text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_file_type    text;
  v_evidence_id  uuid;
  v_quota        jsonb;
  v_entity_id    uuid;
  v_entity_type  text;
  v_order_num    text;
begin
  -- Validar padre
  if p_order_id is null and p_work_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'Se requiere order_id o work_order_id');
  end if;

  -- Obtener workspace del padre y validar acceso
  if p_order_id is not null then
    select o.workspace_id, o.order_number
    into v_workspace_id, v_order_num
    from public.orders o
    join public.profiles p on p.workspace_id = o.workspace_id
    where o.id = p_order_id and o.deleted_at is null and p.id = v_user_id;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado o sin acceso');
    end if;
    v_entity_type := 'order';
    v_entity_id   := p_order_id;
  else
    select wo.workspace_id, wo.work_order_number
    into v_workspace_id, v_order_num
    from public.work_orders wo
    join public.profiles p on p.workspace_id = wo.workspace_id
    where wo.id = p_work_order_id and p.id = v_user_id;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'OT no encontrada o sin acceso');
    end if;
    v_entity_type := 'work_order';
    v_entity_id   := p_work_order_id;
  end if;

  -- Re-validar feature (Zero Trust — doble check)
  if not public.check_feature_access(v_workspace_id, 'storage_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Evidencias requieren plan PREMIUM');
  end if;

  -- Re-validar cuota (puede haber cambiado desde check_evidence_upload_allowed)
  v_quota := public.check_evidence_quota(v_workspace_id, p_file_size);
  if not (v_quota->>'allowed')::boolean then
    return jsonb_build_object(
      'ok', false,
      'error', 'Cuota de almacenamiento excedida',
      'quota', v_quota
    );
  end if;

  -- Validar path (debe pertenecer al workspace)
  if not (p_storage_path like v_workspace_id::text || '/%') then
    return jsonb_build_object('ok', false, 'error', 'Path de storage inválido');
  end if;

  -- Validar MIME y tamaño
  if p_file_size <= 0 or p_file_size > 52428800 then
    return jsonb_build_object('ok', false, 'error', 'Tamaño de archivo inválido');
  end if;

  v_file_type := public.mime_to_file_type(p_mime_type);
  if v_file_type is null then
    return jsonb_build_object('ok', false, 'error', 'Tipo MIME no permitido');
  end if;

  -- Ajustar file_type si es firma
  if p_is_signature and v_file_type = 'image' then
    v_file_type := 'signature';
  end if;

  -- Insertar evidencia
  insert into public.evidence_files (
    workspace_id, order_id, work_order_id, uploaded_by,
    file_name, file_size, mime_type, storage_path,
    file_type, caption, is_signature, duration_sec, thumbnail_path
  ) values (
    v_workspace_id, p_order_id, p_work_order_id, v_user_id,
    p_file_name, p_file_size, p_mime_type, p_storage_path,
    v_file_type, p_caption, p_is_signature, p_duration_sec, p_thumbnail_path
  )
  returning id into v_evidence_id;

  -- Actualizar cuota del workspace (O(1))
  update public.workspaces
  set storage_used_bytes = storage_used_bytes + p_file_size,
      updated_at = now()
  where id = v_workspace_id;

  -- Registrar en bitácora
  insert into public.work_logs (
    workspace_id, order_id, work_order_id, user_id,
    event_type, note, metadata
  ) values (
    v_workspace_id,
    p_order_id,
    p_work_order_id,
    v_user_id,
    'evidence_uploaded',
    'Evidencia subida: ' || p_file_name,
    jsonb_build_object(
      'evidence_id',   v_evidence_id,
      'file_name',     p_file_name,
      'file_type',     v_file_type,
      'file_size',     p_file_size,
      'is_signature',  p_is_signature
    )
  );

  return jsonb_build_object(
    'ok',          true,
    'evidence_id', v_evidence_id,
    'file_type',   v_file_type
  );
end;
$$;

grant execute on function public.register_evidence_file(text,uuid,uuid,text,bigint,text,text,boolean,int,text) to authenticated;

-- ============================================================================
-- RPC 3: delete_evidence_file — soft delete + decrementa cuota + limpia storage
-- ============================================================================

create or replace function public.delete_evidence_file(p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_file_size    bigint;
  v_file_name    text;
  v_file_type    text;
  v_order_id     uuid;
  v_wo_id        uuid;
  v_storage_path text;
  v_is_owner     boolean;
begin
  -- Obtener evidencia y validar acceso
  select
    e.workspace_id, e.file_size, e.file_name, e.file_type,
    e.order_id, e.work_order_id, e.storage_path,
    (e.uploaded_by = v_user_id
     or exists (
       select 1 from public.profiles p
       where p.workspace_id = e.workspace_id
         and p.id = v_user_id
         and p.role in ('owner','admin','super_admin','support_admin')
     )
    ) as is_owner
  into v_workspace_id, v_file_size, v_file_name, v_file_type,
       v_order_id, v_wo_id, v_storage_path, v_is_owner
  from public.evidence_files e
  where e.id = p_evidence_id and e.deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Evidencia no encontrada');
  end if;

  -- Validar que el usuario es miembro del workspace
  if not exists (
    select 1 from public.profiles where workspace_id = v_workspace_id and id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  if not v_is_owner then
    return jsonb_build_object('ok', false, 'error', 'Solo el creador o un admin puede eliminar evidencias');
  end if;

  -- Soft delete
  update public.evidence_files
  set deleted_at = now()
  where id = p_evidence_id;

  -- Decrementar cuota
  update public.workspaces
  set storage_used_bytes = greatest(0, storage_used_bytes - v_file_size),
      updated_at = now()
  where id = v_workspace_id;

  -- Registrar en bitácora
  insert into public.work_logs (
    workspace_id, order_id, work_order_id, user_id,
    event_type, note, metadata
  ) values (
    v_workspace_id, v_order_id, v_wo_id, v_user_id,
    'evidence_deleted',
    'Evidencia eliminada: ' || v_file_name,
    jsonb_build_object(
      'evidence_id', p_evidence_id,
      'file_name',   v_file_name,
      'file_type',   v_file_type,
      'file_size',   v_file_size,
      'storage_path',v_storage_path
    )
  );

  return jsonb_build_object(
    'ok',           true,
    'storage_path', v_storage_path,
    'freed_bytes',  v_file_size
  );
end;
$$;

grant execute on function public.delete_evidence_file(uuid) to authenticated;

-- ============================================================================
-- RPC 4: get_evidence_gallery — evidencias de un pedido o OT
-- ============================================================================

create or replace function public.get_evidence_gallery(
  p_order_id      uuid default null,
  p_work_order_id uuid default null,
  p_file_type     text default null,
  p_limit         int  default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
begin
  -- Obtener workspace y validar acceso
  if p_order_id is not null then
    select o.workspace_id into v_workspace_id
    from public.orders o
    join public.profiles p on p.workspace_id = o.workspace_id
    where o.id = p_order_id and p.id = v_user_id and o.deleted_at is null;
  else
    select wo.workspace_id into v_workspace_id
    from public.work_orders wo
    join public.profiles p on p.workspace_id = wo.workspace_id
    where wo.id = p_work_order_id and p.id = v_user_id;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Entidad no encontrada o sin acceso');
  end if;

  -- Feature gating
  if not public.check_feature_access(v_workspace_id, 'storage_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Evidencias requieren plan PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'files', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',             e.id,
          'file_name',      e.file_name,
          'file_size',      e.file_size,
          'mime_type',      e.mime_type,
          'storage_path',   e.storage_path,
          'file_type',      e.file_type,
          'caption',        e.caption,
          'is_signature',   e.is_signature,
          'duration_sec',   e.duration_sec,
          'thumbnail_path', e.thumbnail_path,
          'uploaded_by',    e.uploaded_by,
          'uploader_name',  pr.full_name,
          'created_at',     e.created_at
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.evidence_files e
      left join public.profiles pr on pr.id = e.uploaded_by
      where e.deleted_at is null
        and (p_order_id      is null or e.order_id      = p_order_id)
        and (p_work_order_id is null or e.work_order_id = p_work_order_id)
        and (p_file_type     is null or e.file_type     = p_file_type)
      limit p_limit
    ),
    'total', (
      select count(*)::int
      from public.evidence_files e
      where e.deleted_at is null
        and (p_order_id      is null or e.order_id      = p_order_id)
        and (p_work_order_id is null or e.work_order_id = p_work_order_id)
    )
  );
end;
$$;

grant execute on function public.get_evidence_gallery(uuid, uuid, text, int) to authenticated;

-- ============================================================================
-- RPC 5: get_storage_usage — dashboard de almacenamiento del workspace
-- ============================================================================

create or replace function public.get_storage_usage(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quota   jsonb;
begin
  -- ZERO TRUST
  if not exists (
    select 1 from public.profiles where workspace_id = p_workspace_id and id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  v_quota := public.check_evidence_quota(p_workspace_id);

  return jsonb_build_object(
    'ok',           true,
    'used_bytes',   v_quota->'used_bytes',
    'max_bytes',    v_quota->'max_bytes',
    'available_bytes', v_quota->'available_bytes',
    'pct_used',     v_quota->'pct_used',
    'has_storage',  public.check_feature_access(p_workspace_id, 'storage_enabled'),
    'by_type', (
      select coalesce(jsonb_object_agg(
        file_type,
        jsonb_build_object('count', cnt, 'bytes', total_bytes)
      ), '{}'::jsonb)
      from (
        select file_type, count(*)::int as cnt, sum(file_size) as total_bytes
        from public.evidence_files
        where workspace_id = p_workspace_id and deleted_at is null
        group by file_type
      ) s
    ),
    'recent_files', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',        e.id,
          'file_name', e.file_name,
          'file_type', e.file_type,
          'file_size', e.file_size,
          'created_at',e.created_at
        )
        order by e.created_at desc
      ), '[]'::jsonb)
      from public.evidence_files e
      where e.workspace_id = p_workspace_id and e.deleted_at is null
      limit 5
    )
  );
end;
$$;

grant execute on function public.get_storage_usage(uuid) to authenticated;

comment on function public.check_evidence_upload_allowed is 'Sprint 7: valida cuota/plan/mime antes del upload. Zero Trust — llama antes de subir.';
comment on function public.register_evidence_file        is 'Sprint 7: registra evidencia post-upload y actualiza cuota. Double-check Zero Trust.';
comment on function public.delete_evidence_file          is 'Sprint 7: soft delete + decrementa storage_used_bytes.';
comment on function public.get_evidence_gallery          is 'Sprint 7: galería de evidencias de un pedido u OT.';
comment on function public.get_storage_usage             is 'Sprint 7: dashboard de almacenamiento del workspace.';
