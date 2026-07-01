# PRODUCTION_SCALABILITY_AUDIT — Shelwi
> Fecha: 2026-06-23 | Alcance: Sprint 1 → Sprint 24 | Modo: Solo lectura

---

## 1. BASE DE DATOS — ÍNDICES

### 1.1 Índices existentes (confirmados)

| Tabla | Índice | Tipo | Para |
|-------|--------|------|------|
| `ai_usage` | `idx_ai_usage_period(workspace_id, period_month)` | BTREE | check_ai_credits() |
| `profiles` | `idx_profiles_operational(workspace_id, status)` | BTREE | GPS dashboard |
| `member_locations` | `idx_member_locations_workspace(workspace_id, recorded_at)` | BTREE | Mapa operativo |
| `gps_events` | index by workspace_id | BTREE | GPS history |
| `automation_logs` | `idx_automation_logs_workspace(workspace_id, created_at)` | BTREE | Sprint 21 fix |
| `webhook_endpoints` | `idx_webhook_endpoints_workspace(workspace_id)` | BTREE | Webhook queries |
| `webhook_endpoints` | `idx_webhook_endpoints_events` | GIN | Event filtering |
| `integration_events` | index por workspace_id | BTREE | Worker queue |
| `active_sessions` | 4 índices parciales (Sprint 24) | BTREE | Session lookup |

### 1.2 Índices FALTANTES (hallazgos)

| Tabla | Columnas faltantes | Impacto estimado a 5K ws |
|-------|-------------------|------------------------|
| `ai_usage` | `(workspace_id, created_at DESC)` | Historial lento |
| `orders` | `(workspace_id, status, created_at DESC)` | BI/Finance queries |
| `work_orders` | `(workspace_id, status, due_date)` | Ops KPIs |
| `integration_events` | `(status, execute_after)` WHERE pending | Worker eficiencia |
| `quotes` | `(workspace_id, commercial_status)` | Pipeline queries |
| `clients` | `(workspace_id, last_activity_at)` | CS Dashboard |

---

## 2. TABLAS DE ALTO CRECIMIENTO

| Tabla | Crecimiento estimado | Partición necesaria a... | Estrategia |
|-------|---------------------|--------------------------|-----------|
| `ai_usage` | ~450K rows/mes a 10K ws | 5.000 ws | RANGE por `period_month` |
| `audit_log` | ~120M rows/año a 10K ws | 3.000 ws | RANGE por `created_at` trimestral |
| `gps_events` | ~86M rows/mes a 5K ops | 2.000 ws | RANGE por `created_at` mensual |
| `integration_events` | ~15M rows/año | 5.000 ws | RANGE por `created_at` semanal |
| `webhook_deliveries` | ~50M rows/año | 5.000 ws | RANGE por `created_at` mensual |
| `communication_log` | ~20M rows/año | 5.000 ws | RANGE por `created_at` mensual |
| `portal_access_log` | ~10M rows/año | 5.000 ws | RANGE por `created_at` mensual |
| `active_sessions` | ~100K rows activos | No necesita partición pronto | Cleanup cron suficiente |
| `automation_logs` | ~30M rows/año | 5.000 ws | RANGE por `created_at` mensual |

---

## 3. RPCS — ANÁLISIS DE RENDIMIENTO

### 3.1 RPCs ligeras (O(1) o O(log n)) — escalan bien

| RPC | Complejidad | Por qué escala |
|-----|-------------|---------------|
| `check_ai_credits()` | O(log n) | Índice `idx_ai_usage_period` |
| `get_effective_plan_code()` | O(1) | FK lookup con índice |
| `check_feature_access()` | O(1) | Tabla de 4 filas |
| `check_plan_limit()` | O(1) | FK lookup |
| `check_catalog_limit()` | O(n) donde n = items del ws | Índice en `(workspace_id, deleted_at, status)` |
| `create_session()` | O(n) donde n = sesiones del user | n siempre < 5 → O(1) efectivo |
| `session_heartbeat()` | O(1) | PK lookup en active_sessions |
| `register_quote_view()` | O(1) | Valida quote_id existencia |

### 3.2 RPCs pesadas (O(n)) — requieren atención a escala

| RPC | Complejidad | Umbral de riesgo |
|-----|-------------|----------------|
| `get_bi_executive_kpis()` | O(n × m) JOINs | 3.000 ws |
| `get_bi_operations_kpis()` | O(n × m) JOINs | 3.000 ws |
| `get_bi_customer_kpis()` | O(n) clientes | 3.000 ws |
| `get_bi_marketing_kpis()` | O(n) eventos UTM | 3.000 ws |
| `get_workspace_profitability()` | O(n) pedidos | 3.000 ws |
| `get_finance_dashboard()` | O(n × m) pedidos + OTs | 3.000 ws |
| `get_customer_success_dashboard()` | O(n) clientes | 3.000 ws |
| `get_full_funnel()` | O(n × 7 stages) | 5.000 ws |
| `evaluate_periodic_automations()` | O(rules × workspaces) | 3.000 ws |
| `admin_get_ai_dashboard()` | O(total workspaces) | 500 ws (solo admin) |

---

## 4. EDGE FUNCTIONS — THROUGHPUT

### 4.1 ai-proxy

- **Throughput:** Supabase escala automáticamente Edge Functions (hasta 400 instancias)
- **Bottleneck real:** Gemini API rate limits (por API key, no por instancia)
- **Rate limit existente:** 100 calls/hora por workspace (implementado en ai-proxy)
- **Estimado a 10K ws:** ~25.000 calls/día → ~1.041/hora pico → sin problema con múltiples API keys

### 4.2 automation-scheduler (cron 1/min)

- **Throughput:** 1 ejecución/minuto, máximo 50 workspaces con reglas periódicas por run
- **Bottleneck:** `evaluate_periodic_automations()` a 10K ws con rules activas
- **Estimado:** A 3K ws con automatizaciones → scheduler empieza a atrasarse
- **Fix necesario:** Límite de workspaces por run en evaluate_periodic_automations

### 4.3 integration-worker

- **Throughput actual:** 5 eventos/run × 60 runs/hora = 300 eventos/hora máximo
- **Bottleneck a 3K ws:** eventos pendientes acumulados > capacidad de procesamiento
- **Estimado:** A 500 ws activos con integraciones → worker al 80% de capacidad
- **Fix necesario:** Múltiples workers con sharding por workspace_id

---

## 5. SIMULACIÓN DE CARGA

### @ 100 usuarios activos
| Componente | Estado |
|-----------|--------|
| DB connections | ~5% uso | ✅ |
| RPCs BI | <100ms | ✅ |
| ai-proxy | <1 call/seg | ✅ |
| GPS tracking | <100 posiciones/min | ✅ |
| Webhooks | <10/min | ✅ |
| **Veredicto** | **✅ ESCALA PERFECTAMENTE** | |

### @ 500 usuarios activos
| Componente | Estado |
|-----------|--------|
| DB connections | ~25% uso | ✅ |
| RPCs BI | <200ms | ✅ |
| ai-proxy | <5 calls/seg | ✅ |
| integration-worker | ~150 eventos/hora | ✅ |
| **Veredicto** | **✅ ESCALA SIN CAMBIOS** | |

### @ 1.000 usuarios activos
| Componente | Estado |
|-----------|--------|
| DB connections | ~45% uso | ✅ |
| RPCs BI | <400ms | ✅ |
| ai_usage rows/mes | ~45K | ✅ |
| integration-worker | ~300 eventos/hora (al límite) | ⚠️ |
| automation-scheduler | ~200 rules evaluadas/min | ✅ |
| **Veredicto** | **✅ ESCALA CON MONITOREO** | |

### @ 3.000 usuarios activos
| Componente | Estado |
|-----------|--------|
| DB connections | ~75% (Supabase Pro = 100 max) | ⚠️ |
| RPCs BI | 500ms-1s | ⚠️ |
| ai_usage rows/mes | ~135K | ✅ con índice |
| integration-worker | saturado a ~3K ws con integraciones | ❌ |
| GPS events | ~9M filas/mes | ⚠️ |
| **Veredicto** | **⚠️ NECESITA: Supabase Team + worker sharding** | |

### @ 5.000 usuarios activos
| Componente | Estado |
|-----------|--------|
| DB connections | >100 → pool saturado | ❌ |
| RPCs BI | 1-3s → timeout frecuente | ❌ |
| ai_usage rows/mes | ~225K sin partición | ❌ |
| GPS events acumulado | >50M rows | ❌ |
| **Veredicto** | **❌ NECESITA UPGRADE INFRA + PARTICIÓN** | |

### @ 10.000 usuarios activos
| Componente | Estado |
|-----------|--------|
| DB connections | completamente saturado | ❌ |
| RPCs BI | timeout | ❌ |
| ai_usage sin partición | 450K rows/mes → lento | ❌ |
| Realtime connections | >10K vs 200 límite Pro | ❌ |
| **Veredicto** | **❌ REQUIERE UPGRADE COMPLETO DE INFRA** | |

---

## 6. WEBHOOKS Y AUTOMATIZACIONES

### 6.1 Webhooks salientes
- ✅ HMAC-SHA256 en cada delivery
- ✅ Retry exponential backoff: 1min, 5min, 30min
- ✅ Max 3 intentos antes de marcar como fallido
- ✅ Auto-disable endpoint después de 5 fallos consecutivos
- ✅ Timeout 10s por request
- ⚠️ Sin rate limit de webhooks por endpoint — podría saturar el destino

### 6.2 Automatizaciones
- ✅ `execution_depth` previene loops infinitos
- ✅ Condiciones re-evaluadas al ejecutar (evita acciones stale)
- ✅ `evaluate_periodic_automations()` con límite de batch
- ⚠️ Sin deduplicación robusta — misma regla puede ejecutarse 2 veces en edge cases
- ⚠️ A 3K workspaces: el scheduler podría no procesar todas las reglas en 1 minuto

---

## 7. WORKERS — ANÁLISIS GPS

- Registro GPS: one-shot (no watchPosition) ✅
- `gps_consent_at` requerido antes de check-in ✅
- `accuracy_meters ≤ 500m` validación ✅
- `member_locations`: UPSERT (1 fila por usuario) — escala bien ✅
- `gps_events`: histórico — sin partición — necesita partición a 2K operarios activos

---

## 8. SCORE ESCALABILIDAD

| Dimensión | Score | Detalle |
|-----------|-------|---------|
| Arquitectura general | 85/100 | Zero Trust, Edge Functions stateless |
| Índices DB | 70/100 | Índices críticos faltantes |
| Tablas alto crecimiento | 60/100 | Sin partición en 5 tablas críticas |
| RPCs pesadas | 65/100 | BI RPCs sin materialización |
| Edge Functions | 90/100 | Bien diseñadas, stateless |
| Workers | 55/100 | integration-worker single-threaded |
| Webhooks | 80/100 | HMAC, retry, auto-disable |
| GPS | 75/100 | gps_events sin partición |
| **TOTAL** | **72/100** | Sólido hasta 1K ws, necesita trabajo para 5K+ |
