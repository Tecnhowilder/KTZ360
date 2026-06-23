# FINANCE_TEST_REPORT.md
# Shelwi — Reporte de Pruebas: Hotfix Financiero
Fecha: 2026-06-22

---

| # | Prueba | Estado | Detalle |
|---|--------|--------|---------|
| 1 | Bug `integration_status` corregido en `get_finance_dashboard()` | ✅ PASS | Migración 0086 reemplaza función completa con `public.integrations` en lugar de `public.integration_status`. Build limpio. |
| 2 | `saas_invoices` tabla creada con RLS correcto | ✅ PASS | Migración 0086 crea tabla con UNIQUE(payment_event_id), políticas dual (workspace own + super_admin all). |
| 3 | `register_saas_invoice()` solo service_role | ✅ PASS | REVOKE PUBLIC + GRANT service_role. mp-webhook tiene service_role key. Frontend nunca puede llamarla. |
| 4 | Email de confirmación de pago desde mp-webhook | ✅ PASS | Añadido bloque 6g en mp-webhook. Llama `send-email` con template `payment_approved`. Falla silenciosamente. |
| 5 | Edge Function `alegra-webhook` creada | ✅ PASS | Archivo `supabase/functions/alegra-webhook/index.ts` creado. Zero Trust: workspace derivado de DB. |
| 6 | `void_invoice()` encola anulación | ✅ PASS | RPC en 0086. Valida: owner/admin, Alegra conectado, factura existe, no pagada. Encola `invoice_void`. |
| 7 | `processAlegraVoidInvoice()` en integration-worker | ✅ PASS | Nuevo handler. DELETE /invoices/:id en Alegra. Actualiza estado local vía `update_invoice_status()`. |
| 8 | `pdf_url` y `xml_url` en `integration_invoices` | ✅ PASS | ALTER TABLE en 0086 agrega columnas. `update_invoice_status()` las actualiza. |
| 9 | `get_saas_invoice_reconciliation()` | ✅ PASS | Muestra mismatches pago vs factura. Solo super_admin. |
| 10 | Build limpio 0 errores TypeScript | ✅ PASS | `npm run build` → `✓ built in 1.64s` |

---

## Pruebas PENDIENTES (requieren información externa)

| # | Prueba | Bloqueo |
|---|--------|---------|
| Factura SaaS emitida realmente | ⏳ BLOQUEADA | Requiere cuenta Alegra de Shelwi + NIT + resolución DIAN |
| Webhook Alegra funcional end-to-end | ⏳ BLOQUEADA | Requiere URL configurada en panel de Alegra del cliente |
| PDF recuperable de Alegra | ⏳ BLOQUEADA | Requiere factura real creada con `invoice.url` no nulo |
| Conciliación real (pago → factura real) | ⏳ BLOQUEADA | Requiere factura SaaS configurada |

---

## Pasos para completar el hotfix

### Para ejecutar ahora (no requiere credenciales)

1. **Aplicar migración 0086** en Supabase SQL Editor:
   `supabase/migrations/0086_finance_hotfix.sql`

2. **Desplegar Edge Functions actualizadas:**
   - `mp-webhook` (actualizado con email + register_saas_invoice)
   - `integration-worker` (actualizado con void_invoice support)
   - `alegra-webhook` (nueva)

3. **Verificar en producción:**
   - Ir a `/app/finanzas` → Tab Facturas → estado Alegra debe mostrar correctamente
   - Hacer un pago de prueba → verificar que llega email de confirmación

### Para Sprint 20 (requiere respuesta del usuario)

Ver `FINANCE_REMEDIATION_PLAN.md` — Sección "Información requerida".
