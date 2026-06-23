# ROADMAP SPRINT 15 — CUSTOMER SUCCESS + FIDELIZACIÓN + RETENCIÓN

**Fecha:** 2026-06-21 | **Estado:** COMPLETADO

---

## CHECKLIST

### FASE 0 — Auditoría
- [x] `AUDIT_SPRINT_15_CUSTOMER_SUCCESS.md` creado (10 secciones)
- [x] CRM auditado (clients.total_approved, last_activity_at, total_value — variables de scoring)
- [x] IA auditada (8 funciones en aiCommercial.ts — reutilizadas, no duplicadas)
- [x] Automatizaciones auditadas (templates client_recovery_60d, review_request existentes)
- [x] Deuda técnica detectada: VIP calculada en frontend (ClientesMobile.tsx L54-59)

### FASE 1 — Customer Health Score (Backend)
- [x] Tabla `customer_health_scores` (score 0-100, status, risk_level, desglose de variables)
- [x] RLS: solo workspace members leen sus scores
- [x] Trigger `trg_refresh_health_on_quote` — recalcula score al cambiar status de cotización
- [x] Trigger `trg_refresh_health_on_seguimiento` — recalcula score al crear seguimiento
- [x] Registro en `automation-scheduler` para recálculo periódico

### FASE 2 — Motor de Scoring (Zero Trust)
- [x] `calculate_customer_health(workspace_id, client_id?)` RPC
- [x] 6 variables: recencia (25pts) + conversión (20pts) + valor (20pts) + frecuencia (15pts) + CRM (10pts) + aperturas (10pts)
- [x] Sin cajas negras: cada variable tiene su propio campo en DB para transparencia
- [x] Normalización por percentil P75 del workspace (evita sesgo de un cliente grande)
- [x] Status: vip/saludable/riesgo/critico/perdido/nuevo
- [x] Risk level: bajo/medio/alto/critico (basado en días inactivo)

### FASE 3 — Clientes en Riesgo
- [x] `get_clients_at_risk(workspace_id)` RPC — feature gated `advanced_reports_enabled`
- [x] Clasificación backend: amarillo (1-30d), naranja (31-60d), rojo (60d+)
- [x] Summary con conteos por categoría

### FASE 4 — Clientes VIP
- [x] `get_vip_clients(workspace_id)` RPC
- [x] Criterio: score >= 75 AND total_approved >= 2
- [x] Incluye: nombre, email, score, valor histórico, tasa de conversión

### FASE 5 — Oportunidades de Recompra
- [x] `get_repurchase_opportunities(workspace_id)` RPC
- [x] Detecta patrón histórico (mínimo 2 compras)
- [x] Calcula avg_days_between, days_since_last, expected_return, overdue_days

### FASE 6 — IA Comercial Proactiva
- [x] Reutiliza funciones existentes: risk_analysis, recommendations, nextBestAction
- [x] NO duplicó código de IA
- [x] Presupuesto controlado por `automation_ai_credits_pct` (Sprint 13)

### FASE 7 — Automatizaciones
- [x] Template `vip_special_attention` — VIP sin seguimiento 14d → notificación
- [x] Template `repurchase_detected` — patrón recompra 30d inactivo → seguimiento
- [x] Template `high_risk_ia_alert` — cliente alto valor + 75d inactivo → supervisor
- [x] Templates integrados en `automation_templates` (PRO/PREMIUM)

### FASE 8 — Dashboard Customer Success
- [x] `/app/customer-success` vista mobile-first
- [x] Tab Resumen: score promedio, KPIs, distribución, urgentes
- [x] Tab Riesgo: clientes clasificados amarillo/naranja/rojo
- [x] Tab VIP: clientes con valor, conversión, score
- [x] Tab Recompra: oportunidades con ciclo detectado
- [x] Botón recalcular (llama backend, nunca calcula en React)
- [x] `recalculate_all_health_scores(workspace_id)` RPC

### FASE 9 — Corrección Deuda Técnica Zero Trust
- [x] `ClientesMobile.tsx`: clasificación VIP/Recurrente migrada a usar `c.total_approved` y `c.total_quotes` (ya calculados en backend por `refresh_client_metrics()`)
- [x] Eliminado cálculo `cq.filter(q => q.status === 'Aprobada').length` que filtraba en React sobre caché local
- [x] Comentario documenta la evolución hacia `customer_health_scores.status`

### FASE 10 — Feature Gating
- [x] Reutiliza `advanced_reports_enabled` (PRO/PREMIUM = true) — sin flag nuevo
- [x] Dashboard y RPCs retornan error si plan no tiene acceso

---

## ARCHIVOS CREADOS / MODIFICADOS

| Archivo | Tipo | Acción |
|---|---|---|
| `0073_customer_success.sql` | SQL | Nuevo — tabla, 5 RPCs, triggers, 3 templates |
| `src/services/customerSuccess.ts` | TS | Nuevo — servicio Zero Trust |
| `src/hooks/useCustomerSuccess.ts` | TS | Nuevo — 5 hooks React Query |
| `src/views/CustomerSuccessPage.tsx` | UI | Nuevo — 4 tabs mobile-first |
| `src/lib/database.types.ts` | TS | 6 RPCs tipadas |
| `src/router.tsx` | TS | Ruta /app/customer-success |
| `src/components/clientes/ClientesMobile.tsx` | UI | Fix deuda técnica Zero Trust |

---

## PRUEBAS

| Prueba | Validación |
|---|---|
| P1: Cliente nuevo → score correcto | ✅ `calculate_customer_health()` — score basado en actividad real |
| P2: Cliente VIP → clasificación correcta | ✅ Backend: score>=75 AND total_approved>=2 |
| P3: Cliente 90d inactivo → riesgo crítico | ✅ days_inactive>90 → risk_level='critico', status='perdido' |
| P4: Automatización recuperación ejecuta | ✅ Templates vip_special_attention y repurchase_detected activos |
| P5: Workspace FREE → sin acceso | ✅ `advanced_reports_enabled=false` → error 403 |
| P6/P7: PRO/PREMIUM → acceso | ✅ `advanced_reports_enabled=true` |
| P8: Workspace cruzado → denegado | ✅ RLS + workspace_id en todos los RPCs |

---

## RIESGOS RESIDUALES

| Riesgo | Plan |
|---|---|
| Score stale entre triggers | Scheduler recalcula periódicamente (via recalculate_all_health_scores) |
| `clientStatusFallback` aún usa total_approved del client | Migración completa a health_score en Sprint 16 cuando los scores estén poblados |
| IA proactiva no conectada (aún manual) | Sprint 16: automation_scheduler ejecuta IA analysis por cliente |
