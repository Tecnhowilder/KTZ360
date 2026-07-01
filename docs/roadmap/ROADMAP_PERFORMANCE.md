# ROADMAP DE OPTIMIZACIÓN DE RENDIMIENTO — SHELWI
**Basado en:** AUDIT_PERFORMANCE.md + PERFORMANCE_SCORECARD.md  
**Principio:** Seguridad primero. Ninguna optimización rompe Zero Trust ni RLS.  
**Estado:** Pendiente de aprobación. Sin implementación aún.

---

## FASE P1 — INMEDIATA (esta semana) — Score estimado: 57 → 74

Cambios de bajo riesgo, alto impacto. Sin refactors estructurales.

### P1.1 — Eliminar polling de `useAICredits`
**Archivo:** `src/hooks/useAICredits.ts`  
**Problema:** `refetchInterval: 60_000` genera 14M queries/día a 10K usuarios  
**Fix:** Eliminar `refetchInterval`, usar `invalidateQueries` cuando el usuario consume créditos  
**Impacto:** Elimina el 90% de carga innecesaria en la tabla `ai_usage`  
**Riesgo:** Bajo — los créditos se refrescan al navegar normalmente

### P1.2 — Reducir MAX_EVENTS_PER_RUN en integration-worker
**Archivo:** `supabase/functions/integration-worker/index.ts`  
**Problema:** 20 eventos × Drive sync = >60s → timeout garantizado  
**Fix:** Cambiar constante a 5 eventos por run  
**Impacto:** Elimina timeouts. Scheduler sigue procesando todo, pero en más iteraciones  
**Riesgo:** Bajo — los eventos pendientes se procesan en el siguiente ciclo (1 minuto)

### P1.3 — Crear índice compuesto en `quotes.commercial_status`
**Migración:** Nueva (0078_performance_indexes.sql)
```sql
CREATE INDEX CONCURRENTLY idx_quotes_status_commercial
  ON public.quotes(workspace_id, commercial_status, created_at DESC)
  WHERE deleted_at IS NULL;
```
**Impacto:** Mejora get_crm_dashboard, get_pipeline, get_funnel_report, get_smart_alerts  
**Riesgo:** Zero — `CONCURRENTLY` no bloquea escrituras

### P1.4 — Crear índice en `seguimientos(quote_id, created_at)`
**Migración:** Incluir en P1.3
```sql
CREATE INDEX CONCURRENTLY idx_seguimientos_quote_date
  ON public.seguimientos(quote_id, created_at DESC);
```
**Impacto:** Mejora NOT EXISTS en get_crm_dashboard línea 375  
**Riesgo:** Zero

### P1.5 — Crear índice en `integration_events` para worker
**Migración:** Incluir en P1.3
```sql
CREATE INDEX CONCURRENTLY idx_integration_events_poll
  ON public.integration_events(workspace_id, status, execute_after)
  WHERE status IN ('pending', 'failed', 'retry');
```
**Impacto:** Scheduler encuentra eventos pendientes 5-10x más rápido  
**Riesgo:** Zero

---

## FASE P2 — CORTO PLAZO (2 semanas) — Score estimado: 74 → 83

Optimizaciones de queries y bundle. Requieren más testing.

### P2.1 — Refactorizar N+1 en `list_orders()`
**Archivo:** `supabase/migrations/0051_orders_rpc.sql`  
**Problema:** 2 subqueries por orden → cambiar a LEFT JOIN agrupado  
```sql
-- Antes (N+1):
'work_order_count', (SELECT count(*) FROM work_orders WHERE order_id = o.id),
'work_orders_done', (SELECT count(*) FROM work_orders WHERE order_id = o.id AND status = 'finalizada')

-- Después (1 JOIN):
LEFT JOIN (
  SELECT order_id,
    count(*) AS woc,
    count(*) FILTER (WHERE status = 'finalizada') AS wod
  FROM public.work_orders GROUP BY order_id
) wo_stats ON wo_stats.order_id = o.id
-- Luego usar wo_stats.woc y wo_stats.wod
```
**Impacto:** -50% queries en listado de pedidos  
**Riesgo:** Bajo — resultado idéntico, solo más eficiente

### P2.2 — Lazy loading de `xlsx`
**Archivo:** `src/components/catalog/ImportCatalogModal.tsx`  
**Problema:** `import * as XLSX from 'xlsx'` → +800KB siempre en bundle  
**Fix:** Dynamic import solo cuando el usuario abre el modal
```typescript
// Antes:
import * as XLSX from 'xlsx';

// Después:
const XLSX = await import('xlsx');
```
**Impacto:** -800KB del bundle inicial → -2-3s en primera carga en conexiones lentas  
**Riesgo:** Bajo — solo cambia el momento de carga, no la funcionalidad

### P2.3 — Lazy loading de `maplibre-gl`
**Archivo:** Componente que importa maplibre  
**Fix:** Usar `React.lazy()` + `Suspense` para el componente de mapa  
**Impacto:** -350KB del bundle inicial  
**Riesgo:** Bajo — el mapa se carga solo cuando se navega a la vista GPS

### P2.4 — Índices adicionales (lote 2)
**Migración:** Nueva (0079_performance_indexes_2.sql)
```sql
-- Índice para quote_views en reports
CREATE INDEX CONCURRENTLY idx_quote_views_quote_opened
  ON public.quote_views(quote_id, opened_at DESC);

-- Índices para audit_log (admin panel)
CREATE INDEX CONCURRENTLY idx_audit_log_action_date
  ON public.audit_log(action, created_at DESC);

CREATE INDEX CONCURRENTLY idx_audit_log_user_date
  ON public.audit_log(user_id, created_at DESC);

-- Índice para notificaciones
CREATE INDEX CONCURRENTLY idx_notifications_workspace_unread
  ON public.notifications(workspace_id, is_read, created_at DESC);
```
**Impacto:** Mejora admin panel auditoría, reports, notificaciones  
**Riesgo:** Zero (CONCURRENTLY)

### P2.5 — Aumentar staleTime en useQuotes
**Archivo:** `src/hooks/useQuotes.ts`  
**Problema:** `staleTime: 0` refetch en cada component mount  
**Fix:** `staleTime: 30_000` (30 segundos)  
**Impacto:** Reduce fetches en navegación entre vistas  
**Riesgo:** Mínimo — datos pueden estar 30s desactualizados (aceptable)

---

## FASE P3 — MEDIO PLAZO (1 mes) — Score estimado: 83 → 89

Refactorizaciones más profundas. Requieren análisis cuidadoso.

### P3.1 — Refactorizar `get_reports_summary()` serie mensual
**Archivo:** `supabase/migrations/0049_reports_rpc.sql`  
**Problema:** `date_trunc()` en JOIN no usa índice  
**Fix:** Cambiar a comparación de rangos directa
```sql
-- Antes (no indexable):
and date_trunc('month', q.created_at)::date = d.month

-- Después (indexable):
and q.created_at >= d.month
and q.created_at < d.month + interval '1 month'
```
**Impacto:** Elimina 12 full table scans en reporte mensual  
**Riesgo:** Medio — requiere validación de que los resultados son idénticos

### P3.2 — Desacoplar RPC calls de triggers de integración
**Archivos:** `supabase/migrations/0064_integrations_triggers.sql`  
**Problema:** Triggers llaman RPCs en serie (hasta 6 calls por UPDATE)  
**Fix:** En lugar de llamar RPC directamente, hacer INSERT directo en `integration_events`
```sql
-- Antes (lento):
PERFORM public.queue_integration_event(workspace_id, 'google_calendar', ...)
PERFORM public.queue_integration_event(workspace_id, 'outlook_calendar', ...)
PERFORM public.queue_integration_event(workspace_id, 'whatsapp', ...)

-- Después (1 INSERT por evento):
INSERT INTO public.integration_events(workspace_id, provider, event_type, payload)
VALUES
  (new.workspace_id, 'google_calendar', 'calendar_create', v_payload),
  (new.workspace_id, 'outlook_calendar', 'calendar_create', v_payload),
  (new.workspace_id, 'whatsapp', 'order_created', v_payload);
-- 1 bulk INSERT en lugar de 3 RPCs = 3x más rápido
```
**Impacto:** Reduce cascada de 18 ops → 5 ops en work_order UPDATE  
**Riesgo:** Medio — requiere verificar que worker procesa correctamente

### P3.3 — Refactorizar `get_executive_dashboard()`
**Archivo:** `supabase/migrations/0049_reports_rpc.sql`  
**Problema:** 7 subqueries sin LIMIT + jsonb_object_agg sin garantía  
**Fix:** Consolidar en 2 queries con CTE:
```sql
WITH base_quotes AS (
  SELECT commercial_status, count(*) as cnt, sum(total)::numeric as val
  FROM public.quotes
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
    AND created_at >= now() - interval '90 days'
  GROUP BY commercial_status
)
SELECT jsonb_object_agg(commercial_status, jsonb_build_object('count', cnt, 'valor', val))
FROM base_quotes;
```
**Impacto:** Reduce de 7 subqueries a 1 CTE → 5-7x más rápido  
**Riesgo:** Medio — requiere validación exhaustiva de resultados

### P3.4 — TTL para `audit_log`
**Nueva migración:**
```sql
-- Job de limpieza mensual
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < now() - interval '2 years';
END;
$$;
-- Configurar como pg_cron job mensual
```
**Impacto:** Previene crecimiento descontrolado a 10K workspaces  
**Riesgo:** Bajo — 2 años de historial es suficiente para compliance

---

## FASE P4 — LARGO PLAZO (3 meses) — Score estimado: 89 → 95

Cambios arquitectónicos. Solo necesarios a escala de 10K+ workspaces.

### P4.1 — Materializar vistas de reportes
**Objetivo:** Cachear resultados de get_reports_summary en tabla materializada  
**Mecanismo:** Tabla `reports_cache` + refresh cada 4 horas via automation-scheduler  
**Impacto:** Reportes instantáneos (~50ms) en lugar de ~5s  
**Prerequisito:** P3.1 implementado primero

### P4.2 — Particionamiento de `audit_log` por mes
**Objetivo:** Partition table por rango de fecha  
**Mecanismo:** `PARTITION BY RANGE (created_at)`  
**Impacto:** Queries a audit_log solo escanean la partición relevante  
**Prerequisito:** P3.4 implementado y validado

### P4.3 — Caché de plan_code en workspace
**Objetivo:** Evitar llamada a `get_effective_plan_code()` en cada trigger de storage  
**Mecanismo:** Columna `cached_plan_code` en workspaces, actualizada en cambio de suscripción  
**Impacto:** Elimina RPC en trigger `trg_workspace_storage_alert`  
**Prerequisito:** Auditoría de consistencia de datos

### P4.4 — Paginación keyset en `admin_get_audit_log()`
**Objetivo:** Reemplazar OFFSET por cursor basado en `id`  
**Mecanismo:** `WHERE id < p_cursor ORDER BY id DESC LIMIT 100`  
**Impacto:** Queries constantes en tiempo independiente del offset  
**Prerequisito:** Frontend actualizado para manejar cursor

---

## RESUMEN EJECUTIVO DEL PLAN

| Fase | Plazo | Esfuerzo | Score | Cambios |
|------|-------|---------|-------|---------|
| **P1** | Esta semana | 🟢 Bajo | 57 → 74 | 5 cambios simples |
| **P2** | 2 semanas | 🟡 Medio | 74 → 83 | 5 cambios moderados |
| **P3** | 1 mes | 🟠 Alto | 83 → 89 | 4 refactors |
| **P4** | 3 meses | 🔴 Muy alto | 89 → 95 | Cambios arquitectónicos |

### Prioridad absoluta (hacer ANTES de 1.000 workspaces):
1. ✋ Eliminar polling useAICredits (P1.1)
2. ✋ Reducir MAX_EVENTS integration-worker (P1.2)
3. ✋ Crear índice compuesto en quotes (P1.3)
4. ✋ Lazy load xlsx y maplibre (P2.2, P2.3)
5. ✋ Refactorizar N+1 en list_orders (P2.1)

**Tiempo total para P1 + P2:** ~1 semana de implementación  
**Impacto estimado:** Score 57 → 83, reducción del 80% de queries innecesarias

---

*Este roadmap no modifica funcionalidad. Solo optimiza rendimiento.*  
*Toda implementación requiere aprobación explícita antes de ejecutarse.*
