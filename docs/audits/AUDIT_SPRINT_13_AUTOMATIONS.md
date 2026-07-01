# AUDIT — SPRINT 13 AUTOMATIZACIONES INTELIGENTES

**Fecha:** 2026-06-21  
**Ejecutado por:** Claude Sonnet 4.6 (Agente)  
**Estado:** Auditoría completa pre-implementación

---

## INSTRUCCIÓN

NO se asumió nada. Se auditó cada sistema mencionado en el spec antes de escribir código.

---

## 1. CRM

| Elemento | Estado | Ubicación | Notas |
|---|---|---|---|
| `seguimientos` tabla | ✅ EXISTE | `0046_crm_tables.sql` | tipos: llamada/whatsapp/correo/visita/reunion/nota. RLS ✅ |
| `recordatorios` tabla | ✅ EXISTE | `0046_crm_tables.sql` | scheduled_at, status: pendiente/completado/cancelado. RLS ✅ |
| `client_timeline_events` tabla | ✅ EXISTE | `0046_crm_tables.sql` | 10 tipos de evento. RLS ✅ |
| `quote_commercial_history` tabla | ✅ EXISTE | `0045_crm_commercial_status.sql` | from_status, to_status, observacion |
| `commercial_status` en quotes | ✅ EXISTE | `0045_crm_commercial_status.sql` | borrador/enviada/vista/negociacion/aprobada/rechazada/vencida |
| `get_crm_dashboard` RPC | ✅ EXISTE | `0047_crm_rpc.sql` | métricas 90d, en campo, sin seguimiento, vencimientos |
| `create_seguimiento` RPC | ✅ EXISTE | `0047_crm_rpc.sql` | feature gated pipeline_enabled. Zero Trust ✅ |
| `create_recordatorio` RPC | ✅ EXISTE | `0047_crm_rpc.sql` | valida fecha futura |
| `trg_seguimientos_crm` | ✅ EXISTE | `0048_crm_triggers.sql` | resultado positivo → negociacion |
| `trg_quote_views_crm` | ✅ EXISTE | `0048_crm_triggers.sql` | apertura → vista + notif ← **DUPLICADO CON Sprint 13** |

**RIESGO DETECTADO:** `trg_quote_views_crm` y el nuevo trigger `trg_quote_views_automation` de Sprint 13 hacen cosas similares. Coexisten sin conflicto porque uno actualiza `commercial_status` y el otro dispara `evaluate_and_queue_automations`. ✅ Sin duplicidad real.

---

## 2. IA

| Elemento | Estado | Ubicación | Notas |
|---|---|---|---|
| `ai_usage` tabla | ✅ EXISTE | `0001_schema.sql` + `0038_ai_credits_system.sql` | credits_used, period_month, feature |
| `ai_operation_costs` tabla | ✅ EXISTE | `0038_ai_credits_system.sql` | 8 operaciones configurables (1-5 créditos) |
| `check_ai_credits` RPC | ✅ EXISTE | `0038_ai_credits_system.sql` | Zero Trust, valida plan |
| `consume_ai_credits` RPC | ✅ EXISTE | `0038_ai_credits_system.sql` | descuenta y registra |
| `get_ai_credits_summary` RPC | ✅ EXISTE | `0042_ai_credits_dashboard.sql` | by_operation, periodo |
| `get_ai_usage_history` RPC | ✅ EXISTE | `0042_ai_credits_dashboard.sql` | historial N días |
| `aiCommercial.ts` | ✅ EXISTE | `src/services/aiCommercial.ts` | 8 funciones IA: close_probability, recommendations, forecast, risk_analysis, nextBestAction, prioritize, improve, describe |
| `ai-proxy` Edge Function | ✅ EXISTE | `supabase/functions/ai-proxy/` | Gemini, Zero Trust, consume_ai_credits |
| Alerta 80/90/100% créditos | ✅ EXISTE | `0043_ai_credits_alerts.sql` | trigger automático |
| **Control IA en automatizaciones** | ❌ FALTA (Sprint 13) | 0068 | `automation_ai_credits_pct` en plan_limits — CREADO en Sprint 13 |

**REUTILIZABLE:** `check_ai_credits` y `consume_ai_credits` son reutilizados en el motor de automatizaciones para respetar el presupuesto por plan.

---

## 3. INTEGRACIONES

| Elemento | Estado | Ubicación | Notas |
|---|---|---|---|
| `integrations` tabla | ✅ EXISTE | `0062_integrations_schema.sql` | providers: whatsapp/google_calendar/outlook_calendar/alegra/gmail/outlook_mail |
| `integration_credentials` tabla | ✅ EXISTE | `0062_integrations_schema.sql` | AES-256-GCM. RLS deny directo ✅ |
| `integration_events` tabla | ✅ EXISTE | `0062_integrations_schema.sql` | queue con retry. **Sin** execute_after/depth (← AGREGADO en Sprint 13 migración 0068) |
| `oauth_states` tabla | ✅ EXISTE | `0062_integrations_schema.sql` | PKCE 10min |
| `integration_invoices` tabla | ✅ EXISTE | `0065_integrations_s12_schema.sql` | Sprint 12 |
| `integration_entity_refs` tabla | ✅ EXISTE | `0065_integrations_s12_schema.sql` | IDs externos genéricos |
| `communication_log` tabla | ✅ EXISTE | `0065_integrations_s12_schema.sql` | Sprint 12 |
| `integration-worker` Edge Function | ✅ EXISTE | `supabase/functions/integration-worker/` | WhatsApp, Google Calendar, Outlook Calendar, Alegra, Gmail, Outlook Mail. **Sprint 13 agrega ShelwiInternalAdapter** |
| `get_whatsapp_message` RPC | ✅ EXISTE | `0063_integrations_rpc.sql` | genera mensaje dinámico |
| `queue_integration_event` RPC | ✅ EXISTE | `0063_integrations_rpc.sql` | verifica integración activa |

**DUPLICADO DETECTADO Y RESUELTO:**  
Los triggers hardcodeados de Sprint 11 (0064) disparaban directamente sin pasar por reglas configurables:
- `trg_integrations_quote_sent` → **ELIMINADO** en `0070_automations_dispatch.sql`
- `trg_integrations_order_insert` → **ELIMINADO**
- `trg_integrations_work_order` → **ELIMINADO**
- `trg_integrations_seguimiento` → **ELIMINADO**
- `trg_integrations_recordatorio` → **ELIMINADO**

Reemplazados por dispatch genérico → `evaluate_and_queue_automations()`.

---

## 4. NOTIFICACIONES

| Elemento | Estado | Notas |
|---|---|---|
| `notifications` tabla | ✅ EXISTE | workspace_id, user_id, title, message, type, is_read |
| `createNotification` service | ✅ EXISTE | `src/services/notifications.ts` |
| Triggers que generan notifs | ✅ EXISTE | Sprint 4 (quote aprobada), Sprint 7 (evidencia), Sprint 8 (GPS) |
| Notificación apertura cotización | ⚠️ PARCIAL | Sprint 4 `trg_quote_views_crm` notifica 1 vez/día. Sprint 13 dispatcher no duplica. |

---

## 5. SCHEDULER

| Elemento | Estado | Notas |
|---|---|---|
| `pg_cron` disponible | ⚠️ INCIERTO | Migración 0067 intenta configurarlo con DO block. No depende de él. |
| `expire_overdue_quotes()` | ✅ EXISTE (sin cron) | Sprint 4 — función existe pero **nunca se ejecuta automáticamente** |
| `recalculate_workspace_storage()` | ✅ EXISTE (sin cron) | Sprint 7 — ídem |
| **`automation-scheduler`** | ✅ CREADO (Sprint 13) | Edge Function. Cada minuto. Procesa delayed events + reglas periódicas + cleanup |
| Edge schedule configurado | ❌ PENDIENTE | Requiere configuración manual en Supabase Dashboard → Edge Functions → Schedule |

---

## 6. DUPLICADOS DETECTADOS Y RESOLUCIÓN

| Duplicado | Estado | Resolución |
|---|---|---|
| Triggers Sprint 11 vs dispatch Sprint 13 | ✅ RESUELTO | Sprint 11 eliminados en 0070 |
| `openWhats()` en calc.ts vs `whatsapp.ts` | ⚠️ PENDIENTE | Sprint 11 unificó en whatsapp.ts. calc.ts conserva versión legacy marcada deprecated |
| `buildWhatsAppMessage()` en shareUtils.ts | ✅ RESUELTO Sprint 11 | Eliminado. openWhatsAppShare marcado deprecated |
| Doble notificación apertura cotización | ✅ NO EXISTE | trg_quote_views_crm notifica 1 vez/día; Sprint 13 solo evalúa reglas, no notifica directamente |

---

## 7. ELEMENTOS SPRINT 13 — ESTADO

### BACKEND (CREADO EN ESTA SESIÓN)

| Elemento | Estado | Archivo |
|---|---|---|
| `automation_templates` tabla (5 predefinidas) | ✅ CREADO | `0068_automations_schema.sql` |
| `automation_rules` tabla + RLS corregido | ✅ CREADO | `0068_automations_schema.sql` |
| `automation_logs` tabla (retención 180d) | ✅ CREADO | `0068_automations_schema.sql` |
| `automation_enabled` en plan_features | ✅ CREADO | `0068_automations_schema.sql` |
| `max_automations` + `automation_ai_credits_pct` | ✅ CREADO | `0068_automations_schema.sql` |
| Campos anti-loop en integration_events | ✅ CREADO | `0068_automations_schema.sql` |
| RLS: support_admin = solo lectura | ✅ CORREGIDO | `0068_automations_schema.sql` (obs. del usuario) |
| `evaluate_and_queue_automations()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| `evaluate_automation_conditions()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| `install_automation_templates()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| `create_automation_rule()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| `toggle_automation_rule()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| `list_automation_rules()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| `evaluate_periodic_automations()` RPC | ✅ CREADO | `0069_automations_rpc.sql` |
| Cleanup retention RPCs | ✅ CREADO | `0069_automations_rpc.sql` |
| Triggers genéricos + eliminación Sprint 11 | ✅ CREADO | `0070_automations_dispatch.sql` |
| Auto-instala templates al conectar integración | ✅ CREADO | `0070_automations_dispatch.sql` |
| `automation-scheduler` Edge Function | ✅ CREADO | `supabase/functions/automation-scheduler/` |
| `ShelwiInternalAdapter` en integration-worker | ✅ CREADO | `supabase/functions/integration-worker/` |

### FRONTEND (CREADO — PARCIAL)

| Elemento | Estado | Notas |
|---|---|---|
| `services/automations.ts` | ✅ CREADO | tipos, API, labels |
| `hooks/useAutomations.ts` | ✅ CREADO | React Query hooks |
| `AutomatizacionesPage.tsx` — tabs Reglas/Templates/Historial | ✅ CREADO | |
| Ruta `/app/automatizaciones` | ✅ CREADO | router.tsx |
| **Sección Resumen (stats)** | ❌ FALTA | Spec Fase 8: activas, ejecuciones hoy, errores, IA consumida |
| **Wizard No-Code 4 pasos** | ❌ FALTA | Spec Fase 9: Trigger → Condiciones → Acción → Resumen |
| **Vista Desktop** | ⚠️ PARCIAL | Mobile-first existe. Desktop hereda pero no está optimizado |

---

## 8. RIESGOS

| Riesgo | Severidad | Estado |
|---|---|---|
| Loop infinito automatizaciones | 🔴 MITIGADO | depth max=3, blocked_loop status |
| IA consume créditos sin límite | 🔴 MITIGADO | automation_ai_credits_pct en plan_limits |
| Doble envío triggers Sprint 11 + Sprint 13 | 🔴 MITIGADO | Triggers hardcoded eliminados en 0070 |
| Scheduler no configurado | 🟡 PENDIENTE | Requiere config manual en Dashboard |
| `execute_after` en eventos previos sin el campo | 🟡 N/A | Los eventos existentes tienen execute_after=NULL (inmediato) → OK |
| support_admin modificaba reglas | 🟡 CORREGIDO | Solo lectura (obs. usuario) |

---

## CONCLUSIÓN DE AUDITORÍA

**Completado (backend):** 19/19 elementos de backend.  
**Pendiente (frontend):** 2 elementos — Sección Resumen y Wizard No-Code.  
**Sin riesgo de duplicidad:** Los sistemas anteriores coexisten correctamente.  
**Dependencias validadas:** `public.workspaces` ✅ `public.set_updated_at()` ✅ `public.profiles` ✅

**Autorización para implementar:** Wizard No-Code + Sección Resumen.
