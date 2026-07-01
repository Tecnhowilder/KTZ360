# MIGRATION GOVERNANCE — Shelwi / Brivia App

Documento oficial de gobernanza de migraciones SQL del proyecto.
**Versión 1.0 — Efectiva desde Sprint 25**

---

## 1. Principios fundamentales

| # | Principio |
|---|---|
| 1 | Las migraciones aplicadas en producción son **inmutables**. |
| 2 | Nunca se renumeran migraciones históricas. |
| 3 | Nunca se reutilizan números faltantes (huecos históricos). |
| 4 | Toda nueva migración usa el siguiente número libre disponible. |
| 5 | Todo dato de QA o seed temporal queda fuera de `migrations/`. |
| 6 | El pipeline de CI debe bloquear prefijos duplicados, numeración regresiva y nombres genéricos. |
| 7 | Cada sprint reserva previamente su número en `supabase/migration_registry.md`. |

---

## 2. Estructura oficial del directorio `supabase/`

```
supabase/
├── migrations/         ← Solo cambios permanentes de schema, RLS, RPC, índices, triggers
│   └── NNNN_descripcion_compuesta.sql
│
├── seeds/              ← Datos iniciales necesarios para que el sistema funcione
│   └── (datos de referencia, configuraciones base)
│
├── qa/                 ← Datos de prueba, usuarios QA, escenarios temporales
│   └── NNN_qa_escenario.sql
│
├── scripts/            ← Auditorías, backfills manuales, herramientas de soporte
│   └── nombre_descriptivo.sql
│
├── functions/          ← Edge Functions (Deno)
├── tests/              ← Validaciones SQL del schema
├── migration_registry.md   ← Registro de reservas por sprint
├── seed.sql            ← Seed principal
└── config.toml         ← Configuración del proyecto Supabase
```

---

## 3. Reglas de naming

### Formato obligatorio

```
NNNN_descripcion_compuesta.sql
```

- `NNNN` = 4 dígitos numéricos, cero-padding (`0124`, no `124`).
- `descripcion_compuesta` = mínimo 2 palabras separadas por `_`.
- La descripción debe comunicar **el objetivo**, no la acción genérica.

### Ejemplos válidos ✅

```
0124_marketplace_webhook_schema.sql
0125_ia_voice_credits_increase.sql
0126_rls_orders_owner_isolation.sql
0127_fix_invitation_expiry_logic.sql    ← "fix" válido porque va con contexto
```

### Ejemplos inválidos ❌

```
0124_fix.sql            ← nombre genérico de una sola palabra
0124_update.sql         ← genérico
0124_changes.sql        ← sin contexto
0124.sql                ← sin nombre
migration_0124.sql      ← formato incorrecto
```

### Palabras bloqueadas como nombre único

Las siguientes palabras son válidas **en combinación** pero bloqueadas **solas**:

`fix`, `temp`, `test`, `update`, `add`, `new`, `change`, `misc`, `other`, `wip`, `todo`, `hotfix`, `patch`

---

## 4. Huecos históricos — no reutilizar jamás

| Número | Razón |
|---|---|
| **0028** | Saltado durante desarrollo Sprint 4. Forma parte de la historia del proyecto. |
| **0121** | Saltado durante desarrollo Sprint 25. Ídem. |

Estos números **nunca deben asignarse a nuevas migraciones**, aunque estén vacíos.
La numeración siempre es estrictamente ascendente desde el máximo existente.

---

## 5. Proceso de creación de una migración

```
PASO 1 — Reservar número
  └─ Editar supabase/migration_registry.md
  └─ Cambiar estado de la próxima fila disponible a "Reservado por [nombre]"
  └─ Abrir PR con solo este cambio
  └─ Esperar aprobación si el número tiene conflicto con otro sprint

PASO 2 — Crear el archivo
  └─ Nombre: NNNN_descripcion_compuesta.sql (2+ palabras)
  └─ Cabecera obligatoria en el archivo (ver plantilla §6)

PASO 3 — Validar localmente
  └─ ./scripts/check-migrations.sh
  └─ Sin errores antes de hacer push

PASO 4 — PR y revisión
  └─ El CI ejecuta check-migrations.sh automáticamente
  └─ Revisión obligatoria de un segundo par de ojos para migraciones de schema

PASO 5 — Deploy
  └─ supabase db push --linked
  └─ Verificar en production que la migración aparece en supabase_migrations
  └─ Actualizar estado en migration_registry.md a "Aplicado (prod)"
```

---

## 6. Plantilla de migración

Todo nuevo archivo de migración debe comenzar con esta cabecera:

```sql
-- ============================================================================
-- NNNN — nombre_descriptivo: Descripción en una línea
-- ============================================================================
-- Sprint: XX
-- Owner: [nombre del responsable]
-- Fecha: YYYY-MM-DD
--
-- Objetivo:
--   Describe qué se crea, modifica o elimina, y por qué.
--
-- Dependencias:
--   - Tabla X (creada en 00NN_xxx.sql)
--   - RPC Y (creada en 00MM_yyy.sql)
--
-- Compatibilidad:
--   - Idempotente: SÍ / NO
--   - Reversible: SÍ / NO (y cómo si aplica)
--
-- Zero Trust: [describe el mecanismo de aislamiento multi-tenant]
-- ============================================================================
```

---

## 7. Separación de responsabilidades por directorio

### `migrations/` — Qué puede contener

| Tipo | ¿Puede ir en migrations/? |
|---|---|
| `CREATE TABLE` | ✅ Sí |
| `ALTER TABLE` | ✅ Sí |
| `CREATE INDEX CONCURRENTLY` | ✅ Sí |
| `CREATE OR REPLACE FUNCTION` (RPC) | ✅ Sí |
| `CREATE POLICY` / `ALTER POLICY` | ✅ Sí |
| `CREATE TRIGGER` | ✅ Sí |
| `INSERT` de datos de configuración permanentes | ✅ Sí (planes, features, costos de operaciones IA) |
| `INSERT` de usuarios de prueba | ❌ No → `supabase/qa/` |
| `INSERT` de datos de demo / seed de QA | ❌ No → `supabase/qa/` |
| Scripts de auditoría / diagnóstico | ❌ No → `supabase/scripts/` |
| Scripts de cleanup / rollback manual | ❌ No → `supabase/qa/` o `supabase/scripts/` |

---

## 8. Configuración del CI

Añadir el siguiente step en el pipeline de GitHub Actions (o equivalente):

```yaml
# .github/workflows/ci.yml
- name: Validate migrations
  run: |
    chmod +x scripts/check-migrations.sh
    ./scripts/check-migrations.sh
```

Para bloquear también warnings (recomendado en main):

```yaml
- name: Validate migrations (strict)
  run: |
    chmod +x scripts/check-migrations.sh
    ./scripts/check-migrations.sh --strict
```

---

## 9. Resolución de colisiones de prefijo

Si al mergear dos ramas se detecta que comparten prefijo:

```
CORRECTO:
  1. Identificar cuál llegó después (por fecha de commit o criterio del Tech Lead).
  2. Renumbrar la migración tardía al siguiente número libre.
  3. Actualizar migration_registry.md.
  4. NO dejar stubs vacíos (a diferencia del caso histórico 0107).

INCORRECTO:
  ✖ Mergear ignorando la colisión.
  ✖ Renumerar la migración que llegó primero.
  ✖ Reutilizar un hueco histórico (0028, 0121).
```

---

## 10. Registro de decisiones históricas

| Prefijo | Tipo | Resolución |
|---|---|---|
| 0021 (×2) | Seed + Cleanup QA | En producción. Efecto neto: nulo. Futuro: mover a `qa/`. |
| 0034 (×2) | Dos tablas distintas | En producción. Orden alfabético correcto. Sin dependencia cruzada. |
| 0053 (×2) | Admin RPCs + Evidences | En producción. Orden correcto. Sin dependencia cruzada. |
| 0078 (×2) | Growth schema + Performance | En producción. Independientes. |
| 0092 (×2) | CX RPCs + RLS hardening | En producción. RPCs antes de hardening = correcto. |
| 0097 (×2) | Enterprise plan data + Sprint24 schema | En producción. Independientes. |
| 0098 (×2) | Plans v3 prices + Sprint24 RPCs | En producción. Independientes. |
| 0102 (×2) | Custom permissions + Hardening prod | En producción. Independientes. |
| 0103 (×2) | Portal fix + Seed test v2 | En producción. Independientes. |
| 0104 (×2) | Orders search + Phone country | En producción. Independientes. |
| 0105 (×2) | IA create flow + State machine | En producción. Orden alfabético correcto. |
| 0107 (×2) | Invite token fix + STUB | Stub vacío en `0107_pedidos_production_ready.sql`. Contenido real en `0111_pedidos_production_ready.sql`. Correcto. |

---

## Historial de este documento

| Versión | Fecha | Autor | Cambios |
|---|---|---|---|
| 1.0 | 2026-06-30 | Tech Lead / Claude Code | Creación inicial — derivado de auditoría Fase 2 |
