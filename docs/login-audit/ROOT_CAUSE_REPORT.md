# ROOT CAUSE REPORT — Login Bloqueado / Loading Infinito

**Fecha:** 2026-06-28  
**Severidad:** CRÍTICA — Bloquea el acceso completo a la aplicación

---

## SÍNTOMA

```
GET /profiles → HTTP 406 (Not Acceptable)
Origen: ProtectedRoute.tsx → WorkspaceProvider → getProfile()
Resultado: Spinner infinito, nunca entra al Dashboard
```

---

## DOS CAUSAS RAÍZ IDENTIFICADAS

### CAUSA 1 — RLS Circular: `current_workspace_id()` con filtro `status = 'active'`

**Archivo:** `supabase/migrations/0020_roles_team_management.sql`

```sql
-- Función que devuelve el workspace del usuario autenticado:
CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.profiles
   WHERE id = auth.uid() AND status = 'active';   -- ← PROBLEMA AQUÍ
$$;
```

**Política RLS en profiles:**
```sql
-- supabase/migrations/0003_rls.sql
CREATE POLICY "profiles_select_workspace" ON public.profiles
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());
```

**El problema:**

```
Usuario autenticado → getProfile(userId)
         ↓
PostgREST evalúa RLS: workspace_id = current_workspace_id()
         ↓
current_workspace_id() ejecuta:
  SELECT workspace_id FROM profiles WHERE id = auth.uid() AND status = 'active'
         ↓
Si status != 'active' → devuelve NULL
         ↓
Condición RLS: workspace_id = NULL → siempre FALSE
         ↓
0 filas retornadas → .single() → HTTP 406
```

**Casos en que status != 'active':**
- `status = 'invited'` (usuario creado antes de aceptar invitación)
- `status = 'inactive'` (usuario desactivado)
- `status = 'removed'` (usuario eliminado por migration 0108 cleanup)

**Gravedad:** El usuario está autenticado en Supabase Auth pero su fila de profile es invisible para él mismo.

---

### CAUSA 2 — WorkspaceProvider sin manejo de errores

**Archivo:** `src/features/auth/WorkspaceProvider.tsx` — líneas 86-98

```typescript
// ❌ CÓDIGO ACTUAL — sin manejo de errores:
const loading =
  profileQuery.isLoading || workspaceQuery.isLoading || ...;

const value =
  !loading && profileQuery.data && workspaceQuery.data && companyQuery.data && planQuery.data
    ? { profile, workspace, company, planName, loading: false }
    : { loading: true };   // ← PROBLEMA: también se ejecuta cuando hay ERROR
```

**Secuencia de estado cuando profileQuery falla:**

| Momento | isLoading | isError | data | `loading` var | value |
|---------|-----------|---------|------|--------------|-------|
| Inicio | true | false | undefined | true | `{loading:true}` |
| Falla 1er intento | false | true | undefined | false | `{loading:true}` ← BUG |
| React Query reintenta | false | true | undefined | false | `{loading:true}` ← BUG |
| Después de 3 reintentos | false | true | undefined | false | `{loading:true}` ← BUG PERMANENTE |

**El resultado:** `WorkspaceGate` hace `if (ws.loading) return <FullScreenSpinner />` → spinner infinito.

---

## CADENA COMPLETA DEL FALLO

```
1. Usuario hace login → Supabase Auth sesión OK
2. AuthProvider → session válida, user.id existe
3. ProtectedRoute → sesión existe, monta WorkspaceProvider
4. WorkspaceProvider → llama getProfile(user.id)
5. getProfile() → supabase.from('profiles').select('*').eq('id',userId).single()
6. PostgREST evalúa RLS:
     profiles_select_workspace: workspace_id = current_workspace_id()
7. current_workspace_id() → NULL (status != 'active')
8. RLS: workspace_id = NULL → FALSE → 0 filas
9. .single() con 0 filas → HTTP 406
10. profileQuery.isError = true, data = undefined
11. WorkspaceProvider: value = { loading: true } ← ERROR NO MANEJADO
12. WorkspaceGate: ws.loading = true → <FullScreenSpinner />
13. SPINNER INFINITO — la aplicación queda bloqueada
```

---

## POR QUÉ EL 406 NO ES 404

PostgREST usa HTTP 406 (no 404) cuando `.single()` recibe 0 filas porque:
- 406 = "Not Acceptable" — el servidor no puede producir el formato solicitado
- Para `.single()` el "formato" es "exactamente 1 objeto JSON"
- Con 0 filas no puede cumplir ese contrato → 406

El código interno es `PGRST116: "JSON object requested, multiple (or no) rows returned"`.

---

## MIGRACIONES ANALIZADAS SIN ENCONTRAR CAUSAS ADICIONALES

| Migration | Cambio | Impacto en Login |
|-----------|--------|-----------------|
| 0112 | compute_team_seats, check_feature_access | ✅ Sin impacto |
| 0116 | Enterprise NULL, cleanup invitations | ✅ Sin impacto |
| 0117 | plan_limits NULL, archiving | ✅ Sin impacto |
| 0118 | invite_team_member reescrita | ✅ Sin impacto |
| 0119 | accept_invitation, token hardening | ✅ Sin impacto |

La migration 0108 tiene un bloque de limpieza que setea `status='removed'` SOLO para emails `@test.ktz360.com` y excluyendo `role='owner'`. No afecta usuarios reales con dominios distintos.
