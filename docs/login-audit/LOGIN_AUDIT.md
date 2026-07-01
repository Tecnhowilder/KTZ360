# AUDITORÍA DE LOGIN — Flujo Completo

## Flujo esperado

```
Login ──→ AuthProvider ──→ ProtectedRoute ──→ WorkspaceProvider ──→ WorkspaceGate ──→ Dashboard
```

## Flujo real (estado actual con bug)

```
Login ──→ AuthProvider (OK) ──→ ProtectedRoute (OK)
       ──→ WorkspaceProvider.getProfile() ──→ 406 Error
       ──→ WorkspaceProvider.value = { loading: true } [STUCK]
       ──→ WorkspaceGate: <FullScreenSpinner /> [FOREVER]
```

## Paso a paso

### AuthProvider.tsx ✅ OK
- `supabase.auth.getSession()` → session
- `onAuthStateChange` → actualiza session
- Expone: `{ session, user, loading }`
- **Ningún problema**

### ProtectedRoute.tsx ✅ OK para sesión
- Si loading → spinner (temporal, correcto)
- Si !session → redirect a /login (correcto)
- Si session → monta WorkspaceProvider → WorkspaceGate

### WorkspaceProvider.tsx ❌ ERROR SIN MANEJO
- Llama `getProfile(user.id)` → **406 Not Acceptable**
- `profileQuery.isError = true`, `data = undefined`
- `loading` variable = `false` (queries settled, not loading)
- `value = { loading: true }` ← ERROR: confunde "error" con "loading"
- **Spinner infinito permanente**

### WorkspaceGate.tsx ❌ BLOQUEADO POR WORKSPACEPROVIDER
- `ws.loading = true` → siempre → `<FullScreenSpinner />`
- Nunca llega a verificar onboarding ni redirigir al dashboard

### Dashboard ❌ INACCESIBLE
- Nunca se monta

## Queries ejecutadas durante startup

| Query | Función | Tabla | Resultado actual |
|-------|---------|-------|-----------------|
| 1 | getProfile(userId) | profiles | ❌ 406 → 0 rows (RLS) |
| 2 | getWorkspace(wsId) | workspaces | ⏸ Nunca ejecutada |
| 3 | getCompanySettings(wsId) | company_settings | ⏸ Nunca ejecutada |
| 4 | getCurrentPlanName(wsId) | subscriptions (RPC) | ⏸ Nunca ejecutada |

## El punto exacto donde se rompe

```
WorkspaceProvider.tsx línea 29-33:

const profileQuery = useQuery({
  queryKey: ['profile', user?.id],
  queryFn: () => getProfile(user!.id),  ← FALLA AQUÍ
  enabled: !!user,
});
```

`getProfile()` → `supabase.from('profiles').select('*').eq('id', userId).single()` → HTTP 406
