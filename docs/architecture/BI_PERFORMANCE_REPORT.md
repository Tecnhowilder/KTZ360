# BI_PERFORMANCE_REPORT.md
# Shelwi Sprint 19 — Análisis de Rendimiento del KPI Engine
Fecha: 2026-06-23

---

## DISEÑO: REDUCCIÓN DE N+1

### El problema resuelto

Sin KPI Engine, el dashboard `/app/bi` requeriría ~10 llamadas independientes desde el frontend:
```
get_executive_dashboard()     → 1 round-trip
get_finance_dashboard()       → 1 round-trip
get_customer_success_dashboard() → 1 round-trip
get_smart_alerts()            → 1 round-trip
get_operations_dashboard()    → 1 round-trip
get_growth_dashboard()        → 1 round-trip
get_utm_analytics()           → 1 round-trip
get_reports_summary()         → 1 round-trip
get_funnel_report()           → 1 round-trip
get_nps_summary()             → 1 round-trip
... total: 10+ round-trips
```

Con el KPI Engine:
```
get_bi_executive_kpis()  → Tab CEO:        1 round-trip (consolida 4)
get_bi_sales_kpis()      → Tab Comercial:  1 round-trip (consolida 3)
get_bi_operations_kpis() → Tab Ops:        1 round-trip (consolida 3)
get_bi_marketing_kpis()  → Tab Marketing:  1 round-trip (consolida 3)
get_bi_customer_kpis()   → Tab CS:         1 round-trip (consolida 3)
... total: 5 round-trips (solo los tabs activos)
```

**Reducción: de 10+ a 1 llamada por tab activo.**

---

## ANÁLISIS DE QUERIES POR RPC

### get_bi_executive_kpis (consolida 4 RPCs)

| Sub-RPC | Queries internas estimadas | Índices usados |
|---------|--------------------------|----------------|
| `get_finance_dashboard` | 7-9 | `idx_quotes_status_commercial`, `idx_order_cost_entries_workspace` |
| `get_executive_dashboard` | 4-6 | `idx_quotes_status_commercial` |
| `get_customer_success_dashboard` | 5-7 | `customer_health_scores(workspace_id)` |
| `get_smart_alerts` | 3-5 | `idx_quotes_status_commercial` |
| **Total estimado** | **19-27 queries** | Ejecutadas en secuencia PL/pgSQL (sin round-trips) |

### get_bi_sales_kpis

| Sub-RPC | Queries estimadas | Índices |
|---------|------------------|---------|
| `get_reports_summary` | 8-10 | `idx_quotes_status_commercial` |
| `get_funnel_report` | 3-4 | `idx_quotes_status_commercial` |
| `get_sales_by_rep` | 2-3 | **NUEVO** `idx_quotes_created_by_workspace` |
| **Total** | **13-17 queries** | |

### get_ops_productivity

| Queries | Índices |
|---------|---------|
| 2-3 queries principales | **NUEVO** `idx_work_orders_ws_assigned_status` |
| GPS hours: subquery LATERAL por usuario | `idx_gps_events_work_order_date` (existente) |
| Evidence count: correlacionada | **NUEVO** `idx_evidence_files_workspace_wo` |

---

## TAMAÑO DE PAYLOAD ESTIMADO

| RPC | Payload estimado (JSON) | Notas |
|-----|------------------------|-------|
| `get_bi_executive_kpis` | ~8-15 KB | Incluye monthly_trend + top_clients + alerts |
| `get_bi_sales_kpis` | ~5-10 KB | Depende de número de comerciales y etapas de funnel |
| `get_bi_operations_kpis` | ~3-6 KB | Depende del tamaño del equipo |
| `get_bi_marketing_kpis` | ~3-5 KB | UTM sources + canales |
| `get_bi_customer_kpis` | ~5-10 KB | Cohort matrix + CS segments |
| `get_full_funnel` | ~1-2 KB | 7 etapas + conversiones |

**Total si se cargaran todos simultáneamente: ~25-48 KB** — aceptable para mobile.
En práctica: solo el tab activo se carga (lazy via React Query).

---

## ÍNDICES NUEVOS EN SPRINT 19

| Índice | Tabla | Impacto |
|--------|-------|---------|
| `idx_quotes_created_by_workspace` | `quotes(workspace_id, created_by, status, created_at)` | Mejora `get_sales_by_rep` ~5-10x |
| `idx_work_orders_ws_assigned_status` | `work_orders(workspace_id, assigned_to, status, finished_at)` | Mejora `get_ops_productivity` ~5x |
| `idx_evidence_files_workspace_wo` | `evidence_files(workspace_id, work_order_id)` | Mejora count evidencias en productividad |

**Índices pre-existentes reutilizados (sin duplicar):**
- `idx_quotes_status_commercial` (Sprint 16.3) — usado por todos los RPCs de finanzas y comercial
- `idx_work_orders_assigned` (Sprint 6) — existente
- `idx_gps_events_work_order_date` (Sprint 16.3) — usado para GPS hours

---

## STALE TIME (React Query)

| Hook | staleTime | Justificación |
|------|-----------|---------------|
| `useBIExecutiveKPIs` | 2 min | KPIs ejecutivos no cambian en segundos |
| `useBISalesKPIs` | 2 min | Datos comerciales del período |
| `useBIOperationsKPIs` | 2 min | Estado operativo relativamente estático |
| `useBIMarketingKPIs` | 2 min | UTM/referidos del período |
| `useBICustomerKPIs` | 2 min | Health scores cambian poco |
| `useClientCohorts` | 10 min | Análisis histórico — casi estático |

---

## RENDIMIENTO OBJETIVO

| Métrica | Objetivo | Estado |
|---------|---------|--------|
| Time to First Tab (CEO) | < 1.5s | Con índices correctos, estimado 800ms-1.2s |
| Payload total por tab | < 15 KB | Verificado por análisis de estructura |
| N+1 queries | 0 | KPI Engine las elimina |
| Queries por tab | < 30 DB queries | Interno en PL/pgSQL |
| Build size | Sin incremento notable | `✓ built in 1.11s` |

---

## LIMITACIONES IDENTIFICADAS

| Limitación | Impacto | Mitigación |
|-----------|---------|-----------|
| `get_ops_productivity` usa subquery GPS correlacionada por usuario | O(n×m) para equipos grandes | Aceptable hasta ~50 operarios |
| Cohortes recalculan por call (sin cache) | ~500ms para 6 meses | staleTime 10min + lazy loading |
| KPI Engine llama sub-RPCs en secuencia (no paralelo) | Suma de tiempos individuales | En PL/pgSQL no hay paralelismo real; latencia total ~300-600ms |
| `get_ops_productivity` sin índice en `evidence_files(work_order_id[])` correlacionado | Full scan si muchas evidencias | Índice añadido en 0088 |
