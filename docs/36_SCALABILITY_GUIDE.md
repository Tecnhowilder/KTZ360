# SCALABILITY GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Estrategia de escalabilidad para soportar crecimiento de Shelwi

---

## 1. ESTADO ACTUAL Y PROYECCIÓN

| Fase | Empresas activas | Usuarios | Filas DB estimadas | Plan Supabase |
|---|---|---|---|---|
| Actual (v1.4) | ~10-50 | ~100-500 | ~500K | Pro |
| Corto plazo (v1.6) | ~100-500 | ~1K-5K | ~5M | Pro |
| Mediano plazo (v2.0) | ~1K-5K | ~10K-50K | ~50M | Pro/Business |
| Largo plazo (v3.0) | 10K+ | 100K+ | 500M+ | Business/Enterprise |

---

## 2. BOTTLENECKS CONOCIDOS Y SOLUCIONES

### 2.1 Base de datos

**Problema:** Tablas de alta escritura crecen indefinidamente.

**Tablas en riesgo:**
- `audit_log` — INSERT por cada acción de usuario/agente
- `ai_usage` — INSERT por cada llamada IA
- `gps_events` — INSERT por cada check-in/out/waypoint
- `agent_executions` — INSERT por cada ejecución de agente

**Solución: Partitioning por fecha**

```sql
-- Implementación planificada para cuando superen 5M filas
ALTER TABLE audit_log RENAME TO audit_log_legacy;

CREATE TABLE audit_log (
  LIKE audit_log_legacy INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_log_2025 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE audit_log_2026 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

**Solución: Archivado automático**

```sql
-- pg_cron: archivar audit_log de más de 1 año
SELECT cron.schedule('archive-old-audit-log', '0 2 1 * *',
  $$DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '1 year'$$
);
```

### 2.2 Edge Functions — Cold Starts

**Problema:** Edge Functions tienen cold start si no se han invocado recientemente.

**Solución:** Keep-warm pings para funciones críticas:
```sql
-- pg_cron: ping ai-proxy cada 5 minutos para mantener caliente
SELECT cron.schedule('keep-warm-ai-proxy', '*/5 * * * *',
  $$SELECT net.http_post(url := 'https://xxx.supabase.co/functions/v1/ai-proxy', body := '{"ping":true}')$$
);
```

### 2.3 AI Usage — Costos

**Problema:** Sin límites, una empresa podría generar costos descontrolados de IA.

**Solución actual** (implementar en FASE 2):
```sql
-- Verificar créditos antes de cada invocación
CREATE FUNCTION check_ai_credits(p_workspace_id UUID) RETURNS BOOLEAN AS $$
  SELECT
    COALESCE(SUM(estimated_cost_usd), 0) < ai_budget_monthly_usd
  FROM ai_usage
  WHERE company_id = p_workspace_id
    AND created_at >= date_trunc('month', NOW());
$$ LANGUAGE SQL SECURITY DEFINER;
```

---

## 3. ÍNDICES — ESTRATEGIA

### 3.1 Índices obligatorios en toda tabla de negocio

```sql
-- Índice por empresa (para RLS y queries)
CREATE INDEX idx_[tabla]_company ON public.[tabla](company_id);

-- Índice por fecha (para queries con filtro temporal)
CREATE INDEX idx_[tabla]_created_at ON public.[tabla](company_id, created_at DESC);
```

### 3.2 Índices para queries frecuentes

```sql
-- tasks — queries más frecuentes
CREATE INDEX idx_tasks_assignee ON tasks(company_id, assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due_date ON tasks(company_id, due_date) WHERE status != 'completed';

-- invoices — queries de cobranza
CREATE INDEX idx_invoices_overdue ON invoices(company_id, due_date, status) WHERE status IN ('sent', 'overdue');

-- ai_usage — queries de costos
CREATE INDEX idx_ai_usage_monthly ON ai_usage(company_id, created_at, estimated_cost_usd);
```

### 3.3 Identificar queries lentas

```sql
-- Ver queries más lentas (requiere pg_stat_statements)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## 4. CACHE STRATEGY

### 4.1 TanStack Query (frontend)

```typescript
// Datos que cambian poco: cache largo
{ staleTime: 30 * 60 * 1000 }  // 30 min: plan_features, workspace settings

// Datos de negocio: cache medio
{ staleTime: 5 * 60 * 1000 }   // 5 min: clients, invoices

// Datos que cambian frecuente: cache corto
{ staleTime: 60 * 1000 }        // 1 min: dashboard metrics, tasks
```

### 4.2 Supabase — Materialized Views (futuro)

Para el Dashboard Ejecutivo, cuando las queries sean muy pesadas:

```sql
-- Vista materializada del resumen de empresa
CREATE MATERIALIZED VIEW workspace_metrics AS
SELECT
  company_id,
  COUNT(DISTINCT client_id) as active_clients,
  -- ... más métricas
FROM quotes q
GROUP BY company_id;

-- Refrescar cada hora
SELECT cron.schedule('refresh-metrics', '0 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY workspace_metrics$$
);
```

---

## 5. HORIZONTAL SCALING (largo plazo)

Cuando Supabase Pro no sea suficiente:

| Escenario | Solución |
|---|---|
| DB reads lentos | Read replicas (Supabase Business) |
| Storage lleno | S3 compatible externo (Supabase puede conectar a S3) |
| Supabase Business limit | Supabase Enterprise o self-hosted |
| Edge Functions saturadas | Considerar workers dedicados para automation-scheduler |

---

## 6. MONITORING DE ESCALABILIDAD

Revisar mensualmente:
- Tamaño de tablas clave (`pg_relation_size('audit_log')`)
- Queries lentas (`pg_stat_statements`)
- Costo mensual de IA (`ai_usage`)
- Storage usado (`supabase storage list`)
- Supabase dashboard: CPU, connections, memory

---

*Ver: `docs/25_PLATFORM_STABILITY_GUIDE.md` para capacity planning*
*Ver: `docs/37_PERFORMANCE_BUDGET.md` para presupuesto de performance frontend*
*Ver: `docs/13_DATA_DICTIONARY.md` para el schema actual de las tablas críticas*
