# AUDIT_SPRINT_18_FINANCE.md
# Shelwi — Auditoría previa a Sprint 18: Finanzas y Rentabilidad
Fecha: 2026-06-22 | Auditor: Claude Sonnet 4.6

---

## METODOLOGÍA

Auditados: quotes, orders, work_orders, materials, quote_items, clients, reports, CRM, customer_success, alegra.
Revisados: migraciones 0001–0082, database.types.ts, engine/, services/, views/.

Leyenda: ✅ EXISTE · ⚡ PARCIAL · ❌ FALTA

---

## 1. INVENTARIO DE DATOS FINANCIEROS EXISTENTES

### 1.1 Cotizaciones (quotes)

| Campo | Estado | Ubicación |
|-------|--------|-----------|
| total (de calc_snapshot) | ✅ EXISTE | `quotes.calc_snapshot->>'total'` |
| subtotal (materiales+labor+equipo) | ✅ EXISTE | `calc_snapshot.subtotal` |
| materiales | ✅ EXISTE | `calc_snapshot.materials` |
| mano de obra | ✅ EXISTE | `calc_snapshot.labor` |
| equipos | ✅ EXISTE | `calc_snapshot.equipment` |
| admin_pct (A de AIU) | ✅ EXISTE | `quotes.admin_pct` (columna real) |
| imprevistos_pct (I de AIU) | ✅ EXISTE | `quotes.imprevistos_pct` (columna real) |
| util (U de AIU) | ✅ EXISTE | `quotes.util` (columna real) |
| descuento | ✅ EXISTE | `quotes.discount`, `discount_on` |
| IVA / tax | ✅ EXISTE | `quotes.tax_mode`, `tax_rate` |
| transporte | ✅ EXISTE | `quotes.transport_cost`, `transport_enabled` |
| total final con IVA+transporte | ✅ EXISTE | `calc_snapshot.total` |
| **Costo real de materiales** | ❌ FALTA | No hay `real_materials_cost` |
| **Costo real mano de obra** | ❌ FALTA | No hay seguimiento post-ejecución |
| **Utilidad real vs estimada** | ❌ FALTA | Solo hay utilidad estimada en calc_snapshot |

**Clave arquitectural:** `calc_snapshot` (JSONB congelado) contiene el desglose completo en el momento de la cotización. Tiene: `materials`, `labor`, `equipment`, `subtotal`, `adminAmt`, `imprevistosAmt`, `utilAmt`, `discAmt`, `ivaAmt`, `transportAmt`, `total`.

Este snapshot ES el costo estimado del trabajo. Es el punto de partida para la rentabilidad estimada.

### 1.2 Pedidos (orders)

| Campo | Estado | Ubicación |
|-------|--------|-----------|
| total_amount | ✅ EXISTE | `orders.total_amount` (copiado de cotización) |
| order_snapshot (JSONB) | ✅ EXISTE | `orders.order_snapshot` |
| vínculo a cotización | ✅ EXISTE | `orders.quote_id` |
| vínculo a cliente | ✅ EXISTE | `orders.client_id` |
| fecha inicio/fin | ✅ EXISTE | `orders.started_at`, `finished_at` |
| **Costo real materiales usados** | ❌ FALTA | No existe tabla order_materials/costs |
| **Costo real horas operario** | ❌ FALTA | No se registran horas trabajadas |
| **Gastos adicionales / extras** | ❌ FALTA | No existe tabla overhead_costs |
| **Margen real del pedido** | ❌ FALTA | Se requiere derivar de costos reales |

### 1.3 Órdenes de Trabajo (work_orders)

| Campo | Estado | Ubicación |
|-------|--------|-----------|
| vínculo a pedido | ✅ EXISTE | `work_orders.order_id` |
| fecha inicio/fin | ✅ EXISTE | `work_orders.started_at`, `finished_at` |
| prioridad, status | ✅ EXISTE | columnas nativas |
| **Horas trabajadas** | ❌ FALTA | No hay `hours_worked` ni time tracking |
| **Costo de mano de obra real** | ❌ FALTA | No hay tasa por operario ni registro de horas |

### 1.4 Check-in / GPS (gps_events)

| Campo | Estado | Ubicación |
|-------|--------|-----------|
| check_in, check_out events | ✅ EXISTE | `gps_events.source in ('check_in','check_out')` |
| user_id, work_order_id | ✅ EXISTE | columnas en gps_events |
| **Tiempo entre check_in / check_out** | ⚡ PARCIAL | Datos existen pero NO hay RPC que calcule horas trabajadas |
| **Costo por hora de operario** | ❌ FALTA | No hay campo `hourly_rate` en profiles o labor_rates |

### 1.5 Clientes (clients)

| Campo | Estado | Ubicación |
|-------|--------|-----------|
| total_quotes | ✅ EXISTE | `clients.total_quotes` (O(1) counter) |
| total_approved | ✅ EXISTE | `clients.total_approved` |
| total_value (valor aprobado acumulado) | ✅ EXISTE | `clients.total_value` — actualizado por trigger |
| last_activity_at | ✅ EXISTE | `clients.last_activity_at` |
| **total_real_billed** | ❌ FALTA | No hay distinción entre aprobado y cobrado |
| **Rentabilidad por cliente** | ❌ FALTA | Solo hay valor de cotizaciones, no margen |

### 1.6 Materiales del catálogo (materials)

| Campo | Estado | Ubicación |
|-------|--------|-----------|
| precio_minimo | ✅ EXISTE | `materials.precio_minimo` |
| precio_sugerido | ✅ EXISTE | `materials.precio_sugerido` |
| precio_maximo | ✅ EXISTE | `materials.precio_maximo` |
| **Precio de compra real (cost)** | ❌ FALTA | Solo hay precios de venta, no de compra |
| **Margen por material** | ❌ FALTA | Se puede derivar si se agrega `purchase_price` |

### 1.7 Reportes (reports — get_reports_summary)

| Dato | Estado | Ubicación |
|------|--------|-----------|
| cotizaciones por período | ✅ EXISTE | RPC `get_reports_summary` |
| valor total cotizado | ✅ EXISTE | suma de `calc_snapshot->>'total'` |
| valor aprobado | ✅ EXISTE | filtrado por status='Aprobada' |
| tasa de conversión | ✅ EXISTE | calculada en RPC |
| comparativa período anterior | ✅ EXISTE | en RPC |
| **Costos reales** | ❌ FALTA | Solo ingresos, no costos |
| **Utilidad/Margen** | ❌ FALTA | No calculado |
| **Top clientes por margen** | ❌ FALTA | Solo por valor cotizado |
| **Forecast** | ❌ FALTA | No existe |

### 1.8 CRM (seguimientos, pipeline)

| Dato | Estado | Ubicación |
|------|--------|-----------|
| pipeline con valor por cotización | ✅ EXISTE | Stage amounts en pipeline |
| total_value_approved por cliente | ✅ EXISTE | `get_crm_overview` en 0047 |
| **Margen esperado por deal** | ❌ FALTA | Solo valor total, no margen |

### 1.9 Customer Success (health scores)

| Dato | Estado | Ubicación |
|------|--------|-----------|
| health_score (0-100) | ✅ EXISTE | `customer_health_scores` |
| VIP / at_risk / churned | ✅ EXISTE | segmentos calculados |
| total_value en score | ✅ EXISTE | ponderado en el score (Sprint 15) |
| **Revenue per segment** | ⚡ PARCIAL | `total_value` disponible pero sin dashboard financiero |
| **CLV (Customer Lifetime Value)** | ⚡ PARCIAL | `clients.total_value` = LTV bruto, sin margen |

### 1.10 Alegra (integración Sprint 12)

| Función | Estado | Ubicación |
|---------|--------|-----------|
| Credenciales cifradas (AES-256-GCM) | ✅ EXISTE | `integration_credentials` con provider='alegra' |
| `queue_invoice_generation()` | ✅ EXISTE | 0066_integrations_s12_rpc.sql |
| Edge Function: `alegra-sync` | ✅ EXISTE | Sprint 12 |
| Facturas sincronizadas en `integration_events` | ✅ EXISTE | con event_type='invoice_create' |
| **Estado de pago de facturas** | ⚡ PARCIAL | `integration_events.status` pero sin tabla de facturas propia |
| **Cuentas por cobrar (AR)** | ❌ FALTA | No hay tabla `invoices` local |
| **Pagos recibidos** | ❌ FALTA | No hay tracking de pagos |
| **MRR/ARR** | ⚡ PARCIAL | Solo en Admin (contando suscripciones de Shelwi, no de los clientes del contratista) |

### 1.11 Admin Panel (super_admin)

| Dato | Estado | Ubicación |
|------|--------|-----------|
| MRR de Shelwi (suscripciones) | ✅ EXISTE | `src/services/admin.ts` |
| Workspaces activos, churn | ✅ EXISTE | `get_admin_stats()` |
| Storage billing | ✅ EXISTE | Sprint 14 storage addons |
| IA credits billing | ✅ EXISTE | `ai_usage_logs` |
| **Panel financiero Shelwi completo** | ⚡ PARCIAL | MRR existe, falta ARR, expansion, contraction |

---

## 2. ANÁLISIS DE CONFLICTOS Y DUPLICACIONES

### CONFLICTO 1 — "Costo real" ≠ "Costo estimado"
**Situación:** El `calc_snapshot` YA tiene materiales+labor+equipo ESTIMADOS del catálogo.
**Problema:** Nadie registra si en ejecución se usaron más materiales, más horas, o hubo gastos extras.
**Decisión requerida:** ¿Usamos calc_snapshot como costo estimado y agregamos registro de costos reales? O ¿solo reportamos rentabilidad estimada?
**Recomendación:** Implementar `order_cost_entries` (tabla simple: order_id, tipo, descripción, monto) para registrar costos reales opcionales. El margen estimado siempre estará disponible desde calc_snapshot.

### CONFLICTO 2 — `clients.total_value` vs "Ingreso real"
**Situación:** `clients.total_value` acumula valor de cotizaciones **aprobadas**, no pagadas.
**Riesgo:** Cotización aprobada ≠ cobrada. Sin integración Alegra, no sabemos si se cobró.
**Decisión:** Tratar `total_value` como ingreso comprometido (revenue committed). Ingreso cobrado requiere Alegra.

### CONFLICTO 3 — Horas trabajadas en GPS
**Situación:** Los GPS events tienen `check_in`/`check_out` con timestamps y work_order_id.
**Oportunidad:** Se puede calcular horas trabajadas por OT desde gps_events SIN nuevas tablas.
**Decisión:** RPC `get_order_time_summary(order_id)` calcula horas desde gps_events. Costo de mano de obra = horas × tasa_horaria. Tasa horaria nueva en `profiles` o config.

### CONFLICTO 4 — Alegra ya tiene facturas y pagos
**Situación:** Alegra maneja facturas, pagos y cuentas por cobrar. Duplicar esto en Shelwi = error.
**Decisión:** NO crear tabla `invoices` local. Usar Alegra como fuente de verdad. Agregar vista de resumen desde `integration_events` con status de facturas.

### CONFLICTO 5 — Reports ya tiene datos de ingresos
**Situación:** `get_reports_summary` ya calcula valor cotizado y aprobado.
**Riesgo:** Si creamos `/app/finanzas` con los mismos KPIs → duplicación.
**Decisión:** Dashboard de Finanzas EXTIENDE y NO DUPLICA a Reportes. Reportes = pipeline comercial. Finanzas = costos + margen + rentabilidad. Views diferentes, datos complementarios.

---

## 3. QUÉ FALTA (GAPS REALES)

### Gap 1 — Registro de costos reales de ejecución ❌
No existe forma de registrar qué materiales se usaron realmente en un pedido.
**Solución:** Tabla `order_cost_entries` (ligera, opcional por pedido).

### Gap 2 — Tasas horarias de operarios ❌
Para calcular costo de mano de obra real se necesita `hourly_rate` por operario.
**Solución:** Columna `hourly_rate` en `profiles` (nullable, solo visible para owner/admin).

### Gap 3 — RPCs de rentabilidad ❌
No existe ninguna función que calcule margen, utilidad o rentabilidad.
**Solución:** 4 RPCs nuevas calculando desde datos existentes.

### Gap 4 — Dashboard `/app/finanzas` ❌
No existe vista de finanzas. (Reportes cubre ingresos pero no costos/margen).
**Solución:** Nueva vista con 5 secciones.

### Gap 5 — Forecast financiero ❌
No existe proyección de ingresos futuros.
**Solución:** Reusar `aiCommercial.ts` con prompt especializado en finanzas.

### Gap 6 — Vista de facturas Alegra en Shelwi ❌
No hay UI que muestre el estado de facturas sincronizadas con Alegra.
**Solución:** Sección en `/app/finanzas` que lee `integration_events` con event_type='invoice_*'.

### Gap 7 — Panel Finanzas en Admin ❌
El Admin Panel no muestra ARR, expansion revenue, churn revenue.
**Solución:** Nueva tab en `AdminPanel.tsx`.

---

## 4. QUÉ NO HACER (ANTI-PATRONES)

| ❌ NO hacer | Razón |
|-------------|-------|
| Crear tabla `invoices` local | Alegra es la fuente de verdad |
| Crear tabla `labor_costs` separada | Datos están en gps_events + hourly_rate |
| Crear tabla `material_costs` separada | Datos están en calc_snapshot + order_cost_entries |
| Duplicar `get_reports_summary` | Reusar, no duplicar |
| Crear motor IA nuevo | Reusar `aiCommercial.ts` |
| Crear sistema de alertas nuevo | Reusar `automation_rules` + `notifications` existentes |
| Frontend calcula márgenes | Backend first siempre |

---

## 5. RIESGOS IDENTIFICADOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Margen estimado ≠ margen real | Alta | Medio | Documentar que es "estimado" en UI |
| Alegra no conectado → sin datos de cobro | Media | Alto | UI muestra "Conecta Alegra" si no está activo |
| hourly_rate no configurado → sin costo laboral | Alta | Medio | Default a 0, UI avisa si no está configurado |
| Datos históricos sin hourly_rate | Alta | Bajo | Solo calcular desde fecha de configuración |
| Zero Trust: workspace_id nunca del front | — | Crítico | Todos los RPCs SECURITY DEFINER |

---

## 6. PLAN DE IMPLEMENTACIÓN SPRINT 18

### Fase 0 (Auditoría) — ✅ COMPLETADA

### Fase 1 — Backend de costos (Migr 0083)
**Nuevas columnas/tablas:**
- `ALTER TABLE profiles ADD COLUMN hourly_rate numeric(10,2)` (tasa horaria operario)
- `CREATE TABLE order_cost_entries` (registro real de costos por pedido: materiales extra, equipos alquilados, otros)

**Sin crear:**
- `service_costs` — está en calc_snapshot
- `material_costs` — está en calc_snapshot + order_cost_entries
- `labor_costs` — deriva de gps_events + hourly_rate
- `overhead_costs` — entra en order_cost_entries con type='overhead'

### Fase 2 — RPCs de rentabilidad (Migr 0084)
4 funciones nuevas (todas SECURITY DEFINER, workspace_id del JWT):
1. `get_order_profit(order_id)` — margen estimado (calc_snapshot) vs real (order_cost_entries + GPS horas)
2. `get_client_profit(workspace_id, client_id)` — suma de pedidos del cliente
3. `get_service_profit(workspace_id, days)` — por tipo de servicio desde service_lines de calc_snapshot
4. `get_finance_dashboard(workspace_id, period_start, period_end)` — consolidado: ingresos + costos + margen + top rentables + alertas

**REUSAR (no crear nuevas):**
- `get_reports_summary` → datos de ingresos (llamado desde dashboard)
- `get_customer_success_dashboard` → segmentos VIP/at_risk con revenue
- `get_clients_at_risk` → clientes no rentables (Sprint 15)

### Fase 3 — Márgenes
Calculados DENTRO de los RPCs de Fase 2. Sin RPCs separadas.
- `margen_bruto = (ingresos - costo_directo) / ingresos * 100`
- `margen_neto = (ingresos - costo_total_incluyendo_AIU) / ingresos`
- El AIU (admin + imprevistos + utilidad) está en calc_snapshot

### Fase 4 — Dashboard `/app/finanzas` (Frontend)
5 secciones:
1. **Resumen** — KPIs: ingresos, costos, utilidad, margen (período seleccionable)
2. **Rentabilidad** — Top clientes rentables, Top servicios rentables, No rentables
3. **Pedidos** — Detalle de margen por pedido (estimado vs real si hay cost_entries)
4. **Facturación** — Estado de facturas Alegra (desde integration_events)
5. **Forecast IA** — Proyección usando aiCommercial.ts

### Fase 5 — Forecast
Prompt nuevo para `aiCommercial.ts` con datos financieros históricos.
No nuevo motor. No nueva llamada a API.

### Fase 6 — Alertas
Templates en `automation_templates` con category='finance':
- margen_bajo (< 10%): notificar
- cliente_no_rentable: notificar owner/admin
- caida_ingresos_20pct: notificar
Usar `automation_rules` existente. Sin nuevo sistema.

### Fase 7 — Alegra vista
Sección en `/app/finanzas` tab Facturación:
- Llama RPC existente que lee `integration_events` con provider='alegra'
- Muestra: facturas pendientes, pagadas, vencidas
- Si Alegra no conectado: CTA a `/app/config/integraciones`

### Fase 8 — Admin CMS Finanzas
Nueva tab en AdminPanel: ARR, MRR, expansion revenue, storage billing, IA billing.
Reusar `get_admin_stats` + agregar `get_admin_finance_summary` RPC.

---

## 7. TABLAS NUEVAS NECESARIAS (MÍNIMO VIABLE)

```sql
-- Tabla 1: Entradas de costo real por pedido (opcional, lightweight)
CREATE TABLE order_cost_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  order_id      uuid NOT NULL REFERENCES orders(id),
  type          text NOT NULL CHECK (type IN ('materials','labor','equipment','overhead','other')),
  description   text NOT NULL,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  recorded_by   uuid REFERENCES auth.users(id),
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
-- RLS: workspace members read, owner/admin insert/update/delete
```

**Columna nueva en profiles:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);
-- Para calcular costo de mano de obra real desde GPS check-in/check-out
```

**NO se crean:** `service_costs`, `material_costs`, `labor_costs`, `overhead_costs` (separadas).
Todo entra en `order_cost_entries` con el campo `type`.

---

## 8. MIGRACIÓN DE DATOS

No se migran datos históricos.
- `calc_snapshot` ya contiene estimados históricos
- `clients.total_value` ya tiene valor acumulado
- `hourly_rate` se configura going forward

---

## 9. VEREDICTO

| Aspecto | Evaluación |
|---------|-----------|
| Datos de ingresos (cotizaciones) | ✅ Sólidos — calc_snapshot es completo |
| Datos de costos estimados | ✅ Completos — calc_snapshot tiene materiales+labor+AIU |
| Datos de costos reales | ❌ No existen — requiere order_cost_entries + hourly_rate |
| Horas de trabajo | ⚡ Datos en GPS, falta RPC que los calcule |
| Integración Alegra | ⚡ Existe, falta vista UI de facturas |
| Dashboard financiero | ❌ No existe — crear de cero |
| Forecast | ❌ No existe — reusar aiCommercial |
| Alertas financieras | ❌ No existen — agregar templates a automation_rules |
| Admin finanzas Shelwi | ⚡ MRR existe, faltan ARR/expansion |

**LISTO PARA IMPLEMENTAR:** 2 tablas/columnas nuevas, 4 RPCs nuevas, 1 vista nueva, 1 tab admin.
**Estimado:** 4 migraciones (0083-0086) + 4 archivos frontend.

---

*Auditoría completada. Sin implementación iniciada. Esperando aprobación.*
