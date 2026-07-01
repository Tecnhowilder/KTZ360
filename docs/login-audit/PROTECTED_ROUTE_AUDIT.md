# AUDITORÍA PROTECTED ROUTE — Bugs de Manejo de Estado

## WorkspaceProvider.tsx — El Bug Central

### Estado actual (buggy)

```typescript
// ❌ Solo tiene dos estados: loading o loaded
interface WorkspaceContextValue  { profile, workspace, company, planName; loading: false }
interface WorkspaceContextLoading { loading: true }

// ❌ Condición problemática:
const value =
  !loading && profileQuery.data && ...
    ? { ...data, loading: false }   // Solo cuando TODOS los datos existen
    : { loading: true };            // ← También cuando hay ERROR
```

### Tabla de estados: lo que debería vs lo que ocurre

| Situación | `isLoading` | `isError` | `data` | Valor actual | Valor correcto |
|-----------|-------------|-----------|--------|-------------|---------------|
| Cargando inicial | true | false | undef | `{loading:true}` | `{loading:true}` ✅ |
| Datos OK | false | false | Object | `{loading:false,data}` | `{loading:false,data}` ✅ |
| Query falló | false | true | undef | `{loading:true}` ❌ | `{loading:false,error}` |
| Reintentando | false | true | undef | `{loading:true}` ❌ | `{loading:true}` |
| Timeout | false | true | undef | `{loading:true}` ❌ | `{loading:false,error}` |

### El código problemático exacto

```typescript
// WorkspaceProvider.tsx líneas 86-98

const loading =
  profileQuery.isLoading || workspaceQuery.isLoading ||
  companyQuery.isLoading || planQuery.isLoading;
// ↑ FALSE cuando los queries fallaron (isLoading = false después del error)

const value: WorkspaceContextValue | WorkspaceContextLoading =
  !loading && profileQuery.data && workspaceQuery.data &&
  companyQuery.data && planQuery.data
    ? { profile: profileQuery.data, ..., loading: false }
    : { loading: true };
// ↑ Retorna { loading: true } tanto cuando CARGANDO como cuando ERROR
```

### WorkspaceGate.tsx — Sin salida del error

```typescript
function WorkspaceGate({ children }) {
  const ws = useWorkspaceMaybe();
  if (ws.loading) return <FullScreenSpinner />;  // ← Atrapado aquí para siempre
  // ↑ No hay else if (ws.error) → no hay pantalla de error
  // ... el resto nunca se ejecuta si hay error
}
```

## Corrección propuesta (mínima)

### 1. Agregar estado de error al contexto

```typescript
interface WorkspaceContextError {
  profile?: undefined;
  workspace?: undefined;
  loading: false;
  error: Error;
}
```

### 2. Detectar error en el value

```typescript
const isError = profileQuery.isError || workspaceQuery.isError ||
                companyQuery.isError || planQuery.isError;
const firstError = profileQuery.error || workspaceQuery.error ||
                   companyQuery.error || planQuery.error;

const value =
  !loading && !isError && profileQuery.data && workspaceQuery.data && ...
    ? { ...data, loading: false }
    : isError
    ? { loading: false, error: firstError as Error }
    : { loading: true };
```

### 3. Manejar error en WorkspaceGate

```typescript
function WorkspaceGate({ children }) {
  const ws = useWorkspaceMaybe();
  if (ws.loading) return <FullScreenSpinner />;
  if ('error' in ws && ws.error) {
    return <ErrorScreen error={ws.error} />;
  }
  // ... resto igual
}
```

### 4. Timeout de seguridad

```typescript
// Nunca dejar spinner más de 15 segundos
const [timedOut, setTimedOut] = useState(false);
useEffect(() => {
  const t = setTimeout(() => setTimedOut(true), 15_000);
  return () => clearTimeout(t);
}, []);

if (timedOut && loading) {
  return <ErrorScreen error={new Error('La carga tardó demasiado. Verifica tu conexión.')} />;
}
```
