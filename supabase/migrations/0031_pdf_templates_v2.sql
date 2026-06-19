-- ============================================================================
-- 0031 — pdf_templates v2 (ampliar con campos explícitos para plantillas)
-- ============================================================================
-- La tabla pdf_templates ya existe con config JSONB genérico.
-- Se agregan columnas explícitas para los campos principales de diseño,
-- permitiendo múltiples plantillas visuales en el futuro.
-- ============================================================================

-- Agregar columnas explícitas de diseño
alter table public.pdf_templates
  add column if not exists primary_color   text not null default '#2563EB',
  add column if not exists logo_position   text not null default 'left'
                             check (logo_position in ('left','center','right')),
  add column if not exists show_qr         boolean not null default true,
  add column if not exists show_signature  boolean not null default false,
  add column if not exists show_bank_info  boolean not null default false,
  add column if not exists footer_text     text;

-- Función para crear plantilla PDF default al registrar un workspace nuevo
-- (se llama desde handle_new_user si no existe plantilla para el workspace)
create or replace function public.ensure_pdf_template(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pdf_templates (workspace_id, created_by, name, is_default)
  values (p_workspace_id, p_user_id, 'Predeterminada', true)
  on conflict do nothing;
end;
$$;

-- RLS ya existe en pdf_templates desde 0001 / migraciones anteriores.
-- Si no existe, agregar:
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pdf_templates' and policyname = 'pdf_templates_select'
  ) then
    alter table public.pdf_templates enable row level security;

    execute $p$
      create policy "pdf_templates_select" on public.pdf_templates
        for select using (
          workspace_id in (
            select workspace_id from public.profiles where id = auth.uid()
          )
        )
    $p$;

    execute $p$
      create policy "pdf_templates_insert" on public.pdf_templates
        for insert with check (
          workspace_id in (
            select workspace_id from public.profiles where id = auth.uid()
          )
        )
    $p$;

    execute $p$
      create policy "pdf_templates_update" on public.pdf_templates
        for update using (
          workspace_id in (
            select workspace_id from public.profiles where id = auth.uid()
          )
        )
    $p$;
  end if;
end;
$$;
