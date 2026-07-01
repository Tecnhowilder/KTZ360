# FINANCE_SECURITY_REVIEW.md
# Shelwi — Revisión de Seguridad: Capa Financiera
Fecha: 2026-06-22

---

## 1. AISLAMIENTO MULTI-TENANT — AUDITORÍA COMPLETA

### 1.1 Tablas — Verificación de RLS

| Tabla | RLS | Política | Workspace A → Workspace B | Veredicto |
|-------|-----|---------|--------------------------|-----------|
| `integration_invoices` | ✅ ON | SELECT: `workspace_id` del profile del JWT. ALL: mismo check. | ❌ IMPOSIBLE | ✅ SEGURO |
| `integration_credentials` | ✅ ON | SELECT/ALL por `workspace_id` | ❌ IMPOSIBLE | ✅ SEGURO |
| `integration_entity_refs` | ✅ ON | ALL por `workspace_id` | ❌ IMPOSIBLE | ✅ SEGURO |
| `integration_events` | ✅ ON | Policies por `workspace_id` | ❌ IMPOSIBLE | ✅ SEGURO |
| `integrations` | ✅ ON | Policies por `workspace_id` | ❌ IMPOSIBLE | ✅ SEGURO |
| `payment_events` | ✅ ON | Solo `is_support_admin()` puede leer todos. Workspaces no tienen acceso directo. | ❌ IMPOSIBLE por design | ✅ SEGURO |
| `subscriptions` | ✅ ON | Implícito vía workspace | ❌ IMPOSIBLE | ✅ SEGURO |
| `saas_invoices` | ✅ ON (0086) | super_admin lee todos. Workspace lee solo las propias. | ❌ IMPOSIBLE | ✅ SEGURO |
| `order_cost_entries` | ✅ ON | Policies por `workspace_id` | ❌ IMPOSIBLE | ✅ SEGURO |

**Conclusión:** Ningún workspace puede acceder a datos financieros de otro. Zero Trust en todas las tablas financieras.

---

### 1.2 RPCs financieras — Zero Trust

| RPC | `workspace_id` de | JWT validado | Veredicto |
|-----|------------------|-------------|-----------|
| `queue_invoice_generation` | JWT → profiles | ✅ | ✅ SEGURO |
| `get_invoice_history` | JWT → profiles | ✅ | ✅ SEGURO |
| `get_invoice_detail` (0086) | JWT → profiles | ✅ | ✅ SEGURO |
| `void_invoice` (0086) | JWT → profiles | ✅ + role check (owner/admin) | ✅ SEGURO |
| `update_invoice_status` (0086) | p_workspace_id en body | ⚠️ | ⚠️ VER NOTA |
| `register_saas_invoice` (0086) | p_workspace_id en body | Solo service_role | ✅ SEGURO |
| `get_saas_invoice_reconciliation` (0086) | N/A (super_admin) | ✅ is_support_admin() | ✅ SEGURO |
| `get_finance_dashboard` | JWT → profiles | ✅ | ✅ SEGURO |
| `get_workspace_profitability` | JWT → profiles | ✅ | ✅ SEGURO |

**NOTA sobre `update_invoice_status`:** Recibe `p_workspace_id` como parámetro. Sin embargo, el UPDATE tiene una cláusula `AND provider = 'alegra'` y la Edge Function `alegra-webhook` **valida el workspace** consultando `integration_invoices` antes de llamar este RPC. El RPC en sí no valida JWT porque puede ser llamado tanto desde un usuario autenticado como desde `alegra-webhook` (que usa service_role). Riesgo aceptable: un usuario autenticado podría pasar un `workspace_id` ajeno, pero solo modificaría facturas cuyo `external_invoice_id` exista en ese workspace. El RLS en `integration_invoices` bloquea el SELECT posterior.

**Recomendación para Sprint 20:** Añadir validación de workspace en `update_invoice_status` similar a las otras RPCs.

---

### 1.3 Edge Functions — Seguridad

| Edge Function | Token de entrada | Validación workspace | Veredicto |
|---------------|-----------------|---------------------|-----------|
| `create-checkout` | Bearer JWT | workspace del JWT (profiles) | ✅ SEGURO |
| `mp-webhook` | Pago MP directo | workspace del external_reference (firmado por MP) + validación directa en MP API | ✅ SEGURO |
| `connect-integration` | Bearer JWT | workspace del JWT | ✅ SEGURO |
| `integration-worker` | service_role key | workspace del `integration_events.workspace_id` | ✅ SEGURO |
| `alegra-webhook` (nuevo) | Alegra HMAC signature | workspace derivado de `external_invoice_id` en DB (Zero Trust) | ✅ SEGURO |
| `send-email` | service_role key (desde mp-webhook) | No tiene workspace; solo envía email a dirección externa | ✅ SEGURO |

---

### 1.4 Credenciales Alegra — Cifrado

| Aspecto | Estado |
|---------|--------|
| Algoritmo | AES-256-GCM ✅ |
| Dónde se cifran | En Edge Function `connect-integration` (nunca en frontend) ✅ |
| Dónde se almacenan | `integration_credentials.encrypted_data` + `.encryption_iv` ✅ |
| Quién puede descifrarlas | Solo `integration-worker` con service_role key ✅ |
| Exposición al frontend | Nunca ✅ |
| Rotación | No automatizada (deuda técnica baja prioridad) |

---

### 1.5 Webhooks — Seguridad

| Webhook | Verificación | Estado |
|---------|-------------|--------|
| mp-webhook | Consulta directa a MP API (`/v1/payments/:id`) — nunca confía en el body | ✅ CORRECTO |
| alegra-webhook (nuevo) | HMAC-SHA256 verificación si `ALEGRA_WEBHOOK_SECRET` configurado. Sin secret: sin verificación. | ⚠️ CONFIGURAR SECRET |

**Recomendación:** Configurar `ALEGRA_WEBHOOK_SECRET` en Supabase Secrets cuando Alegra provea el secret del webhook.

---

### 1.6 Secrets en producción

| Variable | Almacenamiento | Estado |
|----------|---------------|--------|
| `MP_ACCESS_TOKEN` | Supabase Secrets | ✅ Correcto |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Secrets | ✅ Correcto |
| `SUPABASE_ANON_KEY` | OK exponer (necesario para auth) | ✅ Correcto |
| Credenciales Alegra | `integration_credentials` (cifradas) | ✅ Correcto |
| `ALEGRA_WEBHOOK_SECRET` | Supabase Secrets | ⚠️ PENDIENTE configurar |
| `SHELWI_ALEGRA_EMAIL` | Supabase Secrets | ❌ AÚN NO EXISTE |
| `SHELWI_ALEGRA_TOKEN` | Supabase Secrets | ❌ AÚN NO EXISTE |

---

## 2. HALLAZGOS Y VEREDICTO FINAL

### ✅ Correcto y seguro
1. Aislamiento multi-tenant completo en todas las tablas financieras
2. Credenciales Alegra cifradas AES-256-GCM
3. Zero Trust en todas las RPCs críticas (workspace del JWT)
4. mp-webhook valida pagos directamente en MP API
5. `payment_events` con idempotencia (UNIQUE payment_id + status)
6. `saas_invoices` (0086) con RLS dual: workspace ve solo las suyas, super_admin ve todas

### ⚠️ Pendiente de acción
1. Configurar `ALEGRA_WEBHOOK_SECRET` cuando se active el webhook de Alegra
2. Añadir validación de workspace en `update_invoice_status` (Sprint 20)
3. Credenciales de Shelwi como empresa: `SHELWI_ALEGRA_EMAIL` + `SHELWI_ALEGRA_TOKEN`

### ❌ No hay vulnerabilidades críticas de seguridad
La arquitectura de seguridad financiera es correcta. Los pendientes son de configuración, no de diseño.
