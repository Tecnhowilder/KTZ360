# ROADMAP SPRINT 13 — AUTOMATIZACIONES INTELIGENTES

**Fecha inicio:** 2026-06-21  
**Misión:** Shelwi trabaja por el usuario — seguimientos automáticos, recuperación de cotizaciones perdidas, alertas inteligentes.

---

## ARQUITECTURA

### Cola unificada (Decisión 1)
- **`integration_events`** con `provider='shelwi_internal'` para acciones internas
- Un solo worker (`integration-worker`) procesa todo: integraciones externas + automatizaciones internas
- Sin `automation_executions` separado → menor complejidad

### Triggers genéricos (Decisión 2 — reemplaza Sprint 11 hardcoded)
- Los triggers de Sprint 11 (`trg_integrations_quote_status`, etc.) fueron **eliminados**
- Reemplazados por triggers genéricos que llaman a `evaluate_and_queue_automations()`
- Cada evento pasa por el motor de reglas → solo ejecuta lo que el workspace configuró
- Al conectar una integración → **auto-instala templates relevantes**

### Scheduler Edge Function (Decisión 3)
- `automation-scheduler` → cada minuto
- Procesa eventos diferidos + ejecuta reglas periódicas + cleanup diario
- Configurar en: Supabase Dashboard → Edge Functions → automation-scheduler → Schedule → `*/1 * * * *`

### Condiciones JSON estructuradas (Decisión 4)
- `[{"field": "commercial_status", "operator": "not_in", "value": ["vista","negociacion"]}]`
- Evaluación en RPC `evaluate_automation_conditions()` — extensible
- No DSL — simple, auditable, tipable en TypeScript

---

## SEGURIDAD

### Anti-loops (Decisión adicional 1)
- Campo `execution_depth` en `integration_events`
- Máximo `depth = 3` — si se supera, se registra en automation_logs con `status='blocked_loop'`
- `parent_event_id` para trazar cadenas de automatizaciones

### Control IA (Decisión adicional 2)
- `automation_ai_credits_pct` en plan_limits: PRO=20%, PREMIUM=30%
- Si presupuesto agotado → `status='blocked_credits'` en log

### Retención (Decisión adicional 3)
- `automation_logs`: 180 días
- `integration_events` procesados: 90 días
- Limpieza automática en el scheduler (3 AM)

---

## TABLAS CREADAS (3)

| Tabla | Descripción |
|---|---|
| `automation_rules` | Reglas configuradas por workspace. Habilitables/desactivables individualmente. |
| `automation_templates` | 5 templates predefinidos del sistema. Se instalan en el workspace. |
| `automation_logs` | Historial de ejecuciones (180 días). Anti-loop tracking. |

### Campos agregados a tablas existentes
- `plan_features.automation_enabled` — FREE=false, PRO=true, PREMIUM=true
- `plan_limits.max_automations` — FREE=0, PRO=5, PREMIUM=ilimitado
- `plan_limits.automation_ai_credits_pct` — PRO=20%, PREMIUM=30%
- `integration_events.execute_after` — para eventos diferidos (delay_hours)
- `integration_events.source_rule_id` — qué regla lo generó
- `integration_events.execution_depth` — anti-loop
- `integration_events.parent_event_id` — traza de cadenas

---

## TRIGGERS REEMPLAZADOS

| Eliminado (Sprint 11) | Reemplazado por |
|---|---|
| `trg_integrations_quote_sent` | `trg_quotes_automation_dispatch` |
| `trg_integrations_order_insert` | `trg_orders_automation_dispatch` |
| `trg_integrations_work_order` | `trg_work_orders_automation_dispatch` |
| `trg_integrations_seguimiento` | (pendiente Sprint 14) |
| `trg_integrations_recordatorio` | (pendiente Sprint 14) |

**Nuevo:** `trg_install_templates_on_integration` — cuando se conecta WhatsApp/Calendar, instala automáticamente los templates relevantes con `enabled=false` (usuario decide cuándo activarlos).

---

## TEMPLATES PREDEFINIDOS (5)

| Template | Trigger | Acción | Plan |
|---|---|---|---|
| `quote_followup_72h` | quote_sent + 72h + no abierta | Crear seguimiento + notificar | PRO |
| `client_hot_signal` | quote_viewed_multiple (≥3) | Notificar "cliente caliente" | PRO |
| `review_request_on_completion` | order_completed + 24h | WhatsApp solicitar reseña | PRO |
| `client_recovery_60d` | client_inactive (periódico) | Crear seguimiento recuperación | PRO |
| `work_order_overdue_alert` | work_order_delayed (periódico) | Notificar supervisor | PREMIUM |

---

## RPCs CREADAS (6)

| RPC | Descripción |
|---|---|
| `evaluate_and_queue_automations()` | Motor principal: evalúa reglas, encola acciones |
| `evaluate_automation_conditions()` | Evalúa condiciones JSON contra la entidad |
| `install_automation_templates()` | Instala templates predefinidos en el workspace |
| `create_automation_rule()` | Crear regla personalizada (con límite por plan) |
| `toggle_automation_rule()` | Activar/desactivar regla (con límite por plan) |
| `list_automation_rules()` | Lista reglas + templates + logs recientes |
| `evaluate_periodic_automations()` | Evalúa client_inactive + work_order_delayed |
| `cleanup_automation_logs()` | Limpieza 180 días |
| `cleanup_processed_integration_events()` | Limpieza 90 días |

---

## EDGE FUNCTIONS

### Nueva: `automation-scheduler`
- Ejecuta cada minuto
- Procesa delayed events → llama al worker
- Evalúa reglas periódicas
- Cleanup diario a las 3 AM

### Actualizado: `integration-worker`
- Nuevo adapter: `ShelwiInternalAdapter`
- Maneja: create_followup_and_notify, notify_user, notify_supervisor, send_whatsapp, send_email, change_commercial_status
- Re-evalúa condiciones diferidas al ejecutar (estado puede haber cambiado)

---

## FRONTEND

### Nueva ruta: `/app/automatizaciones`
- Mobile-first
- 3 tabs: Mis reglas | Templates | Historial
- Toggle on/off por regla
- Instalar templates con 1 clic
- Historial de ejecuciones con estados

---

## INSTRUCCIONES DE DEPLOYMENT

```sql
-- Supabase SQL Editor, en orden:
0068_automations_schema.sql
0069_automations_rpc.sql
0070_automations_dispatch.sql
```

```bash
# Edge Functions:
npx supabase functions deploy automation-scheduler
npx supabase functions deploy integration-worker  # actualizado
```

**Configurar schedule:**
- Supabase Dashboard → Edge Functions → automation-scheduler → Schedule → `*/1 * * * *`

---

## CHECKLIST

| # | Ítem | Estado |
|---|---|---|
| 1 | `automation_enabled` en plan_features (FREE/PRO/PREMIUM) | ✅ |
| 2 | `max_automations` en plan_limits (0/5/ilimitado) | ✅ |
| 3 | `automation_ai_credits_pct` (0%/20%/30%) | ✅ |
| 4 | Campos anti-loop en integration_events | ✅ |
| 5 | `automation_templates` con 5 templates predefinidos | ✅ |
| 6 | `automation_rules` tabla con RLS | ✅ |
| 7 | `automation_logs` tabla (retención 180d) | ✅ |
| 8 | `evaluate_and_queue_automations` RPC con anti-loop | ✅ |
| 9 | `evaluate_automation_conditions` — JSON conditions | ✅ |
| 10 | `install_automation_templates` RPC | ✅ |
| 11 | Triggers hardcoded Sprint 11 ELIMINADOS | ✅ |
| 12 | Triggers genéricos de dispatch creados | ✅ |
| 13 | Auto-instala templates al conectar integración | ✅ |
| 14 | `automation-scheduler` Edge Function | ✅ |
| 15 | `ShelwiInternalAdapter` en integration-worker | ✅ |
| 16 | Cleanup automático diario | ✅ |
| 17 | `services/automations.ts`, `hooks/useAutomations.ts` | ✅ |
| 18 | `AutomatizacionesPage.tsx` mobile-first | ✅ |
| 19 | Ruta `/app/automatizaciones` en router | ✅ |
| 20 | Build TypeScript: 0 errores | ✅ |

---

## RIESGOS RESIDUALES

| Riesgo | Severidad | Plan |
|---|---|---|
| `evaluate_automation_conditions` solo maneja campos básicos | Medio | Sprint 14: agregar campos: `total`, `priority`, `assigned_to` |
| Triggers de `seguimientos`/`recordatorios` no migrados | Bajo | Sprint 14 |
| Sin UI de creación de reglas personalizadas | Bajo | Sprint 14: formulario de creación |
| `quote_viewed_multiple` requiere contar en trigger | Bajo | Ya implementado: dispara en view_count 3,5,10 |

---

## OPORTUNIDAD DE NEGOCIO (Marketing)

**Cómo vender esto en los planes:**
> "Shelwi trabaja por ti: seguimientos automáticos, recuperación de cotizaciones perdidas y alertas inteligentes."

Esto comunica RESULTADO, no funcionalidad técnica. Impacta más que "integración con Google Calendar" porque el usuario ve directamente el valor: más ventas, menos olvidos, más retención.
