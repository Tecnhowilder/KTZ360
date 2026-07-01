# LOAD_TEST_REPORT — Shelwi Sprint 24 Simulación de Carga

> Fecha: 2026-06-23 | Tipo: Simulación analítica (no test real de carga)

---

## METODOLOGÍA

Simulación analítica basada en:
- Arquitectura real del sistema (código auditado)
- Estimaciones de throughput PostgreSQL / Supabase
- Distribución de workspaces: 60% FREE / 30% PRO / 8% PREMIUM / 2% ENTERPRISE
- Hora pico: 9am-12pm Colombia (50% de la carga diaria)

---

## RESULTADOS POR ESCENARIO

### 1.000 Workspaces Activos

| Métrica | Valor | Estado |
|---------|-------|--------|
| Requests DB/hora pico | ~15.000 | ✅ Normal |
| ai-proxy calls/hora | ~1.250 | ✅ OK |
| Tiempo RPC simple (check_ai_credits) | <20ms | ✅ Excelente |
| Tiempo RPC BI (get_bi_executive_kpis) | ~200ms | ✅ Aceptable |
| Tiempo RPC GPS (get_gps_positions) | ~50ms | ✅ OK |
| ai_usage rows/mes | ~45.000 | ✅ Trivial |
| Pool de conexiones usado | ~20% | ✅ Holgado |
| **Veredicto** | **ESCALA** | ✅ |

### 3.000 Workspaces Activos

| Métrica | Valor | Estado |
|---------|-------|--------|
| Requests DB/hora pico | ~45.000 | ✅ OK |
| ai-proxy calls/hora | ~3.750 | ✅ OK |
| Tiempo RPC simple | <30ms | ✅ OK |
| Tiempo RPC BI | ~350ms | ⚠️ Empieza a sentirse |
| ai_usage rows/mes | ~135.000 | ✅ OK con índice |
| Pool de conexiones usado | ~55% | ✅ OK |
| **Veredicto** | **ESCALA CON MONITOREO** | ⚠️ |

### 5.000 Workspaces Activos

| Métrica | Valor | Estado |
|---------|-------|--------|
| Requests DB/hora pico | ~75.000 | ⚠️ Presión en pool |
| ai-proxy calls/hora | ~6.250 | ✅ OK (Edge Functions) |
| Tiempo RPC simple | ~50ms | ⚠️ Degradación leve |
| Tiempo RPC BI | ~700ms | ⚠️ Necesita materialización |
| ai_usage rows/mes | ~225.000 | ⚠️ Sin partición → lento |
| Pool de conexiones usado | ~85% | ⚠️ Alto |
| **Veredicto** | **NECESITA ÍNDICES + PARTICIÓN** | ⚠️ |

### 10.000 Workspaces Activos

| Métrica | Valor | Estado |
|---------|-------|--------|
| Requests DB/hora pico | ~150.000 | ❌ Pool saturado |
| ai-proxy calls/hora | ~12.500 | ✅ OK (stateless) |
| Tiempo RPC simple | ~100ms+ | ❌ Degradación |
| Tiempo RPC BI | ~2-5s | ❌ Timeout |
| ai_usage rows/mes | ~450.000 | ❌ Sin partición |
| Pool de conexiones usado | >100% | ❌ Bloqueante |
| **Veredicto** | **NECESITA UPGRADE INFRA** | ❌ |

---

## CUELLOS DE BOTELLA IDENTIFICADOS

| # | Cuello de botella | Umbral | Fix |
|---|------------------|--------|-----|
| 1 | `ai_usage` sin partición | >5K ws | Partición mensual (migr 0102) |
| 2 | Pool conexiones Supabase Pro | >5K ws | Upgrade a Team ($599 USD/mes) |
| 3 | RPCs BI sin caché | >3K ws | Materialized views (Sprint 25) |
| 4 | integration-worker worker único | >3K ws | Sharding (Sprint 26) |
| 5 | GPS sin partición temporal | >5K ws | Partición mensual (Sprint 26) |

---

## CONSUMO DE IA A ESCALA

| Escenario | Workspaces | Calls Gemini/día | Tokens/mes | Costo USD/mes |
|-----------|-----------|-----------------|-----------|--------------|
| 1K ws | 1.000 | ~2.500 | ~22M | ~$3.30 |
| 3K ws | 3.000 | ~7.500 | ~66M | ~$9.90 |
| 5K ws | 5.000 | ~12.500 | ~110M | ~$16.50 |
| 10K ws | 10.000 | ~25.000 | ~220M | ~$33.00 |

**Gemini 2.5 Flash pricing: $0.15 USD/1M tokens input + $0.60 USD/1M output**
**Promedio estimado: $0.15 USD/1M tokens (input-heavy)**

**El costo de IA a 10K workspaces = ~$33 USD/mes = 0.01% de ingresos potenciales**

---

## PLAN DE ACCIÓN

### Inmediato (antes de lanzamiento masivo)
1. Ejecutar migraciones 0097-0101 ✅ (implementadas Sprint 24)
2. Añadir índices críticos (especialmente `idx_orders_ws_status_date`)

### Al superar 1.000 workspaces activos
1. Upgrade Supabase Pro → Team
2. Activar Materialized Views para RPCs BI

### Al superar 3.000 workspaces activos
1. Particionado `ai_usage` por `period_month`
2. Particionado `gps_positions` por mes
3. Workers múltiples para `integration-worker`

### Al superar 5.000 workspaces activos
1. Redis/Upstash para caché de planes y créditos
2. Read replicas para queries analíticas
3. CDN para assets estáticos

---

## VEREDICTO FINAL

**Shelwi escala cómodamente hasta 3.000 workspaces activos con la arquitectura actual.**

A 5.000 se necesita: upgrade de Supabase + partición de tablas pesadas.

A 10.000 se necesita: Supabase Team + materialized views + múltiples workers.

El costo de infraestructura a 10K usuarios (<$2.000 USD/mes) representa <0.7% de los ingresos potenciales ($280K USD/mes), lo que hace viable la inversión.
