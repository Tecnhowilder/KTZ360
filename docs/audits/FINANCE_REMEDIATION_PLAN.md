# FINANCE_REMEDIATION_PLAN.md
# Shelwi — Plan de Remediación Financiero
Fecha: 2026-06-22

---

## LO QUE SE IMPLEMENTÓ EN ESTE HOTFIX (sin credenciales externas)

| Item | Migración/Archivo | Estado |
|------|-------------------|--------|
| Fix BUG-001: `integration_status` → `integrations` | `0086_finance_hotfix.sql` | ✅ APLICAR |
| `pdf_url` y `xml_url` en `integration_invoices` | `0086_finance_hotfix.sql` | ✅ APLICAR |
| `update_invoice_status()` RPC | `0086_finance_hotfix.sql` | ✅ APLICAR |
| `void_invoice()` RPC — anular factura | `0086_finance_hotfix.sql` | ✅ APLICAR |
| `get_invoice_detail()` RPC — detalle completo | `0086_finance_hotfix.sql` | ✅ APLICAR |
| Tabla `saas_invoices` — trazabilidad SaaS | `0086_finance_hotfix.sql` | ✅ APLICAR |
| `register_saas_invoice()` RPC | `0086_finance_hotfix.sql` | ✅ APLICAR |
| `get_saas_invoice_reconciliation()` RPC | `0086_finance_hotfix.sql` | ✅ APLICAR |
| Email de confirmación de pago desde mp-webhook | `mp-webhook/index.ts` | ✅ DESPLEGADO |
| Edge Function `alegra-webhook` (receptor de notificaciones) | `alegra-webhook/index.ts` | ✅ CREAR |
| `processAlegraVoidInvoice()` en integration-worker | `integration-worker/index.ts` | ✅ DESPLEGADO |
| Route `invoice_void` en integration-worker dispatcher | `integration-worker/index.ts` | ✅ DESPLEGADO |
| Nuevas RPCs en `database.types.ts` | `database.types.ts` | ✅ ACTUALIZADO |

---

## LO QUE REQUIERE INFORMACIÓN EXTERNA ANTES DE IMPLEMENTAR

### INFORMACIÓN REQUERIDA — Detener hasta recibir respuesta

Antes de implementar la facturación electrónica de Shelwi como empresa, necesito:

---

### PREGUNTA 1 — ¿Cuál es el procesador de pago de Shelwi?

**Respuesta de la auditoría:** El único procesador activo es **MercadoPago**. Wompi y Stripe están declarados en schema pero nunca implementados.

¿Confirmas que MercadoPago es el único procesador? ¿O se implementará Wompi también?

---

### PREGUNTA 2 — ¿Shelwi tiene cuenta de Alegra como empresa?

Para emitir facturas electrónicas a sus propios clientes (Plan PRO/PREMIUM), Shelwi necesita su propia cuenta de Alegra (distinta de las cuentas de sus clientes contratistas).

**Necesito saber:**
- ¿Existe una cuenta Alegra para Shelwi como empresa? (**sí/no**)
- Si sí: ¿Las credenciales están en `system_configuration` o dónde se guardarán?
- Si no: ¿Qué sistema de facturación usará Shelwi? (Siigo, Alegra, Factura Directa, etc.)

---

### PREGUNTA 3 — Datos fiscales de Shelwi

Para la factura electrónica necesito:
- **NIT de Shelwi** (ej: 900.XXX.XXX-X)
- **Razón social** (ej: Shelwi SAS)
- **Dirección fiscal**
- **Ciudad y departamento**
- **Régimen tributario** (régimen simple, renta, IVA)
- **Responsabilidades fiscales** (¿aplica IVA? ¿retención en la fuente?)

---

### PREGUNTA 4 — Resolución DIAN

Para emitir factura electrónica válida en Colombia necesitas:
- **Número de resolución DIAN**
- **Rango de numeración** (ej: FE-001 a FE-5000)
- **Fecha de resolución**
- **Prefijo de factura** (ej: "FE", "SHELWI", etc.)

¿Tienes resolución DIAN activa? Si no, ¿estás en proceso de obtenerla?

---

### PREGUNTA 5 — Ambiente Alegra

- ¿Ambiente de **producción** o **sandbox/pruebas**?
- ¿La cuenta de Alegra de Shelwi ya tiene habilitada la facturación electrónica con DIAN?

---

### PREGUNTA 6 — Método de notificación

Cuando Shelwi emita una factura electrónica a un cliente PRO/PREMIUM:
- ¿Se envía el PDF por email automáticamente? (Sí/No)
- ¿Qué email remitente? (¿el mismo Resend configurado en `send-email`?)
- ¿El cliente recibe también el XML CUFE?

---

## PLAN DE SPRINT 20 (una vez recibida la información)

### Fase A — Facturación SaaS (requiere datos externos)
1. `system_configuration` → agregar `shelwi_alegra` con credenciales de la cuenta de Shelwi
2. Nueva Edge Function `generate-saas-invoice` — llama a Alegra de Shelwi
3. `mp-webhook` → después de `register_saas_invoice()` → llamar `generate-saas-invoice`
4. Email con PDF adjunto al cliente cuando factura lista
5. UI en `/app/planes` → "Ver mis facturas"

### Fase B — Mejoras Alegra cliente (implementables ahora)
1. UI de historial de facturas en pedidos (`get_invoice_history`)
2. Botón "Anular factura" en detalle de pedido (`void_invoice`)
3. Enlace al PDF cuando `pdf_url` disponible
4. Ítems desglosados (calc_snapshot.lines) en vez de ítem genérico

### Fase C — Configuración alegra-webhook
1. Desplegar Edge Function `alegra-webhook`
2. Configurar URL en panel de Alegra del cliente
3. Configurar `ALEGRA_WEBHOOK_SECRET` en Supabase Secrets
4. Probar con evento real de pago en Alegra

---

## VARIABLES DE ENTORNO NUEVAS REQUERIDAS

Para desplegar en producción, agregar en Supabase Dashboard → Edge Functions → Secrets:

| Variable | Cuándo | Descripción |
|----------|--------|-------------|
| `ALEGRA_WEBHOOK_SECRET` | Sprint 20 | Secret HMAC del webhook de Alegra (si Alegra lo provee) |
| `SHELWI_ALEGRA_EMAIL` | Sprint 20 | Email de la cuenta Alegra de Shelwi como empresa |
| `SHELWI_ALEGRA_TOKEN` | Sprint 20 | API token de Alegra de Shelwi como empresa |
