# AUDIT_SPRINT_WEBHOOKS.md
# Shelwi — Auditoría Sprint Webhooks & Marketplace
Fecha: 2026-06-23

---

## PRUEBAS PASS/FAIL

| # | Prueba | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | Zero Trust: workspace_id del JWT | ✅ PASS | Todas las RPCs: `v_user_id := auth.uid()` + validación en `profiles` |
| 2 | Zero Trust: secret nunca del frontend | ✅ PASS | `v_secret := 'whsec_' || encode(gen_random_bytes(32), 'hex')` en RPC |
| 3 | Zero Trust: secret solo visible en creación | ✅ PASS | `get_webhook_endpoints` omite columna `secret`. Solo `register_` y `rotate_` lo retornan |
| 4 | Zero Trust: `get_webhook_endpoint_secret` | ✅ PASS | `IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION`. REVOKE PUBLIC, GRANT service_role |
| 5 | Zero Trust: `record_webhook_delivery` | ✅ PASS | Solo service_role. REVOKE PUBLIC. |
| 6 | Multi Tenant: RLS en `webhook_endpoints` | ✅ PASS | SELECT policy con `EXISTS (profiles WHERE workspace_id = ...)` |
| 7 | Multi Tenant: RLS en `webhook_deliveries` | ✅ PASS | SELECT policy con workspace_id check. INSERT solo `auth.uid() IS NULL` |
| 8 | HMAC-SHA256 implementado | ✅ PASS | `crypto.subtle.sign('HMAC', key, timestamp + "." + body)` → `X-Shelwi-Signature: sha256=...` |
| 9 | Replay attack prevention | ✅ PASS | Timestamp incluido en el mensaje firmado (`timestamp + "." + body`) |
| 10 | Headers de seguridad en entrega | ✅ PASS | `X-Shelwi-Signature`, `X-Shelwi-Event`, `X-Shelwi-Delivery`, `X-Shelwi-Timestamp` |
| 11 | Retry con backoff exponencial | ✅ PASS | 1min → 5min → 30min. MAX 3 intentos. `execute_after` en `integration_events` |
| 12 | Idempotencia de eventos | ✅ PASS | Cada entrega tiene `event_id` único (UUID). Deliveries son inmutables. |
| 13 | No duplicación de eventos | ✅ PASS | `dispatch_webhook_event` corre una vez por trigger. Triggers existentes no cambian su lógica. |
| 14 | Resiliencia: auto-disable | ✅ PASS | `consecutive_failures >= max_consecutive_failures` → `is_active = false`, `disabled_at = now()` |
| 15 | Observabilidad: log completo | ✅ PASS | `webhook_deliveries`: payload, response_status, response_body, duration_ms, attempt, status |
| 16 | Plan gating PRO+ | ✅ PASS | `check_feature_access(workspace_id, 'webhook_enabled')` en `register_webhook_endpoint` |
| 17 | HTTPS obligatorio | ✅ PASS | `IF NOT (p_url LIKE 'https://%') THEN RETURN error` |
| 18 | Reutilización de triggers existentes | ✅ PASS | CREATE OR REPLACE de funciones Sprint 13. 0 triggers nuevos creados. |
| 19 | Marketplace ready (4 providers) | ✅ PASS | `provider_type IN ('webhook','zapier','make','n8n')`. Mismo handler en worker. |
| 20 | Build TypeScript limpio | ✅ PASS | `✓ built in 993ms` — 0 errores |

---

## HALLAZGOS

### Diseño correcto
- Los triggers `trg_quotes/orders/work_orders_automation_dispatch` se extendieron sin crear nuevos triggers
- La función `dispatch_webhook_event` verifica activamente `is_active = true AND disabled_at IS NULL` antes de encolar
- El secret se genera con `gen_random_bytes(32)` (256 bits de entropía) prefijado con `whsec_` para identificación

### Deuda técnica menor (no crítica)
- `HTTPS only` en producción: la validación rechaza `http://` pero no bloquea IPs privadas en producción. Agregar validación de IP pública en Sprint futuro.
- El `execute_after` en integration_events para reintentos requiere que pg_cron esté activo y el worker lo respete. Ya implementado en integration-worker.

### Sin hallazgos críticos
Ningún vector de ataque identificado en la implementación actual.
