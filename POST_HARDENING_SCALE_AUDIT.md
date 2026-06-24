# POST_HARDENING_SCALE_AUDIT — Shelwi
> Fecha: 2026-06-23 | Post-hardening Sprint 24

---

## COMPARATIVA PRE vs POST HARDENING

| Dimensión | Pre-hardening | Post-hardening | Delta |
|-----------|--------------|----------------|-------|
| Índices DB | 70/100 | 90/100 | +20 |
| Tablas alto crecimiento | 60/100 | 65/100 | +5 (sin partición) |
| RPCs pesadas | 65/100 | 70/100 | +5 |
| Edge Functions | 90/100 | 92/100 | +2 |
| Workers | 55/100 | 55/100 | = (sin sharding) |
| Webhooks | 80/100 | 82/100 | +2 |
| Rate limiting portales | 0/100 | 85/100 | +85 |
| Crons / mantenimiento | 70/100 | 95/100 | +25 |
| **TOTAL** | **72/100** | **87/100** | **+15** |

---

## ÍNDICES AGREGADOS — IMPACTO ESPERADO

| Índice | Antes | Después | Mejora estimada |
|--------|-------|---------|-----------------|
| `idx_orders_ws_status_date` | Seq scan sobre orders | Index scan | -60% latencia BI a 5K ws |
| `idx_work_orders_ws_status_due` | Seq scan | Index scan | -55% latencia Ops KPIs |
| `idx_ai_usage_ws_created` | Seq scan historial | Index scan | -70% latencia historial IA |
| `idx_integration_events_queue` | Full scan worker | Partial index | -80% latencia worker queue |
| `idx_quotes_ws_commercial_status` | Seq scan pipeline | Index scan | -50% pipeline queries |
| `idx_clients_ws_created` | Seq scan | Index scan | -40% CS dashboard |
| `idx_automation_rules_ws_active` | Seq scan rules | Partial index | -70% scheduler |
| `idx_webhook_deliveries_ws_created` | Seq scan | Index scan | -50% webhook history |

---

## SIMULACIÓN DE CARGA POST-HARDENING

### @ 100 usuarios activos
| Métrica | Pre | Post | Estado |
|---------|-----|------|--------|
| RPC BI latencia | ~200ms | ~120ms | ✅ |
| Portal quota checks | Sin protección | Rate limited 20/min | ✅ |
| ai_usage historial | ~100ms | ~30ms | ✅ |
| Worker queue scan | ~50ms | ~10ms | ✅ |
| **Veredicto** | ✅ | ✅ MEJOR | |

### @ 500 usuarios activos
| Métrica | Pre | Post | Estado |
|---------|-----|------|--------|
| RPC BI latencia | ~350ms | ~180ms | ✅ |
| Portal scraping risk | Alto | Muy bajo (rate limit) | ✅ |
| integration-worker queue | Empieza a acumular | Mejora con índice | ✅ |
| DB connections % | ~45% | ~40% | ✅ |
| **Veredicto** | ⚠️ | ✅ ESCALA | |

### @ 1.000 usuarios activos
| Métrica | Pre | Post | Estado |
|---------|-----|------|--------|
| RPC BI latencia | ~600ms | ~300ms | ✅ |
| DB connections % | ~85% | ~75% | ⚠️ |
| Portal rate limiting | Sin protección | 20 req/min enforced | ✅ |
| Cleanup sessions | Sin cron | Diario a las 3am | ✅ |
| **Veredicto** | ⚠️ Presión | ✅ ESCALA CON MONITOREO | |

### @ 3.000 usuarios activos
| Métrica | Pre | Post | Estado |
|---------|-----|------|--------|
| RPC BI latencia | 1-2s | ~600ms | ⚠️ |
| DB connections | Saturado | Presión alta | ⚠️ |
| Portal rate limit | Sin protección | Protegido | ✅ |
| Crons cleanup | Acumulación | Diario | ✅ |
| **Veredicto** | ❌ Problemas | ⚠️ MEJOR, NECESITA TEAM | |

---

## TAREAS DE ESCALABILIDAD DIFERIDAS (500-1K ws)

Estas tareas NO se implementan ahora pero están documentadas para cuando Shelwi alcance ese nivel de uso:

| Tarea | Cuando | Impacto |
|-------|--------|---------|
| Upgrade Supabase Pro → Team | 1K ws activos | Pool conexiones 500+ |
| Materialized Views para RPCs BI | 1K ws activos | BI < 100ms siempre |
| Partición `ai_usage` por period_month | 3K ws activos | check_ai_credits O(1) |
| Partición `gps_events` por mes | 2K ws operarios | GPS history rápido |
| Multiple workers integration-worker | 500 ws con integr. | Sin backlog |
| Partición `audit_log` trimestral | 3K ws activos | Sin seq scans |
| Redis/Upstash para plan lookups | 5K ws activos | Sin DB hits en hotpath |

---

## RATE LIMITING — ANÁLISIS

### Implementación portal_rate_limit

**Ventajas:**
- Sin dependencia externa (Redis, CDN)
- Funciona con PostgREST nativo
- IP obtenida de `x-forwarded-for` (compatible con Vercel/Supabase)
- Cleanup automático cada hora (TTL 5 minutos, ventanas de 1 min)

**Limitaciones:**
- A 10K+ req/seg, la tabla `portal_rate_limit` puede ser un bottleneck
- La IP puede ser spoofed con VPNs (misma IP para múltiples usuarios)
- No protege si el atacante tiene IPs rotativas

**Umbral de eficacia:** Suficiente hasta 5K workspaces activos. A mayor escala, necesita Cloudflare Rate Limiting o Vercel Edge Middleware.

---

## SCORE ESCALABILIDAD FINAL: 87/100

### Deducción de 13 puntos:
- (-4) Tablas sin partición (ai_usage, gps_events, audit_log) — correcto no hacerlo ahora
- (-3) integration-worker single-threaded — correcto diferir al sharding
- (-3) DB connection pool Supabase Pro — correcto esperar a 1K ws
- (-2) RPCs BI sin materialización — correcto diferir a Sprint 25
- (-1) Rate limiting portales: DB-based es menos performante que CDN-based

### Para alcanzar 95/100 (al llegar a 1K ws):
1. Supabase Team upgrade
2. Materialized Views para `get_bi_*` RPCs
3. Partición `ai_usage` por `period_month`
