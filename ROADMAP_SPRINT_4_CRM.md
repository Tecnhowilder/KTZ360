# ROADMAP SPRINT 4 — CRM COMERCIAL PRO

**Fecha inicio:** 2026-06-21  
**Objetivo:** Convertir Shelwi en un CRM comercial ligero — de cotización a venta.

---

## FASE 1 — PIPELINE COMERCIAL ✅

### Base de datos
- [x] `commercial_status` en tabla `quotes` (separado del status técnico)
  - Valores: `borrador | enviada | vista | negociacion | aprobada | rechazada | vencida`
  - Migración retroactiva: sincroniza desde `status` existente
- [x] `quote_commercial_history` — historial de cambios con fecha, usuario y observación
- [x] Trigger: sincroniza `commercial_status` automáticamente cuando `status` técnico cambia

### RPCs (Zero Trust)
- [x] `update_commercial_status(quote_id, new_status, observacion?)` — feature gated PRO+
- [x] `get_pipeline(workspace_id)` — cotizaciones agrupadas + totales por estado
- [x] `get_quote_commercial_history(quote_id)` — historial + seguimientos + vistas

### Frontend
- [x] `PipelineMobile.tsx` — vista Kanban mobile-first (390–430px)
  - Tabs por estado comercial
  - KPIs: enviadas, vistas, negociación, aprobadas
  - Tarjetas con: cliente, total, alertas (sin seguimiento, vence pronto)
  - Mover entre estados con menú contextual
  - Feature gate → UpgradeModal si FREE
- [x] Ruta `/app/pipeline` en router
- [x] `Pipeline` en `MobileBottomNav` (reemplaza `Catálogo` — movido a "Más")

---

## FASE 2 — APERTURA DE COTIZACIÓN ✅

- [x] `quote_views` tabla — **ya existía**
- [x] Trigger `trg_quote_views_crm`: cuando cliente abre cotización →
  - Auto-actualiza `commercial_status` a `vista` (si estaba `enviada`)
  - Registra en historial comercial
  - Registra en timeline del cliente
  - Notificación al owner (primera apertura del día)

---

## FASE 3 — SEGUIMIENTOS ✅

### Base de datos
- [x] `seguimientos` tabla — tipos: llamada, whatsapp, correo, visita, reunión, nota
  - RLS: workspace members solo ven/crean los propios
- [x] RPC `create_seguimiento` — Zero Trust, feature gated PRO+
  - Auto-registra en timeline del cliente
  - Auto-actualiza `last_activity_at` del cliente
  - Si resultado es "interesado/reprogramar" → mueve cotización a `negociacion`
- [x] `SeguimientoSheet.tsx` — bottom sheet para crear/ver seguimientos
  - Tab "Nuevo": tipo, resultado, comentario
  - Tab "Historial": lista cronológica de seguimientos

---

## FASE 4 — TIMELINE COMERCIAL ✅

### Base de datos
- [x] `client_timeline_events` tabla — todos los eventos comerciales por cliente
  - Tipos: quote_created, quote_sent, quote_viewed, quote_approved, quote_rejected, seguimiento, nota, recordatorio...
  - Poblada retroactivamente con cotizaciones existentes
  - Triggers automáticos desde: quotes, quote_views, seguimientos
- [x] RPC `get_client_timeline(workspace_id, client_id)` — Zero Trust, PRO+
- [x] `ClientTimelineView.tsx` — componente de timeline visual

---

## FASE 5 — RECORDATORIOS ✅

### Base de datos
- [x] `recordatorios` tabla — tipo, fecha, estado (pendiente/completado/cancelado)
  - RLS: solo el creador puede actualizar
- [x] RPC `create_recordatorio` — crea + genera notificación interna + registra en timeline
- [x] `listRecordatorios`, `completeRecordatorio` en servicio

---

## FASE 6 — DASHBOARD CRM ✅

- [x] RPC `get_crm_dashboard(workspace_id)` — métricas de 90 días:
  - Enviadas, Vistas, Aprobadas, Rechazadas
  - Tasa de conversión (%)
  - Tiempo promedio de cierre (días)
  - Valor total aprobado
  - Sin seguimiento >3d, próximas a vencer
- [x] `CrmMetricsCard.tsx` — widget insertado en MobileDashboard
  - PRO/PREMIUM: KPI grid + alertas de acción
  - FREE: upsell card con call to action

---

## FASE 7 — IA COMERCIAL

- [ ] Probabilidad de cierre por cotización (usa créditos IA)
- [ ] Siguiente acción recomendada
- [ ] Clasificación: cliente caliente / frío / en riesgo
- **Estado:** Pendiente Sprint 4.2 — integración con Sprint 2 AI Credits

---

## FASE 8 — REPORTES CRM

- [ ] Embudo de conversión (Borrador → Aprobada)
- [ ] Top clientes por valor
- [ ] Top servicios cotizados vs ganados
- [ ] Cotizaciones ganadas/perdidas por período
- **Estado:** Pendiente — base de datos lista, falta UI

---

## FASE 9 — NOTIFICACIONES ✅ (Parcial)

- [x] Trigger: cliente abre cotización → notificación al owner
- [x] Trigger: cotización aprobada → notificación a owner/admin
- [x] Recordatorio creado → notificación interna
- [ ] Cotización sin seguimiento 3+ días → notificación push
- [ ] Cron para vencer cotizaciones expiradas (`expire_overdue_quotes`)

---

## FASE 10 — MOBILE FIRST ✅

- [x] `PipelineMobile` — 390/430px primero
- [x] `SeguimientoSheet` — bottom sheet adaptado
- [x] `ClientTimelineView` — componente responsive
- [x] `CrmMetricsCard` — widget compacto
- [ ] Pipeline Desktop — pendiente

---

## SEGURIDAD — ZERO TRUST ✅

| Validación | Estado |
|---|---|
| `pipeline_enabled` feature gating en todas las RPCs | ✅ |
| RLS en `seguimientos` — solo workspace propio | ✅ |
| RLS en `recordatorios` — solo workspace propio | ✅ |
| RLS en `quote_commercial_history` — solo workspace propio | ✅ |
| RLS en `client_timeline_events` — solo workspace propio | ✅ |
| `update_commercial_status` valida que quote pertenezca al workspace | ✅ |
| `create_seguimiento` valida quote + client pertenecen al workspace | ✅ |
| `create_recordatorio` rechaza fechas pasadas | ✅ |
| Acceso cruzado entre workspaces bloqueado en todos los RPCs | ✅ |
| Usuario FREE → bloqueado en Pipeline con UpgradeModal | ✅ |

---

## ARCHIVOS CREADOS

### SQL Migraciones
- `supabase/migrations/0045_crm_commercial_status.sql`
- `supabase/migrations/0046_crm_tables.sql`
- `supabase/migrations/0047_crm_rpc.sql`
- `supabase/migrations/0048_crm_triggers.sql`

### TypeScript / Servicios
- `src/lib/database.types.ts` — +CommercialStatus, +SeguimientoRow, +RecordatorioRow, +ClientTimelineEventRow, +commercial_status en QuoteRow, +pipeline_enabled en PlanFeaturesRow
- `src/lib/permissions.ts` — +pipeline_enabled en PlanFeature type
- `src/services/crm.ts` — servicio CRM Zero Trust
- `src/hooks/useCRM.ts` — React Query hooks CRM

### UI Components
- `src/components/crm/PipelineMobile.tsx`
- `src/components/crm/SeguimientoSheet.tsx`
- `src/components/crm/ClientTimelineView.tsx`
- `src/components/dashboard/CrmMetricsCard.tsx`

### Views / Routing
- `src/views/Pipeline.tsx`
- `src/router.tsx` — +ruta `/app/pipeline`
- `src/components/layout/MobileBottomNav.tsx` — Pipeline en nav principal

---

## INSTRUCCIONES DE DEPLOYMENT

### Paso 1: Aplicar migraciones en Supabase SQL Editor (en orden)
```
0045_crm_commercial_status.sql
0046_crm_tables.sql
0047_crm_rpc.sql
0048_crm_triggers.sql
```

### Paso 2: Verificar feature flags
```sql
select plan_code, pipeline_enabled from plan_features;
-- Debe mostrar: free=false, pro=true, premium=true
```

### Paso 3: Deploy frontend
```bash
npm run build
```

---

## PRUEBAS DE SEGURIDAD

### PRUEBA 1 — FREE bloqueado
```
Workspace FREE → /app/pipeline → UpgradeModal → PASS
```

### PRUEBA 2 — PRO puede mover estados
```
Workspace PRO → Pipeline → Mover cotización a ENVIADA → PASS
```

### PRUEBA 3 — Apertura registra vista
```
Cliente abre cotización → quote_views INSERT → commercial_status='vista' → PASS
```

### PRUEBA 4 — Seguimiento actualiza timeline
```
Crear seguimiento → client_timeline_events INSERT → PASS
```

### PRUEBA 5 — Acceso cruzado bloqueado
```
RPC con workspace_id ajeno → 'Sin acceso' → PASS (validado en todos los RPCs)
```

---

## RIESGOS IDENTIFICADOS

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Pipeline Desktop no implementado | Baja | Placeholder con mensaje "en desarrollo" |
| IA Comercial (FASE 7) pendiente | Media | Se completará en Sprint 4.2 |
| Cron `expire_overdue_quotes` no configurado | Baja | Función SQL existe, falta pg_cron/Edge Function |
| Reportes CRM completos | Media | Base de datos lista, falta UI de reportes |
