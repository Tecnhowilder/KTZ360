# TOOL CATALOG — SHELWI OS
> Versión: 0.1 (stub — implementación en Sprint 5) | Fecha: 2026-07-14
> Regla: Todo agente IA usa EXCLUSIVAMENTE Tools de este catálogo. Sin excepciones.

---

## Formato de Tool

```
TOOL-XXX | ToolName
Descripción: qué hace
Agentes que pueden usarlo: AGT-XXX, AGT-XXX
Parámetros: campo (tipo, requerido, validaciones)
Output: campo (tipo)
Requiere aprobación humana: sí/no (si sí, Policy=assistant mínimo)
Rate limit: N calls / empresa / hora
Audit: campo que registra en ai_usage
Estado: Definido | Implementado
```

---

## Tools READ (solo lectura — safe para modo observer)

**TOOL-001** | `ListClients`
- Descripción: Lista clientes del workspace activo con filtros opcionales
- Agentes: AGT-001, AGT-006, AGT-009
- Parámetros: `search` (string, opt), `status` (enum, opt), `limit` (int, opt, max:100)
- Output: `clients` (array), `total` (int)
- Requiere aprobación: No
- Rate limit: 200/empresa/hora
- Estado: Definido

**TOOL-002** | `GetClient`
- Descripción: Obtiene el detalle completo de un cliente
- Agentes: AGT-001, AGT-006
- Parámetros: `client_id` (uuid, req)
- Output: `client` (object)
- Requiere aprobación: No
- Rate limit: 500/empresa/hora
- Estado: Definido

**TOOL-003** | `ListInvoices`
- Descripción: Lista facturas del workspace con filtros
- Agentes: AGT-002, AGT-009
- Parámetros: `status` (enum, opt), `date_from` (date, opt), `date_to` (date, opt), `client_id` (uuid, opt)
- Output: `invoices` (array), `total` (int), `summary` (object)
- Requiere aprobación: No
- Rate limit: 100/empresa/hora
- Estado: Definido

**TOOL-004** | `ListTasks`
- Descripción: Lista tareas del workspace con filtros
- Agentes: AGT-004, AGT-008
- Parámetros: `assignee_id` (uuid, opt), `status` (enum, opt), `project_id` (uuid, opt)
- Output: `tasks` (array), `total` (int)
- Requiere aprobación: No
- Rate limit: 200/empresa/hora
- Estado: Definido

**TOOL-005** | `RunQuery`
- Descripción: Ejecuta una query BI pre-aprobada del catálogo (no SQL libre)
- Agentes: AGT-009, AGT-013
- Parámetros: `query_id` (string, req — debe existir en catalog), `params` (object, opt)
- Output: `data` (array), `columns` (string[]), `execution_time_ms` (int)
- Requiere aprobación: No
- Rate limit: 30/empresa/hora
- Nota: NUNCA acepta SQL libre — solo IDs de queries pre-aprobadas
- Estado: Definido

---

## Tools WRITE — Bajo (reversibles, sin impacto externo)

**TOOL-006** | `CreateTask`
- Descripción: Crea una tarea
- Agentes: AGT-004, AGT-008
- Parámetros: `title` (string, req, max:200), `assignee_id` (uuid, opt), `due_date` (date, opt), `priority` (enum: low|medium|high, opt), `project_id` (uuid, opt)
- Output: `task_id` (uuid)
- Requiere aprobación: No (semi_autonomous puede ejecutar)
- Rate limit: 50/empresa/hora
- Estado: Definido

**TOOL-007** | `UpdateTask`
- Descripción: Actualiza estado o datos de una tarea existente
- Agentes: AGT-004, AGT-008
- Parámetros: `task_id` (uuid, req), `status` (enum, opt), `assignee_id` (uuid, opt), `notes` (string, opt)
- Output: `task_id` (uuid), `updated_fields` (string[])
- Requiere aprobación: No
- Rate limit: 100/empresa/hora
- Estado: Definido

**TOOL-008** | `UpdateClient`
- Descripción: Actualiza datos de un cliente (sin eliminar)
- Agentes: AGT-001
- Parámetros: `client_id` (uuid, req), `fields` (object con solo campos permitidos: name, phone, email, notes, status)
- Output: `client_id` (uuid), `updated_fields` (string[])
- Requiere aprobación: No
- Rate limit: 50/empresa/hora
- Nota: Solo campos de la whitelist — nunca acepta `company_id` como campo actualizable
- Estado: Definido

---

## Tools WRITE — Alto (impacto externo o irreversible)

**TOOL-009** | `SendEmail`
- Descripción: Envía un email desde el workspace a un destinatario
- Agentes: AGT-001, AGT-002, AGT-006
- Parámetros: `to` (string, req — email válido), `template_id` (string, req), `variables` (object, opt)
- Output: `email_id` (uuid), `status` (enum)
- Requiere aprobación: **SÍ** — Policy mínima: `assistant`
- Rate limit: 20/empresa/hora
- Nota: Usa el sistema de templates existente — nunca texto libre de email
- Estado: Definido

**TOOL-010** | `CreateInvoice`
- Descripción: Crea una factura (acción financiera)
- Agentes: AGT-002
- Parámetros: `client_id` (uuid, req), `items` (array, req), `due_date` (date, opt), `currency` (enum, opt)
- Output: `invoice_id` (uuid), `invoice_number` (string), `total` (decimal)
- Requiere aprobación: **SÍ** — Policy mínima: `assistant`
- Rate limit: 10/empresa/hora
- Estado: Definido

---

## Tools SISTEMA (solo para Orchestrator)

**TOOL-SYS-01** | `DispatchAgent`
- Descripción: El Orchestrator delega una subtarea a otro agente
- Agentes: AGT-011 (Orchestrator) únicamente
- Parámetros: `target_agent_id` (string, req), `task` (object, req), `policy_override` (enum, opt)
- Requiere aprobación: No (el Orchestrator ya tiene aprobación)
- Estado: Definido

**TOOL-SYS-02** | `EscalateToHuman`
- Descripción: Pausa la ejecución del agente y notifica al usuario para aprobación
- Agentes: Todos
- Parámetros: `reason` (string, req), `pending_action` (object, req), `urgency` (enum, opt)
- Requiere aprobación: No aplica — esto ES la solicitud de aprobación
- Estado: Definido

---

## Proceso para añadir un Tool nuevo

1. Definir en este catálogo con todos los campos del formato
2. Clasificar: READ / WRITE-Bajo / WRITE-Alto / SISTEMA
3. Definir si requiere aprobación humana
4. Implementar en Tool Registry (Sprint 5+)
5. Registrar en migration de BD con schema de parámetros
6. Añadir tests: parámetros inválidos, company_id incorrecto, rate limit
7. Actualizar estado a `Implementado`

## Reglas de seguridad de Tools

- `company_id` NUNCA es un parámetro del Tool — lo inyecta el Tool Registry desde el contexto del Orchestrator
- Todo Tool valida la whitelist de agentes que puede invocarlo
- Todo Tool registra su invocación en `ai_usage` antes de ejecutar
- Si el Tool falla, registra el error en `ai_usage` — nunca silencia errores
- Tools de tipo WRITE-Alto requieren que la sesión del agente esté en Policy `assistant` o superior con aprobación pendiente
