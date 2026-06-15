-- KTZ360 — Bloqueo server-side de la feature "Plantillas" (Zero Trust)
-- Complementa check_feature_access(): ningún insert en quote_templates puede
-- ocurrir si el plan efectivo del workspace no incluye templates_enabled.
-- No ejecutar automáticamente: pegar manualmente en el editor SQL de Supabase.

create or replace function public.enforce_templates_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_support_admin() then
    return new;
  end if;

  if not public.check_feature_access(new.workspace_id, 'templates_enabled') then
    raise exception 'feature_not_available: templates_enabled';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_templates_feature
  before insert on public.quote_templates
  for each row execute function public.enforce_templates_feature();

-- ---------------------------------------------------------------------------
-- Agrega expiración a los tokens públicos de acceso a cotización.
-- ---------------------------------------------------------------------------
alter table public.quote_access_tokens
  add column if not exists expires_at timestamptz not null default now() + interval '7 days';

create index if not exists idx_quote_access_tokens_expires_at on public.quote_access_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Expone también custom_qr_enabled en el portal público, para ocultar el QR
-- de verificación y el enlace cuando el plan efectivo no lo incluye.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_quote(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'workspace_id' - 'created_by',
    'client', to_jsonb(c) - 'workspace_id' - 'created_by',
    'company', to_jsonb(cs) - 'workspace_id',
    'consent_status', (
      select status from public.client_consents
      where client_id = q.client_id
      order by created_at desc
      limit 1
    ),
    'consent_accepted_at', (
      select accepted_at from public.client_consents
      where client_id = q.client_id and status = 'accepted'
      order by created_at desc
      limit 1
    ),
    'pdf_tier', (
      select pf.pdf_tier from public.plan_features pf
      where pf.plan_code = public.get_effective_plan_code(q.workspace_id)
    ),
    'custom_qr_enabled', public.check_feature_access(q.workspace_id, 'custom_qr_enabled')
  ) into result
  from public.quote_access_tokens t
  join public.quotes q on q.id = t.quote_id and q.deleted_at is null
  left join public.clients c on c.id = q.client_id
  left join public.company_settings cs on cs.workspace_id = q.workspace_id
  where t.token = p_token
    and t.expires_at > now();

  if result is null then
    raise exception 'not_found';
  end if;

  return result;
end;
$$;
