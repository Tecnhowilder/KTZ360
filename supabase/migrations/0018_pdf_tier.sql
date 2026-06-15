-- ---------------------------------------------------------------------------
-- 0018_pdf_tier.sql
-- Expone el nivel de PDF (free/pro) del workspace en el portal público,
-- para diferenciar el branding "Generado con KTZ360" (FREE) vs PDF limpio
-- con marca propia (PRO/PREMIUM).
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
    )
  ) into result
  from public.quote_access_tokens t
  join public.quotes q on q.id = t.quote_id and q.deleted_at is null
  left join public.clients c on c.id = q.client_id
  left join public.company_settings cs on cs.workspace_id = q.workspace_id
  where t.token = p_token;

  if result is null then
    raise exception 'not_found';
  end if;

  return result;
end;
$$;
