# CAPABILITY CATALOG — SHELWI OS
> Versión: 0.1 (stub — requiere expansión en Sprint 0) | Fecha: 2026-07-14
> Schema en BD: migration `0148_ai_capability_registry.sql` (auditar antes de Sprint 2)

---

## Formato de Capability

```
CAP-XXX | domain.entity.action | Departamento
Descripción: qué hace esta Capability
Inputs: campo (tipo, requerido)
Outputs: campo (tipo)
Permisos: roles mínimos + feature flag
Eventos emitidos: DOMAIN.ENTITY.ACTION
Tools que usa: TOOL-XXX
Estado: Definida | En desarrollo | Implementada | Deprecada
Migration: XXXX (si aplica)
```

---

## Capabilities Core (Sprint 2-3 — 15 obligatorias)

### Departamento: CRM / Ventas

**CAP-001** | `crm.client.create`
- Descripción: Crea un nuevo cliente en el CRM de la empresa
- Inputs: `name` (string, req), `email` (string, opt), `phone` (string, opt), `source` (enum, opt)
- Outputs: `client_id` (uuid), `created_at` (timestamptz)
- Permisos: `member+` | Feature: `crm_access`
- Eventos: `CRM.CLIENT.CREATED`
- Tools: `CreateClient`
- Estado: Definida

**CAP-002** | `crm.opportunity.update`
- Descripción: Actualiza el estado de una oportunidad de venta
- Inputs: `opportunity_id` (uuid, req), `stage` (enum, req), `amount` (decimal, opt), `notes` (string, opt)
- Outputs: `opportunity_id` (uuid), `previous_stage` (enum), `new_stage` (enum)
- Permisos: `member+` | Feature: `crm_access`
- Eventos: `CRM.OPPORTUNITY.STAGE_CHANGED`
- Tools: `UpdateOpportunity`
- Estado: Definida

**CAP-003** | `crm.quote.generate`
- Descripción: Genera una cotización para un cliente
- Inputs: `client_id` (uuid, req), `items` (array, req), `validity_days` (int, opt)
- Outputs: `quote_id` (uuid), `quote_url` (string), `total` (decimal)
- Permisos: `member+` | Feature: `quotes_access`
- Eventos: `CRM.QUOTE.GENERATED`
- Tools: `CreateQuote`, `GeneratePDF`
- Estado: Definida

### Departamento: Finanzas

**CAP-004** | `finance.invoice.create`
- Descripción: Genera una factura para un cliente
- Inputs: `client_id` (uuid, req), `items` (array, req), `due_date` (date, opt), `currency` (enum, opt)
- Outputs: `invoice_id` (uuid), `invoice_number` (string), `total` (decimal)
- Permisos: `admin+` | Feature: `invoicing_access`
- Eventos: `FINANCE.INVOICE.CREATED`
- Tools: `CreateInvoice`, `GeneratePDF`, `SendEmail`
- Estado: Definida

**CAP-005** | `finance.payment.register`
- Descripción: Registra un pago recibido contra una factura
- Inputs: `invoice_id` (uuid, req), `amount` (decimal, req), `method` (enum, req), `date` (date, req)
- Outputs: `payment_id` (uuid), `invoice_status` (enum)
- Permisos: `admin+` | Feature: `payments_access`
- Eventos: `FINANCE.PAYMENT.REGISTERED`
- Tools: `RegisterPayment`, `ReconcileInvoice`
- Estado: Definida

**CAP-006** | `finance.report.generate`
- Descripción: Genera reporte financiero del período seleccionado
- Inputs: `period` (enum: monthly|quarterly|yearly, req), `year` (int, req), `month` (int, opt)
- Outputs: `report_id` (uuid), `report_url` (string), `summary` (object)
- Permisos: `admin+` | Feature: `reports_access`
- Eventos: `FINANCE.REPORT.GENERATED`
- Tools: `RunQuery`, `GeneratePDF`, `ExportData`
- Estado: Definida

### Departamento: Operaciones

**CAP-007** | `ops.task.create`
- Descripción: Crea una tarea en el sistema de operaciones
- Inputs: `title` (string, req), `assignee_id` (uuid, opt), `due_date` (date, opt), `priority` (enum, opt), `project_id` (uuid, opt)
- Outputs: `task_id` (uuid)
- Permisos: `member+` | Feature: `tasks_access`
- Eventos: `OPS.TASK.CREATED`
- Tools: `CreateTask`
- Estado: Definida

**CAP-008** | `ops.task.assign`
- Descripción: Asigna o reasigna una tarea a un miembro del equipo
- Inputs: `task_id` (uuid, req), `assignee_id` (uuid, req)
- Outputs: `task_id` (uuid), `previous_assignee` (uuid|null)
- Permisos: `manager+` | Feature: `tasks_access`
- Eventos: `OPS.TASK.ASSIGNED`
- Tools: `UpdateTask`, `SendNotification`
- Estado: Definida

**CAP-009** | `ops.project.update`
- Descripción: Actualiza el estado o datos de un proyecto
- Inputs: `project_id` (uuid, req), `status` (enum, opt), `progress` (int, opt), `notes` (string, opt)
- Outputs: `project_id` (uuid), `previous_status` (enum)
- Permisos: `manager+` | Feature: `projects_access`
- Eventos: `OPS.PROJECT.UPDATED`
- Tools: `UpdateProject`
- Estado: Definida

### Departamento: RRHH

**CAP-010** | `hr.employee.onboard`
- Descripción: Inicia el proceso de onboarding de un nuevo empleado
- Inputs: `name` (string, req), `email` (string, req), `role` (string, req), `start_date` (date, req), `department` (string, req)
- Outputs: `employee_id` (uuid), `onboarding_tasks` (array)
- Permisos: `admin+` | Feature: `hr_access`
- Eventos: `HR.EMPLOYEE.ONBOARDING_STARTED`
- Tools: `CreateEmployee`, `CreateTask`, `SendEmail`
- Estado: Definida

**CAP-011** | `hr.evaluation.create`
- Descripción: Crea una evaluación de desempeño para un empleado
- Inputs: `employee_id` (uuid, req), `period` (string, req), `evaluator_id` (uuid, req)
- Outputs: `evaluation_id` (uuid)`
- Permisos: `manager+` | Feature: `hr_evaluations`
- Eventos: `HR.EVALUATION.CREATED`
- Tools: `CreateEvaluation`
- Estado: Definida

**CAP-012** | `hr.leave.approve`
- Descripción: Aprueba o rechaza una solicitud de ausencia
- Inputs: `leave_request_id` (uuid, req), `decision` (enum: approved|rejected, req), `notes` (string, opt)
- Outputs: `leave_request_id` (uuid), `status` (enum)
- Permisos: `manager+` | Feature: `hr_leaves`
- Eventos: `HR.LEAVE.DECISION_MADE`
- Tools: `UpdateLeaveRequest`, `SendNotification`
- Estado: Definida

### Departamento: Configuración / Sistema

**CAP-013** | `config.workspace.update`
- Descripción: Actualiza configuración del workspace
- Inputs: `settings` (object, req) — nombre, logo, timezone, currency, etc.
- Outputs: `workspace_id` (uuid), `updated_fields` (string[])
- Permisos: `admin+` | Feature: `workspace_settings`
- Eventos: `CONFIG.WORKSPACE.UPDATED`
- Tools: `UpdateWorkspace`
- Estado: Definida

**CAP-014** | `config.member.invite`
- Descripción: Invita a un nuevo miembro al workspace
- Inputs: `email` (string, req), `role` (enum, req), `department` (string, opt)
- Outputs: `invitation_id` (uuid)
- Permisos: `admin+` | Feature: `team_management`
- Eventos: `CONFIG.MEMBER.INVITED`
- Tools: `CreateInvitation`, `SendEmail`
- Estado: Definida (ya implementada via RPC `invite_team_member`)

**CAP-015** | `config.feature.toggle`
- Descripción: Activa o desactiva una feature para el workspace
- Inputs: `feature_key` (string, req), `enabled` (boolean, req)
- Outputs: `feature_key` (string), `enabled` (boolean), `effective_from` (timestamptz)
- Permisos: `owner` solo | Feature: `feature_flags_admin`
- Eventos: `CONFIG.FEATURE.TOGGLED`
- Tools: `UpdateWorkspaceFeature`
- Estado: Definida

---

## Capabilities futuras (post-Sprint 3)

A definir durante el Sprint correspondiente. No diseñar antes de tener las 15 core implementadas.

---

## Notas de implementación

- Toda Capability nueva sigue el formato exacto de esta sección
- Antes de implementar una Capability, verificar que no existe ya una con el mismo dominio/entidad/acción
- El ID es secuencial y nunca se reutiliza (aunque se deprece una Capability)
- `Estado: Definida` no bloquea el desarrollo — pero `Estado: En desarrollo` sí (una Capability a la vez por dominio)
- El schema real de migration 0148 debe auditarse en Sprint 0 — este documento se actualiza si hay diferencias
