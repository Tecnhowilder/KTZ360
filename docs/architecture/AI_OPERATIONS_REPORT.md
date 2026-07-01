# AI_OPERATIONS_REPORT.md
# Shelwi — IA Operativa
Fecha: 2026-06-23

---

## ENTREGABLES

### Migración SQL

| Archivo | Contenido |
|---------|-----------|
| [0096_ai_operations_costs.sql](supabase/migrations/0096_ai_operations_costs.sql) | 6 operaciones en `ai_operation_costs`: `ops_risk_detection`, `ops_delay_analysis`, `ops_productivity_analysis`, `ops_cost_analysis`, `ops_project_risk`, `ops_recommendations` (3 créditos c/u) |

### Código nuevo

| Archivo | Descripción |
|---------|-------------|
| `src/services/aiStudio.ts` | 6 nuevas operaciones añadidas a `AIOperation` type |
| `src/services/aiCommercial.ts` | 6 nuevas funciones IA operativas |
| [src/views/IAOperacionesPage.tsx](src/views/IAOperacionesPage.tsx) | `/app/ia/operaciones` — 6 paneles de análisis |
| `src/router.tsx` | Ruta `/app/ia/operaciones` |

---

## FUNCIONES IA IMPLEMENTADAS

| Función | Datos de entrada | Operación | Créditos |
|---------|-----------------|-----------|---------|
| `detectOperationalRisks(opsKpis, finDashboard)` | BIOperationsKPIs + FinanceDashboard | `ops_risk_detection` | 3 |
| `detectDelayedWorkOrders(opsKpis)` | BIOperationsKPIs (delay_count, delay_rate_pct por miembro) | `ops_delay_analysis` | 3 |
| `detectLowProductivity(opsKpis)` | BIOperationsKPIs (completion_rate, avg_duration por miembro) | `ops_productivity_analysis` | 3 |
| `detectCostOverruns(finDashboard, profitability)` | FinanceDashboard + WorkspaceProfitability | `ops_cost_analysis` | 3 |
| `detectAtRiskProjects(finDashboard, csKpis)` | FinanceDashboard + BICustomerKPIs | `ops_project_risk` | 3 |
| `recommendOperationalActions(risk, delay, productivity, cost)` | Texto de los 4 análisis anteriores | `ops_recommendations` | 3 (12 total para el plan) |

---

## ARQUITECTURA — SIN NUEVO MOTOR IA

```
IAOperacionesPage
    ↓ (carga datos de Sprint 18-19)
useBIOperationsKPIs() → get_bi_operations_kpis() → get_ops_productivity()
useFinanceDashboard() → get_finance_dashboard()
useWorkspaceProfitability() → get_workspace_profitability()
useBICustomerKPIs() → get_bi_customer_kpis() → get_clients_at_risk()
    ↓ (botón "Analizar")
aiCommercial.detectXxx(datos) → callAistudio({operation:'ops_*'})
    ↓ (Edge Function ai-proxy)
check_ai_credits(workspace_id, 3) → si no → error
Gemini API → respuesta JSON
consume_ai_credits(workspace_id, 3, 'ops_*')
    ↓
Resultado renderizado en IAOperacionesPage
```

---

## INTEGRACIÓN CON SPRINT 13 AUTOMATIZACIONES

El panel "Retrasos" y "Plan de acción" incluyen botón "Crear alerta automática" → `/app/automatizaciones`.

Los templates de automatización `work_order_delayed` y `client_inactive` (Sprint 13) ya existen y son la respuesta a los riesgos detectados por la IA. La IA detecta el patrón — el motor de automatizaciones lo ejecuta.

---

## PRUEBAS PASS/FAIL

| # | Prueba | Estado |
|---|--------|--------|
| 1 | Sin nuevo motor IA | ✅ PASS — usa ai-proxy existente |
| 2 | check_ai_credits() antes de ejecutar | ✅ PASS — via callAistudio() → ai-proxy |
| 3 | consume_ai_credits() post-ejecución | ✅ PASS — via ai-proxy |
| 4 | Zero Trust: workspace_id del JWT | ✅ PASS — datos de RPCs SECURITY DEFINER |
| 5 | Sin nuevo proveedor IA | ✅ PASS — solo Gemini via ai-proxy |
| 6 | `isAICreditsExhausted` manejado en UI | ✅ PASS — error específico mostrado |
| 7 | `isAIPlanNotIncluded` manejado en UI | ✅ PASS — error específico mostrado |
| 8 | Reutiliza datos de Sprint 18-19 | ✅ PASS — no queries nuevas |
| 9 | Integración con Sprint 13 automatizaciones | ✅ PASS — CTA a /app/automatizaciones |
| 10 | 0 errores en archivos nuevos | ✅ PASS — 0 errores en IAOperacionesPage.tsx y aiCommercial.ts |
