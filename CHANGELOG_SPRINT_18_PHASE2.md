# CHANGELOG_SPRINT_18_PHASE2.md
# Shelwi Sprint 18 — Fase 2: Módulo Financiero Completo (No Bloqueado)
Fecha: 2026-06-22

---

## MIGRACIONES

| Archivo | Contenido |
|---------|-----------|
| `0083_finance_schema.sql` | `order_cost_entries` · `profiles.hourly_rate` · `profiles.cost_rate_type` · `get_order_cost_entries()` · `add_order_cost_entry()` |
| `0084_finance_profit_rpcs.sql` | `get_order_profit()` · `get_client_profit()` · `get_service_profit()` · `get_workspace_profitability()` |
| `0085_finance_dashboard_rpc.sql` | `get_finance_dashboard()` · `get_admin_finance_summary()` · Templates alertas (low_margin, negative_profit, revenue_drop) |
| `0086_finance_hotfix.sql` | Fix BUG-001 `integration_status→integrations` · `saas_invoices` · `void_invoice()` · `update_invoice_status()` · `get_invoice_detail()` · `register_saas_invoice()` · `get_saas_invoice_reconciliation()` |
| `0087_finance_phase2.sql` | `order_cost_entries.work_order_id` · `add_order_cost_entry()` actualizado · `forecast_finance` en `ai_operation_costs` |

---

## SERVICIOS / HOOKS

| Archivo | Cambio |
|---------|--------|
| `src/services/finance.ts` | Nuevo — tipos y funciones financieras |
| `src/hooks/useFinance.ts` | Nuevo — React Query hooks para todos los RPCs |
| `src/services/aiCommercial.ts` | `forecastFinance()` añadida · import `WorkspaceProfitability` |
| `src/services/aiStudio.ts` | `forecast_finance` añadido a `AIOperation` type |

---

## VISTAS

| Archivo | Cambio |
|---------|--------|
| `src/views/FinancePage.tsx` | Nuevo — `/app/finanzas` con 5 tabs: Resumen, Rentabilidad, Pedidos, Conectado (integraciones), Forecast |
| `src/views/AdminPanel.tsx` | `FinanzasAdminTab` añadida — MRR, ARR, crecimiento, addons |

---

## ROUTER / TIPOS

| Archivo | Cambio |
|---------|--------|
| `src/router.tsx` | `/app/finanzas` route |
| `src/lib/database.types.ts` | `OrderCostEntryRow` · `CostRateType` · 15 RPCs nuevas · `work_order_id` en `OrderCostEntryRow` |

---

## EDGE FUNCTIONS

| Función | Cambio |
|---------|--------|
| `mp-webhook` | Email confirmación de pago · Registro `saas_invoices` |
| `integration-worker` | `processAlegraVoidInvoice()` · route `invoice_void` |
| `alegra-webhook` | Nueva — receptor de notificaciones Alegra · Zero Trust |

---

## FUERA DE ALCANCE (Sprint 20)

- Facturación electrónica DIAN de Shelwi (requiere cuenta Alegra + resolución)
- Webhooks productivos Alegra end-to-end
- Implementación Wompi (confirmada por usuario para Sprint 20)
- XML CUFE
