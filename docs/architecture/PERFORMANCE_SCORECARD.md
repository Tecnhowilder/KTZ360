# PERFORMANCE SCORECARD — SHELWI
**Fecha:** 22 de junio de 2026  
**Baseline:** Estado actual sin optimizaciones

---

## PUNTUACIONES

| Categoría | Puntuación | Detalle |
|-----------|-----------|---------|
| 🗄️ Base de datos (índices) | **58/100** | Índices básicos OK, faltan 10 índices críticos |
| ⚡ RPCs | **52/100** | 3 funciones CRÍTICAS, N+1 en list_orders, date_trunc en JOIN |
| 🔔 Triggers | **61/100** | Cascada peligrosa en work_orders, 18 ops por status change |
| 🚀 Edge Functions | **72/100** | integration-worker con riesgo de timeout por MAX_EVENTS=20 |
| ⚛️ Frontend | **68/100** | Polling agresivo en useAICredits, staleTime=0 en quotes |
| 📦 Bundle | **55/100** | xlsx (+800KB wildcard), maplibre sin lazy load |
| 📈 Escalabilidad | **44/100** | Sin particionamiento, audit_log crece sin TTL, sin archivado |
| 💰 Costos Supabase | **50/100** | Polling IA = 14M queries/día a 10K usuarios |

---

## **TOTAL: 57.5 / 100**

### Clasificación: 🟠 ALTO RIESGO A ESCALA

> El sistema funciona correctamente a escala actual (<100 workspaces) pero presenta problemas de arquitectura que se convertirán en críticos a partir de 1.000 workspaces activos.

---

## TOP 10 PROBLEMAS DE RENDIMIENTO

| # | Problema | Categoría | Severidad | Impacto |
|---|---------|-----------|-----------|---------|
| 1 | `useAICredits` polling cada 60s | Frontend | 🔴 CRÍTICO | 14M queries/día a 10K usuarios |
| 2 | `integration-worker` MAX_EVENTS=20 con riesgo timeout | Edge Function | 🔴 CRÍTICO | Timeout cada vez que hay 20+ eventos Drive/Alegra |
| 3 | Cascada de 18 operaciones en `work_orders.status` UPDATE | Triggers | 🔴 CRÍTICO | Bloqueos DB en momentos de alta carga |
| 4 | `get_executive_dashboard()` — 7 subqueries sin LIMIT | RPC | 🔴 CRÍTICO | 2-5s por llamada, crece con datos |
| 5 | `get_reports_summary()` — `date_trunc()` en JOIN no indexable | RPC | 🔴 CRÍTICO | Full table scan en serie mensual (12 scans) |
| 6 | Falta índice `(workspace_id, commercial_status, created_at)` en `quotes` | Índices | 🟠 ALTO | Afecta pipeline, funnel, alerts, CRM dashboard |
| 7 | `list_orders()` — N+1 (2 subqueries por orden) | RPC | 🟠 ALTO | ×1000 órdenes = 2000 queries innecesarias |
| 8 | `xlsx` importada con wildcard `import *` (+800KB bundle) | Bundle | 🟠 ALTO | Aumenta tiempo de carga inicial en 2-3s en 3G |
| 9 | `audit_log` sin TTL ni particionamiento | DB | 🟠 ALTO | 500M filas en 5 años a 10K workspaces |
| 10 | `trg_workspace_storage_alert` — RPC call en cada UPDATE de bytes | Triggers | 🟠 ALTO | 100 uploads/día = 100 RPC calls innecesarias |

---

## TOP 10 OPTIMIZACIONES RECOMENDADAS

| # | Optimización | Esfuerzo | Ganancia | ROI |
|---|-------------|---------|---------|-----|
| 1 | Eliminar `refetchInterval` en `useAICredits` (usar invalidate on-demand) | 🟢 Bajo | Elimina 14M queries/día | 🔴 MUY ALTO |
| 2 | Reducir `MAX_EVENTS_PER_RUN` de 20 a 5 en integration-worker | 🟢 Bajo | Elimina riesgo de timeout | 🔴 MUY ALTO |
| 3 | Crear índice `quotes(workspace_id, commercial_status, created_at DESC)` | 🟢 Bajo | Mejora 5 RPCs críticas | 🔴 MUY ALTO |
| 4 | Refactorizar `list_orders()` → LEFT JOIN en lugar de N+1 subqueries | 🟡 Medio | -50% queries en listado | 🟠 ALTO |
| 5 | Lazy loading de `xlsx` y `maplibre-gl` | 🟡 Medio | -1.1MB bundle inicial | 🟠 ALTO |
| 6 | Refactorizar `get_reports_summary()` → range filter en lugar de date_trunc | 🟡 Medio | Elimina 12 full table scans | 🟠 ALTO |
| 7 | Crear índice `seguimientos(quote_id, created_at DESC)` | 🟢 Bajo | Mejora NOT EXISTS en crm_dashboard | 🟡 MEDIO |
| 8 | Desacoplar RPC calls de triggers de integración (encolar en vez de llamar directo) | 🔴 Alto | Elimina cascada de 18 ops | 🟠 ALTO |
| 9 | Añadir TTL/particionamiento a `audit_log` (DELETE rows > 2 años) | 🟡 Medio | Control de crecimiento DB | 🟡 MEDIO |
| 10 | Cambiar staleTime en `useQuotes` de 0 a 30s | 🟢 Bajo | Reduce refetches en navegación | 🟡 MEDIO |

---

## RIESGOS POR ESCALA

### A 1.000 workspaces activos

| Riesgo | Probabilidad | Impacto | Mitigación necesaria |
|--------|-------------|---------|---------------------|
| `get_executive_dashboard()` timeout (>5s) | 🔴 Alta | Experiencia degradada | Caché de resultados + índices |
| `integration-worker` timeouts frecuentes | 🟠 Media | Eventos sin procesar | Reducir batch size |
| `audit_log` lenta en admin panel | 🟠 Media | Admin panel lento | Índice compuesto + paginación keyset |
| Polling IA: 60K queries/min | 🔴 Alta | Costo DB elevado | Eliminar polling |

### A 10.000 workspaces activos

| Riesgo | Probabilidad | Impacto | Mitigación necesaria |
|--------|-------------|---------|---------------------|
| `audit_log` > 500M rows sin particionamiento | 🔴 Alta | DB inutilizable | Particionamiento por fecha + archivado |
| Costo Edge Functions excede plan Pro | 🔴 Alta | $$$$ | Optimizar scheduler, reducir invocaciones |
| `useAICredits` polling = $2.000/mes solo en reads | 🔴 Alta | Costos inmanejables | Eliminar polling AHORA |
| Cascada de triggers en OTs paralelas | 🟠 Media | Bloqueos de tabla | Desacoplar triggers de integración |
| `quotes` table scan en reportes = timeout | 🔴 Alta | Reportes no cargan | Materializar vistas de reportes |

---

## CLASIFICACIÓN FINAL DE HALLAZGOS

### 🔴 CRÍTICO (requiere acción inmediata)
1. Polling `useAICredits` cada 60s
2. `integration-worker` riesgo de timeout (MAX_EVENTS=20)
3. Cascada 18 operaciones en `work_orders.status`
4. `get_executive_dashboard()` — 7 subqueries sin LIMIT
5. `get_reports_summary()` — date_trunc en JOIN no indexable

### 🟠 ALTO (resolver en 2 semanas)
6. Falta índice compuesto en `quotes.commercial_status`
7. N+1 en `list_orders()` — 2 subqueries por orden
8. `xlsx` wildcard import (+800KB)
9. `audit_log` sin TTL (crecimiento sin control)
10. `trg_workspace_storage_alert` — RPC en cada UPDATE

### 🟡 MEDIO (resolver en 1 mes)
11. Falta índice `seguimientos(quote_id, created_at)`
12. Falta índice `quote_views(quote_id, opened_at)`
13. Falta índice `integration_events` para worker polling
14. `staleTime: 0` en useQuotes
15. `maplibre-gl` sin lazy loading
16. OFFSET pagination en `admin_get_audit_log()`

### 🟢 BAJO / INFO
17. `notifications` sin índice compuesto
18. `gps_events` sin índice por work_order
19. `ai_usage` sin índice por feature
20. `work_logs` sin índice compuesto (order_id, created_at)
