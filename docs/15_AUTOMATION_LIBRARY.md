# AUTOMATION LIBRARY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Triggers, condiciones y acciones disponibles en el Automation Engine
> Implementación: `supabase/migrations/0068_automations_schema.sql` + `supabase/functions/automation-scheduler/index.ts`

---

## 1. ARQUITECTURA DEL AUTOMATION ENGINE

```
Evento ocurre en Shelwi
      ↓
evaluate_and_queue_automations(event_type, payload) — RPC
      ↓
¿Existen automatizaciones activas para este evento en esta empresa?
      ↓ Sí
¿Se cumplen las condiciones?
      ↓ Sí
Encolar la automatización (queue table)
      ↓
automation-scheduler Edge Function ejecuta la acción
      ↓
Registrar resultado en automation_executions
```

---

## 2. TRIGGERS DISPONIBLES

### 2.1 Triggers por Evento

| Trigger ID | Descripción | Evento |
|---|---|---|
| `trigger.crm.lead.created` | Nuevo lead creado | CRM.LEAD.CREATED |
| `trigger.crm.lead.converted` | Lead convertido | CRM.LEAD.CONVERTED |
| `trigger.crm.quote.sent` | Cotización enviada | CRM.QUOTE.SENT |
| `trigger.crm.quote.accepted` | Cotización aceptada | CRM.QUOTE.ACCEPTED |
| `trigger.crm.quote.rejected` | Cotización rechazada | CRM.QUOTE.REJECTED |
| `trigger.crm.quote.expired` | Cotización vencida | CRM.QUOTE.EXPIRED |
| `trigger.finance.invoice.created` | Factura creada | FINANCE.INVOICE.CREATED |
| `trigger.finance.invoice.paid` | Factura pagada | FINANCE.INVOICE.PAID |
| `trigger.finance.invoice.overdue` | Factura vencida | FINANCE.INVOICE.OVERDUE |
| `trigger.ops.task.created` | Tarea creada | OPS.TASK.CREATED |
| `trigger.ops.task.completed` | Tarea completada | OPS.TASK.COMPLETED |
| `trigger.ops.task.overdue` | Tarea vencida | OPS.TASK.OVERDUE |
| `trigger.ops.order.confirmed` | Pedido confirmado | OPS.ORDER.STATUS_CHANGED (to:confirmed) |
| `trigger.hr.employee.created` | Empleado creado | HR.EMPLOYEE.CREATED |
| `trigger.hr.leave.requested` | Ausencia solicitada | HR.LEAVE.REQUESTED |
| `trigger.cx.ticket.created` | Ticket creado | SYSTEM.TICKET.CREATED |
| `trigger.config.member.joined` | Miembro se unió | CONFIG.MEMBER.JOINED |
| `trigger.config.plan.changed` | Plan cambiado | CONFIG.PLAN.CHANGED |
| `trigger.ai.agent.awaiting_approval` | Agente espera aprobación | AI.AGENT.AWAITING_APPROVAL |

### 2.2 Triggers por Schedule

| Trigger ID | Descripción | Schedule |
|---|---|---|
| `schedule.daily.morning` | Ejecución diaria en la mañana | Diario 8:00am (timezone empresa) |
| `schedule.daily.evening` | Ejecución diaria en la tarde | Diario 6:00pm |
| `schedule.weekly.monday` | Lunes por la mañana | Lunes 8:00am |
| `schedule.monthly.first` | Primero del mes | Día 1, 8:00am |
| `schedule.custom` | Schedule personalizado | Cron expression configurable |

### 2.3 Triggers por Webhook

| Trigger ID | Descripción |
|---|---|
| `trigger.webhook.mercadopago` | Pago recibido via MercadoPago |
| `trigger.webhook.alegra` | Sincronización con Alegra |
| `trigger.webhook.whatsapp` | Mensaje recibido via WhatsApp Business |
| `trigger.webhook.custom` | Webhook externo configurado por empresa |

---

## 3. CONDICIONES DISPONIBLES

Las condiciones filtran cuándo ejecutar la automatización:

| Condición | Descripción | Ejemplo |
|---|---|---|
| `field.equals` | Campo igual a valor | `status = 'overdue'` |
| `field.not_equals` | Campo diferente | `priority != 'low'` |
| `field.greater_than` | Campo mayor que | `amount > 1000` |
| `field.less_than` | Campo menor que | `days_overdue < 30` |
| `field.contains` | Campo contiene texto | `title contains 'urgente'` |
| `field.in_list` | Campo en lista | `source in ['web', 'whatsapp']` |
| `field.is_null` | Campo está vacío | `assignee_id is null` |
| `days_since.created` | Días desde creación | `days >= 3` |
| `days_since.updated` | Días desde última actualización | `days >= 7` |
| `days_until.due_date` | Días hasta vencimiento | `days <= 3` |
| `time.is_business_hours` | Es horario laboral (configurable) | — |
| `day.of_week` | Día de la semana | `weekday = 'monday'` |

---

## 4. ACCIONES DISPONIBLES

### 4.1 Comunicaciones

| Acción | Descripción | Config requerida |
|---|---|---|
| `action.send.email` | Enviar email al cliente o usuario | `to`, `template_id`, `variables` |
| `action.send.push` | Enviar push notification | `user_ids`, `title`, `body` |
| `action.send.whatsapp` | Enviar mensaje WhatsApp | `phone`, `template_id` (requiere integración) |
| `action.send.sms` | Enviar SMS | `phone`, `message` (requiere integración) |

### 4.2 Tareas y Proyectos

| Acción | Descripción | Config requerida |
|---|---|---|
| `action.create.task` | Crear tarea automática | `title`, `assignee`, `due_offset_days`, `priority` |
| `action.update.task.status` | Cambiar estado de tarea | `task_id`, `new_status` |
| `action.assign.task` | Asignar tarea a usuario | `task_id`, `assignee_rule` (ej: 'least_loaded') |
| `action.update.task.priority` | Cambiar prioridad de tarea | `task_id`, `new_priority` |

### 4.3 CRM

| Acción | Descripción | Config requerida |
|---|---|---|
| `action.update.client.status` | Cambiar estado del cliente | `status` |
| `action.update.lead.status` | Cambiar estado del lead | `status` |
| `action.create.note` | Añadir nota al registro | `content` |
| `action.assign.client` | Asignar cliente a usuario | `assignee_rule` |

### 4.4 Finanzas

| Acción | Descripción | Config requerida |
|---|---|---|
| `action.update.invoice.status` | Cambiar estado de factura | `status` |
| `action.generate.invoice` | Generar factura desde orden | `from_order_id` |
| `action.sync.alegra` | Sincronizar con Alegra | `entity_type`, `entity_id` |

### 4.5 Sistema

| Acción | Descripción | Config requerida |
|---|---|---|
| `action.wait` | Esperar N días antes de la siguiente acción | `days` |
| `action.webhook.call` | Llamar a webhook externo | `url`, `method`, `body` |
| `action.agent.invoke` | Invocar agente IA | `agent_id`, `context` |
| `action.conditional` | Bifurcación según condición | `condition`, `then_actions`, `else_actions` |

---

## 5. LÍMITES POR PLAN

| Métrica | Free | Start | Growth | Business OS | Enterprise OS |
|---|---|---|---|---|---|
| Automatizaciones activas | 0 | 5 | 20 | 100 | Ilimitado |
| Acciones por automatización | — | 3 | 5 | 10 | Ilimitado |
| Ejecuciones/mes | — | 500 | 5.000 | 50.000 | Ilimitado |
| Workflows pre-construidos | — | Todos | Todos | Todos | + custom |
| Builder visual | — | ✅ | ✅ | ✅ | ✅ |
| Triggers por webhook | — | ❌ | ✅ | ✅ | ✅ |
| Acciones de agente IA | — | ❌ | ❌ | ✅ | ✅ |

---

## 6. SCHEMA RELEVANTE

```sql
-- Automatizaciones (0068_automations_schema.sql)
CREATE TABLE automations (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL,
  conditions JSONB,
  is_active BOOLEAN DEFAULT false,
  last_run_at TIMESTAMPTZ,
  run_count INT DEFAULT 0,
  error_count INT DEFAULT 0
);

CREATE TABLE automation_actions (
  id UUID PRIMARY KEY,
  automation_id UUID FK → automations,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL,
  order INT NOT NULL,
  delay_minutes INT DEFAULT 0
);

CREATE TABLE automation_executions (
  id UUID PRIMARY KEY,
  automation_id UUID FK,
  company_id UUID NOT NULL,
  trigger_event TEXT,
  status TEXT, -- running | completed | failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  actions_executed JSONB[]
);
```

---

*Ver: `supabase/functions/automation-scheduler/index.ts` para la implementación del scheduler*
*Ver: `docs/11_WORKFLOW_LIBRARY.md` para workflows pre-construidos que usan estas acciones*
*Ver: `docs/audits/AUDIT_SPRINT_13_AUTOMATIONS.md` para contexto histórico del módulo*
