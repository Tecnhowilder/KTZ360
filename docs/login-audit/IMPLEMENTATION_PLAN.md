# PLAN DE IMPLEMENTACIÓN — Fix Login Bloqueado

**Principio:** Corrección mínima necesaria. Sin romper arquitectura. Sin parches.

---

## FIX 1 — RLS: permitir que un usuario lea su propio perfil siempre

**Problema:** La política `profiles_select_workspace` depende de `current_workspace_id()` que retorna NULL cuando `status != 'active'`. Un usuario con cualquier status distinto de 'active' no puede leer su propio profile.

**Corrección:** Agregar una segunda política que siempre permita leer el propio profile por `id = auth.uid()`.

```sql
-- Migration 0120
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
```

**Por qué es correcto:**
- Un usuario autenticado SIEMPRE debe poder leer su propio perfil
- Esto es Zero Trust correcto: el JWT del usuario es la fuente de verdad
- No permite leer perfiles de otros usuarios
- La política de workspace sigue activa para ver perfiles de compañeros

**Impacto:** 0 cambios de seguridad negativos. Un usuario solo puede ver su propia fila adicional.

---

## FIX 2 — WorkspaceProvider: manejar errores explícitamente

**Problema:** Cuando cualquier query falla, el provider retorna `{ loading: true }` indefinidamente. No hay estado de error, no hay UI de error, no hay timeout.

**Corrección en `WorkspaceProvider.tsx`:**

```typescript
// Agregar interfaz de error
interface WorkspaceContextError {
  profile?: undefined;
  workspace?: undefined;
  company?: undefined;
  planName?: undefined;
  loading: false;
  error: Error;
}

// En el provider:
const isError =
  profileQuery.isError || workspaceQuery.isError || companyQuery.isError || planQuery.isError;

const firstError =
  profileQuery.error || workspaceQuery.error || companyQuery.error || planQuery.error;

const value =
  !loading && !isError && profileQuery.data && workspaceQuery.data && companyQuery.data && planQuery.data
    ? { profile, workspace, company, planName, loading: false }
    : isError
    ? { loading: false, error: firstError as Error }
    : { loading: true };
```

**En WorkspaceGate:**
```typescript
function WorkspaceGate({ children }) {
  const ws = useWorkspaceMaybe();
  if (ws.loading) return <FullScreenSpinner />;
  if ('error' in ws && ws.error) return <WorkspaceErrorScreen error={ws.error} />;
  // ... resto del código
}
```

---

## FIX 3 — Timeout de seguridad (prevención de spinners futuros)

```typescript
const [timedOut, setTimedOut] = useState(false);

useEffect(() => {
  const t = setTimeout(() => setTimedOut(true), 15_000); // 15 segundos
  return () => clearTimeout(t);
}, []);

// Si timed out y aún cargando → mostrar error en lugar de spinner
if (timedOut && loading) → <WorkspaceErrorScreen error={new Error('Tiempo de carga excedido')} />
```

---

## ORDEN DE APLICACIÓN

1. **Aplicar migration 0120** (Fix RLS) — INMEDIATO
2. **Actualizar WorkspaceProvider.tsx** — INMEDIATO
3. Verificar que el login funciona
4. Investigar por qué el status del usuario era != 'active' (audit_log)

---

## DIAGNÓSTICO DEL ESTADO ACTUAL DEL USUARIO

Para saber exactamente qué status tiene el usuario bloqueado, ejecutar en SQL Editor:

```sql
-- Ver status del perfil del usuario bloqueado
SELECT id, email, status, role, workspace_id, updated_at
FROM profiles
WHERE email = 'email-del-usuario@ejemplo.com';

-- Ver audit_log de cambios a ese perfil
SELECT *
FROM audit_log
WHERE entity_type = 'profiles'
  AND entity_id = 'UUID-DEL-PERFIL'
ORDER BY created_at DESC
LIMIT 20;
```

Si `status = 'removed'` o `status = 'invited'`, el fix de RLS resolverá el problema.  
Si el perfil no existe en absoluto, el problema es diferente (trigger de signup falló).
