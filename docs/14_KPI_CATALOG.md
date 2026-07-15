# KPI CATALOG — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Todas las métricas que Shelwi calcula, monitorea y presenta

---

## 1. KPIs DE NEGOCIO (por empresa cliente)

### 1.1 CRM / Ventas

| KPI | Fórmula | Fuente | Frecuencia |
|---|---|---|---|
| Leads activos | COUNT(leads WHERE status = 'new' OR 'contacted' OR 'qualified') | leads table | Tiempo real |
| Tasa de conversión de leads | COUNT(leads converted) / COUNT(leads total) × 100 | leads | Mensual |
| Cotizaciones enviadas | COUNT(quotes WHERE status = 'sent') | quotes | Semanal |
| Tasa de aceptación de cotizaciones | COUNT(accepted) / COUNT(sent) × 100 | quotes | Mensual |
| Monto cotizaciones pendientes | SUM(grand_total WHERE status = 'sent') | quotes | Tiempo real |
| Pipeline de ventas (valor) | SUM(opportunity.amount × probability) | opportunities | Semanal |
| Tiempo promedio de cierre (días) | AVG(accepted_at - created_at) | quotes | Mensual |
| Clientes activos | COUNT(clients WHERE status = 'active') | clients | Tiempo real |
| Clientes nuevos (mes) | COUNT(clients WHERE created_at > month_start) | clients | Mensual |
| Clientes sin actividad (60d) | COUNT(clients sin quote/order últimos 60 días) | clients + quotes | Semanal |

### 1.2 Finanzas

| KPI | Fórmula | Fuente | Frecuencia |
|---|---|---|---|
| Ingresos del mes | SUM(payment.amount WHERE payment_date IN mes) | payments | Mensual |
| Facturación pendiente (total) | SUM(invoice.grand_total WHERE status = 'sent') | invoices | Tiempo real |
| Cuentas por cobrar vencidas | SUM(grand_total WHERE status = 'overdue') | invoices | Diario |
| Facturas vencidas (cantidad) | COUNT(invoices WHERE status = 'overdue') | invoices | Diario |
| Días promedio de cobro (DSO) | AVG(paid_at - issue_date) WHERE status = 'paid' | invoices | Mensual |
| Flujo de caja (proyectado) | Ingresos esperados vs egresos planificados | invoices + orders | Mensual |
| Tasa de pago en fecha | COUNT(paid on time) / COUNT(paid total) × 100 | invoices | Mensual |
| Ticket promedio | AVG(grand_total) WHERE status IN ('paid', 'sent') | invoices | Mensual |

### 1.3 Operaciones

| KPI | Fórmula | Fuente | Frecuencia |
|---|---|---|---|
| Tareas completadas (semana) | COUNT(tasks WHERE completed_at IN semana) | tasks | Semanal |
| Tareas vencidas | COUNT(tasks WHERE due_date < TODAY AND status != 'completed') | tasks | Diario |
| Tiempo promedio de resolución | AVG(completed_at - created_at) | tasks | Mensual |
| Velocidad del equipo (tareas/semana) | COUNT(completed) / semanas | tasks | Mensual |
| Proyectos activos | COUNT(projects WHERE status = 'active') | projects | Tiempo real |
| Proyectos en riesgo | COUNT(projects WHERE progress < expected AND end_date < 14d) | projects | Semanal |
| Check-ins GPS (día) | COUNT(gps_events WHERE type = 'check_in' AND DATE = TODAY) | gps_events | Diario |
| Cobertura de campo | Empleados con check-in hoy / Total campo | gps_events | Diario |

### 1.4 RRHH

| KPI | Fórmula | Fuente | Frecuencia |
|---|---|---|---|
| Empleados activos | COUNT(employees WHERE status = 'active') | employees | Tiempo real |
| Solicitudes de ausencia pendientes | COUNT(leave_requests WHERE status = 'pending') | leave_requests | Diario |
| Evaluaciones pendientes | COUNT(employees sin evaluación > 90d) | evaluations | Mensual |
| Tasa de absentismo | Días ausentes / Días hábiles × 100 | leave_requests | Mensual |

### 1.5 Customer Success

| KPI | Fórmula | Fuente | Frecuencia |
|---|---|---|---|
| Tickets abiertos | COUNT(tickets WHERE status = 'open' OR 'in_progress') | tickets | Tiempo real |
| Tiempo promedio de primera respuesta | AVG(first_reply_at - created_at) | tickets | Semanal |
| Tickets resueltos (semana) | COUNT(resolved IN semana) | tickets | Semanal |
| SLA cumplido | COUNT(within SLA) / COUNT(total) × 100 | tickets | Semanal |
| NPS promedio | AVG(survey_score) | reviews/surveys | Mensual |
| Satisfacción al cierre | AVG(post_close_rating) | surveys | Mensual |

---

## 2. KPIs DE PLATAFORMA (para Shelwi como producto)

### 2.1 Adopción

| KPI | Descripción | Target | Fuente |
|---|---|---|---|
| Time to First Value | Tiempo desde registro hasta primera acción de negocio | < 30 min | analytics |
| Activación | % usuarios que completan onboarding en 7 días | > 70% | analytics |
| DAU/MAU ratio | Stickiness de la plataforma | > 40% | analytics |
| Features adoptadas (promedio) | Módulos activos por workspace | > 3 | plan_features |

### 2.2 Retención

| KPI | Descripción | Target | Fuente |
|---|---|---|---|
| Retención 30d | % workspaces activos a 30 días | > 80% | analytics |
| Retención 90d | % workspaces activos a 90 días | > 65% | analytics |
| Churn mensual | % cancelaciones / total | < 5% | subscriptions |
| NPS (empresas) | Net Promoter Score | ≥ 40 | surveys |

### 2.3 Revenue

| KPI | Descripción | Target | Fuente |
|---|---|---|---|
| MRR | Monthly Recurring Revenue | Crecimiento 20% MoM | subscriptions |
| ARPU | Revenue promedio por workspace activo | > $50 USD | subscriptions |
| LTV | Lifetime Value estimado | > 12 meses × ARPU | cálculo |
| Expansion revenue | % MRR de upsells/upgrades | > 20% | subscriptions |

### 2.4 Performance Técnico

| KPI | Descripción | Target | Herramienta |
|---|---|---|---|
| Uptime | Disponibilidad del sistema | 99.9% | Supabase status |
| LCP | Largest Contentful Paint | < 2.5s (P75) | Sentry / Lighthouse |
| API P95 latency | Latencia P95 de RPCs | < 500ms | Supabase dashboard |
| Edge Function P95 | Latencia P95 incluyendo LLM | < 5s | Sentry |
| Error rate | % requests con error 5xx | < 0.1% | Sentry |

### 2.5 IA

| KPI | Descripción | Target | Fuente |
|---|---|---|---|
| AI cost per company/month | Costo IA por empresa mensual | < $5 USD | ai_usage |
| Agent success rate | % ejecuciones de agente sin error | > 95% | agent_executions |
| Agent approval rate | % acciones de agente aprobadas | > 80% | AI events |
| Token efficiency | Tokens por tarea completada | Tendencia bajista | ai_usage |
| Dead letter rate | % ejecuciones en dead letter | < 1% | agent_executions |

---

## 3. CÓMO SE CALCULAN

Los KPIs de negocio se calculan via RPCs SECURITY DEFINER:

```sql
-- Ejemplo: get_crm_metrics
CREATE OR REPLACE FUNCTION get_crm_metrics(
  p_workspace_id UUID,
  p_period TEXT -- 'day' | 'week' | 'month' | 'year'
) RETURNS JSONB
SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'active_clients', (SELECT COUNT(*) FROM clients WHERE company_id = p_workspace_id AND status = 'active' AND deleted_at IS NULL),
    'open_quotes', (SELECT COUNT(*) FROM quotes WHERE company_id = p_workspace_id AND status = 'sent'),
    'pending_amount', (SELECT COALESCE(SUM(grand_total), 0) FROM quotes WHERE company_id = p_workspace_id AND status = 'sent'),
    ...
  );
$$ LANGUAGE SQL;
```

---

## 4. DASHBOARD EJECUTIVO

Los KPIs se presentan en el Dashboard Ejecutivo (feature: `reports_access`):
- Vista resumen con los 12 KPIs más importantes
- Drill-down por módulo
- Filtros por período y por responsable
- Export a PDF/Excel
- Generación vía `generate-report` Edge Function

---

*Ver: `docs/architecture/BI_PERFORMANCE_REPORT.md` para análisis de rendimiento de KPIs*
*Ver: `supabase/functions/generate-report/index.ts` para implementación de reportes*
