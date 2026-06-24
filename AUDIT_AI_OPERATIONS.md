# AUDIT_AI_OPERATIONS.md
# Shelwi — Auditoría IA Operativa
Fecha: 2026-06-23

---

## 1. LO QUE YA EXISTE (NO DUPLICAR)

### Funciones IA en aiCommercial.ts

| Función | Operación | Créditos | Sprint |
|---------|-----------|---------|--------|
| `generateDescription()` | generate_description | 1 | 2 |
| `improveProposal()` | improve_proposal | 2 | 2 |
| `generateBusinessSummary()` | ai_summary | 2 | 5 |
| `analyzeCloseProbability()` | close_probability | 3 | 5 |
| `getCommercialRecommendations()` | recommendations | 3 | 5 |
| `forecastSales()` | forecast | 3 | 5 |
| `analyzeClientsAtRisk()` | risk_analysis | 3 | 5 |
| `prioritizeOpportunities()` | recommendations | 3 | 5 |
| `nextBestAction()` | recommendations | 3 | 5 |
| `forecastFinance()` | forecast_finance | 3 | 18 |
| `generateExecutiveSummary()` | bi_executive_summary | 3 | 19 |
| `generateBusinessForecast()` | bi_business_forecast | 3 | 19 |
| `generateRiskAssessment()` | bi_risk_assessment | 3 | 19 |
| `generateGrowthRecommendations()` | bi_growth_recs | 3 | 19 |

**Total IA operativa existente: 0 funciones** — no hay ninguna función IA que analice operaciones.

### Datos operativos existentes (fuentes de datos para las nuevas funciones)

| Fuente | Datos disponibles | RPC/Hook |
|--------|-----------------|----------|
| `get_ops_productivity(ws, start, end)` | OTs asignadas/finalizadas, `delayed_count`, `delay_rate_pct`, `avg_duration_hours`, `gps_hours`, evidencias | Sprint 19 ✅ |
| `get_bi_operations_kpis(ws, start, end)` | Estado actual pedidos/OTs + productividad por miembro | Sprint 19 ✅ |
| `get_operations_dashboard()` | Totales en tiempo real por status | Sprint 6 ✅ |
| `get_operational_dashboard(ws)` | GPS: check-ins, miembros en campo, OTs activas | Sprint 8 ✅ |
| `get_order_profit(ws, order_id)` | Costo estimado vs real, margen, GPS horas | Sprint 18 ✅ |
| `get_workspace_profitability(ws, start, end)` | Ingresos, costos, márgenes, tendencia | Sprint 18 ✅ |
| `get_finance_dashboard(ws, start, end)` | Pedidos bajo margen, top clientes, salud financiera | Sprint 18 ✅ |
| `get_clients_at_risk(ws)` | Clientes con health score bajo, inactivos | Sprint 15 ✅ |
| `get_customer_success_dashboard(ws)` | Segmentos VIP/at_risk/churned, avg health score | Sprint 15 ✅ |
| `dw_operations` view | OTs con `is_delayed`, `duration_hours` | Sprint 19 ✅ |
| `work_orders.scheduled_at/finished_at` | Fechas para calcular retrasos | Sprint 6 ✅ |
| `order_cost_entries` | Costos reales registrados vs estimado | Sprint 18 ✅ |

### Automatizaciones que ya detectan retrasos (Sprint 13)

| Template | Trigger | Estado |
|----------|---------|--------|
| `work_order_delayed` | periodic_check | ✅ EXISTE — evalúa OTs con `scheduled_at < now()` |
| `client_inactive` | periodic_check | ✅ EXISTE — ya detecta clientes inactivos |

**El motor `evaluate_periodic_automations` ya detecta OTs retrasadas y puede disparar alertas.**

---

## 2. GAPS REALES — LO QUE FALTA

### Gap 1 — `detectOperationalRisks()` — función IA nueva

No existe análisis IA que combine: OTs retrasadas + clientes en riesgo + costos elevados + baja productividad → diagnóstico holístico.

**Datos a combinar:** `get_bi_operations_kpis` + `get_finance_dashboard` + `get_clients_at_risk`

### Gap 2 — `detectDelayedWorkOrders()` — función IA nueva

Los triggers detectan retrasos pero NO generan análisis IA: ¿por qué se retrasa? ¿qué patrón hay? ¿qué operario tiene más retrasos?

**Datos:** `get_ops_productivity` → `delayed_count`, `delay_rate_pct` por miembro.

### Gap 3 — `detectLowProductivity()` — función IA nueva

No existe análisis IA de productividad comparativa por operario. Los datos YA existen en `get_ops_productivity`.

### Gap 4 — `detectCostOverruns()` — función IA nueva

No existe análisis IA de desviaciones de costo. Los datos YA existen en `get_order_profit` (estimado vs real).

**Nota:** Solo disponible cuando hay `order_cost_entries` registrados.

### Gap 5 — `detectAtRiskProjects()` — función IA nueva

Cruzar: OTs activas + clientes en riesgo + margen bajo → proyectos que necesitan atención.

### Gap 6 — `recommendOperationalActions()` — función IA nueva

Basado en los diagnósticos anteriores, generar un plan de acción priorizado.

### Gap 7 — Dashboard `/app/ia/operaciones`

No existe. La ruta `/app/ia` lleva a `KtzIA` (asistente comercial). Las operaciones no tienen dashboard IA propio.

### Gap 8 — Integración con Sprint 13 automations

Las nuevas funciones IA deben poder disparar reglas de automatización cuando detecten un riesgo. El motor ya existe (`trigger_automations`), falta integrarlo desde la UI.

### Gap 9 — AI operation costs para funciones nuevas

Necesitan registrarse en `ai_operation_costs` para que `check_ai_credits` funcione correctamente.

---

## 3. LO QUE NO SE CREA

| Solicitud | Razón para NO crear |
|-----------|---------------------|
| Motor IA nuevo | `callAistudio()` via `ai-proxy` es el único motor permitido |
| Proveedor IA nuevo | Solo Gemini via ai-proxy |
| Tablas de análisis operativo | Todos los datos ya están en `work_orders`, `dw_operations`, `order_cost_entries` |
| RPCs de detección en backend | Los triggers/automations del Sprint 13 ya detectan. La IA analiza los datos que ya existen. |

---

## 4. PLAN DE IMPLEMENTACIÓN

### No requiere migración nueva

Todos los datos operativos ya están accesibles via RPCs existentes. Solo falta:

1. Registrar las 6 nuevas operaciones IA en `ai_operation_costs` → **Migration 0096** (solo INSERT)
2. Añadir operaciones al tipo `AIOperation` en `aiStudio.ts`
3. Añadir 6 funciones en `aiCommercial.ts`
4. Crear `src/views/IAOperacionesPage.tsx` → `/app/ia/operaciones`
5. Actualizar router
6. Opcionalmente: botón "Crear automatización" que lleva a `/app/automatizaciones`

### Flujo de datos para cada función

```
detectOperationalRisks():
  get_bi_operations_kpis() → [ops KPIs]
  get_finance_dashboard()  → [low margin orders]
  get_clients_at_risk()    → [at risk clients]
  → prompt → callAistudio('ops_risk_detection') → 3 créditos

detectDelayedWorkOrders():
  get_ops_productivity()  → [delayed_count, delay_rate_pct por miembro]
  → prompt → callAistudio('ops_delay_analysis') → 3 créditos

detectLowProductivity():
  get_ops_productivity()  → [completion_rate, avg_duration por miembro]
  → prompt → callAistudio('ops_productivity_analysis') → 3 créditos

detectCostOverruns():
  get_workspace_profitability() → [real vs estimado]
  get_finance_dashboard()       → [low margin orders]
  → prompt → callAistudio('ops_cost_analysis') → 3 créditos

detectAtRiskProjects():
  get_finance_dashboard()  → [low_margin_orders]
  get_clients_at_risk()    → [at_risk_clients]
  get_operations_dashboard() → [activas]
  → prompt → callAistudio('ops_project_risk') → 3 créditos

recommendOperationalActions():
  [resultados de las funciones anteriores como contexto]
  → prompt → callAistudio('ops_recommendations') → 3 créditos
```

---

*Auditoría completada. Plan listo. Ningún código escrito aún.*
