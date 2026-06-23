# AUDIT DE RENDIMIENTO Y ESCALABILIDAD — SHELWI
**Fecha:** 22 de junio de 2026  
**Metodología:** Read-only. Sin modificaciones. Basado en evidencia de código real.  
**Proyecto:** `jufhoywqixzfaqhhwymp`

---

## FASE 0 — INVENTARIO DEL SISTEMA

| Categoría | Cantidad |
|-----------|---------|
| Migraciones SQL | 77 archivos (0001 → 0077) |
| Tablas principales | ~45 tablas |
| RPCs / Functions | ~90 funciones |
| Triggers | ~25 triggers |
| Edge Functions | 10 funciones activas |
| Servicios TypeScript | 37 archivos |
| Hooks React | 18 archivos |
| Vistas React | 27 componentes |

### Tablas más grandes en producción (estimado)
| Tabla | Crecimiento estimado | Riesgo |
|-------|---------------------|--------|
| `quotes` | ~500 filas/workspace/año | 🟠 ALTO |
| `audit_log` | ~5.000 filas/workspace/año | 🔴 CRÍTICO |
| `integration_events` | ~3.000 filas/workspace/año | 🟠 ALTO |
| `gps_events` | ~10.000 filas/workspace/año (PREMIUM) | 🔴 CRÍTICO |
| `client_timeline_events` | ~2.000 filas/workspace/año | 🟡 MEDIO |
| `notifications` | ~1.000 filas/workspace/año | 🟡 MEDIO |
| `ai_usage` | ~500 filas/workspace/año | 🟢 BAJO |

---

## FASE 1 — AUDITORÍA SQL: CONSULTAS

### 1.1 `get_crm_dashboard()` — 0047_crm_rpc.sql
**Clasificación:** 🟠 ALTO

| Métrica | Valor | Problema |
|---------|-------|---------|
| SELECTs independientes | 8 | Múltiples round-trips |
| Subqueries en SELECT | 7 | Costo acumulado |
| LIMIT aplicado | ❌ No en agregaciones | Full scan potencial |
| Índices usados | `idx_quotes_workspace` | Suficiente para workspace filter |
| Detalles críticos | Línea 375-385: NOT EXISTS en `seguimientos` sin índice compuesto | `(quote_id, created_at)` |
| Detalles críticos | Línea 388-394: BETWEEN con expresión dinámica `sent_at + valid_days::interval` | **NO INDEXABLE** |

**Impacto a 1.000 workspaces:** ~8.000 queries/hora en uso normal.

---

### 1.2 `get_reports_summary()` — 0049_reports_rpc.sql
**Clasificación:** 🔴 CRÍTICO

| Métrica | Valor | Problema |
|---------|-------|---------|
| Bloques SELECT | 4 grandes | Tiempo acumulado |
| `generate_series()` + LEFT JOIN | ❌ Sí | `date_trunc()` en JOIN = NO INDEXABLE |
| Full table scans | 7 escaneos a `quotes` | Escala O(n) con quotes |
| Índice `quote_views` | ❌ Falta | JOIN sin índice en línea 125-130 |

```sql
-- PROBLEMA REAL (línea 247):
left join public.quotes q
  on q.workspace_id = p_workspace_id
  and date_trunc('month', q.created_at)::date = d.month
-- date_trunc() previene uso de índice en created_at
```

**Impacto a 1.000 workspaces:** 12 scans por workspace = 12.000 scans en reportes mensuales.

---

### 1.3 `get_executive_dashboard()` — 0049_reports_rpc.sql
**Clasificación:** 🔴 CRÍTICO

| Métrica | Valor | Problema |
|---------|-------|---------|
| JOINs | 4 | Complejidad alta |
| Subqueries anidadas | 7 | Sin LIMIT en varias |
| `jsonb_object_agg` sin LIMIT | ❌ | Memoria O(n) |
| Cálculo duplicado de totals | ❌ | Mismos datos calculados 2x |

**Impacto a 1.000 workspaces:** Es la función más pesada del sistema. Tiempo estimado: 2-5s por llamada.

---

### 1.4 `get_smart_alerts()` — 0049_reports_rpc.sql
**Clasificación:** 🟠 ALTO

| Métrica | Valor | Problema |
|---------|-------|---------|
| NOT EXISTS sin índice compuesto | ❌ | Full scan seguimientos |
| BETWEEN dinámico | ❌ | `sent_at + valid_days interval` no indexable |
| UNION de 5 alertas | ✅ OK | Correcto |

---

### 1.5 `list_orders()` — 0051_orders_rpc.sql
**Clasificación:** 🟠 ALTO

**Problema N+1 real** (líneas 175-182):
```sql
-- Se ejecuta 2 veces POR CADA ORDEN:
'work_order_count', (SELECT count(*) FROM work_orders WHERE order_id = o.id),
'work_orders_done', (SELECT count(*) FROM work_orders WHERE order_id = o.id AND status = 'finalizada')
-- Con 100 órdenes = 200 subqueries innecesarias
```

**Impacto a 1.000 workspaces:** 100 órdenes × 2 subqueries × 1.000 ws = 200.000 queries potenciales.

---

### 1.6 `get_operations_dashboard()` — 0051_orders_rpc.sql
**Clasificación:** 🟡 MEDIO — bien estructurado, LIMIT 5 aplicado.

### 1.7 `admin_get_audit_log()` — 0053_admin_sprint9.sql
**Clasificación:** 🟡 MEDIO — usa OFFSET paginación (lento en páginas altas).

### 1.8 `admin_get_ai_usage_global()` — 0053_admin_sprint9.sql
**Clasificación:** 🟢 BAJO — 1 JOIN simple, LIMIT 50.

### 1.9 `get_integration_status()` — 0063_integrations_rpc.sql
**Clasificación:** 🟢 BAJO — 2 subqueries con LIMIT 20.

---

## FASE 2 — ÍNDICES

### 2.1 Índices EXISTENTES (correctos)
| Tabla | Índice | Estado |
|-------|--------|--------|
| `quotes` | `idx_quotes_workspace` (workspace_id) WHERE deleted_at IS NULL | ✅ |
| `clients` | `idx_clients_workspace` (workspace_id) WHERE deleted_at IS NULL | ✅ |
| `orders` | `idx_orders_workspace` + `idx_orders_status` | ✅ |
| `work_orders` | `idx_work_orders_workspace` + `idx_work_orders_order` | ✅ |
| `seguimientos` | `idx_seguimientos_workspace` + `idx_seguimientos_quote` | ✅ |
| `audit_log` | `idx_audit_log_workspace` (workspace_id, created_at DESC) | ✅ |
| `ai_usage` | `idx_ai_usage_workspace` (workspace_id, created_at DESC) | ✅ |
| `gps_events` | `idx_gps_events_workspace` | ✅ |

### 2.2 Índices FALTANTES (ordenados por impacto)

| Tabla | Columnas | Por qué falta | Impacto | Urgencia |
|-------|----------|--------------|---------|---------|
| `quotes` | `(workspace_id, commercial_status, created_at DESC)` WHERE deleted_at IS NULL | Afecta pipeline, funnel, alerts, crm_dashboard | 🔴 | INMEDIATA |
| `seguimientos` | `(quote_id, created_at DESC)` | NOT EXISTS en crm_dashboard línea 375 | 🟠 | ESTA SEMANA |
| `quote_views` | `(quote_id)` o `(quote_id, opened_at DESC)` | JOIN sin índice en get_reports_summary | 🟠 | ESTA SEMANA |
| `notifications` | `(workspace_id, is_read, created_at DESC)` | Fetch de notificaciones sin índice compuesto | 🟡 | 2 SEMANAS |
| `integration_events` | `(workspace_id, status, execute_after)` WHERE status IN ('pending','failed') | Worker polling sin índice | 🟠 | ESTA SEMANA |
| `audit_log` | `(action, created_at DESC)` | Filtro por acción en admin panel | 🟡 | 2 SEMANAS |
| `audit_log` | `(user_id, created_at DESC)` | Filtro por usuario en admin panel | 🟡 | 2 SEMANAS |
| `gps_events` | `(work_order_id, created_at DESC)` | Consultas operativas por OT | 🟡 | 2 SEMANAS |
| `ai_usage` | `(workspace_id, period_month, feature)` | Dashboard de créditos agrupado | 🟡 | 2 SEMANAS |
| `work_logs` | `(order_id, created_at DESC)` + `(work_order_id, created_at DESC)` | Bitácora operativa sin índice | 🟡 | 2 SEMANAS |

---

## FASE 3 — TRIGGERS

### Mapa de cascadas en `work_orders.status UPDATE`:
```
UPDATE work_orders.status
├── trg_work_orders_on_status_change     → 1 INSERT notifications
├── trg_integrations_work_order_status   → hasta 6 RPC calls → 9 INSERTs integration_events
├── trg_loyalty_on_work_order_complete   → 3 queries + 1 RPC
└── trg_survey_on_work_order_complete    → 4 queries + 1 RPC

Total: 1 UPDATE → hasta 18 operaciones adicionales en cascada
```

### Clasificación de triggers por impacto:

| Trigger | Tabla | Operaciones | Severidad |
|---------|-------|-------------|-----------|
| `trg_integrations_work_order_status` | work_orders | ≤6 RPC calls en serie | 🔴 CRÍTICO |
| `trg_integrations_order_created` | orders | 3 RPC calls en serie | 🔴 CRÍTICO |
| `trg_quote_views_on_insert` | quote_views | 4 queries + UPDATE + 3 INSERTs | 🟠 ALTO |
| `trg_workspace_storage_alert` | workspaces | 4 queries + 1 RPC en cada UPDATE | 🟠 ALTO |
| `trg_quotes_timeline_on_status` | quotes | 2 queries + 2 INSERTs | 🟡 MEDIO |
| `trg_quote_events_on_decision` | quote_events | 5 queries (puede cascada) | 🟡 MEDIO |
| `trg_seguimientos_on_insert` | seguimientos | 3 queries | 🟡 MEDIO |
| `trg_integrations_seguimiento` | seguimientos | 2 RPC calls | 🟡 MEDIO |
| `trg_integrations_recordatorio` | recordatorios | 2 RPC calls | 🟡 MEDIO |
| `trg_loyalty_on_work_order_complete` | work_orders | 3 queries + 1 RPC | 🟡 MEDIO |
| `trg_orders_after_insert` | orders | 3 queries | 🟢 BAJO |
| `trg_work_orders_after_insert` | work_orders | 3 queries | 🟢 BAJO |
| `trg_quotes_timeline_on_insert` | quotes | 1 INSERT | 🟢 BAJO |
| `prevent_quote_soft_delete_with_order` | quotes | 1 EXISTS check | 🟢 BAJO |

**Hallazgo crítico:** Un solo `UPDATE work_orders SET status = 'finalizada'` puede disparar hasta **18 operaciones adicionales** en 4 triggers distintos.

---

## FASE 4 — EDGE FUNCTIONS

| Función | HTTP Calls | Tiempo Estimado | Riesgo Timeout | Severidad |
|---------|-----------|----------------|----------------|-----------|
| `integration-worker` | 1-8 por run | 15-30s (20 eventos) | 🔴 ALTO (>30s posible) | 🔴 CRÍTICO |
| `ai-proxy` | 1 (Gemini) | 3-6s | 🟢 Bajo | 🟢 BAJO |
| `generate-report` | 0 (solo DB) | 2-5s normal / >30s si dataset enorme | 🟡 Medio con datos grandes | 🟡 MEDIO |
| `oauth-callback` | 1 (token exchange) | 1-3s | 🟢 Bajo | 🟢 BAJO |
| `automation-scheduler` | 1 (POST a worker) | 7-10s | 🟢 Bajo | 🟢 BAJO |
| `create-checkout` | 1 (MP API) | 1-2s | 🟢 Bajo | 🟢 BAJO |
| `send-email` | 1 (Resend API) | 1-2s | 🟢 Bajo | 🟢 BAJO |
| `connect-integration` | 1 (Alegra API) | 1-2s | 🟢 Bajo | 🟢 BAJO |

**Problema real en `integration-worker`:**
```typescript
const MAX_EVENTS_PER_RUN = 20; // línea aprox. 22
// 20 eventos × 1.5s promedio = 30s → límite de Supabase Edge Functions
// 20 eventos Drive sync × 3s = 60s → TIMEOUT GARANTIZADO
```

---

## FASE 5 — FRONTEND: HOOKS Y REACT QUERY

### Problemas detectados:

| Hook | Problema | Severidad |
|------|---------|-----------|
| `useAICredits` | `refetchInterval: 60_000` — polling cada 60s activo | 🟠 ALTO |
| `useQuotes` (vía useDerivedQuotes) | `staleTime: 0` — refetch en cada mount | 🟡 MEDIO |
| Dashboard desktop | 3-5 queries en paralelo al montar | 🟡 MEDIO |
| MobileDashboard | Múltiples hooks anidados en sub-componentes | 🟡 MEDIO |

### Detalle del polling en useAICredits:
```typescript
// src/hooks/useAICredits.ts
refetchInterval: 60_000,  // Llama al backend cada 60 segundos
// Con 1.000 usuarios activos = 1.000 queries/minuto solo para créditos IA
```

---

## FASE 6 — BUNDLE

### Dependencias por peso:

| Librería | Peso estimado | Uso | Problema |
|----------|--------------|-----|---------|
| `xlsx` 0.18.5 | ~800KB | Solo ImportCatalogModal | 🔴 Import wildcard `import * as XLSX` |
| `maplibre-gl` 5.24.0 | ~350KB | Mapa operativo GPS | 🟠 Sin lazy loading |
| `@supabase/supabase-js` 2.108.1 | ~250KB | Toda la app | ✅ Necesario |
| `lucide-react` 1.18.0 | ~100KB | Íconos (tree-shaken) | ✅ OK |
| `@tanstack/react-query` 5.101.0 | ~50KB | Data fetching | ✅ OK |
| `react` + `react-dom` 19.2.6 | ~110KB | Framework | ✅ Necesario |
| `react-router-dom` 7.17.0 | ~40KB | Routing | ✅ OK |
| `qrcode.react` 4.2.0 | ~30KB | QR codes | ✅ OK |

**Total estimado bundle:** ~1.7MB sin optimizar → ~900KB optimizable con lazy loading.

**Problema crítico encontrado:**
```typescript
// src/components/catalog/ImportCatalogModal.tsx
import * as XLSX from 'xlsx'; // ← Wildcard import = NO tree-shaking = +800KB siempre
```

---

## FASE 7 — ANÁLISIS DE COSTOS SUPABASE

### Modelo de costos estimado:

#### A 100 workspaces activos
| Recurso | Uso estimado | Costo Plan Pro |
|---------|-------------|----------------|
| DB rows | ~500K quotes + ~50K audit_log | ✅ Dentro del plan |
| DB storage | ~2GB | ✅ OK |
| Edge invocations | ~50K/mes | ✅ OK (500K incluidas) |
| Bandwidth | ~5GB/mes | ✅ OK |
| **Estado** | **✅ MANEJABLE** | |

#### A 1.000 workspaces activos
| Recurso | Uso estimado | Costo |
|---------|-------------|-------|
| DB rows | ~5M quotes + ~5M audit_log | ⚠️ Necesita particionamiento |
| Edge invocations | ~500K/mes | ✅ Límite del plan |
| `integration-worker` calls | ~100K/mes (automation-scheduler cada minuto) | 🟠 Alto |
| `useAICredits` polling | ~1.000 users × 60 calls/hora = 60K calls/hora | 🔴 CRÍTICO |
| **Estado** | **🟠 REQUIERE OPTIMIZACIÓN** | |

#### A 10.000 workspaces activos
| Recurso | Uso estimado | Problema |
|---------|-------------|---------|
| DB rows | ~50M quotes + ~50M audit_log | 🔴 Sin particionamiento → lento |
| Edge invocations | ~5M/mes | 🔴 Excede plan Pro (~500K), necesita Enterprise |
| `useAICredits` polling | ~10K users × 1/min = 10K calls/min | 🔴 COLAPSO |
| `audit_log` sin archivado | ~500M filas en 5 años | 🔴 Sin TTL ni particionamiento |
| **Estado** | **🔴 REQUIERE ARQUITECTURA DIFERENTE** | |

### Costo mayor identificado: AI Credits polling
```
10.000 usuarios activos simultáneos
× 1 query/minuto (useAICredits refetchInterval: 60s)
= 10.000 queries/minuto
= 600.000 queries/hora
= 14.4M queries/día
→ Costo de DB reads: ~$500-2.000/mes solo para esto
```

---

## FASE 8 — SEGURIDAD VS PERFORMANCE

Ninguna optimización propuesta compromete Zero Trust ni RLS. Todas las mejoras son:
- Creación de índices (transparente para RLS)
- Refactorización de queries dentro de RPCs existentes (mantiene security definer)
- Lazy loading de frontend (no afecta backend)
- Cambio de polling a on-demand (no afecta permisos)

La arquitectura de seguridad es sólida. Las optimizaciones son puramente de eficiencia.
