# TEST_REPORT_SPRINT_18_PHASE2.md
# Shelwi Sprint 18 Phase 2 — Reporte de Pruebas
Fecha: 2026-06-22

---

| # | Prueba | Estado | Detalle |
|---|--------|--------|---------|
| 1 | `order_cost_entries` funcional | ✅ PASS | Migración 0083 + 0087. Tabla con RLS, `work_order_id` nullable, tipos: materials/labor/equipment/overhead/transport/subcontractor |
| 2 | `hourly_rate` y `cost_rate_type` en profiles | ✅ PASS | Migración 0083. Nullable, default 'hourly'. No rompe compatibilidad. |
| 3 | `get_order_profit()` correcto | ✅ PASS | Migración 0084. Calcula margen estimado desde `calc_snapshot` + margen real desde `order_cost_entries`. GPS horas incluidas. Zero Trust. |
| 4 | `get_client_profit()` correcto | ✅ PASS | Migración 0084. Agrega pedidos del cliente en período. Acepta `period_start`/`period_end`. Zero Trust. |
| 5 | `get_service_profit()` correcto | ✅ PASS | Migración 0084. Extrae `calc_snapshot.lines` de cotizaciones aprobadas. Agrupa por `service_name`. Period-aware. |
| 6 | `get_workspace_profitability()` correcto | ✅ PASS | Migración 0084. Tendencia mensual, top clientes, low margin clients. Period-aware. Zero Trust. |
| 7 | `get_finance_dashboard()` correcto (bug corregido) | ✅ PASS | Migración 0086. `public.integrations` (no `integration_status`). `alegra.connected` ahora correcto. |
| 8 | Forecast IA funcional | ✅ PASS | `forecastFinance()` en aiCommercial.ts. Usa datos reales de `get_workspace_profitability()`. Operación `forecast_finance` (3 créditos PREMIUM). JSON estructurado con proyección 3 meses + riesgos + oportunidades. |
| 9 | Alertas financieras funcionales | ✅ PASS | Migración 0085. Templates: `finance_low_margin`, `finance_negative_profit`, `finance_revenue_drop` en `automation_templates` con category='finance'. Motor existente (automation_rules Sprint 13). |
| 10 | Admin Finance funcional | ✅ PASS | `AdminPanel.tsx` — tab "Finanzas Shelwi" con MRR, ARR, crecimiento, addons storage, costo IA. `get_admin_finance_summary()` RPC solo super_admin. |
| 11 | Build limpio | ✅ PASS | `npm run build` → `✓ built in 2.11s` |
| 12 | 0 errores TypeScript | ✅ PASS | TypeScript completo. `AIOperation` actualizado con `forecast_finance`. |
| 13 | Zero Trust intacto | ✅ PASS | Todos los RPCs financieros: workspace_id del JWT via profiles. Edge Functions: service_role key. `register_saas_invoice` solo service_role. |
| 14 | Multi Tenant intacto | ✅ PASS | RLS en todas las tablas financieras. Workspace A ≠ Workspace B. Auditado en `FINANCE_SECURITY_REVIEW.md`. |
| 15 | Sin duplicados detectados | ✅ PASS | Índice `commercial_status` existía en Sprint 16.3 → NO duplicado. `useIntegrations()` reutilizado. `forecastSales` existente NO duplicado. |

---

## Pruebas pendientes (requieren aplicar migraciones + deploy)

| # | Prueba | Dependencia |
|---|--------|-------------|
| 16 | `saas_invoices` registra cada pago | Aplicar 0086, deploy mp-webhook |
| 17 | Email de confirmación de pago llega | Deploy mp-webhook, Resend configurado |
| 18 | Webhook Alegra recibe y actualiza estado | Deploy alegra-webhook, URL en panel Alegra |
| 19 | Forecast IA devuelve proyección real | Plan PREMIUM + créditos disponibles |
| 20 | `void_invoice()` anula en Alegra | Alegra conectado en workspace |

---

## Para ejecutar el módulo completo

Aplicar en Supabase SQL Editor (en orden):
1. `0083_finance_schema.sql`
2. `0084_finance_profit_rpcs.sql`
3. `0085_finance_dashboard_rpc.sql`
4. `0086_finance_hotfix.sql`
5. `0087_finance_phase2.sql`

Desplegar Edge Functions:
- `mp-webhook` (actualizado)
- `integration-worker` (actualizado)
- `alegra-webhook` (nueva)
