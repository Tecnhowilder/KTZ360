# AUDITORÍA SUPABASE STARTUP — Queries en Arranque

## Queries ejecutadas al abrir la app (orden)

| # | Tabla/RPC | Query | Resultado esperado | Resultado real | HTTP |
|---|-----------|-------|--------------------|---------------|------|
| 1 | auth | getSession() | Session object | Session object | 200 ✅ |
| 2 | profiles | SELECT * WHERE id=$userId | 1 row | **0 rows** | **406 ❌** |
| 3 | workspaces | SELECT * WHERE id=$wsId | 1 row | Nunca ejecutada | — |
| 4 | company_settings | SELECT * WHERE workspace_id=$wsId | 1 row | Nunca ejecutada | — |
| 5 | subscriptions (RPC) | get_effective_plan_code | 'premium' | Nunca ejecutada | — |

## Query #2 — El query que falla

```
GET https://[project].supabase.co/rest/v1/profiles
  ?id=eq.[USER_UUID]
  &select=*

Headers:
  Authorization: Bearer [JWT]
  Accept: application/vnd.pgrst.object+json   ← .single() agrega esto

Response: 406 Not Acceptable
Body: {
  "code": "PGRST116",
  "message": "JSON object requested, multiple (or no) rows returned"
}
```

## Por qué 0 filas

```sql
-- PostgREST evalúa la RLS policy:
-- profiles_select_workspace: workspace_id = current_workspace_id()

-- current_workspace_id() ejecuta:
SELECT workspace_id FROM profiles
 WHERE id = auth.uid()
   AND status = 'active';   -- ← Si status != 'active' → NULL

-- La condición: workspace_id = NULL → siempre FALSE
-- Resultado: 0 filas → PGRST116 → HTTP 406
```

## Diagnóstico SQL para el usuario bloqueado

```sql
-- Ejecutar en Supabase SQL Editor:

-- 1. Ver el estado actual del perfil
SELECT id, email, status, role, workspace_id, updated_at
  FROM profiles
 WHERE email = 'tu@email.com';

-- 2. Ver historial de cambios de estado
SELECT action, metadata, created_at
  FROM audit_log
 WHERE entity_type = 'profiles'
 ORDER BY created_at DESC
 LIMIT 20;

-- 3. Fix manual si status != 'active':
UPDATE profiles SET status = 'active' WHERE email = 'tu@email.com';
```

## Post-fix: queries que funcionan correctamente

Una vez aplicada la migration 0120:

| # | Tabla/RPC | Resultado esperado |
|---|-----------|-------------------|
| 1 | profiles | 1 row (propio perfil) — siempre, sin importar status |
| 2 | workspaces | 1 row (workspace del perfil) |
| 3 | company_settings | 1 row |
| 4 | get_effective_plan_code | 'free'/'pro'/'premium' |

## Tiempo esperado de startup (post-fix)

- Auth session: < 100ms (cached)
- Profile: < 200ms (single row by PK)
- Workspace: < 200ms (single row by PK)
- Company settings: < 200ms (single row by FK)
- Plan code RPC: < 300ms (simple query)
- **Total startup: < 1 segundo**
