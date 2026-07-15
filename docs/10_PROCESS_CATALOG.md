# PROCESS CATALOG — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Procesos de negocio que Shelwi soporta y automatiza

---

## 1. QUÉ ES UN PROCESO EN SHELWI

Un proceso es una secuencia de Capabilities que transforma un estado inicial en un resultado de negocio.
Los procesos pueden ser manuales (el usuario ejecuta cada paso), semi-automáticos (Shelwi ayuda) o completamente automatizados (el Automation Engine + Agentes ejecutan).

---

## 2. PROCESOS POR DEPARTAMENTO

### 2.1 CRM / Ventas

**P-CRM-001: Ciclo de Venta Completo**
```
Estado inicial: Lead recibido
Estado final: Factura pagada

Pasos:
1. Lead capturado (web, WhatsApp, referido, directo)
2. Lead calificado (¿tiene budget? ¿tiene necesidad? ¿hay urgencia?)
3. Reunión/demostración agendada
4. Cotización enviada
5. Negociación (revisiones de cotización)
6. Cotización aceptada → Convertir a Orden
7. Orden confirmada → Generar Factura
8. Factura cobrada

Capabilities involucradas: CAP-001, CAP-003, CAP-004
Agente responsable: AGT-001
Automatizaciones posibles: recordatorio si Lead sin respuesta en 2 días, alerta si Cotización vence en 24h
```

**P-CRM-002: Seguimiento Post-Venta**
```
Estado inicial: Factura pagada
Estado final: Cliente fidelizado / próxima oportunidad

Pasos:
1. Encuesta de satisfacción enviada (auto, 3 días post-entrega)
2. Revisión de satisfacción
3. Si NPS < 7: ticket de soporte abierto
4. Si NPS ≥ 9: solicitud de referido enviada
5. Seguimiento a 30 días (¿necesita algo más?)

Agente responsable: AGT-001, AGT-006
```

---

### 2.2 Finanzas

**P-FIN-001: Ciclo de Cobranza**
```
Estado inicial: Factura creada
Estado final: Factura cobrada o en gestión de mora

Pasos:
1. Factura creada y enviada al cliente
2. D-0: Recordatorio preventivo (3 días antes del vencimiento)
3. D+0: Factura vence → alerta interna
4. D+7: Primer recordatorio de pago
5. D+14: Segundo recordatorio (tono más firme)
6. D+30: Gestión de mora → asignar a responsable de cobranza
7. D+60: Escalamiento (acción legal o castigo de deuda)

Capabilities: CAP-004, CAP-005
Automatizaciones: correos automáticos en D-3, D+7, D+14
Agente: AGT-002
```

**P-FIN-002: Cierre Contable Mensual**
```
Estado inicial: Mes operativo
Estado final: Reporte financiero del mes

Pasos:
1. Verificar facturas pendientes de pago
2. Reconciliar pagos recibidos
3. Sincronizar con Alegra (si integrado)
4. Generar reporte de ingresos vs egresos
5. Exportar para contabilidad externa

Agente: AGT-002
Integración: alegra-webhook, connect-integration
```

---

### 2.3 Operaciones

**P-OPS-001: Gestión de Servicio en Campo**
```
Estado inicial: Tarea asignada a técnico de campo
Estado final: Servicio completado y documentado

Pasos:
1. Tarea asignada con ubicación y descripción
2. Técnico recibe push notification
3. Técnico hace Check-In GPS al llegar
4. Técnico ejecuta el servicio
5. Técnico sube evidencias (fotos/documentos)
6. Técnico hace Check-Out GPS
7. Tarea marcada como Completada
8. Cliente recibe notificación de completado (si integrado portal)

Capabilities: CAP-007, CAP-008
GPS Engine: `supabase/migrations/0057_gps_schema.sql`
Evidencias: `supabase/migrations/` (evidences tables)
Offline: Todo funciona sin internet, sincroniza al recuperar red
```

**P-OPS-002: Ciclo de Proyectos**
```
Estado inicial: Proyecto nuevo
Estado final: Proyecto entregado y cerrado

Pasos:
1. Proyecto creado con alcance y fechas
2. Tareas desglosadas y asignadas
3. Progreso monitoreado semanalmente
4. Bloqueos escalados al manager
5. Entregables verificados
6. Proyecto cerrado + reporte de aprendizajes

Agente: AGT-008
```

---

### 2.4 RRHH

**P-HR-001: Onboarding de Empleado**
```
Estado inicial: Oferta aceptada
Estado final: Empleado operativo en Shelwi

Pasos:
1. Empleado creado en sistema
2. Invitación enviada a Shelwi
3. Tarea de onboarding asignada (checklist)
4. Firma de contrato (docs)
5. Configuración de accesos por rol
6. Periodo de adaptación (30-90 días)
7. Primera evaluación

Capabilities: CAP-010, CAP-014
Agente: AGT-003
Automatizaciones: checklist de onboarding auto-asignado, recordatorios de documentos pendientes
```

**P-HR-002: Ciclo de Evaluación**
```
Estado inicial: Período de evaluación abierto
Estado final: Evaluaciones completadas y feedback entregado

Pasos:
1. Manager crea evaluación por empleado
2. Empleado auto-evalúa (si es 360)
3. Manager completa evaluación
4. Reunión de feedback
5. Evaluación archivada
6. Acciones de mejora definidas como tareas

Agente: AGT-003
```

---

### 2.5 Customer Success

**P-CX-001: Gestión de Ticket**
```
Estado inicial: Ticket creado
Estado final: Ticket resuelto y cliente satisfecho

Pasos:
1. Ticket recibido (portal, WhatsApp, email)
2. Clasificación automática por tipo/prioridad (AGT-006)
3. Asignación al agente de soporte
4. Primera respuesta < 4h (SLA)
5. Seguimiento hasta resolución
6. Encuesta de satisfacción post-cierre
7. Ticket cerrado

SLAs:
- Urgente: primera respuesta < 1h
- Alta: primera respuesta < 4h
- Normal: primera respuesta < 24h

Agente: AGT-006
```

---

### 2.6 Sistema / Plataforma

**P-SYS-001: Onboarding de Nueva Empresa**
```
Estado inicial: Registro completado
Estado final: Empresa operativa en Shelwi

Pasos:
1. Registro del propietario
2. Creación del workspace
3. Configuración inicial (nombre, logo, timezone, moneda)
4. Invitación del equipo
5. Importación de datos iniciales (clientes, productos)
6. Primera Capability activada
7. Primera automatización configurada
8. Primer pago recibido (si aplica)

Time to First Value objetivo: < 30 minutos hasta primer uso real
```

**P-SYS-002: Renovación de Suscripción**
```
Estado inicial: Suscripción próxima a vencer
Estado final: Suscripción renovada o cancelada

Pasos:
1. D-7: Email de recordatorio de renovación
2. D-3: Email de urgencia (si no renovó)
3. D-0: Intento de cobro automático
4. Si falla: Grace period de 3 días
5. Si sigue fallando: Plan degradado a Free
6. D+30: Cancelación y notificación final

Edge Functions: mp-webhook, create-checkout
```

---

## 3. PROCESO DE DOCUMENTAR UN NUEVO PROCESO

Cuando se identifica un nuevo proceso de negocio a soportar:

1. Documentarlo en este catálogo con la plantilla:
   ```
   ID: P-XXX-NNN
   Estado inicial: [descripción]
   Estado final: [descripción]
   Pasos: [lista numerada]
   Capabilities: [CAP-XXX, ...]
   Agente: [AGT-XXX]
   Automatizaciones posibles: [lista]
   ```

2. Definir las Capabilities necesarias en `04_CAPABILITY_CATALOG.md`
3. Definir los eventos en `05_EVENT_CATALOG.md`
4. Definir las automatizaciones en `15_AUTOMATION_LIBRARY.md`

---

*Ver: `docs/audits/AUDIT_FUNCTIONAL_FLOW.md` para flujos funcionales documentados*
*Ver: `docs/15_AUTOMATION_LIBRARY.md` para automatizaciones disponibles*
