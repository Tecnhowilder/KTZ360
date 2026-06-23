# AUDIT_SPRINT_19_BI.md
# Shelwi — Auditoría Sprint 19: Business Intelligence
Fecha: 2026-06-23

---

## PRINCIPIO RECTOR

Sprint 19 **NO reconstruye**. Conecta, consolida y extiende los datos de Sprints 1–18.
Toda decisión parte de este inventario.

---

## 1. INVENTARIO COMPLETO POR DOMINIO

### 1.1 Comercial / Ventas (Sprints 1–5, 9)

| Dato | RPC | Estado |
|------|-----|--------|
| KPIs mensuales: cotizadas, aprobadas, rechazadas, conversión, valor | `get_reports_summary(workspace_id, start, end)` | ✅ EXISTE — period-aware |
| Embudo por status comercial | `get_funnel_report(workspace_id, start, end)` | ✅ EXISTE — 7 etapas, period-aware |
| KPIs ejecutivos: 30d, mes anterior, pipeline activo, tendencia 3m | `get_executive_dashboard(workspace_id)` | ✅ EXISTE — feature-gated PRO+ |
| Alertas inteligentes (caída conversión, oportunidades) | `get_smart_alerts(workspace_id)` | ✅ EXISTE |
| Pipeline kanban por comercial | `get_pipeline(workspace_id)` | ✅ EXISTE |
| Historial comercial de una cotización | `get_quote_commercial_history(workspace_id, quote_id)` | ✅ EXISTE |
| Timeline de cliente | `get_client_timeline(workspace_id, client_id)` | ✅ EXISTE |
| CRM dashboard (seguimientos, tasa seguimiento) | `get_crm_dashboard(workspace_id)` | ✅ EXISTE |
| Reporte de servicios cotizados vs vendidos | `get_services_report(workspace_id, start, end)` | ✅ EXISTE — por servicio, % aprobación |
| Reporte de clientes (nuevos, recurrentes, valor) | `get_clients_report(workspace_id, start, end)` | ✅ EXISTE |
| **Performance por comercial (created_by)** | — | ❌ FALTA — get_reports_summary no agrupa por vendedor |
| **Ticket promedio por comercial** | — | ❌ FALTA |
| **Metas comerciales y % cumplimiento** | — | ❌ FALTA — no existe tabla de metas |

### 1.2 Operaciones (Sprints 6, 8)

| Dato | RPC | Estado |
|------|-----|--------|
| KPIs operativos: pedidos por status, OTs por status | `get_operations_dashboard()` | ✅ EXISTE — sin workspace param (legacy) |
| Dashboard GPS: miembros en campo, check-ins hoy, OTs activas | `get_operational_dashboard(workspace_id)` | ✅ EXISTE — PREMIUM |
| Mapa de equipo en tiempo real | `get_team_map(workspace_id)` | ✅ EXISTE |
| Detalle de miembro | `get_member_detail(workspace_id, user_id)` | ✅ EXISTE |
| Galería de evidencias | `get_evidence_gallery(workspace_id, order_id)` | ✅ EXISTE |
| **Productividad por operario** (OTs finalizadas, horas, avg) | — | ❌ FALTA |
| **Tiempo promedio de ejecución por pedido/OT** | — | ❌ FALTA |
| **Cumplimiento de fechas programadas (SLA)** | — | ❌ FALTA |
| **OTs por día / semana** (tendencia operativa) | — | ❌ FALTA |
| **Tiempo entre check_in y check_out por OT** | ⚡ PARCIAL — datos en gps_events, RPC no existe |

### 1.3 Finanzas (Sprint 18)

| Dato | RPC | Estado |
|------|-----|--------|
| Rentabilidad por pedido | `get_order_profit(workspace_id, order_id)` | ✅ EXISTE |
| Rentabilidad por cliente | `get_client_profit(workspace_id, client_id, start, end)` | ✅ EXISTE |
| Rentabilidad por servicio | `get_service_profit(workspace_id, start, end)` | ✅ EXISTE |
| Rentabilidad global del workspace | `get_workspace_profitability(workspace_id, start, end)` | ✅ EXISTE |
| Dashboard financiero consolidado | `get_finance_dashboard(workspace_id, start, end)` | ✅ EXISTE |
| Administración Shelwi SaaS (MRR/ARR) | `get_admin_finance_summary()` | ✅ EXISTE — super_admin |
| Forecast financiero IA | `forecastFinance()` en aiCommercial.ts | ✅ EXISTE |
| **CAC (Costo de Adquisición de Cliente)** | — | ❌ FALTA — requiere cruzar costos con clients adquiridos |
| **ROI por canal UTM** | — | ❌ FALTA — utm_events vs ingresos no está conectado |

### 1.4 Customer Success (Sprint 15)

| Dato | RPC | Estado |
|------|-----|--------|
| Health scores (0–100, VIP/at_risk/churned) | `calculate_customer_health(workspace_id, client_id)` | ✅ EXISTE |
| Clientes en riesgo | `get_clients_at_risk(workspace_id)` | ✅ EXISTE |
| Clientes VIP | `get_vip_clients(workspace_id)` | ✅ EXISTE |
| Oportunidades de recompra | `get_repurchase_opportunities(workspace_id)` | ✅ EXISTE |
| Dashboard CS consolidado | `get_customer_success_dashboard(workspace_id)` | ✅ EXISTE |
| **Cohortes por mes de ingreso** | — | ❌ FALTA |
| **LTV real (vida × ticket promedio × margen)** | — | ❌ FALTA — `clients.total_value` es LTV bruto sin margen |
| **Tasa de retención / churn de clientes** | — | ❌ FALTA |
| **Clientes reactivados** | — | ❌ FALTA |

### 1.5 NPS / Reviews / Encuestas (Sprint 16)

| Dato | RPC | Estado |
|------|-----|--------|
| NPS score + promotores/pasivos/detractores | `get_nps_summary(workspace_id)` | ✅ EXISTE |
| Satisfacción promedio (reviews) | `get_nps_summary` también incluye avg_rating | ✅ EXISTE |
| Respuestas a encuestas | `get_survey_responses(workspace_id, survey_id)` | ✅ EXISTE |
| Reseñas del workspace | `get_reviews(workspace_id)` | ✅ EXISTE |
| **NPS por período** | — | ❌ FALTA — get_nps_summary no acepta period |
| **Trending de satisfacción** | — | ❌ FALTA |

### 1.6 Growth / Marketing (Sprint 17)

| Dato | RPC | Estado |
|------|-----|--------|
| Dashboard de referidos | `get_referral_dashboard(workspace_id)` | ✅ EXISTE |
| Analytics UTM por fuente y campaña | `get_utm_analytics(workspace_id, days)` | ✅ EXISTE |
| Dashboard growth consolidado | `get_growth_dashboard(workspace_id)` | ✅ EXISTE |
| Tracking de visitas por ref_code | `track_referral_visit` / `track_utm` | ✅ EXISTE |
| **CAC por canal** | — | ❌ FALTA — utm_events.client_id vs costo de adquisición |
| **ROI de campañas** (gasto vs ingresos generados) | — | ❌ FALTA — no hay tabla de gastos de campaña |
| **Atribución multi-touch** | — | ❌ FALTA (arquitectura solo first-touch) |

### 1.7 Loyalty / Fidelización (Sprint 16)

| Dato | RPC | Estado |
|------|-----|--------|
| Puntos del cliente | `get_client_loyalty(token)` | ✅ EXISTE |
| Transacciones de loyalty | en `loyalty_transactions` | ✅ EXISTE |
| **Dashboard de loyalty por workspace** | — | ❌ FALTA — no hay RPC de resumen de loyalty para admin |

### 1.8 Integraciones (Sprints 11–12)

| Dato | RPC | Estado |
|------|-----|--------|
| Estado de todas las integraciones | `get_integration_status(workspace_id)` | ✅ EXISTE |
| Historial de comunicaciones | `get_communication_history(workspace_id)` | ✅ EXISTE |
| Historial de facturas Alegra | `get_invoice_history(workspace_id)` | ✅ EXISTE |
| Overview de integraciones (admin) | `get_integrations_admin_overview()` | ✅ EXISTE |

### 1.9 Portal del Cliente (Sprint 10)

| Dato | RPC | Estado |
|------|-----|--------|
| Analytics del portal (accesos, acciones, clientes activos) | `get_portal_analytics(workspace_id)` | ✅ EXISTE |

### 1.10 Admin / SaaS Shelwi (Sprint 9)

| Dato | RPC / Service | Estado |
|------|---------------|--------|
| Estadísticas globales (users, workspaces, MRR) | `get_admin_stats()` / `getAdminDashboardStats()` | ✅ EXISTE |
| IA usage global | `admin_get_ai_usage_global()` | ✅ EXISTE |
| Storage global | `admin_get_storage_global()` | ✅ EXISTE |
| Audit log | `admin_get_audit_log()` | ✅ EXISTE |
| Finanzas SaaS (MRR, ARR, addons) | `get_admin_finance_summary()` | ✅ EXISTE (Sprint 18) |

---

## 2. ANÁLISIS DE GAPS: QUÉ REALMENTE FALTA

### BRECHA 1 — Performance por Comercial (vendedor/creator)
**Estado:** ❌ FALTA
**Datos disponibles:** `quotes.created_by` + `profiles.full_name` + `calc_snapshot.total`
**Qué daría:** cotizaciones enviadas, aprobadas, valor generado, tasa cierre — agrupado por usuario
**RPC a crear:** `get_sales_by_rep(workspace_id, start, end)`

### BRECHA 2 — Productividad Operativa por Operario
**Estado:** ❌ FALTA
**Datos disponibles:** `work_orders.assigned_to` + status/timestamps + `gps_events` check_in/check_out
**Qué daría:** OTs asignadas, finalizadas, horas trabajadas estimadas, pedidos por operario
**RPC a crear:** `get_ops_productivity(workspace_id, start, end)`

### BRECHA 3 — Cohortes de Clientes
**Estado:** ❌ FALTA
**Datos disponibles:** `clients.created_at` + `quotes` (actividad posterior) + `clients.total_approved`
**Qué daría:** retención mes a mes desde el mes de adquisición
**RPC a crear:** `get_client_cohorts(workspace_id, months)`

### BRECHA 4 — KPI Engine consolidado (Sprint 19 pedido)
**Estado:** ❌ FALTA (como RPCs unificadas)
**Observación:** Los datos YA EXISTEN en múltiples RPCs. El trabajo es crear:
- `get_bi_executive_kpis()` — agrega get_executive_dashboard + get_finance_dashboard + get_customer_success_dashboard
- `get_bi_sales_kpis()` — agrega get_reports_summary + get_funnel_report + sales_by_rep (nueva)
- `get_bi_operations_kpis()` — agrega get_operations_dashboard + get_ops_productivity (nueva)
- `get_bi_marketing_kpis()` — agrega get_growth_dashboard + get_utm_analytics
- `get_bi_customer_kpis()` — agrega get_customer_success_dashboard + get_nps_summary

### BRECHA 5 — Dashboard BI Unificado `/app/bi`
**Estado:** ❌ FALTA
**Observación:** Las vistas individuales existen. La vista unificada CEO-view no existe.

### BRECHA 6 — Data Warehouse (dw_*)
**Estado:** ❌ FALTA
**Evaluación crítica:** Supabase/PostgreSQL no soporta `MATERIALIZED VIEWS` con refresh automático eficiente. La alternativa correcta para este stack son:
- **RPCs optimizadas** (ya existen en su mayoría) → ✅ Correcto para el tamaño actual
- **Views SQL regulares** (sin materializar) → Para simplificar queries complejas
- **Tablas de snapshot** (actualizadas por cron o trigger) → Solo si se detecta rendimiento inaceptable

**Recomendación:** Crear views regulares `dw_*` (no materializadas) que consolidan las queries frecuentes sin duplicar datos. A escala de 3.000 workspaces con índices correctos, las views son suficientes.

### BRECHA 7 — IA Analítica (4 funciones nuevas)
**Estado:** ❌ FALTA
- `generateExecutiveSummary()` — análisis IA del estado del negocio
- `generateBusinessForecast()` — proyección IA de crecimiento (distinto a forecastFinance)
- `generateRiskAssessment()` — detección de riesgos
- `generateGrowthRecommendations()` — oportunidades de crecimiento

---

## 3. QUÉ NO SE DUPLICA (USAR TAL CUAL)

| Sprint 19 pide | Existe en | Acción |
|----------------|-----------|--------|
| Embudo completo Lead→Factura | `get_funnel_report` (Sprint 5) | REUSAR |
| Customer Success dashboard | `get_customer_success_dashboard` (Sprint 15) | REUSAR |
| NPS y satisfacción | `get_nps_summary` (Sprint 16) | REUSAR |
| Marketing UTM | `get_utm_analytics` (Sprint 17) | REUSAR |
| Referidos | `get_referral_dashboard` (Sprint 17) | REUSAR |
| Finance KPIs | `get_finance_dashboard` + `get_workspace_profitability` (Sprint 18) | REUSAR |
| Pipeline comercial | `get_pipeline` + `get_executive_dashboard` (Sprints 4, 5) | REUSAR |
| GPS / Operaciones | `get_operational_dashboard` + `get_operations_dashboard` (Sprints 6, 8) | REUSAR |
| Alertas inteligentes | `get_smart_alerts` (Sprint 5) | REUSAR |
| Admin SaaS | `get_admin_stats` + `get_admin_finance_summary` (Sprints 9, 18) | REUSAR |
| Forecast IA | `forecastFinance()` + `forecastSales()` (Sprints 5, 18) | REUSAR |

---

## 4. PLAN EXACTO DE SPRINT 19

### Nuevas migraciones necesarias

| Migración | Contenido |
|-----------|-----------|
| 0088_bi_views.sql | Views regulares `dw_*` + `get_sales_by_rep()` + `get_ops_productivity()` |
| 0089_bi_kpi_engine.sql | `get_bi_executive_kpis()`, `get_bi_sales_kpis()`, `get_bi_operations_kpis()`, `get_bi_marketing_kpis()`, `get_bi_customer_kpis()` |
| 0090_bi_cohorts.sql | `get_client_cohorts()` + `get_full_funnel()` (Lead→Factura, extiende get_funnel_report) |

### Nuevos archivos frontend

| Archivo | Descripción |
|---------|-------------|
| `src/services/bi.ts` | Tipos + funciones del BI engine |
| `src/hooks/useBI.ts` | React Query hooks para todos los KPI endpoints |
| `src/views/BIPage.tsx` | `/app/bi` — 6 tabs CEO/Comercial/Operaciones/Marketing/CS/IA |
| Actualizar `AdminPanel.tsx` | Tab "Business Intelligence" para Shelwi |
| Actualizar `router.tsx` | Ruta `/app/bi` |
| Actualizar `aiCommercial.ts` | 4 nuevas funciones IA analítica |

### NO crear

| Solicitud | Razón |
|-----------|-------|
| MATERIALIZED VIEWS | Supabase no las refresca automáticamente. Views regulares son suficientes. |
| DW tables separadas | Los datos operativos ya están indexados correctamente. |
| Motor de metas (targets/goals) | Requeriría tabla nueva + UI de configuración → Sprint 20. |
| Multi-touch attribution | Arquitectura actual es first-touch. Cambio de modelo es Sprint 21+. |
| Gastos de campaña (para ROI real) | No existe tabla de ad_spend. Sprint 20. |

---

## 5. ARQUITECTURA BI SPRINT 19

```
/app/bi
├── Tab 1: CEO Dashboard
│   └── get_bi_executive_kpis() ← NUEVO (agrega: executive_dashboard + finance_dashboard + cs_dashboard)
├── Tab 2: Comercial
│   └── get_bi_sales_kpis() ← NUEVO (agrega: reports_summary + funnel_report + sales_by_rep)
├── Tab 3: Operaciones
│   └── get_bi_operations_kpis() ← NUEVO (agrega: operations_dashboard + ops_productivity)
├── Tab 4: Marketing
│   └── get_bi_marketing_kpis() ← NUEVO (agrega: growth_dashboard + utm_analytics + referral_dashboard)
├── Tab 5: Customer Success
│   └── get_bi_customer_kpis() ← NUEVO (agrega: cs_dashboard + nps_summary + cohorts)
└── Tab 6: IA Analítica
    └── generateExecutiveSummary() + generateBusinessForecast() + generateRiskAssessment() ← NUEVAS

Views DW (no materializadas):
├── dw_sales      → quotes + clients + profiles (created_by) + calc_snapshot
├── dw_operations → orders + work_orders + gps_events + profiles (assigned_to)
├── dw_finance    → quotes (aprobadas) + order_cost_entries + calc_snapshot
└── dw_marketing  → utm_events + referral_conversions + clients (con fechas)
```

---

## 6. ÍNDICES NECESARIOS

| Índice | Tabla | Por qué |
|--------|-------|---------|
| `(workspace_id, created_by, status, created_at)` | `quotes` | `get_sales_by_rep()` filtra por estos 4 campos |
| `(workspace_id, assigned_to, status, updated_at)` | `work_orders` | `get_ops_productivity()` agrupa por assigned_to |
| `(workspace_id, client_id)` | `quotes` | cohortes — agrupa clientes por fecha first_quote |

(Verificar si ya existen antes de crear)

---

## 7. SEGURIDAD — CONFIRMACIÓN

Todas las nuevas RPCs seguirán el mismo patrón que Sprints 1–18:
- `SECURITY DEFINER` con `SET search_path = public`
- `workspace_id` siempre del JWT via `profiles`
- RLS en las views `dw_*` (siempre `WHERE workspace_id = current_workspace`)
- Nunca workspace_id del frontend

---

*Auditoría completada. Sin código escrito aún. Esperando validación para proceder.*
