# SHELWI OS 1.0 — Roadmap Oficial

> **Documento de consulta permanente.** Toda decisión de desarrollo debe alinearse con este roadmap.
> Última actualización: 2026-07-13

---

## Principio Rector

**Shelwi no es un ERP, un CRM ni un conjunto de módulos.**
Shelwi es un **Sistema Operativo Empresarial** compuesto por capacidades reutilizables, memoria empresarial, políticas configurables, herramientas desacopladas y agentes inteligentes.

Ninguna funcionalidad podrá implementarse si compromete la escalabilidad, la configurabilidad o la reutilización del sistema. Toda decisión de desarrollo debe permitir que la plataforma crezca durante años sin reescribir su núcleo.

---

## Principio de Identidad Visual

Shelwi YA posee una identidad visual consolidada.

- **NO** rediseñar la marca
- **NO** cambiar el lenguaje visual
- **NO** modificar la experiencia reconocible para el usuario

Se permite únicamente mejorar: organización, jerarquía visual, experiencia, accesibilidad, productividad, rendimiento y consistencia.

La experiencia debe sentirse como una evolución natural. El usuario debe pensar: *"Todo está mejor organizado."* Nunca: *"Parece otra aplicación."*

---

## Regla de Oro del Desarrollo

**Ninguna funcionalidad nueva puede desarrollarse directamente dentro de un módulo.**

Siempre debe seguir esta secuencia:

```
Necesidad
    ↓
Capability (Capacidad)
    ↓
Evento
    ↓
Automatización
    ↓
Herramienta (Tool)
    ↓
Agente IA
    ↓
Pantalla
```

Esto garantiza que cualquier función futura pueda reutilizarse por cualquier agente.

---

## Arquitectura de Pilares

```
              SHELWI OS

      Memory Engine
             │
      Policy Engine
             │
 Configuration Engine
             │
      Capability Engine
             │
        Tool Registry
             │
         Event Bus
             │
     Automation Engine
             │
        AI Orchestrator
             │
     Specialized Agents
```

---

## Principios de Diseño y Experiencia

### Design System
- Toda nueva pantalla usa **exclusivamente** el Design System oficial
- No crear nuevos estilos, botones, inputs ni cards fuera del sistema
- Si un componente no existe: se incorpora al DS, se documenta, se reutiliza después
- Nunca crear componentes aislados

### Responsive First — Una sola interfaz adaptable
No existirán versiones distintas para Web / Tablet / Mobile / Capacitor / Desktop.
Existe UNA sola experiencia que reorganiza elementos según el espacio disponible. Nunca cambia el flujo.

### Breakpoints Oficiales

| Nombre | Rango |
|---|---|
| Extra Small | 320–374 px |
| Mobile | 375–480 px |
| Large Mobile | 481–768 px |
| Tablet | 769–1024 px |
| Laptop | 1025–1440 px |
| Desktop | 1441 px+ |
| UltraWide | 1920 px+ |

### Mobile First
Toda nueva funcionalidad se diseña primero para móvil, luego escala progresivamente a Tablet → Desktop → Capacitor. Nunca al contrario.

### Experiencia Esperada
Toda pantalla debe responder:
- ¿Qué debo hacer?
- ¿Qué requiere mi atención?
- ¿Qué puede hacer Shelwi por mí?
- ¿Qué puedo automatizar?
- ¿Qué decisiones debo tomar hoy?

La plataforma trabaja por el usuario. No espera que el usuario busque información.

### Dashboards
- No mostrar datos por mostrar
- Cada widget debe responder: ¿Qué significa? ¿Por qué importa? ¿Qué acción puedo tomar?
- Si un widget no genera una acción útil, se elimina

### IA Invisible
- No abrir chats innecesarios
- Aparece solo cuando aporte valor real
- Sugiere, se anticipa, ejecuta. Nunca interrumpe

### Performance
- Toda pantalla debe abrir en menos de 2 segundos
- Lazy Loading obligatorio
- Virtualización para listas grandes
- Cache inteligente + prefetch cuando sea necesario

### Accesibilidad
- Modo claro (oficial) / Modo oscuro (preparado para futuro)
- Contraste AA
- Navegación por teclado
- Lectores de pantalla
- Áreas táctiles mínimas de 44 px

### Capacitor Ready
- Toda funcionalidad compatible con Web / PWA / Android / iPhone / Capacitor sin modificar código
- No usar APIs exclusivas del navegador
- Toda interacción usa servicios abstractos

### Adaptabilidad por Empresa
- Ninguna pantalla diseñada para una empresa específica
- Cada empresa personaliza: dashboard, widgets, acciones rápidas, módulos, accesos, agentes, KPIs — desde el CMS

### Escalabilidad Visual
- Diseñar soportando más módulos, widgets, agentes, acciones y empresas sin romper el diseño

---

## Reglas Obligatorias para Todo Desarrollo

1. Consultar siempre **MCP Memory** antes de implementar cualquier cambio
2. Actualizar **MCP Memory** cuando se tome una decisión de arquitectura o se cree una nueva Capability
3. Usar **Skills disponibles** cuando exista una especializada para la tarea
4. **No duplicar** componentes, servicios, hooks ni lógica de negocio
5. Toda nueva funcionalidad se implementa primero como **Capability reutilizable**
6. Toda Capability registra **eventos y auditoría**
7. Ningún agente accede directamente a la BD — siempre usa el **Tool Registry**
8. Toda acción de agente respeta el **Policy Engine** (Observador / Asistente / Semi Autónomo / Autónomo)
9. Toda acción queda registrada para **auditoría y trazabilidad**
10. Mantener **compatibilidad hacia atrás**
11. No crear lógica fija — **todo configurable**
12. No crear límites en código — **todo desde BD**
13. No crear nombres fijos — **todo configurable**
14. Toda integración se desacopla mediante **adaptadores**
15. Diseñar para **cientos de miles de empresas**
16. Ninguna funcionalidad depende de un proveedor específico
17. Todo acceso respeta permisos
18. Todo queda documentado

---

## Estado de Fases

| Fase | Nombre | Semana | Estado |
|---|---|---|---|
| 0 | Fundamentos Shelwi OS (23 entregables) | Pre-1 | 🔴 Pendiente |
| 1 | Foundation 2.0 | 1 | 🔴 Pendiente |
| 2 | Enterprise Capability Engine | 2–3 | 🔴 Pendiente |
| 3 | Enterprise Event Bus | 4 | 🔴 Pendiente |
| 4 | Tool Registry | 5 | 🔴 Pendiente |
| 5 | Enterprise Memory | 6 | 🔴 Pendiente |
| 6 | Policy Engine | 7 | 🔴 Pendiente |
| 7 | AI Brain / Orchestrator | 8 | 🔴 Pendiente |
| 8 | Agentes Core | 9–10 | 🔴 Pendiente |
| 9 | Enterprise Departments | 11 | 🔴 Pendiente |
| 10 | Enterprise Experience | 12 | 🔴 Pendiente |
| 11 | CMS Enterprise | Post-12 | 🔴 Pendiente |
| 12 | Sistema de Planes Inteligentes | Post-12 | 🔴 Pendiente |
| 13 | Integraciones Financieras | Post-12 | 🔴 Pendiente |
| 14 | Marketplace | Post-12 | 🔴 Pendiente |
| 15 | Internacionalización | Post-12 | 🔴 Pendiente |

---

## FASE 0 — Fundamentos de Shelwi OS (Pre-Semana 1)

**Misión:** Construir la base arquitectónica definitiva antes de cualquier funcionalidad nueva.

**NO desarrollar módulos nuevos. NO crear pantallas nuevas. NO implementar funcionalidades empresariales.**

Primero dejar preparada la arquitectura para soportar cientos de miles de empresas durante muchos años.

**Restricciones absolutas:**
- No improvisar
- No inventar arquitecturas paralelas
- No romper compatibilidad
- No generar deuda técnica

**Validación final de la Fase 0 — NO continuar hasta que TODO esté ✓:**

- [ ] Arquitectura escalable
- [ ] Mobile First aplicado
- [ ] Compatible con Capacitor
- [ ] Multiempresa
- [ ] Multiidioma
- [ ] Configurable
- [ ] Desacoplada
- [ ] Auditada
- [ ] Documentada
- [ ] Versionada
- [ ] Preparada para Marketplace
- [ ] Preparada para IA
- [ ] Preparada para cientos de miles de empresas

---

### Entregable 0.1 — Shelwi Architecture Constitution v1.0

Documento oficial que gobernará TODO el desarrollo futuro.

Reglas mínimas obligatorias:
- [ ] Nunca acceder directamente a la BD desde un agente IA
- [ ] Nunca duplicar lógica de negocio
- [ ] Toda lógica vive en Capabilities
- [ ] Toda funcionalidad es reutilizable
- [ ] Todo configurable desde el CMS cuando sea posible
- [ ] Todo cambio importante genera auditoría
- [ ] Todo desarrollo soporta Multi Tenant
- [ ] Toda pantalla es Mobile First
- [ ] Toda API documentada
- [ ] Todo desarrollo respeta el Design System
- [ ] Toda integración desacoplada mediante adaptadores
- [ ] Todo escalable horizontalmente
- [ ] Todo soporta miles de empresas
- [ ] Ninguna funcionalidad depende de un proveedor específico
- [ ] Todo acceso respeta permisos
- [ ] Todo documentado

---

### Entregable 0.2 — Mobile First Constitution

Documento que define la única estrategia de interfaz de Shelwi.

- [ ] Definir que Shelwi NO tendrá versión móvil y otra escritorio — UNA sola app adaptable
- [ ] Orden obligatorio de diseño: Mobile → Fold → Tablet → Laptop → Desktop → UltraWide → Capacitor → PWA → Futuros dispositivos
- [ ] Documentar breakpoints oficiales
- [ ] Establecer reglas de reorganización inteligente (no layouts distintos)
- [ ] Validar implementación contra pantallas existentes

---

### Entregable 0.3 — Enterprise Design System

Documentar completamente el catálogo de componentes:

- [ ] Botones (variantes, estados, tamaños)
- [ ] Cards (tipos, densidades)
- [ ] Inputs (texto, select, fecha, búsqueda, upload)
- [ ] Tablas (básica, paginada, virtual, con acciones)
- [ ] Wizard (pasos, validación, navegación)
- [ ] Dashboard / widgets
- [ ] FAB (Floating Action Button)
- [ ] Bottom Sheet
- [ ] Drawer / Sidebar
- [ ] Navbar (mobile y desktop)
- [ ] Menús y dropdowns
- [ ] Listas y virtualización
- [ ] Alertas y toasts
- [ ] Badges y etiquetas
- [ ] Charts y gráficas
- [ ] Estados vacíos (empty states)
- [ ] Estados de carga (loading / skeleton)
- [ ] Pantallas de error
- [ ] Componentes IA (sugerencias, acciones IA, indicadores)
- [ ] Versionado del DS establecido

---

### Entregable 0.4 — Capability Registry

Catálogo oficial de capacidades reutilizables.

Cada Capability contiene:
- [ ] `id` — Identificador único
- [ ] `name` — Nombre
- [ ] `description` — Qué hace
- [ ] `version` — Versión semántica
- [ ] `inputs` — Parámetros de entrada con tipos
- [ ] `outputs` — Resultado esperado con tipos
- [ ] `permissions` — Quién puede usarla
- [ ] `events` — Eventos que publica
- [ ] `ai_cost` — Costo en créditos IA
- [ ] `department` — Departamento propietario
- [ ] `tools` — Herramientas que usa
- [ ] `compatible_agents` — Agentes que pueden invocarla
- [ ] `owner` — Responsable
- [ ] `status` — Activa / Inactiva / Deprecada
- [ ] `docs` — Documentación completa

Schema en BD creado y validado.

---

### Entregable 0.5 — Tool Registry

Catálogo oficial de herramientas para agentes.

Cada Tool contiene:
- [ ] `version` — Versión
- [ ] `provider` — Proveedor / origen
- [ ] `inputs` — Entradas con tipos
- [ ] `outputs` — Salidas con tipos
- [ ] `errors` — Errores posibles y su manejo
- [ ] `cost` — Costo (IA / API / nulo)
- [ ] `permissions` — Permisos requeridos
- [ ] `docs` — Documentación
- [ ] `audit` — Registro de cada ejecución

Validación: ningún agente ejecuta SQL. Todo mediante Tools.

---

### Entregable 0.6 — Enterprise Knowledge Graph

Modelar relaciones entre entidades del negocio.

- [ ] Definir nodos principales: Cliente, Cotización, Pedido, Factura, Pago, Proyecto, Proveedor, Empleado, Activo, Documento, Conversación, Agente, Automatización
- [ ] Definir relaciones entre nodos
- [ ] Definir propiedades de cada nodo
- [ ] Schema en BD implementado
- [ ] API de consulta del grafo disponible
- [ ] Integración con Memory Engine planificada

---

### Entregable 0.7 — Observability Center

Especificación del sistema de observabilidad.

Debe medir:
- [ ] Uso de IA (tokens, llamadas, modelos)
- [ ] Errores por categoría
- [ ] Costos por empresa / agente / herramienta
- [ ] Latencias por endpoint / Capability / Tool
- [ ] Empresas activas y métricas de uso
- [ ] Usuarios activos
- [ ] Automatizaciones ejecutadas
- [ ] Eventos publicados
- [ ] Tools invocadas
- [ ] Agentes activos
- [ ] Capacidades más usadas
- [ ] Integraciones activas
- [ ] KPIs de plataforma
- [ ] Logs centralizados con niveles

---

### Entregable 0.8 — Simulation Engine

Motor de simulación previo a ejecución de automatizaciones.

Debe poder simular sin ejecutar:
- [ ] Cambios en datos
- [ ] Costos estimados
- [ ] Créditos IA a consumir
- [ ] Correos que se enviarían
- [ ] Mensajes WhatsApp que se enviarían
- [ ] Pedidos que se crearían
- [ ] Tareas que se asignarían
- [ ] Impacto proyectado en KPIs

---

### Entregable 0.9 — Sandbox Environment

- [ ] Toda empresa puede tener entorno Producción + Sandbox
- [ ] Sandbox aislado — no afecta datos reales
- [ ] Datos de prueba configurables
- [ ] Reset de Sandbox disponible
- [ ] Automatizaciones y agentes pueden probarse en Sandbox

---

### Entregable 0.10 — Marketplace Ready

Diseñar arquitectura de Marketplace (aunque aún no exista).

Debe soportar:
- [ ] Apps de terceros
- [ ] Plugins
- [ ] Agentes publicables
- [ ] Widgets instalables
- [ ] Templates de automatización
- [ ] Workflows compartibles
- [ ] Integraciones de terceros
- [ ] Modelo de monetización definido

---

### Entregable 0.11 — Plugin Engine

Sistema de extensión sin modificar el Core.

Un plugin debe poder extender:
- [ ] Capabilities (agregar nuevas)
- [ ] Eventos (suscribirse y publicar)
- [ ] Pantallas (agregar tabs, secciones, widgets)
- [ ] Automatizaciones (agregar pasos)
- [ ] Agentes (agregar herramientas)
- [ ] Sin tocar código del Core

---

### Entregable 0.12 — Internacionalización (Arquitectura)

Preparar la arquitectura base para multi-país:
- [ ] Sistema de idiomas (i18n) configurado
- [ ] Monedas por empresa
- [ ] Impuestos por país (motor configurable)
- [ ] Tipos de facturación por país
- [ ] Tipos de documentos por país
- [ ] Métodos de pago por país
- [ ] Formatos de fecha y hora por región
- [ ] Horarios y zonas horarias

---

### Entregable 0.13 — API First

Toda Capability expuesta para ser consumida por:
- [ ] Web (app actual)
- [ ] Mobile / Capacitor
- [ ] PWA
- [ ] Marketplace
- [ ] API pública (Enterprise)
- [ ] Agentes IA
- [ ] Automatizaciones
- [ ] CLI futura

Sin excepciones. Toda Capability tiene endpoint documentado.

---

### Entregable 0.14 — Enterprise Security

Diseñar el modelo de seguridad empresarial:
- [ ] Policies (políticas por rol, empresa, plan)
- [ ] Roles granulares
- [ ] Permisos por Capability
- [ ] Auditoría de todas las acciones
- [ ] Logs de acceso
- [ ] Rollback de acciones críticas
- [ ] Firmas digitales para documentos
- [ ] Versionado de entidades críticas
- [ ] Flujos de aprobación configurables

---

### Entregable 0.15 — Configuration Engine

Todo configurable sin deploy:
- [ ] Planes (nombre, precio, límites, funciones)
- [ ] Roles y permisos
- [ ] Widgets por dashboard
- [ ] Modelos de IA por plan
- [ ] Prompts de agentes
- [ ] Capabilities habilitadas por plan
- [ ] Eventos y triggers
- [ ] Automatizaciones
- [ ] Integraciones por país y plan
- [ ] Precios y créditos
- [ ] Branding por empresa

---

### Entregable 0.16 — Versioning System

Versionado más allá de Git:
- [ ] Capabilities versionadas semánticamente
- [ ] Tools versionadas
- [ ] Eventos con versión
- [ ] Prompts versionados (historial editable)
- [ ] Agentes versionados
- [ ] Automatizaciones versionadas
- [ ] Workflows versionados
- [ ] APIs versionadas
- [ ] Integraciones versionadas

---

### Entregable 0.17 — Offline Engine

Preparar soporte offline para Capacitor y PWA:
- [ ] Consulta offline de datos cacheados
- [ ] Edición offline con cola de sincronización
- [ ] Captura de fotos sin conexión
- [ ] Firmas digitales offline
- [ ] Cola de acciones pendientes
- [ ] Sincronización automática al reconectar
- [ ] Indicador de estado de conectividad

---

### Entregable 0.18 — Sync Engine

Resolver conflictos de sincronización:
- [ ] Conflictos Usuario vs Usuario
- [ ] Conflictos Usuario vs Agente
- [ ] Conflictos Automatización vs acción manual
- [ ] Conflictos Offline vs Online
- [ ] Prioridad configurable por empresa
- [ ] Historial de conflictos resueltos

---

### Entregable 0.19 — AI Cost Center

Panel de costos IA por empresa:
- [ ] Consumo total de créditos
- [ ] Desglose por agente
- [ ] Desglose por herramienta
- [ ] Costo en dinero estimado
- [ ] Tiempo ahorrado estimado
- [ ] Histórico mensual
- [ ] Alertas de límite de créditos

---

### Entregable 0.20 — ROI Center

Panel de retorno de inversión:
- [ ] Horas ahorradas (estimado)
- [ ] Automatizaciones ejecutadas
- [ ] Seguimientos realizados por agentes
- [ ] Correos enviados automáticamente
- [ ] Pedidos procesados automáticamente
- [ ] Llamadas/recordatorios gestionados
- [ ] Campañas ejecutadas
- [ ] Ahorro económico estimado
- [ ] Productividad vs línea base

---

### Entregable 0.21 — Capacitor Ready (Abstract Native Services)

Servicios abstractos para acceso a hardware:
- [ ] `NotificationService` — push nativas y web
- [ ] `StorageService` — almacenamiento local
- [ ] `CameraService` — cámara y galería
- [ ] `LocationService` — GPS y geolocalización
- [ ] `FileService` — acceso a archivos

Nunca usar APIs directas del navegador.

---

### Entregable 0.22 — Abstract Services Layer

Capa de servicios desacoplados de proveedores:
- [ ] `IAService` — abstracción multi-modelo IA
- [ ] `StorageService` — S3 / Supabase Storage / Drive
- [ ] `PaymentService` — Wompi / Stripe / MercadoPago
- [ ] `EmailService` — SMTP / SendGrid / Resend
- [ ] `NotificationService` — push / email / SMS / WhatsApp
- [ ] `MapsService` — Google Maps / Mapbox
- [ ] `CalendarService` — Google / Outlook
- [ ] `AuthService` — Supabase / SSO / OAuth
- [ ] `OCRService` — extracción de texto de documentos
- [ ] `SpeechService` — voz a texto / texto a voz

Nunca llamar proveedores directamente desde lógica de negocio.

---

### Entregable 0.23 — Enterprise Engines (Núcleo de Shelwi)

Diseñar los 10 motores independientes del núcleo:

| Motor | Responsabilidad |
|---|---|
| **Capability Engine** | Registrar, versionar y ejecutar capacidades |
| **Configuration Engine** | Gestionar toda la configuración sin deploy |
| **Policy Engine** | Controlar autonomía y permisos de agentes |
| **Memory Engine** | Memoria empresarial persistente y Knowledge Graph |
| **Workflow Engine** | Orquestar flujos multi-paso |
| **AI Orchestrator** | Coordinar agentes y distribuir tareas |
| **Integration Engine** | Gestionar adaptadores de integraciones externas |
| **Experience Engine** | Personalizar la UI por empresa/usuario |
| **Event Engine** | Bus de eventos, subscriptores y auditoría |
| **Automation Engine** | Ejecutar automatizaciones con simulación previa |

- [ ] Especificación de cada motor documentada
- [ ] Contratos de comunicación entre motores definidos
- [ ] Todos independientes, desacoplados y reutilizables

---

## FASE 1 — Foundation 2.0 (Semana 1)

**Objetivo:** Congelar la arquitectura. No desarrollar nuevas funciones.

- [ ] Auditoría de deuda técnica crítica (identificar y listar)
- [ ] Eliminar componentes duplicados detectados
- [ ] Eliminar servicios/hooks duplicados
- [ ] Establecer versionado semántico del proyecto
- [ ] Convenciones oficiales de código documentadas
- [ ] Arquitectura actual documentada en MCP Memory
- [ ] Completar Dashboard Enterprise pendiente
- [ ] Definir estándares de patrones (naming, estructura de archivos)
- [ ] Auditoría de Skills disponibles antes de implementar cualquier cosa

---

## FASE 2 — Enterprise Capability Engine (Semanas 2–3)

**Objetivo:** Convertir TODO Shelwi en capacidades reutilizables.

**Schema y base de datos:**
- [ ] Schema de Capability definido en BD (tabla `capabilities`)
- [ ] Schema de Capability versioning definido
- [ ] Migrations ejecutadas y validadas

**Capability Registry:**
- [ ] Implementar Capability Registry (CRUD + consulta)
- [ ] API de registro de nuevas Capabilities
- [ ] API de invocación de Capabilities
- [ ] Validación de permisos en cada invocación
- [ ] Registro de auditoría por invocación

**Capacidades core a migrar (primeras 15):**
- [ ] `createClient`
- [ ] `searchClient`
- [ ] `updateClient`
- [ ] `deleteClient`
- [ ] `createOrder`
- [ ] `createInvoice`
- [ ] `sendWhatsApp`
- [ ] `sendEmail`
- [ ] `scheduleMeeting`
- [ ] `createTask`
- [ ] `createContract`
- [ ] `registerPayment`
- [ ] `generateReport`
- [ ] `queryInventory`
- [ ] `registerPurchase`

**Validación:**
- [ ] Todo nuevo desarrollo usa Capabilities
- [ ] Ninguna lógica de negocio fuera de Capabilities

---

## FASE 3 — Enterprise Event Bus (Semana 4)

**Objetivo:** Todo genera eventos. Nada se ejecuta "porque sí".

- [ ] Schema de eventos definido en BD
- [ ] Event Bus implementado (publish / subscribe)
- [ ] Todos los Capabilities publican eventos al crear/modificar/eliminar
- [ ] Suscriptor: automatizaciones
- [ ] Suscriptor: agentes IA
- [ ] Suscriptor: dashboard (tiempo real)
- [ ] Suscriptor: auditoría (todos los eventos)
- [ ] Sistema de reintentos para eventos fallidos
- [ ] Dead letter queue para eventos no procesados
- [ ] Dashboard de eventos en Super Admin

---

## FASE 4 — Tool Registry (Semana 5)

**Objetivo:** Catálogo oficial de herramientas para agentes.

- [ ] Schema del Tool Registry en BD
- [ ] Implementar Tool Registry (registro, documentación, versioning)
- [ ] Implementar `updateClient()`
- [ ] Implementar `sendEmail()`
- [ ] Implementar `createQuote()`
- [ ] Implementar `createInvoice()`
- [ ] Implementar `createTask()`
- [ ] Implementar `scheduleMeeting()`
- [ ] Implementar `createPurchase()`
- [ ] Implementar `assignTechnician()`
- [ ] Implementar `approveExpense()`
- [ ] Migrar agentes existentes a Tool Registry
- [ ] Validación automatizada: ningún agente accede a BD directamente
- [ ] Documentación de cada Tool en el CMS

---

## FASE 5 — Enterprise Memory (Semana 6)

**Objetivo:** Memoria empresarial persistente por empresa.

- [ ] Schema de Memory Layer en BD
- [ ] Implementar Memory Layer (lectura/escritura)
- [ ] Tipos de memoria: empresa, clientes, proveedores, productos, decisiones, conversaciones, historial, objetivos, indicadores, documentos, organigrama
- [ ] Integración con Knowledge Graph (Entregable 0.6)
- [ ] Agentes consultan Memory antes de actuar
- [ ] Write-back automático tras decisiones relevantes
- [ ] API de consulta semántica de memoria
- [ ] Particionamiento por empresa (multi-tenant)
- [ ] Límites de memoria por plan

---

## FASE 6 — Policy Engine (Semana 7)

**Objetivo:** Cada empresa configura la autonomía de sus agentes.

- [ ] Schema del Policy Engine en BD
- [ ] Implementar los 4 modos: Observador / Asistente / Semi Autónomo / Autónomo
- [ ] Configuración por empresa
- [ ] Configuración por agente (override sobre empresa)
- [ ] Configuración por acción/Capability (override sobre agente)
- [ ] Todos los agentes consultan Policy Engine antes de actuar
- [ ] UI de configuración en panel de empresa
- [ ] Historial de cambios de política auditado

---

## FASE 7 — AI Brain / Orchestrator (Semana 8)

**Objetivo:** Cerebro coordinador de agentes. No responde preguntas — coordina.

- [ ] Diseño del protocolo de comunicación entre Orchestrator y agentes
- [ ] Implementar AI Orchestrator core
- [ ] Integración con Tool Registry
- [ ] Integración con Event Bus
- [ ] Integración con Memory Engine
- [ ] Integración con Policy Engine
- [ ] Capacidad de orquestar ≥3 agentes en paralelo
- [ ] División de objetivos en tareas atómicas
- [ ] Selección automática del agente más adecuado
- [ ] Supervisión de resultados y re-enrutamiento en fallo
- [ ] Dashboard de orquestación para Super Admin
- [ ] Logs de razonamiento del Orchestrator

---

## FASE 8 — Agentes Core (Semanas 9–10)

**Objetivo:** Agentes que generan mayor retorno para el negocio.

**Agente Comercial IA:**
- [ ] Seguimiento automático de oportunidades
- [ ] Generación de cotizaciones
- [ ] Campañas de outreach
- [ ] Recordatorios de seguimiento
- [ ] Detección proactiva de oportunidades

**Agente Operaciones IA:**
- [ ] Gestión de pedidos
- [ ] Órdenes de Trabajo (OT)
- [ ] Monitoreo GPS
- [ ] Análisis de productividad
- [ ] Detección de riesgos operacionales

**Agente Finanzas IA:**
- [ ] Flujo de caja en tiempo real
- [ ] Gestión de cartera vencida
- [ ] Análisis de márgenes
- [ ] Control de costos

**Agente Dirección IA (Daily Brief):**
- [ ] Qué pasó ayer
- [ ] Qué preocupa hoy
- [ ] Qué recomienda
- [ ] Qué hacer hoy

**Integración obligatoria de todos los agentes:**
- [ ] Tool Registry
- [ ] Memory Engine
- [ ] Policy Engine
- [ ] Event Bus
- [ ] Auditoría completa

---

## FASE 9 — Enterprise Departments (Semana 11)

**Objetivo:** Capacidades por departamento. Solo capacidades — no módulos completos.

- [ ] 01 Comercial — Capabilities definidas y activas
- [ ] 02 Marketing — Capabilities definidas y activas
- [ ] 03 Servicio al Cliente — Capabilities definidas y activas
- [ ] 04 Compras — Capabilities definidas y activas
- [ ] 05 Inventario — Capabilities definidas y activas
- [ ] 06 Producción — Capabilities definidas y activas
- [ ] 07 Operaciones — Capabilities definidas y activas
- [ ] 08 Logística — Capabilities definidas y activas
- [ ] 09 Proyectos — Capabilities definidas y activas
- [ ] 10 Calidad — Capabilities definidas y activas
- [ ] 11 SST — Capabilities definidas y activas
- [ ] 12 RRHH — Capabilities definidas y activas
- [ ] 13 Nómina — Capabilities definidas y activas
- [ ] 14 Finanzas — Capabilities definidas y activas
- [ ] 15 Contabilidad — Capabilities definidas y activas
- [ ] 16 Gerencia — Capabilities definidas y activas
- [ ] 17 Jurídica — Capabilities definidas y activas
- [ ] 18 Tecnología — Capabilities definidas y activas
- [ ] 19 BI — Capabilities definidas y activas
- [ ] 20 IA — Capabilities definidas y activas

---

## FASE 10 — Enterprise Experience (Semana 12)

**Objetivo:** El usuario no ve un ERP — ve un asistente inteligente.

**Morning Brief / Dashboard Inteligente:**
- [ ] Saludo personalizado con nombre y fecha
- [ ] Clientes en riesgo de abandono
- [ ] Pedidos con retraso crítico
- [ ] Cobros vencidos con monto total
- [ ] Panel de agentes trabajando en tiempo real
- [ ] Alertas de inventario bajo
- [ ] Recomendaciones del día

**Panel de Agentes:**
- [ ] Estado en tiempo real de cada agente activo
- [ ] Últimas acciones ejecutadas
- [ ] Próximas acciones planificadas

**Sistema de Alertas:**
- [ ] Alertas priorizadas por impacto
- [ ] Acciones rápidas desde cada alerta
- [ ] Historial de alertas resueltas

**Centro de Decisiones:**
- [ ] Aprobaciones pendientes del usuario
- [ ] Una sola pantalla para todas las decisiones pendientes
- [ ] Acciones: Aprobar / Rechazar / Delegar / Posponer

**Vista de Salud Empresarial:**
- [ ] KPIs principales en tiempo real
- [ ] Tendencias vs período anterior
- [ ] Indicadores de riesgo

---

## FASE 11 — CMS Enterprise / Plataforma 100% Configurable

**Objetivo:** El CMS es el cerebro administrativo de Shelwi. Nada hardcoded.

- [ ] Módulo Empresa (tipos, categorías, sectores, países, monedas, idiomas)
- [ ] Módulo Planes (nombre, precio, límites, créditos IA, funciones habilitadas, precios adicionales)
- [ ] Módulo IA (modelos, costos, créditos, prioridades, fallbacks, límites por plan/usuario/día)
- [ ] Módulo Agentes (crear, activar, desactivar, instrucciones, herramientas, permisos, autonomía, planes)
- [ ] Módulo Capabilities (crear, activar, desactivar, permisos, departamentos, agentes asociados)
- [ ] Módulo Automatizaciones (constructor visual, activar, desactivar, duplicar, exportar, importar)
- [ ] Módulo Eventos (crear, relacionar, documentar)
- [ ] Módulo Integraciones (habilitar por país / plan / empresa)
- [ ] Módulo Branding (logos, colores, plantillas, correos, PDF, portal)
- [ ] Módulo Marketplace (activar, desactivar, publicar, ocultar módulos)
- [ ] Validación: cero hardcoding de límites, nombres o configuraciones en código

---

## FASE 12 — Sistema de Planes Inteligentes

**Objetivo:** Los planes salen 100% de BD.

```
❌ if (plan === "premium") → ✅ if (await canUse("orders"))
```

- [ ] Motor de permisos `canUse(feature)` basado en BD
- [ ] Motor de límites `getLimit(resource)` basado en BD
- [ ] Eliminar toda verificación `if(plan===...)` del código
- [ ] Migrar todas las verificaciones al motor
- [ ] Schema de planes en BD con todos los campos del CMS
- [ ] UI de planes actualizada: Start / Growth / Business OS / Enterprise OS
- [ ] Textos, precios y funciones de cada plan configurables desde CMS sin deploy
- [ ] Validación: ningún nombre de plan quemado en código

---

## FASE 13 — Integraciones Financieras

**Principio:** Shelwi nunca recibe dinero de clientes finales de las empresas.

- [ ] Adaptador desacoplado: Wompi
- [ ] Adaptador desacoplado: Mercado Pago
- [ ] Adaptador desacoplado: Stripe
- [ ] Adaptador desacoplado: PayPal
- [ ] Adaptador desacoplado: PayU
- [ ] Adaptador desacoplado: ePayco
- [ ] Adaptador desacoplado: Nequi (sujeto a API oficial)
- [ ] Adaptador desacoplado: Bancolombia
- [ ] Adaptador desacoplado: Transferencias manuales
- [ ] Configuración por empresa en CMS (país, moneda, proveedor, llaves, webhooks, comisión, estado)
- [ ] Habilitación de proveedores por país
- [ ] Habilitación de proveedores por plan
- [ ] Webhooks de confirmación de pago
- [ ] Eventos publicados al Event Bus tras cada pago
- [ ] Auditoría de cada transacción

---

## FASE 14 — Marketplace

**Objetivo:** Shelwi crece mediante Marketplace, no mediante programación directa.

- [ ] Infraestructura de Marketplace en BD
- [ ] Sistema de publicación de agentes / plugins / templates
- [ ] Sistema de activación por empresa
- [ ] Sistema de desactivación por empresa
- [ ] Modelo de monetización en CMS
- [ ] Agente Jurídico (primer agente marketplace)
- [ ] Agente SST (segundo agente marketplace)
- [ ] Agente Calidad (tercer agente marketplace)
- [ ] Portal de Marketplace en la app
- [ ] Gestión desde CMS Super Admin

---

## FASE 15 — Internacionalización (i18n + Multi-país)

**Objetivo:** Soporte real para múltiples países y culturas.

- [ ] i18n implementado en toda la UI (español base)
- [ ] Inglés como segundo idioma
- [ ] Configuración de país por empresa en CMS
- [ ] Motor de impuestos configurable (IVA, ICA, retenciones, etc.)
- [ ] Tipos de documento por país (factura, nota crédito, remisión, etc.)
- [ ] Formatos de fecha/número/moneda por país
- [ ] Zonas horarias por empresa
- [ ] Métodos de pago habilitados por país
- [ ] Colombia — soporte completo
- [ ] México — soporte completo
- [ ] España — soporte completo

---

## Catálogo de Agentes IA

| Agente | Responsabilidad |
|---|---|
| CEO IA | Coordinación general, daily brief ejecutivo |
| Director Comercial IA | Pipeline, forecast, estrategia comercial |
| Asistente Comercial IA | Seguimiento, cotizaciones, recordatorios |
| Marketing IA | Campañas, contenido, leads |
| Comprador IA | Solicitudes, órdenes de compra, proveedores |
| Inventario IA | Stock, alertas, reabastecimiento |
| Operaciones IA | Pedidos, OTs, productividad, riesgos |
| Logística IA | GPS, entregas, rutas |
| Finanzas IA | Flujo de caja, cartera, márgenes |
| Contador IA | Registros, cierres, reportes contables |
| RRHH IA | Nómina, vacaciones, desempeño |
| SST IA | Riesgos, incidentes, cumplimiento |
| Calidad IA | No conformidades, auditorías, mejora continua |
| Customer Success IA | Retención, satisfacción, upsell |
| BI IA | Dashboards, tendencias, alertas de KPI |

---

## Lista de Verificación Pre-Desarrollo (Obligatoria)

Antes de escribir cualquier línea de código:

- [ ] ¿Consulté MCP Memory para evitar duplicar algo existente?
- [ ] ¿Esta funcionalidad está modelada como Capability?
- [ ] ¿La Capability publica eventos al Event Bus?
- [ ] ¿El agente usa Tool Registry y no accede a BD directamente?
- [ ] ¿El comportamiento respeta el Policy Engine?
- [ ] ¿Hay auditoría y trazabilidad registrada?
- [ ] ¿El límite/nombre/configuración viene de BD y no está hardcoded?
- [ ] ¿Actualicé MCP Memory con la decisión tomada?
- [ ] ¿Esta implementación rompe alguna funcionalidad existente?
- [ ] ¿Diseñé pensando en cientos de miles de empresas?
- [ ] ¿La pantalla es Mobile First?
- [ ] ¿Usa solo componentes del Design System?
- [ ] ¿Es compatible con Capacitor (sin APIs directas de browser)?
- [ ] ¿Carga en menos de 2 segundos?
- [ ] ¿Cumple contraste AA de accesibilidad?
