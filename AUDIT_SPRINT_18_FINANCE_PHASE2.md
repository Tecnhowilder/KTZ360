# AUDIT_SPRINT_18_FINANCE_PHASE2.md
# Shelwi — Revalidación Sprint 18 Fase 2
Fecha: 2026-06-22

---

## REVALIDACIÓN (FASE 0)

### Lo que YA existe de Sprint 18 (no duplicar)

| Entidad | Migración | Estado |
|---------|-----------|--------|
| `order_cost_entries` | 0083 | ✅ EXISTE — falta columna `work_order_id` |
| `profiles.hourly_rate` | 0083 | ✅ EXISTE |
| `profiles.cost_rate_type` | 0083 | ✅ EXISTE |
| `get_order_cost_entries()` RPC | 0083 | ✅ EXISTE |
| `add_order_cost_entry()` RPC | 0083 | ✅ EXISTE — falta parámetro `work_order_id` |
| `get_order_profit()` RPC | 0084 | ✅ EXISTE |
| `get_client_profit()` RPC | 0084 | ✅ EXISTE |
| `get_service_profit()` RPC | 0084 | ✅ EXISTE |
| `get_workspace_profitability()` RPC | 0084 | ✅ EXISTE |
| `get_finance_dashboard()` RPC | 0085 + 0086 | ✅ EXISTE (bug corregido en 0086) |
| `get_admin_finance_summary()` RPC | 0085 | ✅ EXISTE |
| Finance alert templates | 0085 | ✅ EXISTE (3 templates: low_margin, negative_profit, revenue_drop) |
| `saas_invoices` tabla | 0086 | ✅ EXISTE |
| `void_invoice()` RPC | 0086 | ✅ EXISTE |
| `update_invoice_status()` RPC | 0086 | ✅ EXISTE |
| `src/services/finance.ts` | — | ✅ EXISTE |
| `src/hooks/useFinance.ts` | — | ✅ EXISTE |
| `src/views/FinancePage.tsx` | — | ✅ EXISTE (Tab 4 necesita actualización) |
| `src/views/AdminPanel.tsx` FinanzasAdminTab | — | ✅ EXISTE |
| `/app/finanzas` route | router.tsx | ✅ EXISTE |
| Índice `idx_quotes_status_commercial` | 0078_performance_sprint163 | ✅ EXISTE desde Sprint 16.3 |
| `useIntegrations()` hook | Sprint 11 | ✅ EXISTE — reutilizable en FinancePage |

### Pendientes exactos (FASE 2)

| # | Pendiente | Por qué falta |
|---|-----------|---------------|
| 1 | `work_order_id` en `order_cost_entries` | El spec lo requiere, no se incluyó en 0083 |
| 2 | Actualizar `add_order_cost_entry()` con `p_work_order_id` | Consecuencia del punto 1 |
| 3 | `forecast_finance()` en aiCommercial.ts | Función de forecast financiero específica |
| 4 | Tab "Integraciones" en FinancePage (reemplaza "Facturación") | Spec pide Alegra+Drive+OneDrive+Gmail status |
| 5 | Tab "Forecast" funcional en FinancePage (call real a IA) | Actualmente solo redirige a /app/ia |
| 6 | Documentación: CHANGELOG, TEST_REPORT | Entregables del sprint |

### Confirmaciones críticas

- **`commercial_status` index**: ✅ Ya existe en `0078_performance_sprint163.sql` como `idx_quotes_status_commercial`. NO duplicar.
- **Procesador de pago**: MercadoPago (único activo confirmado por el usuario).
- **`forecastSales`**: existe en aiCommercial.ts para ventas. `forecast_finance` es una función NUEVA de forecast financiero que reutiliza la misma operación 'forecast' (3 créditos, PREMIUM).
- **`useIntegrations()`**: existe en `src/hooks/useIntegrations.ts`. Se reutiliza para Tab Integraciones.
- **Sin duplicados**: todos los RPCs, tablas y servicios del Sprint 18 ya están implementados. Solo se añade lo estrictamente necesario.
