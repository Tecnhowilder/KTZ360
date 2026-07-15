# PLATFORM STABILITY GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Prácticas para mantener la plataforma estable en producción
> Objetivo: 99.9% uptime (< 9h downtime/año)

---

## 1. FILOSOFÍA DE ESTABILIDAD

> "Primero no romper. Luego mejorar."

En Shelwi, la estabilidad de la plataforma para empresas activas es prioritaria sobre la velocidad de entrega de nuevas features. Un downtime de 1 hora para una PYME que usa Shelwi para operar es pérdida real de negocio.

---

## 2. REGLAS DE PRODUCCIÓN

### 2.1 Deployments

- **Nunca deployar los viernes después de las 4pm** (ni fines de semana)
- **Nunca deployar durante horas pico** (9am-12pm, 2pm-5pm hora local de la mayoría de clientes)
- Todo deploy va a **staging primero** — mínimo 30 minutos de smoke tests antes de producción
- Mantener siempre la capacidad de **rollback en < 5 minutos**
- Deployments de Edge Functions: actualizar una función a la vez, no todas simultáneamente

### 2.2 Migraciones de base de datos

```
REGLA DE ORO: Toda migration en producción debe ser:
1. Backwards compatible (no rompe código que ya está deployado)
2. Reversible (existe un rollback definido)
3. Ejecutada en ventana de mantenimiento (horario de bajo uso)
4. Probada en staging con datos reales antes de producción
```

**Migraciones seguras:**
- ✅ `ALTER TABLE ADD COLUMN` (con DEFAULT o nullable)
- ✅ `CREATE TABLE` nueva
- ✅ `CREATE INDEX CONCURRENTLY`
- ✅ `CREATE FUNCTION` / `CREATE POLICY`

**Migraciones peligrosas (requieren ventana de mantenimiento):**
- ⚠️ `ALTER TABLE DROP COLUMN`
- ⚠️ `ALTER TABLE ALTER COLUMN TYPE`
- ⚠️ `DROP TABLE`
- ⚠️ Cambiar `CHECK constraints` en tablas con millones de filas

### 2.3 Feature flags para rollouts progresivos

Para features de alto riesgo, activar progresivamente usando `plan_features`:

```sql
-- Fase 1: Activar solo para plan Enterprise (pocos clientes)
UPDATE plan_features SET enabled = true WHERE plan_code = 'enterprise' AND feature_key = 'new_feature';

-- Fase 2: Si sin problemas, extender a Business
UPDATE plan_features SET enabled = true WHERE plan_code = 'business_os' AND feature_key = 'new_feature';

-- Fase 3: Growth, Start, etc.
```

---

## 3. PERFORMANCE BUDGET

### 3.1 Frontend

| Métrica | Budget | Alerta si supera |
|---|---|---|
| Bundle JS principal | < 300 KB gzip | 350 KB |
| LCP (P75) | < 2.5s | 3s |
| TTI (Time to Interactive) | < 4s en 4G | 5s |
| CLS | < 0.1 | 0.15 |
| Imágenes sin lazy loading | 0 fuera del viewport | — |

### 3.2 Backend (Edge Functions)

| Métrica | Budget | Alerta si supera |
|---|---|---|
| Latencia P95 non-AI | < 500ms | 800ms |
| Latencia P95 ai-proxy | < 5s | 8s |
| Error rate (5xx) | < 0.1% | 0.5% |
| Cold start de Edge Function | < 200ms | — |

### 3.3 Base de datos

| Métrica | Budget | Acción |
|---|---|---|
| Queries sin índice en tablas > 10k filas | 0 | Agregar índice |
| Queries lentas (> 100ms) | Identificar y optimizar | EXPLAIN ANALYZE |
| Connections activas (max pool) | < 80% del límite | Escalar o optimizar |
| Tabla ai_usage / audit_log sin particionar | Riesgo alto > 1M filas | Particionar |

---

## 4. MONITOREO DE ESTABILIDAD

### 4.1 Health check diario (manual — hasta automatizar)

Revisar cada día hábil:
- [ ] Supabase Dashboard: CPU y conexiones DB normales
- [ ] Edge Functions: 0 errores en las últimas 24h
- [ ] `audit_log`: actividad normal (sin spikes sospechosos)
- [ ] `ai_usage`: costo total del día dentro del presupuesto
- [ ] `integration_events`: 0 eventos en estado `failed` sin atender
- [ ] `automations`: error_count de todas las automatizaciones en 0

### 4.2 Herramientas disponibles

| Herramienta | Qué monitorea | Acceso |
|---|---|---|
| Supabase Dashboard | DB, Auth, Storage, Edge Functions | supabase.com |
| Sentry | Errores frontend + transacciones | sentry.io |
| `ai-health-check` Edge Function | Proveedores de IA | GET /functions/v1/ai-health-check |
| `ai-benchmark` Edge Function | Performance de modelos | POST /functions/v1/ai-benchmark |

---

## 5. DEPENDENCY MANAGEMENT

### 5.1 Actualización de dependencias

- **Patch versions** (1.2.3 → 1.2.4): actualizar libremente, hacer PR
- **Minor versions** (1.2.x → 1.3.0): revisar changelog, probar en staging
- **Major versions** (1.x.x → 2.0.0): sesión de trabajo dedicada, test exhaustivo

**Nunca actualizar simultáneamente:**
- Supabase JS + Vite + React en el mismo PR
- Si hay múltiples updates pendientes, hacerlos en PRs separados y secuenciales

### 5.2 Dependencias a mantener estables (no actualizar sin razón)

| Dependencia | Razón de estabilidad |
|---|---|
| `@supabase/supabase-js` | Core del sistema — cada update puede romper queries |
| `dexie` | IndexedDB offline — actualizaciones pueden romper el schema |
| `@capacitor/*` | Bridge nativo — requiere rebuild y re-submit a tiendas |
| `typescript` | Actualizar TSConfig es trabajo de refactor |

---

## 6. CAPACITY PLANNING

### 6.1 Límites actuales del plan Supabase

(Verificar en Dashboard — estos varían por plan contratado)

| Recurso | Límite aproximado | Acción al 80% |
|---|---|---|
| DB size | Varía por plan | Purgar/archivar audit_log antiguo |
| Edge Function invocations | Varía por plan | Revisar llamadas innecesarias |
| Auth users | Ilimitado en Pro | — |
| Storage | Varía por plan | Comprimir imágenes antes de subir |
| Bandwidth | Varía por plan | Optimizar queries pesadas |

### 6.2 Crecimiento esperado

| Crecimiento | Impacto en DB | Acción preventiva |
|---|---|---|
| 100 empresas activas | ~5M filas en tablas core | Índices en todas las queries frecuentes |
| 500 empresas activas | ~25M filas | Particionar `ai_usage` y `audit_log` |
| 1000+ empresas activas | ~50M+ filas | Evaluar partitioning adicional, read replicas |

---

## 7. ROLLBACK PLAN POR TIPO DE CAMBIO

| Tipo de cambio | Cómo hacer rollback | Tiempo estimado |
|---|---|---|
| Edge Function | Re-deploy versión anterior (git checkout + deploy) | 5 min |
| Frontend | Revert en hosting (Vercel/similar) | 2 min |
| Migration aditiva (ADD COLUMN) | Irreversible, pero sin impacto | N/A |
| Migration destructiva (DROP) | Restore desde backup de Supabase | 15-60 min |
| Cambio de secret | Restaurar valor anterior + supabase secrets set | 5 min |
| npm dependency | `git revert` del commit + redeploy | 10 min |

---

*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para recovery ante fallos mayores*
*Ver: `docs/21_OBSERVABILITY_GUIDE.md` para alertas y métricas*
*Ver: `docs/36_PERFORMANCE_BUDGET.md` para detalles de performance budget frontend*
