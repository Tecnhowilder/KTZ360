# EVENT CATALOG — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Todos los eventos del sistema. Formato: `DOMAIN.ENTITY.ACTION`

---

## 1. CONVENCIÓN DE NOMENCLATURA

```
DOMAIN.ENTITY.ACTION

Ejemplos:
  CRM.CLIENT.CREATED
  FINANCE.INVOICE.PAID
  OPS.TASK.COMPLETED
  AI.AGENT.EXECUTION_STARTED

Reglas:
- DOMAIN: en mayúsculas, nombre del módulo (CRM, FINANCE, OPS, HR, AI, CONFIG, SYSTEM)
- ENTITY: en mayúsculas, nombre de la entidad
- ACTION: en mayúsculas, verbo en pasado (CREATED, UPDATED, DELETED, COMPLETED, PAID, etc.)
- Sin espacios, separados por punto
- Siempre en inglés
```

---

## 2. ESTRUCTURA DE UN EVENTO

```typescript
interface DomainEvent {
  id: string;           // UUID único del evento
  type: string;         // 'CRM.CLIENT.CREATED'
  version: string;      // '1.0' — para compatibilidad hacia adelante
  company_id: string;   // UUID del workspace — siempre presente
  actor_id: string;     // UUID del user o agent que generó el evento
  actor_type: 'user' | 'agent' | 'system' | 'scheduler';
  occurred_at: string;  // ISO 8601 timestamptz
  payload: Record<string, unknown>; // datos específicos del evento
  metadata: {
    correlation_id?: string; // para trazar flujos multi-evento
    source: string;          // 'api' | 'edge_function' | 'automation' | 'agent'
    version: string;
  };
}
```

---

## 3. CATÁLOGO DE EVENTOS POR DOMINIO

### 3.1 CRM

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `CRM.CLIENT.CREATED` | Nuevo cliente creado | `client_id`, `name`, `source` | Automations, AGT-001 |
| `CRM.CLIENT.UPDATED` | Cliente modificado | `client_id`, `changed_fields`, `diff` | Automations, Audit |
| `CRM.CLIENT.DELETED` | Soft delete cliente | `client_id` | Audit |
| `CRM.LEAD.CREATED` | Nuevo lead ingresado | `lead_id`, `source`, `assigned_to` | AGT-001, Automations |
| `CRM.LEAD.CONVERTED` | Lead convertido a cliente | `lead_id`, `client_id` | AGT-001 |
| `CRM.LEAD.LOST` | Lead marcado como perdido | `lead_id`, `reason` | AGT-001 |
| `CRM.OPPORTUNITY.STAGE_CHANGED` | Etapa de oportunidad cambiada | `opportunity_id`, `from_stage`, `to_stage` | AGT-001, Automations |
| `CRM.QUOTE.CREATED` | Cotización generada | `quote_id`, `client_id`, `total` | Automations |
| `CRM.QUOTE.SENT` | Cotización enviada al cliente | `quote_id`, `client_id`, `channel` | Automations, AGT-001 |
| `CRM.QUOTE.ACCEPTED` | Cotización aceptada | `quote_id`, `client_id` | Automations, AGT-002 |
| `CRM.QUOTE.REJECTED` | Cotización rechazada | `quote_id`, `reason` | AGT-001 |
| `CRM.QUOTE.EXPIRED` | Cotización vencida | `quote_id` | Automations |

---

### 3.2 FINANCE

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `FINANCE.INVOICE.CREATED` | Factura generada | `invoice_id`, `client_id`, `total`, `due_date` | Automations, AGT-002 |
| `FINANCE.INVOICE.SENT` | Factura enviada al cliente | `invoice_id`, `channel` | Audit |
| `FINANCE.INVOICE.PAID` | Pago registrado (factura completa) | `invoice_id`, `payment_id`, `amount` | Automations, AGT-002 |
| `FINANCE.INVOICE.PARTIAL_PAID` | Pago parcial registrado | `invoice_id`, `amount_paid`, `balance` | AGT-002 |
| `FINANCE.INVOICE.OVERDUE` | Factura vencida sin pagar | `invoice_id`, `days_overdue` | Automations, AGT-002 |
| `FINANCE.INVOICE.VOID` | Factura anulada | `invoice_id`, `reason` | Audit |
| `FINANCE.PAYMENT.REGISTERED` | Pago registrado | `payment_id`, `invoice_id`, `amount`, `method` | Automations |
| `FINANCE.REPORT.GENERATED` | Reporte financiero generado | `report_id`, `period`, `type` | AGT-002 |
| `FINANCE.ALEGRA.SYNCED` | Sincronización con Alegra completada | `entity_type`, `entity_id`, `alegra_id` | Audit |

---

### 3.3 OPS (Operaciones)

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `OPS.TASK.CREATED` | Tarea creada | `task_id`, `title`, `assignee_id`, `due_date` | Automations, Notifications |
| `OPS.TASK.ASSIGNED` | Tarea reasignada | `task_id`, `from_assignee`, `to_assignee` | Notifications, AGT-004 |
| `OPS.TASK.STATUS_CHANGED` | Estado de tarea cambiado | `task_id`, `from_status`, `to_status` | Automations, AGT-004 |
| `OPS.TASK.COMPLETED` | Tarea completada | `task_id`, `completed_by`, `completed_at` | Automations |
| `OPS.TASK.OVERDUE` | Tarea vencida | `task_id`, `days_overdue` | Automations, Notifications |
| `OPS.PROJECT.CREATED` | Proyecto creado | `project_id`, `name`, `manager_id` | AGT-008 |
| `OPS.PROJECT.STATUS_CHANGED` | Estado de proyecto cambiado | `project_id`, `from_status`, `to_status` | Automations |
| `OPS.PROJECT.COMPLETED` | Proyecto completado | `project_id`, `completed_at` | Automations |
| `OPS.GPS.CHECK_IN` | Check-in de campo registrado | `user_id`, `lat`, `lng`, `accuracy` | Audit, AGT-004 |
| `OPS.GPS.CHECK_OUT` | Check-out de campo registrado | `user_id`, `lat`, `lng` | Audit |
| `OPS.EVIDENCE.UPLOADED` | Evidencia subida | `evidence_id`, `task_id`, `type`, `user_id` | Audit |
| `OPS.ORDER.CREATED` | Pedido creado | `order_id`, `client_id`, `total` | Automations |
| `OPS.ORDER.STATUS_CHANGED` | Estado de pedido cambiado | `order_id`, `from_status`, `to_status` | Automations, Notifications |

---

### 3.4 HR (Recursos Humanos)

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `HR.EMPLOYEE.CREATED` | Empleado creado | `employee_id`, `name`, `department` | AGT-003 |
| `HR.EMPLOYEE.ONBOARDING_STARTED` | Proceso de onboarding iniciado | `employee_id`, `start_date` | Automations |
| `HR.EMPLOYEE.UPDATED` | Empleado actualizado | `employee_id`, `changed_fields` | Audit |
| `HR.EVALUATION.CREATED` | Evaluación creada | `evaluation_id`, `employee_id`, `evaluator_id` | Notifications |
| `HR.EVALUATION.SUBMITTED` | Evaluación enviada | `evaluation_id`, `score` | AGT-003 |
| `HR.LEAVE.REQUESTED` | Solicitud de ausencia creada | `leave_id`, `employee_id`, `type`, `dates` | Notifications, AGT-003 |
| `HR.LEAVE.APPROVED` | Solicitud aprobada | `leave_id`, `approved_by` | Notifications |
| `HR.LEAVE.REJECTED` | Solicitud rechazada | `leave_id`, `reason` | Notifications |

---

### 3.5 CONFIG (Configuración)

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `CONFIG.MEMBER.INVITED` | Invitación enviada | `invitation_id`, `invitee_email`, `role` | send-email |
| `CONFIG.MEMBER.JOINED` | Invitación aceptada | `user_id`, `workspace_id`, `role` | Audit |
| `CONFIG.MEMBER.REMOVED` | Miembro eliminado | `user_id`, `workspace_id` | Audit |
| `CONFIG.MEMBER.ROLE_CHANGED` | Rol cambiado | `user_id`, `from_role`, `to_role` | Audit |
| `CONFIG.WORKSPACE.UPDATED` | Configuración del workspace modificada | `workspace_id`, `changed_fields` | Audit |
| `CONFIG.PLAN.CHANGED` | Plan de suscripción cambiado | `workspace_id`, `from_plan`, `to_plan` | Automations, Audit |
| `CONFIG.FEATURE.TOGGLED` | Feature activada/desactivada | `workspace_id`, `feature_key`, `enabled` | Audit |
| `CONFIG.INTEGRATION.CONNECTED` | Integración conectada | `integration_id`, `provider` | Audit |
| `CONFIG.INTEGRATION.DISCONNECTED` | Integración desconectada | `integration_id`, `provider` | Audit |

---

### 3.6 AI (Inteligencia Artificial)

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `AI.AGENT.TRIGGERED` | Agente disparado | `agent_id`, `trigger_type`, `company_id` | Audit, Monitoring |
| `AI.AGENT.PLANNING` | Agente en fase de planificación | `agent_id`, `execution_id` | Monitoring |
| `AI.AGENT.AWAITING_APPROVAL` | Agente esperando aprobación humana | `agent_id`, `execution_id`, `pending_action` | Notifications |
| `AI.AGENT.APPROVED` | Acción de agente aprobada | `agent_id`, `execution_id`, `approved_by` | Audit |
| `AI.AGENT.REJECTED` | Acción de agente rechazada | `agent_id`, `execution_id`, `rejected_by` | Audit |
| `AI.AGENT.EXECUTING` | Agente ejecutando acción | `agent_id`, `tool_id`, `params` | Monitoring |
| `AI.AGENT.COMPLETED` | Ejecución de agente completada | `agent_id`, `execution_id`, `result_summary` | Audit, Memory |
| `AI.AGENT.FAILED` | Ejecución de agente falló | `agent_id`, `execution_id`, `error`, `retry_count` | Monitoring, Alert |
| `AI.AGENT.DEAD_LETTER` | Agente en dead letter tras 3 retries | `agent_id`, `execution_id` | Alert → Admin |
| `AI.TOOL.INVOKED` | Tool invocado por agente | `tool_id`, `agent_id`, `params` | Audit |
| `AI.TOOL.COMPLETED` | Tool completado | `tool_id`, `agent_id`, `result` | Audit |
| `AI.TOOL.FAILED` | Tool falló | `tool_id`, `error` | Monitoring |
| `AI.MEMORY.WRITTEN` | Memoria escrita para empresa | `company_id`, `memory_type`, `entity` | — |
| `AI.QUOTA.EXCEEDED` | Cuota IA excedida | `company_id`, `resource` | Alert, Notifications |

---

### 3.7 SYSTEM

| Evento | Trigger | Payload clave | Suscriptores típicos |
|---|---|---|---|
| `SYSTEM.AUTOMATION.TRIGGERED` | Automatización disparada | `automation_id`, `trigger_type` | automation-scheduler |
| `SYSTEM.AUTOMATION.COMPLETED` | Automatización completada | `automation_id`, `duration_ms` | Audit |
| `SYSTEM.AUTOMATION.FAILED` | Automatización falló | `automation_id`, `error` | Alert |
| `SYSTEM.WEBHOOK.RECEIVED` | Webhook externo recibido | `webhook_id`, `provider`, `event_type` | integration-worker |
| `SYSTEM.WEBHOOK.PROCESSED` | Webhook procesado | `webhook_id`, `result` | Audit |
| `SYSTEM.EMAIL.QUEUED` | Email encolado | `email_id`, `to`, `template_id` | send-email |
| `SYSTEM.EMAIL.SENT` | Email enviado | `email_id`, `to` | Audit |
| `SYSTEM.EMAIL.FAILED` | Email falló | `email_id`, `error` | Retry, Alert |
| `SYSTEM.PUSH.SENT` | Push notification enviada | `push_id`, `user_id`, `device` | Audit |
| `SYSTEM.INTEGRATION.SYNCED` | Integración sincronizada | `integration_id`, `provider`, `records_synced` | Audit |
| `SYSTEM.BACKUP.COMPLETED` | Backup automático completado | `backup_id`, `size_mb` | Monitoring |
| `SYSTEM.HEALTH_CHECK.FAILED` | Health check de IA falló | `provider`, `latency_ms`, `error` | Alert |

---

## 4. SUBSCRIPTORES CORE

| Suscriptor | Eventos que escucha | Acción |
|---|---|---|
| `automation-scheduler` | Todos los eventos de dominio | Evalúa si dispara automatizaciones |
| `send-email` | `SYSTEM.EMAIL.QUEUED`, `CONFIG.MEMBER.INVITED` | Envía el email |
| `send-push` | `SYSTEM.PUSH.*` | Envía notificación push |
| `integration-worker` | `SYSTEM.WEBHOOK.RECEIVED`, `CONFIG.INTEGRATION.*` | Procesa integraciones |
| `ai-proxy` | `AI.AGENT.*` | Coordina ejecución de agentes |
| Audit (DB trigger) | Todos | Inserta en `audit_log` |
| Memory Engine | `AI.AGENT.COMPLETED` | Escribe aprendizajes en memoria |

---

## 5. REGLAS DE EVENTOS

1. Todo evento tiene `company_id` — nunca puede ser nulo para eventos de dominio
2. Los eventos son **inmutables** — nunca se modifican después de emitirse
3. Versión `'1.0'` hasta que haya breaking change en el payload
4. Si el payload cambia con breaking change → nueva versión `'2.0'`, no modificar la existente
5. Los eventos de `AI.*` siempre incluyen `execution_id` para correlación
6. `correlation_id` en metadata conecta eventos relacionados de un mismo flujo
7. La tabla `domain_events` se particiona por `occurred_at` mensualmente

---

*Referencia: `supabase/migrations/0068_automations_schema.sql`, `0093_webhook_schema.sql`*
*Añadir nuevos eventos aquí ANTES de implementarlos en código*
