# EVENT NAMING STANDARDS — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Convenciones para el Event Bus de Shelwi
> Ver catálogo completo: `docs/05_EVENT_CATALOG.md`

---

## 1. FORMATO DE NAMING

```
DOMAIN.ENTITY.ACTION

DOMAIN:  CRM | FINANCE | OPS | HR | CONFIG | AI | SYSTEM
ENTITY:  LEAD | QUOTE | CLIENT | INVOICE | TASK | EMPLOYEE | ...
ACTION:  CREATED | UPDATED | DELETED | STATUS_CHANGED | SENT | PAID | ...

Ejemplos:
  CRM.LEAD.CREATED
  CRM.QUOTE.SENT
  FINANCE.INVOICE.PAID
  OPS.TASK.COMPLETED
  HR.EMPLOYEE.CREATED
  CONFIG.MEMBER.JOINED
  AI.AGENT.AWAITING_APPROVAL
  SYSTEM.SUBSCRIPTION.UPGRADED
```

---

## 2. REGLAS DE NAMING

### 2.1 DOMAIN — cuándo usar cada uno

| DOMAIN | Cuándo usar |
|---|---|
| `CRM` | Leads, clientes, cotizaciones, órdenes |
| `FINANCE` | Facturas, pagos, cobros |
| `OPS` | Tareas, proyectos, evidencias, GPS, pedidos |
| `HR` | Empleados, ausencias, evaluaciones |
| `CONFIG` | Workspace, miembros, integraciones, plan |
| `AI` | Agentes, ejecuciones, aprobaciones |
| `SYSTEM` | Suscripción, seguridad, sistema |

### 2.2 ACTION — verbos estándar

| Verbo | Cuándo usar |
|---|---|
| `CREATED` | Entidad creada por primera vez |
| `UPDATED` | Cambio genérico en la entidad |
| `DELETED` | Eliminación (soft o hard) |
| `STATUS_CHANGED` | Solo cambio de estado (status) |
| `SENT` | Enviado al cliente (cotización, factura, email) |
| `ACCEPTED` | Aceptado por el cliente |
| `REJECTED` | Rechazado por el cliente |
| `PAID` | Pago completado |
| `OVERDUE` | Vencido (sin pago/respuesta a tiempo) |
| `ASSIGNED` | Asignado a un usuario |
| `COMPLETED` | Completado/terminado |
| `CONNECTED` | Integración conectada |
| `DISCONNECTED` | Integración desconectada |
| `TRIGGERED` | Agente o automatización disparado |
| `AWAITING_APPROVAL` | Esperando aprobación humana |
| `APPROVED` | Aprobado |
| `EXECUTED` | Ejecutado (acción de agente) |

---

## 3. ESTRUCTURA DEL EVENTO

```typescript
interface DomainEvent<T = Record<string, unknown>> {
  id:           string;      // UUID único del evento
  type:         string;      // e.g., "CRM.QUOTE.SENT"
  domain:       string;      // "CRM"
  entity:       string;      // "QUOTE"
  action:       string;      // "SENT"
  company_id:   string;      // UUID del workspace
  user_id:      string | null;  // Actor (null para acciones de sistema/agente)
  agent_id:     string | null;  // e.g., "AGT-002" (null para acciones humanas)
  entity_id:    string;      // UUID de la entidad afectada
  payload:      T;           // Datos específicos del evento
  occurred_at:  string;      // ISO 8601
  correlation_id: string | null;  // Para trazar flujos multi-evento
}
```

---

## 4. EVENTOS INMUTABLES

Los eventos son **inmutables** una vez emitidos:
- No se modifican
- No se eliminan (solo se archivan)
- El `audit_log` es la representación persistida del event bus

```typescript
// ✅ Emitir evento + registrar en audit_log
await supabase.from('audit_log').insert({
  company_id: workspaceId,
  user_id: userId,
  action: 'CLIENT_CREATED',       // Equivalente al event type
  entity_type: 'client',
  entity_id: newClient.id,
  diff: { before: null, after: newClient },
});
```

---

## 5. CREAR UN NUEVO EVENTO

### Checklist para agregar un nuevo tipo de evento:

1. Definir el nombre siguiendo `DOMAIN.ENTITY.ACTION`
2. Verificar que no existe un evento similar (ver `docs/05_EVENT_CATALOG.md`)
3. Si es nuevo: agregar al catálogo en `docs/05_EVENT_CATALOG.md`
4. Definir el payload TypeScript
5. Implementar la emisión en el código (supabase.from('audit_log').insert)
6. Si el Automation Engine debe reaccionar: agregar a los triggers disponibles en `docs/15_AUTOMATION_LIBRARY.md`
7. Si un agente debe reaccionar: actualizar `docs/07_AGENT_CATALOG.md`

---

## 6. EJEMPLOS — PAYLOAD ESTÁNDAR POR ACCIÓN

```typescript
// CRM.QUOTE.SENT
{
  quote_id: "uuid",
  quote_number: "QT-0042",
  client_id: "uuid",
  client_name: "Ana García",
  grand_total: 1500000,
  currency: "COP",
  sent_via: "email" | "whatsapp",
  valid_until: "2025-12-31"
}

// FINANCE.INVOICE.PAID
{
  invoice_id: "uuid",
  invoice_number: "FV-0015",
  amount_paid: 1500000,
  payment_method: "transfer",
  paid_by: "client" | "manual_register",
  reference: "REF-12345"
}

// OPS.TASK.COMPLETED
{
  task_id: "uuid",
  title: "Instalación en cliente X",
  completed_by: "user-uuid",
  completed_at: "2025-12-15T14:30:00Z",
  had_evidences: true,
  project_id: "uuid" | null
}

// AI.AGENT.AWAITING_APPROVAL
{
  execution_id: "uuid",
  agent_id: "AGT-002",
  action_type: "WRITE-HIGH",
  action_description: "Crear factura FV-0016 por $1.500.000 COP para cliente Ana García",
  requires_approval_from: "owner" | "admin",
  context: { quote_id: "uuid", client_id: "uuid" }
}
```

---

*Ver: `docs/05_EVENT_CATALOG.md` para el catálogo completo de eventos*
*Ver: `docs/15_AUTOMATION_LIBRARY.md` para triggers que reaccionan a eventos*
*Ver: `docs/07_AGENT_CATALOG.md` para agentes que escuchan eventos*
