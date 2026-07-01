# AI_SCALE_10000_USERS — Shelwi Análisis de Escala IA para 10.000 Usuarios

> Fecha: 2026-06-23 | Simulación basada en arquitectura real del sistema

---

## RESUMEN EJECUTIVO

| Resultado | Veredicto |
|-----------|-----------|
| ¿Escala a 1.000 ws? | ✅ SÍ — sin cambios |
| ¿Escala a 3.000 ws? | ✅ SÍ — con monitoreo |
| ¿Escala a 5.000 ws? | ⚠️ CON RIESGO — necesita índices + partición |
| ¿Escala a 10.000 ws? | ❌ NO — sin partición ai_usage y sin upgrade Supabase |

---

## 1. QUÉ ROMPE PRIMERO (en orden de urgencia)

### 1.1 [CRÍTICO] `ai_usage` sin partición por período

**Por qué rompe:**
- check_ai_credits() hace `SUM(credits_used) WHERE workspace_id = X AND period_month = Y`
- A 10K workspaces con 500 ops/mes = 5M filas por mes en la tabla
- El índice `idx_ai_usage_period` mitiga pero no elimina el problema
- Sin partición: vacuum, autovacuum y ANALYZE se vuelven lentos

**Umbral de falla:** ~3M filas acumuladas (≈6 meses a 5K ws)

**Fix:**
```sql
-- Convertir ai_usage a tabla particionada por period_month (migración 0102)
-- O agregar partición manual mensual con CHECK constraints
```

**Impacto en latencia:**
- A 1M rows: +10ms en check_ai_credits
- A 5M rows: +50-100ms
- A 20M rows: +500ms+ (timeout frecuente)

---

### 1.2 [CRÍTICO] Pool de conexiones Supabase Pro

**Por qué rompe:**
- Supabase Pro: 100 conexiones directas a PostgreSQL
- PgBouncer (incluido): pool de 200 transacciones máximo
- A 10K ws con 15 requests concurrentes promedio en hora pico: sobresatura

**Fix:** Upgrade a Supabase Team ($599 USD/mes) → 500+ conexiones directas

---

### 1.3 [ALTO] RPCs BI sin materialización

**Por qué rompe:**
- `get_bi_executive_kpis`, `get_bi_operations_kpis`, etc. hacen JOINs sobre 7+ tablas
- Sin materialized views: cada llamada recalcula todo desde cero
- A 3K workspaces en hora pico: 3K × 1 llamada/hora = 50/min → table scans simultáneos

**Fix:** Materialized Views con refresh `pg_cron` cada 5 minutos

---

### 1.4 [ALTO] integration-worker cola única

**Por qué rompe:**
- 1 worker procesando 5 eventos por run, cada 1 minuto
- A 10K ws: potencialmente 10K eventos en queue → backlog de 2000+ minutos

**Fix:** Sharding del worker por workspace_id % N (múltiples instancias)

---

### 1.5 [MEDIO] GPS positions sin partición temporal

**Por qué rompe:**
- 5K operarios × 24 registros GPS/hora × 720 horas/mes = 86M filas/mes
- Sin partición: queries de historial GPS son lentas

**Fix:** Partición mensual en gps_positions (migración futura)

---

## 2. QUÉ ESCALA BIEN (sin cambios)

| Componente | Por qué escala |
|-----------|---------------|
| `ai-proxy` Edge Function | Stateless. Supabase escala automáticamente hasta 400 instancias |
| `check_ai_credits` | Índice perfecto: `(workspace_id, period_month DESC)` |
| `get_effective_plan_code` | Cache-friendly: 3-4 planes, lookup por FK |
| `check_feature_access` | Tabla de 4 filas (una por plan) |
| JWT validation | Supabase Auth es distributed, sin bottleneck |
| Storage Supabase | CDN distribuido, sin límite de throughput en archivos |
| Gemini API | Rate limits propios de Google (escalable) |
| `create-checkout` | Baja frecuencia, stateless |
| RLS policies | Ejecutan en PostgreSQL, optimizadas con índices |

---

## 3. QUÉ NECESITA ÍNDICES (sprint 24 inmediato)

```sql
-- Índice 1: ai_usage history queries (faltante)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_usage_created
  ON public.ai_usage(workspace_id, created_at DESC);

-- Índice 2: orders para BI Finance (faltante)  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_ws_status_date
  ON public.orders(workspace_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Índice 3: work_orders para ops KPIs (faltante)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_ws_status_due
  ON public.work_orders(workspace_id, status, due_date);

-- Índice 4: integration_events worker queue (faltante)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integration_events_queue
  ON public.integration_events(status, execute_after NULLS FIRST)
  WHERE status IN ('pending', 'failed') AND retries < 3;

-- Índice 5: active_sessions (nuevo Sprint 24)
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_active
  ON public.active_sessions(user_id, workspace_id)
  WHERE revoked_at IS NULL;
```

---

## 4. QUÉ NECESITA CACHÉ

| Query | Frecuencia a 10K ws | Estrategia | TTL |
|-------|--------------------|----|-----|
| `get_bi_executive_kpis` | 10K/hora | Materialized View | 5 min |
| `get_bi_operations_kpis` | 10K/hora | Materialized View | 5 min |
| `admin_get_ai_usage_global` | 100/hora | Edge cache | 30 min |
| `v_ai_credits_summary` | 50K/hora | Índice + cache cliente 30s | 30 seg |
| `get_customer_success_dashboard` | 5K/hora | Materialized View | 10 min |

---

## 5. QUÉ NECESITA PARTICIONADO

| Tabla | Tamaño estimado a 10K ws/año | Estrategia |
|-------|------------------------------|-----------|
| `ai_usage` | 60M filas/año | RANGE por `period_month` mensual |
| `gps_positions` | 1B+ filas/año | RANGE por `created_at` mensual |
| `audit_log` | 120M filas/año | RANGE por `created_at` trimestral |
| `integration_events` | 15M filas/año | RANGE por `created_at` semanal |
| `webhook_deliveries` | 50M filas/año | RANGE por `created_at` mensual |

---

## 6. QUÉ NECESITA COLAS

| Proceso | Problema actual | Cola recomendada |
|---------|----------------|-----------------|
| Integration events | Tabla-como-cola, saturación a 10K ws | pg_notify + workers dedicados |
| Webhook delivery | Mismo worker para todos | Workers por prioridad (ENTERPRISE primero) |
| BI refresh | Recalcula todo en real-time | pg_cron materialized refresh |
| GPS bulk import | N+1 inserts | Buffer + COPY bulk insert |
| AI batch operations | Síncrono bloquea UI | Queue async con polling |

---

## 7. SIMULACIÓN DE COSTOS A 10K USUARIOS (mensual)

| Recurso | Costo a 1K ws | Costo a 5K ws | Costo a 10K ws |
|---------|--------------|--------------|----------------|
| Supabase Pro | $25 USD | $25 USD | Necesita Team: $599 USD |
| Gemini API | ~$105 USD | ~$525 USD | ~$1.050 USD |
| Storage S3/CDN | ~$5 USD | ~$25 USD | ~$50 USD |
| **Total infra** | **~$135 USD** | **~$575 USD** | **~$1.700 USD** |
| **Ingresos** | **~$28.000 USD** | **~$140.000 USD** | **~$280.000 USD** |
| **Margen infra** | **99.5%** | **99.6%** | **99.4%** |

---

## 8. CRONOGRAMA DE ESCALA

### Sprint 24 (ahora)
- Índices críticos faltantes → migración 0102
- Partición `ai_usage` por period_month → migración 0102
- Tabla `active_sessions` con índices → migración 0101

### Sprint 25-26
- Materialized views para RPCs BI
- Partición `gps_positions` mensual
- Upgrade Supabase Pro → Team (cuando se superen 1K ws activos)

### Sprint 27-28
- Workers múltiples para integration-worker (sharding)
- Redis/Upstash para caché de planes y créditos
- Read replica para queries analíticas

### Sprint 29-30
- Partición `audit_log` trimestral
- Archivado automático de `integration_events` procesados
- CQRS parcial: separar reads analíticas de writes transaccionales
