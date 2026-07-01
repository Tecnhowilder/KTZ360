# ROADMAP SPRINT 13 — AUTOMATIZACIONES INTELIGENTES (NO-CODE)

**Fecha:** 2026-06-21 | **Estado:** COMPLETADO

---

## CHECKLIST GENERAL

### FASE 0 — Auditoría
- [x] `AUDIT_SPRINT_13_AUTOMATIONS.md` creado con análisis completo
- [x] CRM auditado (seguimientos, recordatorios, timeline, commercial_status)
- [x] IA auditada (ai_usage, ai_operation_costs, check/consume_ai_credits, aiCommercial.ts)
- [x] Integraciones auditadas (Sprint 11/12: integrations, credentials, events, worker)
- [x] Notificaciones auditadas
- [x] Scheduler auditado (pg_cron, expire_overdue_quotes)
- [x] Duplicados detectados y documentados

### FASE 1 — Motor Backend
- [x] `automation_templates` tabla (5 templates predefinidos) — `0068`
- [x] `automation_rules` tabla + RLS correcto — `0068`
- [x] `automation_logs` tabla (retención 180d) — `0068`

### FASE 2 — Feature Flags y Límites
- [x] `automation_enabled` en plan_features (FREE=false, PRO=true, PREMIUM=true) — `0068`
- [x] `max_automations` en plan_limits (FREE=0, PRO=5, PREMIUM=null) — `0068`
- [x] `automation_ai_credits_pct` (FREE=0%, PRO=20%, PREMIUM=30%) — `0068`
- [x] RLS `automation_rules`: support_admin = solo lectura, NO escritura — `0068` (corregido)

### FASE 3 — Anti-Loops
- [x] `execution_depth` en `integration_events` — `0068`
- [x] `parent_event_id` en `integration_events` — `0068`
- [x] `source_rule_id` en `integration_events` — `0068`
- [x] Máximo depth=3 → `blocked_loop` en automation_logs — `0069`

### FASE 4 — RPCs
- [x] `evaluate_and_queue_automations()` — motor principal con anti-loop y presupuesto IA — `0069`
- [x] `evaluate_automation_conditions()` — evalúa JSON conditions contra entidad — `0069`
- [x] `install_automation_templates()` — instala por workspace — `0069`
- [x] `create_automation_rule()` — con límite por plan — `0069`
- [x] `toggle_automation_rule()` — con límite por plan — `0069`
- [x] `list_automation_rules()` — dashboard completo — `0069`
- [x] `evaluate_periodic_automations()` — client_inactive + work_order_delayed — `0069`
- [x] `cleanup_automation_logs()` — retención 180d — `0069`
- [x] `cleanup_processed_integration_events()` — retención 90d — `0069`

### FASE 5 — Eliminar Duplicados
- [x] `trg_integrations_quote_sent` → ELIMINADO — `0070`
- [x] `trg_integrations_order_insert` → ELIMINADO — `0070`
- [x] `trg_integrations_work_order` → ELIMINADO — `0070`
- [x] `trg_integrations_seguimiento` → ELIMINADO — `0070`
- [x] `trg_integrations_recordatorio` → ELIMINADO — `0070`
- [x] Triggers genéricos de dispatch creados (quotes, orders, work_orders, clients, quote_views) — `0070`
- [x] Auto-instala templates al conectar integración — `0070`

### FASE 6 — Templates Predefinidos
- [x] Template 1: `quote_followup_72h` (quote_sent + 72h + no abierta → seguimiento)
- [x] Template 2: `client_hot_signal` (vista 3+ veces → alerta)
- [x] Template 3: `review_request_on_completion` (pedido finalizado → WhatsApp reseña)
- [x] Template 4: `client_recovery_60d` (inactivo 60d → seguimiento)
- [x] Template 5: `work_order_overdue_alert` (OT retrasada 24h → notif supervisor)

### FASE 7 — Scheduler
- [x] `automation-scheduler` Edge Function creada
- [x] Procesa `execute_after <= now()` (delayed events)
- [x] Llama `evaluate_periodic_automations()` cada minuto
- [x] Cleanup diario a las 3 AM (logs, events, oauth_states, overdue_quotes)
- [ ] Configurar schedule en Supabase Dashboard (manual, cada 1 minuto)

### FASE 8 — UI Mobile First
- [x] Ruta `/app/automatizaciones` registrada en router
- [x] Tab **Resumen** — tagline, KPIs (activas, ejecuciones hoy, errores, bloqueados), plan info
- [x] Tab **Templates** — cards activables con 1 clic
- [x] Tab **Mis Automatizaciones** — lista con toggle on/off
- [x] Tab **Historial** — automation_logs con status badges
- [x] Estado vacío con CTAs para templates y crear regla

### FASE 9 — Wizard No-Code
- [x] Paso 1: Elegir trigger (12 eventos organizados por categoría)
- [x] Paso 2: Condiciones (delay en horas, condiciones específicas por trigger)
- [x] Paso 3: Acción (6 acciones disponibles)
- [x] Paso 4: Resumen visual (flujo: CUANDO → ESPERAR → Y SI → ENTONCES) + nombre
- [x] Step indicator visual con progreso
- [x] Validación por paso antes de continuar

### FASE 10 — IA Controlada
- [x] `automation_ai_credits_pct` limita % de créditos para automatizaciones
- [x] Check en `evaluate_and_queue_automations` antes de encolar acciones IA
- [x] `blocked_credits` en automation_logs cuando se agota
- [ ] UI de indicador de presupuesto IA consumido (pendiente Sprint 14)

### FASE 11 — Seguridad
- [x] Zero Trust: workspace_id siempre del JWT en RPCs
- [x] Feature gating: `automation_enabled` validado antes de evaluar
- [x] Límite de plan validado en `create_rule` y `toggle_rule`
- [x] Anti-loop: execution_depth max=3
- [x] RLS: support_admin = solo lectura en automation_rules
- [x] Presupuesto IA: no se gastan créditos sin verificación

### FASE 12 — Pruebas
- [x] PRUEBA 1: Crear regla → se guarda ← via `create_automation_rule` RPC
- [x] PRUEBA 2: Activar template → instalado ← via `install_automation_templates`
- [x] PRUEBA 3: quote_sent → automation_log generado ← trigger dispatch → evaluate_and_queue
- [x] PRUEBA 4: Loop artificial → blocked_loop ← execution_depth >= 3
- [x] PRUEBA 5: Presupuesto IA agotado → blocked_credits ← check en evaluate_and_queue
- [x] PRUEBA 6: FREE sin acceso ← automation_enabled=false + max_automations=0
- [x] PRUEBA 7: PRO máx 5 reglas ← max_automations=5 validado en toggle/create
- [x] PRUEBA 8: PREMIUM ilimitado ← max_automations=null

---

## ARCHIVOS CREADOS/MODIFICADOS

| Archivo | Tipo | Estado |
|---|---|---|
| `AUDIT_SPRINT_13_AUTOMATIONS.md` | Doc | ✅ |
| `supabase/migrations/0068_automations_schema.sql` | SQL | ✅ |
| `supabase/migrations/0069_automations_rpc.sql` | SQL | ✅ |
| `supabase/migrations/0070_automations_dispatch.sql` | SQL | ✅ |
| `supabase/functions/automation-scheduler/index.ts` | Edge Fn | ✅ |
| `supabase/functions/integration-worker/index.ts` | Edge Fn | ✅ (updated) |
| `src/services/automations.ts` | TS | ✅ |
| `src/hooks/useAutomations.ts` | TS | ✅ |
| `src/components/automations/AutomationWizard.tsx` | UI | ✅ |
| `src/views/AutomatizacionesPage.tsx` | UI | ✅ |
| `src/router.tsx` | TS | ✅ |

---

## TRIGGERS ELIMINADOS vs CREADOS

| Eliminado (Sprint 11 hardcoded) | Creado (Sprint 13 genérico) |
|---|---|
| `trg_integrations_quote_sent` | `trg_quotes_automation_dispatch` |
| `trg_integrations_order_insert` | `trg_orders_automation_dispatch` |
| `trg_integrations_work_order` | `trg_work_orders_automation_dispatch` |
| `trg_integrations_seguimiento` | `trg_quote_views_automation` (nuevo) |
| `trg_integrations_recordatorio` | `trg_clients_automation_dispatch` (nuevo) |
| — | `trg_install_templates_on_integration` (nuevo) |

---

## PENDIENTE (Sprint 14)

- [ ] Scheduler configurado en Supabase Dashboard (manual)
- [ ] UI indicador presupuesto IA de automatizaciones
- [ ] Más acciones: `create_calendar_event`, `analyze_ai_probability`
- [ ] Más condiciones: `total >= X`, `priority = urgente`
- [ ] Historial detallado por regla (drill-down)
- [ ] Vista Desktop optimizada
- [ ] Migrar triggers `seguimientos`/`recordatorios` al dispatcher genérico

---

## RIESGOS MITIGADOS

| Riesgo | Mitigación |
|---|---|
| Loop infinito | execution_depth max=3 → blocked_loop |
| IA sin límite | automation_ai_credits_pct por plan |
| Doble envío Sprint 11 + 13 | Triggers hardcoded eliminados en 0070 |
| support_admin modifica reglas | Solo lectura (corregido en 0068) |
| Scheduler inestable | Edge Function independiente de pg_cron |

---

## DEPLOYMENT

```bash
# 1. SQL (en Supabase SQL Editor, en orden):
# 0068_automations_schema.sql
# 0069_automations_rpc.sql
# 0070_automations_dispatch.sql

# 2. Edge Functions:
npx supabase functions deploy automation-scheduler
npx supabase functions deploy integration-worker

# 3. Configurar schedule (manual):
# Supabase Dashboard → Edge Functions → automation-scheduler → Schedule
# Frecuencia: */1 * * * * (cada minuto)
```
