# PRODUCTION_OPERATIONS_AUDIT — Shelwi
> Fecha: 2026-06-23 | Alcance: Sprint 1 → Sprint 24 | Modo: Solo lectura

---

## 1. MÓDULO CRM Y COTIZACIONES (Sprint 1-4)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Cotizaciones con PDF | ✅ Funcional |
| Portal de cotización `/p/:token` | ✅ Funcional + token expira en 7 días |
| Quote views tracking | ✅ Vía RPC `register_quote_view()` |
| Seguimientos CRM | ✅ Funcional |
| Timeline de cotizaciones | ✅ Funcional |
| Templates PDF | ✅ Funcional |
| Limite FREE 50 cotizaciones | ✅ Enforced en DB |
| Limite PRO 1.000 cotizaciones | ✅ Enforced en DB |

### Hallazgos

- ⚠️ `quote_access_tokens`: no hay RPC para regenerar token expirado. Si el cliente pierde el link, el vendedor debe reenviar la cotización.
- ✅ Soft delete en quotes (`deleted_at`) — datos nunca perdidos

---

## 2. MÓDULO OPERATIVO (Sprint 7-10)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Pedidos (Orders) | ✅ Funcional |
| Órdenes de Trabajo (OTs) | ✅ Funcional |
| Evidencias + Storage | ✅ Funcional (PREMIUM) |
| GPS tracking one-shot | ✅ Funcional (PREMIUM) |
| Mapa Operativo | ✅ Funcional (PREMIUM) |
| Portal Cliente | ✅ Funcional (PREMIUM) |
| GPS consent requerido | ✅ `gps_consent_at` validado antes de check-in |
| Storage quota enforced | ✅ `check_evidence_quota()` RPC |

### Hallazgos

- ⚠️ `evidence_files` bucket `attachments` sin `file_size_limit` — vector de abuso de storage sin quota enforcement en upload (la quota se verifica POST-upload, pero el archivo ya se subió)
- ⚠️ GPS `accuracy_meters ≤ 500m` validación: está en el frontend (`gps.ts`), no se verifica en DB — se podría enviar una ubicación con accuracy de 10km directamente vía RPC

---

## 3. MÓDULO BI Y FINANZAS (Sprint 18-19)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Finance Dashboard | ✅ Funcional (PREMIUM) |
| Rentabilidad / Margen | ✅ Funcional (PREMIUM) |
| BI Executive KPIs | ✅ Funcional (PREMIUM) |
| BI Sales KPIs | ✅ Funcional (PREMIUM) |
| BI Customer KPIs | ✅ Funcional (PREMIUM) |
| BI Marketing KPIs | ✅ Funcional (PREMIUM) |
| BI Operations KPIs | ✅ Funcional (PREMIUM) |
| Forecast Financiero IA | ✅ Funcional (PREMIUM) |
| DW Views | ✅ REVOKE SELECT aplicado (0091) |
| Feature gate PRO/PREMIUM | ✅ `check_feature_access()` en RPCs |

### Hallazgos

- ⚠️ RPCs BI calculan en tiempo real sin caché → latas a 3K+ workspaces
- ✅ DW Views no accesibles directamente desde authenticated/anon (hardened en 0091)

---

## 4. MÓDULO CUSTOMER SUCCESS Y LOYALTY (Sprint 20)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Customer Health Scores | ✅ Funcional |
| Loyalty Points | ✅ Funcional |
| Reviews (valoraciones) | ✅ Funcional |
| Surveys (encuestas) | ✅ Funcional |
| NPS | ✅ Funcional |

### Hallazgos

- ✅ `loyalty_transactions` INSERT vía `auth.uid() IS NULL` (RPC security definer)
- ✅ `reviews` INSERT vía service_role o membership check (0091 fix)

---

## 5. MÓDULO GROWTH Y MARKETING (Sprint 16-17)

### Estado de producción

| Feature | Estado |
|---------|--------|
| UTM Tracking | ✅ Funcional |
| Referral Program | ✅ Funcional |
| Campañas | ✅ Funcional |
| Cupones | ✅ Funcional |
| Portal Referidos `/ref/:refCode` | ✅ Funcional |

### Hallazgos

- ✅ `utm_events` INSERT requiere workspace activo existente (0092 fix)
- ⚠️ Sin rate limit en `/ref/:refCode` — podría ser usado para spam de referrals

---

## 6. MÓDULO INTEGRACIONES (Sprint 11-14)

### Estado de producción

| Integración | Estado |
|-------------|--------|
| Gmail (email) | ✅ Funcional |
| Outlook Mail | ✅ Funcional |
| Google Calendar | ✅ Funcional |
| Outlook Calendar | ✅ Funcional |
| Alegra (facturación) | ✅ Funcional |
| Google Drive | ✅ Funcional (PREMIUM) |
| OneDrive | ✅ Funcional (PREMIUM) |
| Microsoft Teams | ✅ Funcional (PREMIUM) |
| WhatsApp Business API | ⚠️ STUB — no implementado |

### Hallazgos

- ✅ Tokens OAuth cifrados AES-256-GCM en DB
- ✅ Refresh automático de tokens (5min antes de expirar)
- ✅ MAX_EVENTS_PER_RUN = 5 con EXECUTION_BUDGET_MS = 25s (Sprint 16 fix)
- ⚠️ Drive usa el token de `google_calendar` (mismo OAuth scope) — no hay scope separado para Drive
- ⚠️ OneDrive usa el token de `outlook_calendar` — mismo problema de scope
- ⚠️ WhatsApp Business API: el sistema solo genera URLs `wa.me` (manual) — NO hay API real de WhatsApp Business integrada. Esto podría ser una expectativa incorrecta del cliente.

---

## 7. MÓDULO AUTOMATIZACIONES (Sprint 13)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Motor de automatizaciones | ✅ Funcional |
| Triggers: cotizaciones, clientes, OTs | ✅ Funcional |
| Acciones: WhatsApp, email, seguimiento, notificación | ✅ Funcional |
| Delay con condiciones re-evaluadas | ✅ Funcional |
| Anti-loop (`execution_depth`) | ✅ Funcional |
| Cleanup de automation_logs | ✅ Funcional (cron 3am) |

### Hallazgos

- ⚠️ `evaluate_periodic_automations()` sin información de throughput máximo por ejecución del scheduler
- ✅ `cleanup_automation_logs` y `cleanup_processed_integration_events` ejecutan a las 3am

---

## 8. MÓDULO WEBHOOKS SALIENTES (Sprint 23)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Webhooks a URL custom | ✅ Funcional |
| Zapier / Make / n8n | ✅ Funcional |
| HMAC-SHA256 firmado | ✅ Funcional |
| Retry exponential (1min, 5min, 30min) | ✅ Funcional |
| Auto-disable por fallos | ✅ Funcional |
| Idempotencia por event_id | ✅ Funcional |
| `get_webhook_endpoint_secret()` | ✅ Solo service_role |

### Hallazgos

- ✅ Secret nunca expuesto al frontend (solo vía RPCs que ocultan el campo)
- ⚠️ Sin rate limit de webhooks por endpoint/hora — si el destino es lento, puede acumular cola

---

## 9. MÓDULO IA (Sprint 2-24)

### Estado de producción

| Feature | Estado |
|---------|--------|
| IA Comercial (PRO) | ✅ Funcional |
| IA Forecasting (PREMIUM) | ✅ Funcional |
| IA BI Analytics (PREMIUM) | ✅ Funcional |
| IA Operativa (PREMIUM) | ✅ Funcional |
| check_ai_credits() | ✅ Funcional + addon credits (Sprint 24) |
| consume_ai_credits() | ✅ Funcional |
| Rate limit 100 calls/hora | ✅ Funcional en ai-proxy |
| FREE sin IA | ✅ `ai_enabled = false` |
| PRO 500 créditos | ✅ Configurado |
| PREMIUM 2.000 créditos | ✅ Configurado |
| ENTERPRISE 5.000 créditos | ✅ Sprint 24 |
| Addons de créditos IA | ✅ Sprint 24 |
| Admin dashboard IA | ✅ Sprint 24 |

### Hallazgos

- ✅ Motor único (Gemini 2.5 Flash) — sin duplicación
- ✅ `ai-proxy` Zero Trust correcto
- ⚠️ `execution_time_ms` y `model` en `ai_usage`: el update en ai-proxy Sprint 24 usa un patrón no atómico (UPDATE separado post-consume) — posible race condition si el registro se hace en la misma fila pero llega tarde

---

## 10. SUSCRIPCIONES Y BILLING (Sprint 1, Sprint 6-7)

### Estado de producción

| Feature | Estado |
|---------|--------|
| Mercado Pago checkout | ✅ Funcional |
| Activación de plan post-pago | ✅ Funcional |
| Idempotencia en mp-webhook | ✅ Via `payment_events` unique |
| Price tampering detection | ✅ Con delta configurable |
| Founder Program | ✅ Funcional |
| saas_invoices registro | ✅ Funcional |
| Email de confirmación de pago | ✅ Via send-email (Resend) |
| Plan ENTERPRISE checkout | ❌ FALTA — `create-checkout` no soporta 'enterprise' todavía |

### Hallazgos

- ❌ `create-checkout` Edge Function: `_shared/plans.ts` se actualizó para incluir 'enterprise', pero la función `create-checkout/index.ts` puede tener validaciones hardcodeadas que rechacen el plan 'enterprise'. **Necesita verificación urgente.**
- ⚠️ Price delta de $5.000 COP demasiado amplio para PRO ($59.900) — permite underpay

---

## 11. CLEANUP Y MANTENIMIENTO

### Crons existentes

| Tarea | Cron | Estado |
|-------|------|--------|
| evaluate_periodic_automations | Cada minuto (automation-scheduler) | ✅ |
| cleanup_automation_logs | 3am diario | ✅ |
| cleanup_processed_integration_events | 3am diario | ✅ |
| cleanup_expired_oauth_states | 3am diario | ✅ |
| expire_overdue_quotes | 3am diario | ✅ |

### Crons FALTANTES (pendientes de configurar)

| Tarea | RPC disponible | Estado |
|-------|---------------|--------|
| expire_ai_addons | `expire_ai_addons()` | ❌ FALTA configurar cron |
| cleanup_old_sessions | `cleanup_old_sessions()` | ❌ FALTA configurar cron |

---

## 12. OBSERVABILIDAD

| Capacidad | Estado |
|-----------|--------|
| Logs en Edge Functions (console.log) | ✅ Disponible en Supabase Dashboard |
| audit_log para acciones críticas | ✅ Funcional |
| log_security_event() RPC | ✅ Funcional |
| ai_usage para observabilidad IA | ✅ Funcional |
| webhook_deliveries para trazabilidad | ✅ Funcional |
| Alertas de storage (80%, 90%, 100%) | ✅ Trigger automatizado |
| Alertas de créditos IA (80%, 95%) | ⚠️ Implementado en RPC pero ¿hay notificación en UI? |
| Métricas de latencia RPCs | ❌ No existe dashboard de latencias |
| Alertas de fallo de automatizaciones | ❌ Solo logs en automation_logs |
| Uptime monitoring | ❌ No configurado (requiere herramienta externa) |
| Error tracking (Sentry/Bugsnag) | ❌ No integrado |

---

## 13. BACKUPS Y RECUPERACIÓN

| Capacidad | Estado |
|-----------|--------|
| Backups automáticos Supabase | ✅ Supabase Pro: daily backups 7 días |
| Point-in-time recovery | ⚠️ Solo disponible en Supabase Team+ |
| Proceso de disaster recovery documentado | ❌ No documentado |
| Backup de secretos (env vars) | ⚠️ Solo en Supabase Secrets + 1Password manual |

---

## 14. SCORE OPERACIONES

| Dimensión | Score | Detalle |
|-----------|-------|---------|
| CRM y Cotizaciones | 92/100 | Maduro, bien testeado |
| Operativo (OT, GPS, Evidencias) | 85/100 | GPS accuracy en frontend only |
| BI y Finanzas | 82/100 | Sin caché, RPCs lentas a escala |
| Customer Success | 88/100 | Bien implementado |
| Integraciones | 80/100 | Drive/OneDrive con scope compartido |
| Automatizaciones | 82/100 | Motor sólido, throughput pendiente |
| Webhooks | 87/100 | HMAC, retry, auto-disable ✅ |
| IA Platform | 88/100 | Sólida, audit incompleto en ai-proxy |
| Billing | 80/100 | mp-webhook delta alto, enterprise falta |
| Observabilidad | 45/100 | Sin error tracking, sin uptime monitor |
| Backups | 70/100 | Automáticos sin PITR en Pro |
| **TOTAL** | **80/100** | |
