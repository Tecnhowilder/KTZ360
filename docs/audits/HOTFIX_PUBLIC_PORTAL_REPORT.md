# HOTFIX_PUBLIC_PORTAL_REPORT.md — Portal Público HTTP 400
Fecha: 2026-06-23

## CAUSA RAÍZ

La migración 0102 reemplazó `get_public_quote()` con una versión que agrega rate limiting. Sin embargo, 0102 falló a mitad de ejecución (errores de `CONCURRENTLY` y `deleted_at`) en EJECUCIONES ANTERIORES. 

El resultado es que la función `get_public_quote` actual en Supabase es la versión de 0059 (que YA funcionaba correctamente con `AND t.expires_at > now()`).

## DIAGNÓSTICO DETALLADO

### Versión actual en Supabase (post-0102 completo)
La versión 0102 de `get_public_quote`:
1. Llama `check_portal_rate_limit()` ✅ (función existe si 0102 corrió completo)
2. Filtra `AND t.expires_at > now()` — mismo que 0059
3. Lanza `'token_expired_or_not_found'` si result IS NULL

### ¿Por qué HTTP 400?

El cliente llama `supabase.rpc('get_public_quote', { p_token: token })`.
Supabase retorna HTTP 400 cuando el RPC lanza una excepción (`RAISE EXCEPTION`).

**Las excepciones posibles:**
- `'rate_limit_exceeded'` → Si el `portal_rate_limit` ya tiene entradas para ese token+IP (de intentos anteriores del mismo minuto)
- `'token_expired_or_not_found'` → Si el token no existe o expiró

**La causa más probable:** Los tokens existentes fueron creados ANTES de que la migración 0059 añadiera `expires_at` con default `now() + interval '90 days'`. Tokens más antiguos pueden tener `expires_at = NULL` o una fecha pasada.

### Verificación rápida en Supabase SQL Editor

```sql
-- Verificar el estado de los tokens
SELECT token, expires_at, revoked_at,
  CASE WHEN expires_at IS NULL THEN 'NULL (problema)' 
       WHEN expires_at < now() THEN 'VENCIDO'
       ELSE 'VÁLIDO' END AS estado
FROM public.quote_access_tokens
ORDER BY created_at DESC LIMIT 20;
```

### Verificar que check_portal_rate_limit existe

```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace 
WHERE n.nspname='public' AND p.proname='check_portal_rate_limit';
```

## SOLUCIONES

### Solución A — Si los tokens tienen expires_at NULL (más probable)

```sql
-- Migración correctiva: dar 90 días a tokens sin expiración
UPDATE public.quote_access_tokens 
SET expires_at = created_at + interval '90 days'
WHERE expires_at IS NULL;
```

### Solución B — Si get_public_quote falla por otra razón

Revertir a la versión de 0059 que funcionaba (sin rate limiting):

```sql
CREATE OR REPLACE FUNCTION public.get_public_quote(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'quote',    to_jsonb(q) - 'workspace_id' - 'created_by',
    'client',   to_jsonb(c) - 'workspace_id' - 'created_by',
    'company',  to_jsonb(cs) - 'workspace_id',
    'pdf_tier', (SELECT pf.pdf_tier FROM public.plan_features pf
                 WHERE pf.plan_code = public.get_effective_plan_code(q.workspace_id)),
    'custom_qr_enabled', public.check_feature_access(q.workspace_id, 'custom_qr_enabled')
  ) INTO result
  FROM public.quote_access_tokens t
  JOIN public.quotes q ON q.id = t.quote_id AND q.deleted_at IS NULL
  LEFT JOIN public.clients c ON c.id = q.client_id
  LEFT JOIN public.company_settings cs ON cs.workspace_id = q.workspace_id
  WHERE t.token = p_token AND (t.expires_at IS NULL OR t.expires_at > now());
  -- Nota: IS NULL permite tokens legacy sin expiración

  IF result IS NULL THEN
    RAISE EXCEPTION 'token_expired_or_not_found';
  END IF;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_quote(uuid) TO anon, authenticated;
```

## RECOMENDACIÓN

1. **Primero:** Ejecutar Solución A (fix los tokens NULL)
2. **Si sigue fallando:** Ejecutar Solución B (revertir función sin rate limit)
3. **El rate limiting** puede re-añadirse en un sprint separado con pruebas completas
