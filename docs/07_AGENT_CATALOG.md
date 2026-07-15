# AGENT CATALOG — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Catálogo completo de los 15 agentes IA del sistema
> Referencia: `docs/18_AI_GOVERNANCE.md` para reglas de seguridad de agentes

---

## FORMATO DE AGENTE

```
ID | Nombre | Departamento
Descripción: qué hace, qué no hace
Policy default: observer | assistant | semi_autonomous | autonomous
Triggers: cómo se activa
Tools Core: lista de Tools que puede invocar
Eventos que emite: lista de AI.AGENT.* específicos del agente
Memoria: qué escribe en el Knowledge Graph
Limitaciones: qué NO puede hacer
Estado: Definido | Implementado | En producción
Implementación: Sprint objetivo
```

---

## AGT-011 — ORCHESTRATOR (COORDINATOR)

**Nombre:** AI Orchestrator
**Departamento:** Global / Plataforma
**Descripción:** Coordina todos los agentes. Recibe la solicitud del usuario, decide qué agente la maneja, delega, monitorea y consolida resultados. NO responde preguntas directamente — solo coordina.
**Policy Default:** `autonomous`
**Triggers:** Toda solicitud al endpoint `/ai-proxy`
**Tools Core:** `DispatchAgent`, `EscalateToHuman`, `MonitorExecution`
**Eventos:** `AI.AGENT.TRIGGERED`, `AI.AGENT.COMPLETED`, `AI.AGENT.DEAD_LETTER`
**Memoria:** Patrones de uso por empresa (qué tipo de solicitudes son más frecuentes)
**Limitaciones:** NO puede leer datos de negocio directamente. Solo distribuye tareas a otros agentes.
**Estado:** ✅ Implementado — `supabase/functions/ai-proxy/index.ts` + `supabase/functions/_shared/orchestrator.ts`
**Sprint:** Completado (Fase 7 = expandir lifecycle + Content Policy)

---

## AGT-001 — COMERCIAL IA

**Nombre:** Agente Comercial
**Departamento:** CRM / Ventas
**Descripción:** Gestiona el ciclo comercial: prospección, seguimiento de oportunidades, cotizaciones, recordatorios de seguimiento. Aprende las preferencias de negociación de la empresa.
**Policy Default:** `semi_autonomous` (puede leer y crear, pero no enviar comunicaciones externas sin aprobación)
**Triggers:** 
- Usuario solicita análisis de pipeline
- Evento `CRM.LEAD.CREATED`
- Evento `CRM.QUOTE.EXPIRED`
- Schedule diario (resumen comercial)
**Tools Core:** `ListClients`, `GetClient`, `UpdateClient`, `ListTasks`, `CreateTask`, `SendEmail` (requiere aprobación)
**Eventos:** `AI.AGENT.TRIGGERED`, `AI.AGENT.COMPLETED`, `AI.AGENT.AWAITING_APPROVAL` (para SendEmail)
**Memoria:**
- Preferencias de contacto de cada cliente
- Historial de negociación
- Mejores horarios de contacto por cliente
- Palabras clave de objeción frecuentes
**Limitaciones:** NO puede eliminar clientes. NO puede cambiar precios. NO puede enviar emails sin aprobación.
**Estado:** Definido (Sprint 9)
**Sprint:** Sprint 9 (modo observer) → Sprint 10 (escalar a assistant)

---

## AGT-002 — FINANZAS IA

**Nombre:** Agente de Finanzas
**Departamento:** Finanzas
**Descripción:** Monitorea facturas vencidas, genera recordatorios de cobranza, analiza flujo de caja, detecta anomalías en pagos, genera reportes financieros resumidos.
**Policy Default:** `assistant` (siempre requiere aprobación para acciones financieras)
**Triggers:**
- Evento `FINANCE.INVOICE.OVERDUE`
- Evento `FINANCE.INVOICE.CREATED`
- Schedule semanal (reporte de flujo de caja)
- Usuario solicita análisis financiero
**Tools Core:** `ListInvoices`, `RunQuery`, `GenerateReport`, `SendEmail` (requiere aprobación), `CreateInvoice` (requiere aprobación)
**Eventos:** `AI.AGENT.TRIGGERED`, `AI.AGENT.AWAITING_APPROVAL` (para todas las escrituras)
**Memoria:**
- Patrones de pago de cada cliente (paga puntual, siempre tarda X días, etc.)
- Ciclos de flujo de caja de la empresa
- Categorías de gastos recurrentes
**Limitaciones:** NO puede crear facturas sin aprobación. NO puede eliminar registros financieros. NO puede acceder a datos bancarios directamente.
**Estado:** Definido (Sprint 9)

---

## AGT-003 — RRHH IA

**Nombre:** Agente de Recursos Humanos
**Departamento:** RRHH
**Descripción:** Asiste en onboarding, evaluaciones, gestión de ausencias, recordatorios de HR, análisis de clima laboral.
**Policy Default:** `assistant`
**Triggers:**
- Evento `HR.EMPLOYEE.CREATED`
- Evento `HR.LEAVE.REQUESTED`
- Schedule mensual (recordatorios de evaluaciones pendientes)
**Tools Core:** `ListClients` (no aplica), `RunQuery` (datos HR), `CreateTask`, `SendEmail` (con aprobación)
**Memoria:** Patrones de ausencia, tendencias de evaluación, cumpleaños y fechas importantes de empleados
**Limitaciones:** NO puede ver sueldos (ABAC en Fase 6). NO puede despedir empleados. NO puede modificar datos bancarios.
**Estado:** Definido (Sprint 10)

---

## AGT-004 — OPERACIONES IA

**Nombre:** Agente de Operaciones
**Departamento:** Operaciones
**Descripción:** Gestiona tareas, detecta bloqueos en proyectos, reasigna recursos, analiza carga de trabajo del equipo.
**Policy Default:** `semi_autonomous`
**Triggers:**
- Evento `OPS.TASK.OVERDUE`
- Evento `OPS.PROJECT.STATUS_CHANGED`
- Usuario solicita resumen de operaciones
- Schedule diario (resumen de bloqueos)
**Tools Core:** `ListTasks`, `CreateTask`, `UpdateTask`, `RunQuery`
**Memoria:** Velocidad típica del equipo, asignaciones históricas, cuellos de botella recurrentes
**Limitaciones:** NO puede asignar recursos a proyectos sin aprobación del manager.
**Estado:** Definido (Sprint 10)

---

## AGT-005 — MARKETING IA

**Nombre:** Agente de Marketing
**Departamento:** Marketing
**Descripción:** Analiza métricas de campaña, sugiere segmentaciones, programa contenido, analiza ROI de canales.
**Policy Default:** `semi_autonomous`
**Triggers:** Usuario solicita análisis de campaña, Schedule semanal
**Tools Core:** `RunQuery`, `CreateTask`, `SendEmail` (con aprobación)
**Memoria:** Métricas históricas por canal, audiencias que convierten mejor, estacionalidad
**Estado:** Definido (Fase 8+)

---

## AGT-006 — SOPORTE IA

**Nombre:** Agente de Customer Success
**Departamento:** Customer Success
**Descripción:** Clasifica tickets, sugiere respuestas, identifica clientes en riesgo de churn, escala casos críticos.
**Policy Default:** `assistant`
**Triggers:** Evento `SYSTEM.TICKET.CREATED` (nuevo ticket), Schedule diario (tickets sin responder)
**Tools Core:** `ListClients`, `GetClient`, `RunQuery`, `SendEmail` (con aprobación), `EscalateToHuman`
**Memoria:** Problemas frecuentes por tipo de cliente, resoluciones exitosas, tiempo de resolución típico
**Limitaciones:** NO puede cerrar tickets sin que el cliente confirme resolución.
**Estado:** Definido (Fase 9)

---

## AGT-007 — LEGAL IA

**Nombre:** Agente Legal
**Departamento:** Legal / Compliance
**Descripción:** Revisa contratos, detecta riesgos legales, resume documentos legales, verifica compliance.
**Policy Default:** `observer` (nunca actúa — solo reporta)
**Triggers:** Usuario carga un documento para revisión
**Tools Core:** `RunQuery`, `GenerateReport`
**Memoria:** Cláusulas de riesgo identificadas históricamente, tipos de contratos que la empresa usa
**Limitaciones:** NO puede firmar ni aprobar contratos. Solo observa y reporta. Siempre recomienda revisión de abogado.
**Estado:** Definido (Fase 9)

---

## AGT-008 — PROYECTOS IA

**Nombre:** Agente de Proyectos
**Departamento:** Proyectos
**Descripción:** Monitorea progreso de proyectos, detecta riesgos de cronograma, genera reportes de avance, sugiere redistribución de recursos.
**Policy Default:** `assistant`
**Triggers:** Evento `OPS.PROJECT.STATUS_CHANGED`, Schedule semanal
**Tools Core:** `ListTasks`, `RunQuery`, `GenerateReport`, `UpdateTask` (con aprobación)
**Memoria:** Velocidad de entrega histórica por tipo de proyecto, recursos más eficientes por tipo de tarea
**Estado:** Definido (Fase 9)

---

## AGT-009 — BI IA

**Nombre:** Agente de Business Intelligence
**Departamento:** Business Intelligence / Analytics
**Descripción:** Genera reportes ejecutivos, detecta anomalías en métricas, responde preguntas de negocio con datos.
**Policy Default:** `observer`
**Triggers:** Usuario solicita análisis, Schedule mensual (reporte ejecutivo)
**Tools Core:** `RunQuery`, `GenerateReport`, `ExportData`
**Memoria:** KPIs históricos de la empresa, estacionalidad, benchmarks por industria
**Limitaciones:** Solo lee datos. No puede modificar ningún registro.
**Estado:** Definido (Fase 9)

---

## AGT-010 — COMPLIANCE IA

**Nombre:** Agente de Compliance
**Departamento:** Cumplimiento Regulatorio
**Descripción:** Audita el cumplimiento interno, revisa el audit_log para detectar acciones inusuales, genera reportes de compliance.
**Policy Default:** `observer`
**Triggers:** Schedule semanal, Evento `SYSTEM.AUDIT.ANOMALY_DETECTED`
**Tools Core:** `RunQuery`, `GenerateReport`
**Memoria:** Patrones de comportamiento normal vs. anómalo
**Estado:** Definido (Fase 9)

---

## AGT-012 — ASISTENTE PERSONAL IA

**Nombre:** Asistente Personal
**Departamento:** Global (usuario-centric)
**Descripción:** Asistente personal del usuario. Resume el día, agenda tareas, da contexto sobre reuniones, busca información dentro de Shelwi.
**Policy Default:** `assistant`
**Triggers:** Usuario inicia conversación, Schedule matutino (resumen del día)
**Tools Core:** `ListTasks`, `ListClients`, `RunQuery`, `CreateTask`
**Memoria:** Preferencias del usuario, agenda típica, contexto de proyectos actuales
**Estado:** Definido (Fase 8)

---

## AGT-013 — AUDITOR IA

**Nombre:** Agente Auditor
**Departamento:** Auditoría / Seguridad
**Descripción:** Monitorea el audit_log, detecta patrones inusuales (accesos fuera de horario, volumen anómalo de operaciones, accesos a datos sensibles).
**Policy Default:** `observer`
**Triggers:** Schedule diario, Umbral de anomalía detectado
**Tools Core:** `RunQuery`
**Memoria:** Patrones de comportamiento normal por usuario y empresa
**Estado:** Definido (Fase 9)

---

## AGT-014 — COMPRAS IA

**Nombre:** Agente de Compras
**Departamento:** Compras / Proveedores
**Descripción:** Gestiona solicitudes de compra, monitorea inventario, sugiere órdenes de compra, evalúa proveedores.
**Policy Default:** `assistant`
**Triggers:** Nivel de inventario bajo, Evento `OPS.ORDER.CREATED`
**Tools Core:** `RunQuery`, `CreateTask`, `SendEmail` (con aprobación)
**Estado:** Definido (Fase 9)

---

## AGT-015 — INVENTARIO IA

**Nombre:** Agente de Inventario
**Departamento:** Inventario / Almacén
**Descripción:** Monitorea niveles de stock, detecta quiebres, sugiere reposición, optimiza rotación.
**Policy Default:** `semi_autonomous`
**Triggers:** Stock < umbral configurado, Schedule diario
**Tools Core:** `RunQuery`, `CreateTask`
**Memoria:** Velocidad de rotación por producto, estacionalidad de demanda, proveedores preferidos por producto
**Estado:** Definido (Fase 9)

---

## RESUMEN DE ESTADO

| ID | Nombre | Policy Default | Estado | Sprint |
|---|---|---|---|---|
| AGT-011 | Orchestrator | autonomous | ✅ Implementado | Expandir Fase 7 |
| AGT-001 | Comercial IA | semi_autonomous | Definido | Sprint 9 |
| AGT-002 | Finanzas IA | assistant | Definido | Sprint 9 |
| AGT-003 | RRHH IA | assistant | Definido | Sprint 10 |
| AGT-004 | Operaciones IA | semi_autonomous | Definido | Sprint 10 |
| AGT-005 | Marketing IA | semi_autonomous | Definido | Fase 8+ |
| AGT-006 | Soporte IA | assistant | Definido | Fase 9 |
| AGT-007 | Legal IA | observer | Definido | Fase 9 |
| AGT-008 | Proyectos IA | assistant | Definido | Fase 9 |
| AGT-009 | BI IA | observer | Definido | Fase 9 |
| AGT-010 | Compliance IA | observer | Definido | Fase 9 |
| AGT-012 | Asistente Personal | assistant | Definido | Fase 8 |
| AGT-013 | Auditor IA | observer | Definido | Fase 9 |
| AGT-014 | Compras IA | assistant | Definido | Fase 9 |
| AGT-015 | Inventario IA | semi_autonomous | Definido | Fase 9 |

---

## REGLAS PARA NUEVOS AGENTES

1. Todo agente nuevo se inicia como `observer` por al menos 1 sprint antes de escalar
2. Toda escala de policy (`observer → assistant → semi_autonomous → autonomous`) requiere aprobación de AI Architect
3. Ningún agente tiene policy `autonomous` para acciones financieras sin aprobación del Security Architect
4. El ciclo de vida del agente sigue el diagrama en `18_AI_GOVERNANCE.md` sección 3.1
5. El proceso de incorporación de nuevo agente está en `18_AI_GOVERNANCE.md` sección 8
6. Toda escala de policy requiere haber pasado los tests de seguridad (prompt injection, data leakage)

---

*Ver: `docs/18_AI_GOVERNANCE.md` para reglas de seguridad, ciclo de vida, y proceso de incorporación*
*Ver: `docs/44_AGENT_DEVELOPMENT_GUIDE.md` para cómo implementar un nuevo agente*
