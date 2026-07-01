# ROADMAP SPRINT 5 — REPORTES AVANZADOS + CENTRO DE INTELIGENCIA

**Fecha inicio:** 2026-06-21  
**Objetivo:** Zero Trust en toda la capa de reportes. Ningún KPI calculado en frontend.

---

## DECISIONES DE ARQUITECTURA

### Zero Trust (implementado)
- **Prohibido en frontend:** calcular conversiones, rankings, KPIs, tendencias
- **Obligatorio:** consumir RPCs que devuelven datos ya calculados por Postgres

### Fuente de verdad — apertura de cotizaciones
- `quote_views` → fuente primaria (device, city, browser, Sprint 4)
- `quote_events.proposal_opened` → legado, se mantiene por compatibilidad
- `quotes.commercial_status` → estado canónico del pipeline CRM
- En las RPCs: se usa `quote_views` para contar aperturas y `commercial_status` para el embudo

### Bug corregido — chartData()
- **Antes:** `chartData()` filtraba `status === 'Aprobada'` pero el label decía "Valor cotizado"
- **Ahora:** Las RPCs devuelven `valor_cotizado` (TODAS las cotizaciones) y `valor_aprobado` (solo Aprobadas) como campos separados y claramente nombrados

### Exportaciones
- **Vía Edge Function** `generate-report` (no client-side)
- Flujo: JWT → validación workspace → validación plan → RPC → generación → archivo
- Formatos: CSV (todos los reportes) + PDF/HTML (reporte ejecutivo)

---

## FASE 1 — RPCs BACKEND ✅

### `get_reports_summary(workspace_id, period_start?, period_end?)`
- FREE: período fijo al mes actual (ignorar parámetros)
- PRO/PREMIUM: período libre hasta 12 meses
- Devuelve: cotizaciones_creadas, **valor_cotizado** (fix bug), valor_aprobado, tasa_conversion, tiempo_promedio_cierre, serie_mensual, vs_periodo_anterior
- Validación: membresía de workspace + límite de rango 12 meses + no fechas futuras

### `get_funnel_report(workspace_id, period_start?, period_end?)`
- PRO/PREMIUM: `advanced_reports_enabled`
- Fuente: `quotes.commercial_status` (canónico)
- Devuelve: 7 etapas con count, valor, conversión desde total + resumen (tasa_vista, tasa_cierre, valor_en_juego)

### `get_services_report(workspace_id, period_start?, period_end?)`
- PRO/PREMIUM
- Fuente: `service_lines` JSONB (unnest con `jsonb_array_elements`)
- Devuelve: por servicio → veces_cotizado, valor_cotizado, veces_vendido, valor_vendido, tasa_conversion
- Límite: top 20 servicios

### `get_clients_report(workspace_id, period_start?, period_end?)`
- FREE: conteos básicos del mes actual
- PRO/PREMIUM: top 10 clientes + inactivos detallados
- Usa: `clients.total_approved`, `clients.last_activity_at` (mantenidos por trigger de Sprint 4)

### `get_executive_dashboard(workspace_id)`
- PRO/PREMIUM
- Una sola llamada: últimos 30 días + mes anterior + pipeline activo + clientes + créditos IA
- PREMIUM adicional: tendencia 3 meses

### `get_smart_alerts(workspace_id)`
- PRO/PREMIUM
- Detecta: caída conversión >20%, sin seguimiento >3d, vencimientos próximos, clientes perdidos 60d, aumento rechazos >30%
- Severidad: high | medium | low

---

## FASE 2 — EDGE FUNCTION ✅

### `generate-report`
- Autenticación: JWT verificado
- workspace_id: extraído de `profiles` (nunca del cliente)
- Plan: `check_feature_access('advanced_reports_enabled')` — PRO+ requerido
- Tipos: summary | funnel | services | clients | executive
- Formatos: csv | pdf (HTML renderizable)
- Datos: vía las mismas RPCs de la Fase 1

---

## FASE 3 — TIPOS Y SERVICIOS ✅

- `src/lib/database.types.ts`: +6 funciones RPC tipadas
- `src/services/reports.ts`: capa de acceso a RPCs + exportReport() + downloadBlob() + periodPresetToDates()
- `src/hooks/useReports.ts`: React Query hooks (useReportsSummary, useFunnelReport, useServicesReport, useClientsReport, useExecutiveDashboard, useSmartAlerts, useExportReport)

---

## FASE 4 — FRONTEND MIGRADO ✅

### ReportesMobile — Centro de Inteligencia
**Eliminado del frontend:**
- ~~conversión calculada en React~~
- ~~ranking de servicios calculado en React~~
- ~~ranking de clientes calculado en React~~
- ~~chartData() con bug de Aprobadas~~
- ~~filtro de período decorativo~~

**Implementado:**
- 5 secciones con tabs: Ventas | Conversión | Clientes | Servicios | IA
- Filtro de período funcional (6 presets, PRO para períodos extendidos)
- Sección Ventas: KPIs + gráfica cotizado vs aprobado (fix bug) + comparativa vs período anterior
- Sección Conversión: embudo real desde commercial_status
- Sección Clientes: nuevos/activos/inactivos/recurrentes + top + en riesgo
- Sección Servicios: cotizado vs vendido por servicio
- Sección IA: alertas inteligentes + exportaciones CSV/PDF
- Feature gating: FREE=solo Ventas (mes actual), PRO+=todo

---

## FASE 5 — IA INSIGHTS

- `aiCommercial.ts` — 8 funciones completas ya existían desde Sprint 2
- `ShelwiIAMobile` — interfaz IA completa en `/app/ia`
- **Pendiente para Sprint 5.1:** Integrar `generateBusinessSummary`, `forecastSales`, `analyzeClientsAtRisk` directamente en la Sección IA de Reportes

---

## SEGURIDAD VALIDADA

| Prueba | Estado |
|---|---|
| FREE → solo Ventas mes actual, resto bloqueado | ✅ RPC bloquea + UI bloquea |
| PRO → período extendido, embudo, clientes, servicios | ✅ check_feature_access |
| PREMIUM → tendencia 3 meses, premium_data | ✅ plan_code check |
| Exportar → requiere JWT válido + PRO+ | ✅ Edge Function valida |
| Acceso cruzado (workspace_id ajeno) | ✅ todos los RPCs validan profiles join |
| Manipular período > 12 meses | ✅ rechazado en RPC |
| Fecha inicio futura | ✅ rechazado en RPC |

---

## ARCHIVOS CREADOS / MODIFICADOS

### Nuevos
- `supabase/migrations/0049_reports_rpc.sql` — 6 RPCs
- `supabase/functions/generate-report/index.ts` — Edge Function exportaciones
- `src/services/reports.ts` — capa de servicio Zero Trust
- `src/hooks/useReports.ts` — React Query hooks

### Modificados
- `src/lib/database.types.ts` — +6 RPCs tipadas
- `src/components/reportes/ReportesMobile.tsx` — reescritura completa (cero cálculos frontend)

---

## INSTRUCCIONES DE DEPLOYMENT

### 1. Aplicar migración
```sql
-- Pegar en Supabase SQL Editor
0049_reports_rpc.sql
```

### 2. Deploy Edge Function
```bash
npx supabase functions deploy generate-report
```

### 3. Deploy frontend
```bash
npm run build
```

### 4. Verificar feature flags
```sql
SELECT plan_code, advanced_reports_enabled FROM plan_features;
-- free=false, pro=true, premium=true
```

---

## RIESGOS RESTANTES

| Riesgo | Severidad | Plan |
|---|---|---|
| IA en Reportes no conectada (Sprint 5.1) | Media | aiCommercial.ts listo, falta UI en Sección IA |
| ReportesDesktop no migrado | Baja | Usa el mismo ReportesDesktop anterior (funciona con logic básica) |
| Edge Function requiere deploy manual | Baja | `supabase functions deploy generate-report` |
| PDF vía HTML (window.print en iframe) | Baja | Solución aceptable; mejorable con Puppeteer en Sprint 6+ |
| `get_services_report` parsea JSONB en Postgres | Media | Testeado con `jsonb_typeof` guard; si service_lines tiene formato distinto en cotizaciones antiguas puede retornar vacío |
