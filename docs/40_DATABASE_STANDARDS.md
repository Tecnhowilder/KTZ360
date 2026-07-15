# DATABASE STANDARDS — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Estándares de diseño y uso de la base de datos Postgres (Supabase)
> Fuente: `supabase/migrations/0001-0149`

---

## 1. CONVENCIONES DE NOMENCLATURA

### 1.1 Tablas

```sql
-- snake_case, plural, descriptivo
public.clients          ✅
public.quotes           ✅
public.quote_items      ✅
public.integration_credentials  ✅

-- PROHIBIDO
public.Client           ❌ (PascalCase)
public.tbl_clients      ❌ (prefijo)
public.data             ❌ (genérico)
```

### 1.2 Columnas

```sql
-- snake_case, descriptivo
id              -- UUID PK
company_id      -- FK a workspaces
created_at      -- TIMESTAMPTZ
updated_at      -- TIMESTAMPTZ
deleted_at      -- Soft delete (TIMESTAMPTZ nullable)
is_active       -- BOOLEAN (prefijo is_ para booleanos)
```

### 1.3 Funciones / RPCs

```sql
-- snake_case, verbo primero
get_dashboard_metrics()
invite_team_member()
evaluate_and_queue_automations()
current_workspace_id()
```

### 1.4 Índices

```sql
-- Formato: idx_[tabla]_[columnas]
idx_clients_company
idx_quotes_company_status
idx_audit_log_company_created_at
```

### 1.5 Políticas RLS

```sql
-- Formato: "[roles] [action] [tabla]"
"workspace members select clients"
"owner admin manage integrations"
"deny_all_direct_access_credentials"
```

---

## 2. ESTRUCTURA ESTÁNDAR DE TABLA

```sql
CREATE TABLE public.ejemplo (
  -- 1. Primary key siempre UUID
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 2. FK multi-tenant obligatorio (ON DELETE CASCADE)
  company_id      UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- 3. Columnas de negocio
  name            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive')),
  config          JSONB       NOT NULL DEFAULT '{}',
  amount          NUMERIC(14,2),

  -- 4. FK a usuarios (cuando aplica)
  created_by      UUID        REFERENCES auth.users(id),
  assigned_to     UUID        REFERENCES auth.users(id),

  -- 5. Soft delete (para entidades principales)
  deleted_at      TIMESTAMPTZ,

  -- 6. Timestamps (siempre al final)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER trg_ejemplo_updated_at
  BEFORE UPDATE ON public.ejemplo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índice obligatorio
CREATE INDEX idx_ejemplo_company ON public.ejemplo(company_id);
CREATE INDEX idx_ejemplo_created_at ON public.ejemplo(company_id, created_at DESC);

-- RLS obligatorio
ALTER TABLE public.ejemplo ENABLE ROW LEVEL SECURITY;
```

---

## 3. TIPOS DE DATOS — GUÍA

| Dato | Tipo recomendado | Ejemplo |
|---|---|---|
| IDs | UUID | `gen_random_uuid()` |
| Nombres, textos | TEXT | — |
| Dinero, cantidades | NUMERIC(14,2) | `99.99` |
| Porcentajes | NUMERIC(5,2) | `19.00` |
| Fechas con hora | TIMESTAMPTZ | `now()` |
| Solo fechas | DATE | `'2025-12-31'` |
| Flags booleanos | BOOLEAN | `true/false` |
| Enumeraciones | TEXT con CHECK | `CHECK (status IN (...))` |
| Configuración flexible | JSONB | `'{}'::jsonb` |
| Texto largo | TEXT | No VARCHAR — Postgres no penaliza |
| IDs externos | TEXT | `alegra_id TEXT` |

**NOTA:** No usar `VARCHAR(n)` — en Postgres, `TEXT` tiene el mismo performance y es más flexible.

---

## 4. DINERO — REGLAS CRÍTICAS

```sql
-- ✅ NUMERIC(14,2) para todos los campos monetarios
amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
grand_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
tax_percent     NUMERIC(5,2)  NOT NULL DEFAULT 0,

-- ❌ NUNCA FLOAT o DOUBLE para dinero (errores de precisión)
amount FLOAT  -- 0.1 + 0.2 = 0.30000000000000004
```

---

## 5. RELACIONES Y FOREIGN KEYS

```sql
-- ✅ ON DELETE CASCADE para datos dependientes del workspace
company_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE

-- ✅ ON DELETE SET NULL para referencias opcionales
assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL

-- ✅ ON DELETE RESTRICT para relaciones críticas (no borrar si tiene hijos)
-- (es el comportamiento default en Postgres)
client_id UUID NOT NULL REFERENCES clients(id)
```

---

## 6. FUNCIONES SECURITY DEFINER

```sql
-- Template para funciones que requieren ejecutar como superuser
CREATE OR REPLACE FUNCTION public.mi_funcion(
  p_workspace_id UUID,
  p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- OBLIGATORIO para prevenir search_path injection
AS $$
BEGIN
  -- 1. Verificar que el caller tiene acceso al workspace
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE workspace_id = p_workspace_id AND id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 2. Lógica de negocio
  -- ...

  RETURN jsonb_build_object('ok', true);
END;
$$;
```

---

## 7. SOFT DELETE

Para entidades principales (clients, quotes, employees, etc.) usar soft delete:

```sql
-- En lugar de DELETE, actualizar deleted_at
UPDATE clients SET deleted_at = now() WHERE id = $1 AND company_id = $2;

-- Siempre filtrar deleted_at en queries
SELECT * FROM clients WHERE company_id = $1 AND deleted_at IS NULL;

-- Índice para excluir eliminados eficientemente
CREATE INDEX idx_clients_active ON clients(company_id) WHERE deleted_at IS NULL;
```

---

## 8. ENUMERACIONES — CONVENCIÓN

Usar TEXT con CHECK constraint (no ENUM type):

```sql
-- ✅ TEXT con CHECK — flexible para agregar valores via migration
status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void'))

-- ❌ ENUM type — requiere ALTER TYPE para agregar valores
status invoice_status_enum  -- difícil de modificar en producción
```

---

## 9. TRIGGERS ESTÁNDAR

```sql
-- Función set_updated_at (ya existe en el proyecto)
-- Se aplica a todas las tablas con updated_at
CREATE TRIGGER trg_[tabla]_updated_at
  BEFORE UPDATE ON public.[tabla]
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

*Ver: `supabase/migrations/0001-0149` para ejemplos de implementación real*
*Ver: `docs/41_MIGRATION_STANDARDS.md` para cómo crear migrations*
*Ver: `docs/34_MULTI_TENANT_GUIDE.md` para patrones de RLS*
