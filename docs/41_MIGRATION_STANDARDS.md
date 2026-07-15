# MIGRATION STANDARDS — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Estándares para crear y gestionar migraciones de base de datos
> Historial: `supabase/migrations/0001-0149`

---

## 1. REGLAS ABSOLUTAS

1. **Nunca modificar una migration ya ejecutada en producción** — crear una nueva migration
2. **Toda migration debe ser idempotente** — usar `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
3. **Nunca hardcodear IDs de producción** — los UUIDs de datos se insertan via seed separado
4. **Toda migration pasa por staging primero**
5. **No crear migrations sin haber leído el estado actual del schema**

---

## 2. NAMING CONVENTION

```
NNNN_descripcion_concisa.sql

Formato:
  - NNNN: número secuencial de 4 dígitos, comenzando desde el siguiente a 0149
  - descripcion: snake_case, verbo primero
  - Máximo 50 caracteres total

Ejemplos correctos:
  0150_ai_memory_schema.sql
  0151_add_loyalty_points_to_clients.sql
  0152_memory_engine.sql

Ejemplos incorrectos:
  0150_schema.sql                              ❌ (demasiado genérico)
  0150-ai-memory-schema.sql                    ❌ (guiones en lugar de guión bajo)
  0150_Add_AI_Memory_Schema_For_Agents.sql     ❌ (PascalCase)
```

---

## 3. ESTRUCTURA DE UNA MIGRATION

```sql
-- ============================================================================
-- NNNN — nombre_descriptivo: [Una línea de descripción]
-- ============================================================================
-- Contexto: [Por qué se necesita esta migration]
-- Sprint: [Sprint N]
-- Decisiones aprobadas:
--   - [Decisión 1]
--   - [Decisión 2]
-- ============================================================================

-- ─── 1. Crear tabla ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nueva_tabla (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Triggers ──────────────────────────────────────────────────────────────

CREATE TRIGGER trg_nueva_tabla_updated_at
  BEFORE UPDATE ON public.nueva_tabla
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. Índices ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_nueva_tabla_company
  ON public.nueva_tabla(company_id);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members select nueva_tabla"
  ON public.nueva_tabla FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE workspace_id = nueva_tabla.company_id
        AND id = auth.uid()
    )
  );

-- ─── 5. Comentarios ───────────────────────────────────────────────────────────

COMMENT ON TABLE public.nueva_tabla IS 'Sprint N: descripción del propósito.';
```

---

## 4. TIPOS DE MIGRATIONS POR SEGURIDAD

### 4.1 Seguras (ejecutar en cualquier momento)

```sql
-- Agregar columna nullable
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;

-- Agregar columna con DEFAULT
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'direct';

-- Crear tabla nueva
CREATE TABLE IF NOT EXISTS nueva_tabla (...);

-- Crear índice concurrentemente (no bloquea)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nuevo ON tabla(columna);

-- Crear función/RPC
CREATE OR REPLACE FUNCTION nueva_funcion() ...

-- Crear política RLS
CREATE POLICY "..." ON tabla ...
```

### 4.2 Con cuidado (ejecutar en ventana de mantenimiento)

```sql
-- Eliminar columna (irreversible)
ALTER TABLE clients DROP COLUMN IF EXISTS columna_antigua;

-- Cambiar tipo de columna (puede fallar si hay datos)
ALTER TABLE quotes ALTER COLUMN total TYPE NUMERIC(14,2);

-- Eliminar tabla (irreversible)
DROP TABLE IF EXISTS tabla_antigua;

-- Eliminar índice
DROP INDEX IF EXISTS idx_viejo;
```

### 4.3 Peligrosas (verificar y testear exhaustivamente)

```sql
-- Cambiar columna NOT NULL a NOT NULL con DEFAULT en tabla grande
-- → Bloquea escrituras mientras recorre toda la tabla

-- Renombrar tabla o columna (puede romper código que no se actualizó)

-- Agregar UNIQUE constraint en tabla grande
-- → Escanea toda la tabla
```

---

## 5. MIGRATIONS PENDIENTES (conocidas)

| Número | Nombre | Estado | Prioridad |
|---|---|---|---|
| 0028 | (migración pendiente) | ⚠️ Pendiente de ejecutar | Alta (TD-C03) |
| 0150 | ai_capability_registry UI connection | Planificado | Media |
| 0151 | ai_prompt_versioning_observability UI | Planificado | Media |
| 0152 | memory_engine | Planificado | Media |

---

## 6. PROCESO PARA CREAR UNA NUEVA MIGRATION

```bash
# 1. Verificar qué número sigue
ls supabase/migrations/ | tail -5

# 2. Crear el archivo (número: 0150 si el último es 0149)
touch supabase/migrations/0150_descripcion.sql

# 3. Escribir la migration siguiendo el template de sección 3

# 4. Probar en development local
supabase db reset  # Aplica todas las migrations desde cero

# 5. Verificar en staging
supabase db push --db-url $STAGING_DB_URL

# 6. Si todo OK, incluir en el PR

# 7. Apply en producción durante el deploy (ver Release Strategy)
supabase db push --db-url $PRODUCTION_DB_URL
```

---

## 7. ROLLBACK DE MIGRATIONS

Supabase no tiene rollback automático de migrations. Si una migration falla:

```bash
# Opción 1: Si la migration es aditiva (ADD COLUMN, CREATE TABLE)
# → Es seguro. La migration nueva puede revertir:
ALTER TABLE nueva_tabla DROP COLUMN IF EXISTS columna_erronea;

# Opción 2: Si la migration es destructiva y ya ejecutó
# → Restore desde backup de Supabase (ver Disaster Recovery Guide)

# Opción 3: Para migrations que fallaron a mitad
# → Ejecutar la parte restante manualmente, luego agregar migration de cleanup
```

---

## 8. SEEDS VS MIGRATIONS

```
migrations/   ← Schema (DDL) — CREATE TABLE, ALTER TABLE, CREATE FUNCTION, RLS
               ← Data inmutable de sistema (plans, plan_features)
               
seeds/        ← Datos de desarrollo (empresas de prueba, usuarios de test)
(NO commitear datos de producción)
```

---

*Ver: `docs/40_DATABASE_STANDARDS.md` para convenciones de schema*
*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para rollback de migrations catastróficas*
*Ver: `supabase/migrations/0062_integrations_schema.sql` como ejemplo de migration bien documentada*
