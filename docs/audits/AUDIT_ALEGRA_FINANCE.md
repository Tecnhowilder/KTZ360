# AUDIT_ALEGRA_FINANCE.md
# Shelwi — Auditoría Especializada: Alegra, Facturación e Integración Financiera
Fecha: 2026-06-22 | Auditor: Claude Sonnet 4.6

---

## RESUMEN EJECUTIVO

| Pregunta | Respuesta |
|----------|-----------|
| ¿Shelwi puede emitir facturas propias hoy? | ❌ NO — Ningún mecanismo de facturación electrónica SaaS implementado |
| ¿Shelwi puede emitir facturas de clientes (via Alegra)? | ⚡ PARCIALMENTE — El flujo técnico existe pero está incompleto en 4 operaciones críticas |
| % integración Alegra terminada | ~45% |
| ¿La arquitectura soporta 3.000 clientes sin rediseño? | ✅ SÍ — El diseño multi-tenant es correcto, RLS aplicado, workspaces aislados |
| ¿Single Source of Truth intacto? | ⚡ PARCIAL — Alegra es la fuente de verdad de facturas, pero sin sincronización bidireccional |
| Riesgo legal inmediato | 🔴 ALTO — Shelwi recibe pagos sin emitir factura electrónica |

---

## FASE 1 — SHELWI COMO EMPRESA SAAS: FACTURACIÓN PROPIA

### 1.1 Flujo de pago actual

```
Cliente elige plan
    ↓
create-checkout (Edge Function) → Mercado Pago Checkout Pro
    ↓
mp-webhook (Edge Function) → Valida pago directamente en MP API
    ↓
Actualiza subscriptions (plan_id, status='active', billing_cycle, period_end)
    ↓
Registra en payment_events (idempotencia)
    ↓
Registra en audit_log
    ↓
❌ [NO SE GENERA FACTURA]
```

### 1.2 Hallazgos críticos — Facturación SaaS

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Procesador de pagos | ✅ EXISTE | MercadoPago Checkout Pro — funcional |
| Validación de pago | ✅ EXISTE | mp-webhook consulta directamente la API de MP (Zero Trust correcto) |
| Idempotencia de pagos | ✅ EXISTE | `payment_events` con UNIQUE(payment_id, status) — correcto |
| Validación de monto | ✅ EXISTE | `validatePaymentAmount()` contra tabla `plans` en DB — nunca hardcodeado |
| Activación de suscripción | ✅ EXISTE | `subscriptions` actualizada correctamente |
| Founder Program | ✅ EXISTE | `activate_founder_subscription()` llamado desde webhook |
| Auditoría de pagos | ✅ EXISTE | `audit_log` registra cada pago |
| **Factura electrónica SaaS** | ❌ **FALTA** | Ningún mecanismo implementado |
| **Integración Alegra para Shelwi** | ❌ **FALTA** | Alegra solo está implementado para facturas de los clientes de Shelwi, NO para las facturas de Shelwi como empresa |
| **Conciliación pago–factura** | ❌ **FALTA** | No existe relación entre `payment_events` y ninguna factura |
| **Envío de comprobante al usuario** | ❌ **FALTA** | No se envía email con comprobante de pago ni factura |
| **Wompi** | ❌ **FALTA** | Solo declarado en schema (provider='wompi'), nunca implementado |

### 1.3 ¿Qué existe en Wompi?
**Respuesta directa:** Nada. El tipo `provider = 'wompi'` existe en la tabla `subscriptions` como placeholder del Sprint 1. Nunca se implementó ningún checkout, webhook ni integración real con Wompi. **Todo el procesamiento de pagos es 100% MercadoPago.**

### 1.4 Riesgos legales — Facturación SaaS

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| Sin factura electrónica | 🔴 CRÍTICO | En Colombia, toda empresa que recibe pagos por servicios debe emitir factura electrónica. Shelwi recibe dinero de clientes PRO/PREMIUM sin emitir factura. Riesgo con DIAN. |
| Sin comprobante de pago | 🔴 ALTO | El cliente no recibe ningún email de confirmación ni recibo al comprar un plan. |
| Sin trazabilidad fiscal | 🔴 ALTO | No hay relación entre payment_events (lo que se cobró) y facturas emitidas (lo que se declaró a la DIAN). |
| Conciliación manual | 🟡 MEDIO | La única forma de conciliar ingresos SaaS es combinando MercadoPago + subscriptions manualmente. |

---

## FASE 2 — INTEGRACIÓN ALEGRA ACTUAL: AUDITORÍA COMPLETA

### 2.1 Mapa de operaciones Alegra

| Operación | Estado | Implementación |
|-----------|--------|----------------|
| **Conexión / Autenticación** | ✅ EXISTE | `connect-integration` Edge Function: valida email + API token contra `https://app.alegra.com/api/r1/company`. Encripta credenciales AES-256-GCM. Guarda en `integration_credentials`. |
| **Crear contacto en Alegra** | ✅ EXISTE | `processAlegraInvoice()` en `integration-worker`: busca en `integration_entity_refs`, si no existe crea contacto vía `POST /contacts`. Guarda ref para reuso. |
| **Crear factura en Alegra** | ✅ EXISTE | `processAlegraInvoice()`: crea factura vía `POST /invoices`. Guarda en `integration_invoices`. Guarda ref en `integration_entity_refs`. |
| **Trazabilidad de factura** | ✅ EXISTE | `integration_invoices` tabla local con: id, number, status, total, issued_at. Sobrevive si Alegra falla. |
| **Historial de facturas** | ✅ EXISTE | `get_invoice_history()` RPC. |
| **Factura automática** | ✅ EXISTE | `trg_order_auto_invoice` trigger: cuando pedido → 'finalizado', si `auto_invoice=true`, encola `invoice_create` en `integration_events`. |
| **Factura manual** | ✅ EXISTE | `queue_invoice_generation()` RPC. |
| **Actualizar estado de factura** | ❌ **FALTA** | No hay sincronización de vuelta de Alegra → Shelwi. Si se paga en Alegra, `integration_invoices.invoice_status` queda en 'issued' forever. |
| **Enviar factura al cliente** | ⚡ PARCIAL | `settings: { sendEmail: !!client.email }` en creación de contacto, pero Alegra envía el email de forma automática si la configuración del workspace en Alegra lo tiene activo. Shelwi no controla esto. |
| **Anular factura** | ❌ **FALTA** | No hay operación `DELETE /invoices/:id` ni `PATCH` para anulación. |
| **Nota crédito** | ❌ **FALTA** | No implementado. |
| **Descargar PDF de factura** | ⚡ PARCIAL | `external_url` se guarda en `integration_entity_refs` cuando Alegra devuelve `invoice.url`. Pero no hay UI para mostrarla ni RPC que la devuelva. |
| **Re-consultar factura en Alegra** | ❌ **FALTA** | No hay `GET /invoices/:id` implementado. |
| **Sincronización bidireccional** | ❌ **FALTA** | Solo Shelwi → Alegra (push). Ningún pull de estado. |
| **Webhook de Alegra** | ❌ **FALTA** | Alegra tiene webhooks. Shelwi no los consume. Sin este mecanismo, Shelwi nunca sabe si una factura fue pagada. |
| **Items detallados en factura** | ⚡ PARCIAL | La factura se crea con un único ítem genérico (`orderRow.title`, precio = `total_amount`). No desglosa servicios ni materiales. |
| **Desconexión limpia** | ⚡ PARCIAL | Existe lógica de desconexión en `connect-integration`, pero no verifica si hay facturas pendientes antes de desconectar. |

### 2.2 Porcentaje de integración completado

| Categoría | % completado |
|-----------|-------------|
| Autenticación y credenciales | 100% |
| Crear factura simple | 100% |
| Trazabilidad básica | 80% |
| Ciclo de vida de factura | 10% |
| Sincronización bidireccional | 0% |
| **TOTAL** | **~45%** |

### 2.3 Bug encontrado en Sprint 18

En `0085_finance_dashboard_rpc.sql` (migración Sprint 18), línea 212:
```sql
SELECT 1 FROM public.integration_status  -- ❌ TABLA NO EXISTE
```
La tabla real es `public.integrations`. Este bug causará error en runtime cuando se consulte el estado de Alegra desde el finance dashboard. **Requiere fix en migración 0086.**

---

## FASE 3 — FLUJO DE FACTURACIÓN DEL CLIENTE FINAL

### 3.1 Flujo técnico implementado

```
Cotización aprobada por cliente
    ↓
Pedido creado (order_snapshot + total_amount congelados)
    ↓ [manual o trigger]
Pedido finalizado (status='finalizado')
    ↓ [trigger trg_order_auto_invoice si auto_invoice=true]
integration_events INSERT (provider='alegra', event_type='invoice_create')
    ↓ [integration-worker cada 1 minuto via pg_cron]
processAlegraInvoice():
    - Busca/crea contacto en Alegra
    - Crea factura en Alegra (1 ítem genérico)
    - Guarda en integration_invoices
    - Guarda ref en integration_entity_refs
    ↓
❌ [Estado 'issued' permanece así sin sincronización]
```

### 3.2 Matriz de capacidades: Facturación cliente final

| Capacidad | ¿Funciona hoy? | Notas |
|-----------|---------------|-------|
| ¿Puede generar factura electrónica real? | ✅ SÍ | Si Alegra está configurado correctamente en el workspace del contratista |
| ¿Se crea en Alegra? | ✅ SÍ | Vía `POST /invoices` en Alegra API |
| ¿Se envía al cliente automáticamente? | ⚡ DEPENDE | Alegra puede enviar el email si el workspace de Alegra tiene esa configuración activa. Shelwi no lo controla directamente. |
| ¿Se almacena la referencia? | ✅ SÍ | `integration_invoices` + `integration_entity_refs` |
| ¿Se puede consultar historial? | ✅ SÍ | `get_invoice_history()` RPC |
| ¿Se puede descargar PDF? | ⚡ PARCIAL | `external_url` se guarda, pero no hay UI para acceder a él |
| ¿Se puede anular? | ❌ NO | No implementado |
| ¿Se puede actualizar el estado (pagada/vencida)? | ❌ NO | Sin sincronización bidireccional |
| ¿Se puede re-consultar en Alegra? | ❌ NO | Sin polling ni webhook |
| ¿El estado en Shelwi es confiable? | ❌ NO | `integration_invoices.invoice_status` queda en 'issued' y nunca se actualiza |

### 3.3 Problema crítico: ítem genérico en factura

La factura que se crea en Alegra tiene un único ítem:
```json
{
  "name": "Remodelación cocina",  // = orders.title
  "quantity": 1,
  "price": 5000000               // = orders.total_amount
}
```

Esto significa:
- ❌ No desglosa materiales, labor, equipos
- ❌ No muestra los servicios específicos
- ❌ Puede generar problemas fiscales (descripción insuficiente)
- ❌ No coincide con lo que el cliente vio en la cotización

---

## FASE 4 — TRAZABILIDAD FINANCIERA

### 4.1 ¿Dónde vive la factura?

| Sistema | Rol | Fiabilidad |
|---------|-----|-----------|
| **Alegra** | Fuente oficial de factura electrónica | Alta (si está conectado) |
| **integration_invoices** | Copia local: número, estado, total | Media (no se sincroniza) |
| **integration_entity_refs** | Mapeo order → alegra_invoice_id | Alta |
| **integration_events** | Cola de eventos (audit trail) | Alta |

### 4.2 ¿Puede Shelwi sobrevivir si Alegra falla?

| Escenario | ¿Shelwi sobrevive? |
|-----------|-------------------|
| Alegra temporalmente caído | ✅ SÍ — el evento queda en `integration_events` y se reintentará |
| Credenciales Alegra vencidas | ⚡ PARCIAL — los eventos fallan y queda en estado 'failed' |
| Workspace de Alegra eliminado | ❌ NO — no hay backup de las facturas. Solo el número e ID. |
| Necesidad de re-emitir factura | ❌ NO — sin URL activa de PDF, el documento puede perderse |

### 4.3 Vacíos de trazabilidad

1. **Sin webhook de Alegra**: Shelwi nunca sabe si una factura fue pagada, vencida o anulada en Alegra.
2. **Sin polling de estado**: No hay job que consulte periódicamente el estado de facturas pendientes.
3. **Sin reconciliación**: `payment_events` (pagos recibidos) no se cruza con `integration_invoices` (facturas emitidas).
4. **Sin auditoría de Alegra en admin**: `get_admin_finance_summary()` no incluye estado de facturas de clientes.

---

## FASE 5 — FLUJO IDEAL VS FLUJO REAL: SAAS

### 5.1 Flujo ideal (lo que debería existir)

```
Cliente compra plan → MercadoPago aprueba
    ↓
mp-webhook activa suscripción
    ↓
[NUEVO] Genera factura en Alegra de Shelwi
    ↓
Envía email con PDF de factura al cliente
    ↓
Registra en payment_events + factura_saas
    ↓
Admin puede conciliar: pago ↔ factura
```

### 5.2 Lo que existe hoy

```
Cliente compra plan → MercadoPago aprueba
    ↓
mp-webhook activa suscripción ✅
    ↓
❌ [BRECHA: sin factura]
    ↓
❌ [BRECHA: sin email de confirmación]
    ↓
❌ [BRECHA: sin registro fiscal]
```

### 5.3 Riesgos contables y legales

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| Incumplimiento DIAN | 🔴 CRÍTICO | Sin factura electrónica por ventas de planes, Shelwi incumple obligaciones tributarias en Colombia |
| Clientes PRO sin soporte contable | 🔴 ALTO | Los clientes PRO/PREMIUM necesitan factura para deducir el gasto. Sin factura, pueden pedir devolución. |
| Conciliación MP vs contabilidad | 🟡 MEDIO | Los ingresos de MercadoPago no están conciliados con ningún sistema contable |
| Fraude o error sin detección | 🟡 MEDIO | Sin conciliación automática, una discrepancia entre lo cobrado y lo facturado podría pasar desapercibida |

---

## FASE 6 — CONCILIACIÓN

### 6.1 Estado actual de conciliación

| Par de sistemas | ¿Existe conciliación? |
|-----------------|----------------------|
| MercadoPago ↔ `subscriptions` | ✅ PARCIAL — el webhook actualiza ambos al mismo tiempo. No hay validación posterior. |
| MercadoPago ↔ Factura Shelwi | ❌ NO |
| `subscriptions` ↔ Factura Shelwi | ❌ NO |
| Alegra (facturas clientes) ↔ `integration_invoices` | ❌ NO — solo al momento de creación |
| `payment_events` ↔ Cualquier factura | ❌ NO |
| MRR calculado ↔ Ingresos reales MP | ❌ NO — MRR es estimado contando planes activos, no pagos reales |

### 6.2 Riesgo de diferencias contables

El MRR que muestra el Admin Panel es una **estimación** basada en workspaces activos × precio del plan. No refleja:
- Pagos anuales (cobrados de una vez pero distribuidos en 12 meses)
- Descuentos Founder (precio diferente al estándar)
- Cancelaciones mid-period
- Pagos fallidos o rechazados posteriormente

---

## FASE 7 — AUDITORÍA MULTI-TENANT

### 7.1 Aislamiento de datos entre workspaces

| Tabla | RLS | Política | Riesgo |
|-------|-----|---------|--------|
| `integration_credentials` | ✅ | `workspace_id = auth.uid()` via profile | ✅ SEGURO |
| `integration_invoices` | ✅ | `workspace_id` en policy | ✅ SEGURO |
| `integration_entity_refs` | ✅ | `workspace_id` en policy | ✅ SEGURO |
| `integration_events` | ✅ | `workspace_id` en policy | ✅ SEGURO |
| `integrations` | ✅ | `workspace_id` en policy | ✅ SEGURO |
| `payment_events` | ✅ | Solo `is_support_admin()` puede ver TODOS | ✅ SEGURO |
| `subscriptions` | ✅ (implícito via workspace) | Solo el workspace dueño | ✅ SEGURO |

### 7.2 RPCs (Security Definer)

| RPC | Zero Trust | Validación workspace |
|-----|-----------|---------------------|
| `store_alegra_credentials` | ✅ | Siempre del JWT |
| `queue_invoice_generation` | ✅ | workspace_id del JWT |
| `get_invoice_history` | ✅ | workspace_id del JWT |
| `processAlegraInvoice` (worker) | ✅ | service_role, workspace del event |

### 7.3 Edge Functions

| Función | Aislamiento |
|---------|------------|
| `create-checkout` | ✅ workspace del JWT, nunca del body |
| `mp-webhook` | ✅ workspace del external_reference (firmado por MP) |
| `connect-integration` | ✅ workspace del JWT |
| `integration-worker` | ✅ service_role, procesa por workspace_id del evento |

### 7.4 Bug detectado en 0085: `integration_status` vs `integrations`

En `get_finance_dashboard()` (migración 0085), se referencia:
```sql
SELECT 1 FROM public.integration_status  -- ❌ NO EXISTE
```
La tabla correcta es `public.integrations`. Este error haría que la sección de Alegra siempre devuelva `connected: false`. **Requiere corrección en Sprint 19 (migración 0086).**

---

## FASE 8 — RESPUESTAS A LAS 8 PREGUNTAS OBLIGATORIAS

### 1. ¿Shelwi puede emitir facturas propias hoy?
**NO.** Shelwi recibe pagos vía MercadoPago y activa suscripciones, pero no emite ninguna factura electrónica a sus propios clientes. No hay integración entre el flujo de cobro SaaS y ningún sistema de facturación electrónica.

### 2. ¿Shelwi puede emitir facturas de clientes (contratista → cliente final) hoy?
**PARCIALMENTE.** El flujo técnico existe y funciona para el caso feliz (crear factura simple en Alegra desde un pedido finalizado). Sin embargo: el estado de la factura nunca se actualiza, no se puede anular, no se pueden re-descargar PDFs, y el ítem de la factura es genérico (un solo ítem = total del pedido).

### 3. ¿Qué porcentaje de la integración Alegra está terminado?
**~45%.** Autenticación y creación de factura están completos. El ciclo de vida de la factura (actualización de estado, anulación, notas crédito, sincronización bidireccional) está al 0%.

### 4. ¿Qué falta para una integración completa?
1. Webhook de Alegra → Shelwi (sincronización de estado de pago)
2. Polling periódico de facturas pendientes (fallback si no hay webhook)
3. Operación de anulación de factura
4. Nota crédito
5. UI para ver y descargar PDF de factura
6. Desglose de ítems en factura (materiales, labor, servicios)
7. Facturación SaaS de Shelwi (facturas de los planes)

### 5. ¿Qué riesgos existen para producción?
Ver tabla de Riesgos Críticos y Altos abajo.

### 6. ¿La arquitectura soporta 3.000 clientes sin rediseño?
**SÍ.** El diseño es multi-tenant correcto desde Sprint 1. RLS en todas las tablas, workspace_id en todos los índices, `integration-worker` procesa por eventos (asíncrono, escalable). Los únicos cuellos de botella potenciales son: (a) el cron de 1 minuto si hay mucho volumen de facturas simultáneas, (b) los rate limits de la API de Alegra por workspace. Ninguno requiere rediseño arquitectural.

### 7. ¿La trazabilidad financiera cumple Single Source of Truth?
**PARCIALMENTE.** Para facturas de clientes finales: Alegra es la fuente de verdad (correcto), y Shelwi conserva un espejo (`integration_invoices`) — bien diseñado pero no sincronizado. Para facturación SaaS: MercadoPago es la fuente de verdad de pagos, pero no hay fuente de verdad de facturas emitidas porque no existen.

### 8. ¿Qué debería entrar en Sprint 20 para cerrar la capa financiera?
Ver Roadmap Sprint 20 abajo.

---

## TABLA DE RIESGOS

### 🔴 Riesgos Críticos

| ID | Riesgo | Impacto | Área |
|----|--------|---------|------|
| RC-1 | Shelwi no emite facturas electrónicas por ventas de planes | Legal/Tributario — DIAN Colombia | SaaS Billing |
| RC-2 | Estado de facturas de clientes nunca se actualiza (siempre 'issued') | Datos incorrectos, no se sabe si cobró | Alegra Integration |
| RC-3 | Bug `integration_status` en migración 0085 | `connected: false` siempre en Finance Dashboard | Sprint 18 |

### 🟠 Riesgos Altos

| ID | Riesgo | Impacto | Área |
|----|--------|---------|------|
| RA-1 | Sin email de confirmación de pago a clientes SaaS | Percepción de fraude, soporte elevado | UX/Billing |
| RA-2 | Sin conciliación MP ↔ suscripciones ↔ facturas | Riesgo contable, diferencias no detectadas | Finanzas |
| RA-3 | Factura con ítem genérico (no desglosado) | No cumple requisitos DIAN de descripción de servicio | Alegra |
| RA-4 | Sin opción de anulación de factura | Errores no se pueden corregir | Alegra |
| RA-5 | MRR calculado ≠ ingresos reales de MP | Métricas de negocio incorrectas | Admin Finance |

### 🟡 Riesgos Medios

| ID | Riesgo | Impacto | Área |
|----|--------|---------|------|
| RM-1 | Sin webhook de Alegra | Estado de pago solo actualizable manualmente | Alegra Sync |
| RM-2 | PDF de factura no accesible desde Shelwi | Los usuarios no pueden re-descargar | UX |
| RM-3 | Wompi declarado pero no implementado | Deuda técnica, confusión | Schema |
| RM-4 | Sin nota crédito | No se pueden hacer devoluciones parciales | Alegra |
| RM-5 | `auto_invoice` depende de config jsonb sin UI de confirmación | Usuarios pueden no saber si está activo | Config |

---

## FLUJOS IDEALES (REFERENCIA PARA SPRINT 20)

### Flujo Ideal 1: Facturación SaaS de Shelwi

```
1. Cliente compra plan PRO/PREMIUM en MercadoPago
2. mp-webhook valida y activa suscripción ✅ (YA EXISTE)
3. [NUEVO] mp-webhook encola: generate_saas_invoice(workspace_id, payment_id, amount)
4. [NUEVO] integration-worker crea factura en Alegra de SHELWI (no del cliente)
5. [NUEVO] Envía email con PDF de factura al propietario del workspace
6. [NUEVO] Registra en saas_invoices (tabla nueva) con payment_event_id
7. [NUEVO] Admin puede ver conciliación: pago ↔ factura ↔ suscripción
```

### Flujo Ideal 2: Facturación del contratista a su cliente final

```
1. Pedido finalizado (status='finalizado') ✅ (YA EXISTE)
2. Trigger encola invoice_create en integration_events ✅ (YA EXISTE)
3. integration-worker:
   a. Busca/crea contacto en Alegra ✅ (YA EXISTE)
   b. [MEJORAR] Crea factura con DESGLOSE de servicios (no ítem genérico)
   c. Guarda en integration_invoices ✅ (YA EXISTE)
   d. [NUEVO] Guarda URL del PDF del invoice en integration_entity_refs ✅ (PARCIAL)
4. [NUEVO] Webhook de Alegra notifica cambio de estado (pagada/vencida)
   → Shelwi actualiza integration_invoices.invoice_status
5. [NUEVO] Cliente puede ver y descargar PDF desde portal del cliente
6. [NUEVO] Contratista puede anular factura desde Shelwi
```

---

## ROADMAP SPRINT 20 — CERRAR CAPA FINANCIERA

### Prioridad 1 — CRÍTICO (legal/tributario)
1. **Facturación SaaS de Shelwi**: Integrar Alegra de Shelwi (empresa) con mp-webhook. Cuando pago aprobado → crear factura electrónica → enviar por email.
2. **Fix RC-3**: Corregir `integration_status` → `integrations` en migración 0085.

### Prioridad 2 — ALTO (integridad de datos)
3. **Webhook de Alegra o polling de estado**: Recibir actualizaciones de estado de facturas. Sin esto, `integration_invoices.invoice_status` es inútil.
4. **Email de confirmación de pago**: Enviar al comprador cuando MercadoPago aprueba. Reusar `send-email` Edge Function existente.
5. **Ítems desglosados en factura**: Usar `calc_snapshot.lines` para crear ítems reales en la factura de Alegra.

### Prioridad 3 — MEDIO (completar ciclo de vida)
6. **Anulación de factura desde Shelwi**: UI en pedido + RPC + `DELETE /invoices/:id` en Alegra.
7. **UI de descarga de PDF**: Mostrar `external_url` del invoice en el historial de pedidos.
8. **Conciliación MRR real**: Calcular MRR desde `payment_events` (pagos reales), no desde workspaces activos × precio.

### Prioridad 4 — LIMPIEZA
9. Eliminar `provider='wompi'` del check constraint de `subscriptions` o documentar como future provider.
10. Tabla `saas_invoices` para facturas que Shelwi emite (separada de `integration_invoices` que son del contratista).

---

## CONCLUSIÓN

Shelwi tiene una arquitectura financiera correcta y bien diseñada para el **cliente final** (contratista → su cliente). El Multi-Tenant, Zero Trust y RLS están bien implementados y soportan escala.

Los problemas son de **cobertura funcional**:
- El ciclo de vida de la factura (sincronización de estado, anulación, PDF) está incompleto.
- Shelwi como empresa SaaS no tiene facturación electrónica propia — este es el riesgo más serio.
- El MRR en el Admin no refleja pagos reales de MercadoPago.

Nada requiere rediseño arquitectural. Todo se resuelve **extendiendo** lo que ya existe.

---

*Auditoría finalizada. Ningún código modificado. Ninguna migración creada.*
*Hallazgos requieren decisión antes de Sprint 20.*
