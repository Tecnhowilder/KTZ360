# WORKFLOW LIBRARY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Biblioteca de flujos de automatización pre-construidos disponibles para empresas
> Implementación: `supabase/migrations/0068_automations_schema.sql`

---

## 1. QUÉ ES UN WORKFLOW EN SHELWI

Un Workflow es una secuencia de acciones que se ejecuta automáticamente cuando ocurre un evento o se cumple una condición. Los workflows son:
- **Configurables por empresa** — cada empresa puede activar/desactivar y personalizar
- **No-code** — no requieren programación para configurarse
- **Auditados** — cada ejecución queda registrada
- **Reversibles** — acciones críticas requieren aprobación

---

## 2. ESTRUCTURA DE UN WORKFLOW

```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  department: string;
  trigger: {
    type: 'event' | 'schedule' | 'webhook' | 'manual';
    event?: string;           // e.g., 'CRM.LEAD.CREATED'
    schedule?: string;        // cron: '0 9 * * MON' (cada lunes a las 9am)
  };
  conditions?: WorkflowCondition[];  // Filtros opcionales
  actions: WorkflowAction[];
  is_active: boolean;
  requires_approval: boolean;
}
```

---

## 3. WORKFLOWS POR DEPARTAMENTO

### 3.1 CRM / Ventas

**WF-CRM-001: Bienvenida a Nuevo Lead**
```
Trigger: CRM.LEAD.CREATED
Condiciones: source = 'web_form' OR source = 'whatsapp'
Acciones:
  1. Crear tarea "Contactar lead" → asignar a comercial de turno
  2. Esperar 0 minutos
  3. Enviar email de bienvenida al lead (template: 'lead_welcome')
  4. Notificar push al comercial asignado
Requiere aprobación: No
```

**WF-CRM-002: Seguimiento de Cotización Sin Respuesta**
```
Trigger: Schedule → diario 8:00am
Condiciones: cotizaciones con status='sent' AND created_at < NOW() - INTERVAL '3 days'
Acciones:
  1. Crear tarea "Hacer seguimiento cotización" para cada cotización
  2. Notificar push al comercial responsable
  3. Si cotización > 7 días sin respuesta: enviar email de seguimiento (requiere aprobación)
```

**WF-CRM-003: Alerta Cotización Por Vencer**
```
Trigger: Schedule → diario 9:00am
Condiciones: cotizaciones con status='sent' AND valid_until = TODAY + 1 día
Acciones:
  1. Notificar push al comercial responsable
  2. Crear tarea urgente "Cotización vence mañana"
  3. Enviar email de recordatorio al cliente (requiere aprobación)
```

**WF-CRM-004: Cliente Sin Actividad**
```
Trigger: Schedule → semanal, lunes 8:00am
Condiciones: clientes activos sin quote/order en últimos 60 días
Acciones:
  1. Crear tarea "Reactivar cliente" para el comercial asignado
  2. Incluir resumen del historial del cliente en la descripción
```

---

### 3.2 Finanzas

**WF-FIN-001: Recordatorio de Vencimiento de Factura**
```
Trigger: Schedule → diario 7:00am
Condiciones: facturas con due_date = TODAY + 3 días AND status = 'sent'
Acciones:
  1. Enviar email al cliente (template: 'invoice_reminder_3d')
  2. Notificar push al responsable de cobranza
```

**WF-FIN-002: Alerta Factura Vencida**
```
Trigger: FINANCE.INVOICE.OVERDUE (o Schedule diario)
Condiciones: status = 'overdue'
Acciones:
  1. Crear tarea "Gestionar cobranza" con prioridad alta
  2. Asignar al responsable de cobranza
  3. Enviar email al cliente (template: 'invoice_overdue')
  4. Si días_vencido > 14: enviar email tono firme (requiere aprobación)
  5. Si días_vencido > 30: notificar al dueño/admin
```

**WF-FIN-003: Confirmación de Pago Recibido**
```
Trigger: FINANCE.INVOICE.PAID
Acciones:
  1. Actualizar estado de factura a 'paid'
  2. Enviar email de confirmación al cliente (template: 'payment_received')
  3. Notificar push al equipo de finanzas
  4. Si hay integración con Alegra: sincronizar pago
```

---

### 3.3 Operaciones

**WF-OPS-001: Nueva Tarea Asignada**
```
Trigger: OPS.TASK.ASSIGNED
Acciones:
  1. Notificar push al assignee: "Nueva tarea: {task_title}"
  2. Enviar email si la tarea tiene due_date < 24h (urgente)
```

**WF-OPS-002: Tarea Vencida**
```
Trigger: Schedule → diario 8:00am
Condiciones: tareas con due_date < TODAY AND status != 'completed'
Acciones:
  1. Cambiar prioridad a 'urgent'
  2. Notificar push al assignee
  3. Notificar push al manager (si days_overdue > 1)
```

**WF-OPS-003: Evidencias de Campo Subidas**
```
Trigger: OPS.EVIDENCE.UPLOADED
Acciones:
  1. Notificar push al manager de la tarea
  2. Si hay portal cliente activo: actualizar vista del cliente
  3. Crear miniatura si es imagen (via storage)
```

**WF-OPS-004: Pedido Confirmado → Crear Tareas de Producción**
```
Trigger: OPS.ORDER.STATUS_CHANGED (to: 'confirmed')
Acciones:
  1. Crear tarea "Preparar pedido #{order_number}" (configurable)
  2. Asignar al responsable de producción/almacén
  3. Notificar push al cliente por portal (si activo)
```

---

### 3.4 RRHH

**WF-HR-001: Onboarding Automático**
```
Trigger: HR.EMPLOYEE.CREATED
Acciones:
  1. Crear checklist de onboarding (tareas predefinidas)
  2. Asignar al manager del empleado
  3. Enviar email de bienvenida al empleado (template: 'employee_welcome')
  4. Crear recordatorio en 30 días: "Evaluación de onboarding"
```

**WF-HR-002: Solicitud de Ausencia**
```
Trigger: HR.LEAVE.REQUESTED
Acciones:
  1. Notificar push al manager
  2. Crear tarea "Revisar solicitud de ausencia de {employee_name}"
  3. Si urgente (leave_type = 'emergency'): notificar SMS/push inmediato
```

**WF-HR-003: Recordatorio de Evaluaciones**
```
Trigger: Schedule → mensual, día 1 de cada mes
Condiciones: empleados con última evaluación > 90 días
Acciones:
  1. Crear tareas de evaluación para cada manager
  2. Notificar push a los managers
```

---

### 3.5 Customer Success

**WF-CX-001: Clasificación Automática de Ticket**
```
Trigger: Ticket recibido (via portal, WhatsApp, email)
Acciones:
  1. Invocar AGT-006 en modo classification
  2. Asignar prioridad (urgente/alta/normal/baja)
  3. Asignar al agente de soporte con menos carga
  4. Enviar confirmación de recepción al cliente
  5. Crear SLA timer según prioridad
```

**WF-CX-002: SLA Breach Alert**
```
Trigger: Schedule → cada 30 minutos
Condiciones: tickets abiertos con SLA vencido
Acciones:
  1. Escalar al supervisor de soporte
  2. Notificar push con urgencia alta
  3. Cambiar prioridad a 'urgente'
```

**WF-CX-003: Encuesta Post-Resolución**
```
Trigger: OPS.TICKET.RESOLVED (o similar)
Condiciones: 24 horas después de cerrar el ticket
Acciones:
  1. Enviar email con encuesta de satisfacción (NPS tipo)
  2. Crear tarea si rating < 7: "Seguimiento insatisfacción"
```

---

### 3.6 Sistema / Integración

**WF-SYS-001: Alerta de Integración Rota**
```
Trigger: CONFIG.INTEGRATION.ERROR
Acciones:
  1. Notificar push al admin del workspace
  2. Crear tarea "Revisar integración {provider}"
  3. Suspender envíos automáticos de esa integración
```

**WF-SYS-002: Renovación de Suscripción Próxima**
```
Trigger: Schedule → diario
Condiciones: subscripción con current_period_end = TODAY + 7 días
Acciones:
  1. Email de aviso de renovación (template: 'renewal_reminder')
  2. Si pago fallará (no hay método guardado): alerta urgente
```

---

## 4. CONFIGURACIÓN DE WORKFLOWS

Las empresas pueden:
- **Activar/desactivar** cualquier workflow pre-construido
- **Personalizar** los templates de mensajes
- **Ajustar** los tiempos (días de espera, horarios de schedule)
- **Crear** workflows personalizados con el builder visual
- **Configurar aprobaciones** — quién aprueba acciones que requieren revisión

---

## 5. REGLAS DE WORKFLOWS

1. Todo workflow está vinculado a `company_id` — los workflows de empresa A no afectan empresa B
2. Las acciones de envío externo (email, WhatsApp, SMS) siempre tienen opción de aprobación
3. Toda ejecución de workflow se registra en `automation_executions` con resultado
4. Un workflow fallido no bloquea los otros — cada uno es independiente
5. Los workflows se deshabilitan automáticamente si fallan > 10 veces consecutivas (alerta al admin)
6. Máximo 100 workflows activos por empresa (límite configurable por plan)

---

*Ver: `supabase/migrations/0068_automations_schema.sql` para schema del Automation Engine*
*Ver: `supabase/functions/automation-scheduler/index.ts` para implementación del scheduler*
*Ver: `docs/15_AUTOMATION_LIBRARY.md` para acciones disponibles en workflows*
