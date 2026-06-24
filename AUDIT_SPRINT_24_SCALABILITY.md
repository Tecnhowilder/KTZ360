# AUDIT_SPRINT_24_SCALABILITY — Shelwi Escalabilidad 10K Usuarios

> Fecha: 2026-06-23 | Simulación: 1K / 3K / 5K / 10K workspaces activos

---

## 1. INVENTARIO DE COMPONENTES AUDITADOS

### 1.1 RPCs (funciones PostgreSQL)

| RPC | Sprint | Índices | Escala estimada |
|-----|--------|---------|-----------------|
| `check_ai_credits` | S2 | idx_ai_usage_period ✅ | O(1) por workspace |
| `consume_ai_credits` | S2 | Insertar + SELECT | O(1) |
| `get_effective_plan_code` | S2 | subscriptions.workspace_id ✅ | O(1) con índice |
| `check_feature_access` | S2 | plan_features PK ✅ | O(1) |
| `check_plan_limit` | S2 | plan_limits PK ✅ | O(1) |
| `get_workspace_profitability` | S18 | orders.workspace_id ✅ | O(n) pedidos |
| `get_finance_dashboard` | S18 | orders, work_orders idx ✅ | O(n) período |
| `get_bi_executive_kpis` | S19 | quotes, orders, clients ✅ | O(n) período |
| `get_bi_sales_kpis` | S19 | profiles.workspace_id ✅ | O(n) períodoo |
| `get_bi_customer_kpis` | S19 | customer_health_scores ✅ | O(n) clientes |
| `get_bi_marketing_kpis` | S19 | utm_sources, referrals ✅ | O(n) |
| `get_bi_operations_kpis` | S19 | work_orders.workspace_id ✅ | O(n) OTs |
| `get_gps_positions` | S10 | idx_gps_positions_ws_time ✅ | O(n) ventana |
| `evaluate_and_queue_automations` | S13 | integration_events ✅ | O(rules) |
| `get_customer_success_dashboard` | S20 | customer_health_scores ✅ | O(n) clientes |

### 1.2 Edge Functions

| Función | Invocaciones estimadas 10K ws | Timeout | Estado |
|---------|-------------------------------|---------|--------|
| `ai-proxy` | 50K/día (5 ops/ws/día avg) | 30s | ✅ OK |
| `integration-worker` | 144K/día (scheduler 1/min) | 30s | ✅ Budget 25s guard |
| `automation-scheduler` | 1440/día (1/min) | 30s | ✅ Batch 50 ws |
| `create-checkout` | ~100/día | 30s | ✅ Low volume |
| `mp-webhook` | ~100/día | 30s | ✅ Low volume |
| `oauth-callback` | ~50/día | 30s | ✅ Low volume |

### 1.3 Triggers DB

| Trigger | Tabla | Operación | Impacto |
|---------|-------|-----------|---------|
| `trg_ai_usage_period` | ai_usage | BEFORE INSERT | ✅ Trivial |
| `trg_workspace_storage_alert` | workspaces | AFTER UPDATE | ✅ Low freq |
| `trg_orders_notify` | orders | AFTER INSERT/UPDATE | ✅ Low freq |
| `trg_work_orders_notify` | work_orders | AFTER UPDATE | ✅ Low freq |
| `trg_evaluate_automations_*` | quotes, clients, orders | AFTER INSERT/UPDATE | ⚠️ N+1 potential |
| `trg_customer_health_update` | customer_health_scores | AFTER UPDATE | ✅ OK |
| `trg_loyalty_points_*` | loyalty_transactions | AFTER INSERT | ✅ Low freq |

---

## 2. SIMULACIÓN DE CARGA

### Supuestos base
- 10.000 workspaces activos simultáneos
- Distribución: 60% FREE, 30% PRO, 8% PREMIUM, 2% ENTERPRISE
- FREE: 5 ops/día, PRO: 30 ops/día, PREMIUM: 100 ops/día, ENTERPRISE: 500 ops/día
- Hora pico: 9am-12pm Colombia (50% de la carga diaria)

### 2.1 @ 1.000 Usuarios Activos

| Métrica | Estimado | Estado |
|---------|----------|--------|
| Requests DB/hora pico | ~15.000 | ✅ OK |
| ai-proxy calls/hora | ~1.250 | ✅ OK (Gemini sin límite severo) |
| integration-worker events/hora | ~600 | ✅ OK |
| ai_usage rows/mes | ~45.000 | ✅ OK |
| GPS positions/hora | ~5.000 | ✅ OK |
| Tiempo promedio RPC simple | <50ms | ✅ OK |
| Tiempo promedio RPC BI | 200-400ms | ✅ Aceptable |

### 2.2 @ 3.000 Usuarios Activos

| Métrica | Estimado | Estado |
|---------|----------|--------|
| Requests DB/hora pico | ~45.000 | ✅ OK |
| ai-proxy calls/hora | ~3.750 | ✅ OK |
| ai_usage rows/mes | ~135.000 | ⚠️ Monitorear tamaño tabla |
| Tiempo promedio RPC BI | 300-600ms | ⚠️ Empieza a degradar |
| GPS positions/hora | ~15.000 | ✅ OK con índice time-series |
| integration_events queue depth | ~300 pendientes/min | ✅ OK |

### 2.3 @ 5.000 Usuarios Activos

| Métrica | Estimado | Estado |
|---------|----------|--------|
| Requests DB/hora pico | ~75.000 | ⚠️ Pool conexiones bajo presión |
| ai_usage rows/mes | ~225.000 | ⚠️ Sin partición → table scan costoso |
| Tiempo promedio RPC BI | 500ms-1s | ⚠️ Degradación notable |
| check_ai_credits latencia | 50-100ms | ⚠️ Empieza a sentirse |
| ai-proxy concurrent calls | ~625/hora pico | ✅ OK |
| DB connection pool (Supabase Pro) | ~90-95 conexiones | ⚠️ Cerca del límite |

### 2.4 @ 10.000 Usuarios Activos

| Métrica | Estimado | Estado |
|---------|----------|--------|
| Requests DB/hora pico | ~150.000 | ❌ Pool saturado |
| ai_usage rows/mes | ~450.000 | ❌ Table scan → timeout |
| Tiempo promedio RPC BI | 2-5s | ❌ Timeout frecuente |
| check_ai_credits latencia | 100-300ms | ❌ Sin partición |
| integration_events backlog | >1000 pending | ❌ Worker insuficiente |
| GPS positions 30 días | >10M rows | ❌ Necesita partición |
| DB connection pool | >100 conexiones | ❌ Supabase Pro limitado |

---

## 3. DIAGNÓSTICO POR COMPONENTE

### 3.1 QUÉ ROMPE PRIMERO (crítico a 10K)

| # | Componente | Por qué rompe | Prioridad |
|---|-----------|---------------|-----------|
| 1 | `ai_usage` sin partición | 450K+ rows/mes → seq scan en `check_ai_credits` | 🔴 CRÍTICA |
| 2 | Pool de conexiones DB | Supabase Pro = 100 conexiones. 10K ws = saturación | 🔴 CRÍTICA |
| 3 | RPCs BI (get_bi_*) | Queries sobre 7+ tablas sin materialización | 🟠 ALTA |
| 4 | GPS positions historico | Sin partición por tiempo → >10M rows | 🟠 ALTA |
| 5 | integration-worker | 1 solo worker para 10K ws → backlog infinito | 🟠 ALTA |
| 6 | `evaluate_automation_conditions` | N+1 en triggers → cascada de locks | 🟡 MEDIA |

### 3.2 QUÉ ESCALA BIEN

- `check_ai_credits`: índice `idx_ai_usage_period(workspace_id, period_month)` cubre el query exacto ✅
- `get_effective_plan_code`: lookup por FK con índice ✅
- `check_feature_access`: lookup en tabla pequeña (3-4 plans) ✅
- `ai-proxy` Edge Function: stateless, Supabase escala horizontal automáticamente ✅
- `create-checkout`, `mp-webhook`: baja frecuencia ✅
- GPS positions recientes (ventana 24h): índice `idx_gps_positions_ws_time` ✅

### 3.3 QUÉ NECESITA ÍNDICES

| Tabla | Columna | Tipo índice | Impacto |
|-------|---------|-------------|---------|
| `ai_usage` | `(workspace_id, period_month DESC)` | BTREE | ✅ YA EXISTE |
| `ai_usage` | `created_at` | BTREE | Falta para queries de historial |
| `gps_positions` | `(workspace_id, created_at DESC)` | BRIN o BTREE | ✅ Verificar existente |
| `integration_events` | `(status, execute_after)` | BTREE | Para worker queue |
| `customer_health_scores` | `(workspace_id, updated_at)` | BTREE | Para CS dashboard |
| `orders` | `(workspace_id, status, created_at)` | BTREE compuesto | Para finanzas |
| `work_orders` | `(workspace_id, status, due_date)` | BTREE compuesto | Para ops |

### 3.4 QUÉ NECESITA CACHÉ

| Query | Tipo caché | TTL |
|-------|-----------|-----|
| `get_bi_executive_kpis` | Materialized View o Redis | 5 minutos |
| `get_bi_operations_kpis` | Materialized View | 5 minutos |
| `get_bi_customer_kpis` | Materialized View | 10 minutos |
| `get_customer_success_dashboard` | Edge cache | 5 minutos |
| `admin_get_ai_usage_global` | Edge cache | 30 minutos |
| `check_ai_credits` (sin cambios) | Session cache en frontend | 30 segundos |

### 3.5 QUÉ NECESITA PARTICIONADO

| Tabla | Estrategia | Por qué |
|-------|-----------|---------|
| `ai_usage` | RANGE por `period_month` | 450K+ rows/mes a 10K ws |
| `gps_positions` | RANGE por `created_at` (mensual) | >10M rows/30 días a 5K operarios |
| `integration_events` | RANGE por `created_at` (semanal) | Queue acumulado |
| `audit_log` | RANGE por `created_at` (trimestral) | Crecimiento lineal |
| `webhook_deliveries` | RANGE por `created_at` (mensual) | Alta frecuencia |

### 3.6 QUÉ NECESITA COLAS

| Proceso | Cola actual | Problema | Solución |
|---------|------------|---------|----------|
| Integration events | `integration_events` tabla + scheduler | Worker único, backlog | pg_net + múltiples workers |
| Webhook delivery | `integration_events` + scheduler | Mismo problema | Cola dedicada con prioridad |
| AI requests async | Sin cola | Llamadas sincrónicas bloquean UI | Queue opcional para batch ops |
| GPS batch import | Directo a tabla | N inserts simultáneos | Buffer + bulk insert |

---

## 4. CONSUMO DE RECURSOS POR COMPONENTE A 10K

| Recurso | Consumo estimado/mes | Límite Supabase Pro | Estado |
|---------|---------------------|--------------------|----|
| DB Storage | ~15 GB (sin partición) | 8 GB (Pro) | ❌ Necesita upgrade |
| Requests DB | ~180M/mes | Ilimitado (Pro) | ✅ OK |
| Edge Function invocations | ~12M/mes | 2M (Pro) | ❌ Necesita upgrade |
| Storage total | ~50 GB (10K ws × 5 MB avg) | 100 GB (Pro) | ✅ OK |
| Realtime connections | ~10K simultáneas | 200 (Pro) | ❌ CRÍTICO |
| AI tokens Gemini | ~450M tokens/mes | API key ilimitada | ✅ OK (costo) |

---

## 5. PLAN DE ACCIÓN ESCALABILIDAD

### Inmediato (Sprint 24)
1. Particionado `ai_usage` por `period_month` → migración 0102
2. Índice compuesto en `orders(workspace_id, status, created_at)`
3. Índice compuesto en `work_orders(workspace_id, status, due_date)`

### Corto plazo (Sprint 25-26)
1. Materialized views para `get_bi_*` RPCs con refresh cada 5 min
2. Particionado `gps_positions` por mes
3. Upgrade Supabase Pro → Team para 500 conexiones + 2M Edge Function calls

### Medio plazo (Sprint 27-28)
1. Read replicas para queries BI pesadas
2. Redis layer para caché de créditos y planes (evitar N+1 en check_ai_credits)
3. Queue dedicada para integration_events (vs tabla como cola)

---

## 6. ÍNDICES CRÍTICOS FALTANTES

Los siguientes índices NO existen y son necesarios:

```sql
-- 1. ai_usage history lookup
CREATE INDEX CONCURRENTLY idx_ai_usage_created_at
  ON public.ai_usage(workspace_id, created_at DESC);

-- 2. orders compuesto (BI + Finance queries)
CREATE INDEX CONCURRENTLY idx_orders_ws_status_date
  ON public.orders(workspace_id, status, created_at DESC);

-- 3. work_orders compuesto (ops queries)
CREATE INDEX CONCURRENTLY idx_work_orders_ws_status_due
  ON public.work_orders(workspace_id, status, due_date);

-- 4. integration_events queue
CREATE INDEX CONCURRENTLY idx_integration_events_queue
  ON public.integration_events(status, execute_after)
  WHERE status IN ('pending', 'failed');

-- 5. active_sessions lookup (Sprint 24 nuevo)
CREATE INDEX CONCURRENTLY idx_active_sessions_user
  ON public.active_sessions(user_id, revoked_at)
  WHERE revoked_at IS NULL;

CREATE INDEX CONCURRENTLY idx_active_sessions_workspace
  ON public.active_sessions(workspace_id, revoked_at)
  WHERE revoked_at IS NULL;
```
