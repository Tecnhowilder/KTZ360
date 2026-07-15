# MULTI-TENANT GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Arquitectura y patrones de multi-tenancy en Shelwi
> Modelo: Shared Database, Tenant Isolation via RLS

---

## 1. MODELO DE MULTI-TENANCY

Shelwi usa el modelo **Shared Database + Row-Level Security**:

```
Una sola base de datos Postgres
  ├── Empresa A (workspace_id: uuid-a)
  │     ├── clients WHERE company_id = uuid-a
  │     ├── quotes WHERE company_id = uuid-a
  │     └── ... (RLS filtra automáticamente)
  │
  └── Empresa B (workspace_id: uuid-b)
        ├── clients WHERE company_id = uuid-b
        └── ... (RLS filtra automáticamente)
```

**Ventajas:** Operaciones simples, un solo Supabase project, menos costo.
**Garantía:** RLS de Postgres asegura aislamiento incluso con bugs en el código.

---

## 2. JERARQUÍA DE ENTIDADES

```
auth.users (Supabase Auth)
  │
  └── profiles
        │
        └── workspaces (= la empresa en Shelwi)
              │
              ├── team_members (usuarios autorizados)
              ├── clients
              ├── quotes
              ├── invoices
              ├── tasks
              └── ... (todas las tablas de negocio)
```

**Terminología:**
- `company_id` = `workspace_id` = mismo UUID. Históricamente se llaman diferente en el código pero apuntan al mismo `workspaces.id`.
- Un usuario puede pertenecer a múltiples workspaces (multi-empresa).

---

## 3. PATRON DE AISLAMIENTO POR TABLA

### 3.1 Toda tabla nueva debe seguir este patrón

```sql
CREATE TABLE public.nueva_tabla (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- ... columnas de negocio ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice obligatorio para performance
CREATE INDEX idx_nueva_tabla_company ON public.nueva_tabla(company_id);

-- RLS obligatorio
ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: miembros del workspace pueden ver
CREATE POLICY "workspace members select nueva_tabla"
  ON public.nueva_tabla FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = nueva_tabla.company_id
        AND id = auth.uid()
    )
  );

-- Policy INSERT/UPDATE: solo roles con permisos
CREATE POLICY "authorized roles manage nueva_tabla"
  ON public.nueva_tabla FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = nueva_tabla.company_id
        AND id = auth.uid()
        AND role IN ('owner', 'admin', 'manager')
        AND status = 'active'
    )
  );
```

### 3.2 La función RPC estándar: current_workspace_id()

```sql
-- Obtener el workspace_id del usuario actual (desde su profile)
CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Uso en RLS policy (alternativa más simple)
USING (company_id = current_workspace_id())
```

---

## 4. QUERIES — REGLAS

### 4.1 Frontend

```typescript
// ✅ Correcto — company_id en el query
const { data: clients } = await supabase
  .from('clients')
  .select('*')
  .eq('company_id', workspaceId);

// También correcto — RLS filtra automáticamente (pero es más explícito con el filtro)
const { data: clients } = await supabase
  .from('clients')
  .select('*');
// RLS aplica WHERE company_id = current_workspace_id() automáticamente

// ❌ RIESGO — query de otra empresa (RLS lo bloqueará, pero no debe intentarse)
const { data } = await supabase
  .from('clients')
  .eq('company_id', otherWorkspaceId);  // devolverá [] por RLS, no error
```

### 4.2 Edge Functions

```typescript
// Edge Functions usan service_role (bypass RLS) — DEBEN filtrar manualmente

// ✅ Correcto — filtrar siempre con workspace_id de DB (Zero Trust)
const workspaceId = profile.workspace_id;  // de DB, no del request
const { data: clients } = await admin
  .from('clients')
  .select('*')
  .eq('company_id', workspaceId);  // filtro manual obligatorio

// ❌ PELIGROSO — sin filtro de empresa (service_role lee todo)
const { data: allClients } = await admin.from('clients').select('*');
```

---

## 5. TABLAS PÚBLICAS (sin company_id)

Algunas tablas son comunes a todos los tenants:

| Tabla | Descripción | RLS |
|---|---|---|
| `plans` | Planes de suscripción disponibles | Public (SELECT only) |
| `plan_features` | Features por plan | Public (SELECT only) |
| `plan_limits` | Límites por plan | Public (SELECT only) |

Estas tablas no tienen `company_id` porque su contenido es global.

---

## 6. MULTI-WORKSPACE PARA UN USUARIO

Un usuario (auth.uid()) puede pertenecer a múltiples workspaces:

```sql
-- Un usuario tiene múltiples profiles (uno por workspace)
-- O un único profile con el workspace activo

-- Query para obtener todos los workspaces de un usuario
SELECT w.id, w.name, p.role
FROM profiles p
JOIN workspaces w ON w.id = p.workspace_id
WHERE p.user_id = auth.uid();
```

El frontend guarda el `active_workspace_id` en localStorage/contexto y el usuario puede hacer "switch" entre workspaces.

---

## 7. DATOS DESNORMALIZADOS POR PERFORMANCE

En algunas tablas, `company_id` se desnormaliza para que RLS funcione sin JOINs costosos:

```sql
-- quote_items hereda company_id de quotes para que RLS funcione directamente
CREATE TABLE quote_items (
  id         UUID PRIMARY KEY,
  quote_id   UUID REFERENCES quotes(id),
  company_id UUID NOT NULL,  -- desnormalizado de quotes.company_id
  -- ...
);
```

Esto es intencional y no una violación de normalización — es un patrón estándar de RLS.

---

## 8. CHECKLIST MULTI-TENANCY PARA NUEVAS FEATURES

- [ ] Nueva tabla tiene `company_id UUID NOT NULL REFERENCES workspaces(id)`
- [ ] Índice `CREATE INDEX ... ON tabla(company_id)`
- [ ] RLS habilitado: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] Policies SELECT, INSERT, UPDATE, DELETE creadas y testeadas
- [ ] Edge Functions filtran con `company_id` de DB (no del request)
- [ ] No hay queries sin filtro de empresa en service_role
- [ ] Test: datos de empresa A no son visibles desde empresa B

---

*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` Artículo III para reglas Multi-tenant*
*Ver: `docs/19_SECURITY_GOVERNANCE.md` sección de RLS para políticas existentes*
*Ver: `supabase/migrations/0003_rls.sql` para las 275+ políticas actuales*
