# SHELWI OS 1.0 — Lista Maestra de Tareas

> Documento de ejecución. Marcar cada tarea al completarse. No saltar ninguna.
> Referencia completa: [SHELWI_OS_ROADMAP.md](SHELWI_OS_ROADMAP.md)
> Última actualización: 2026-07-13

---

## Leyenda de Estado

- `[ ]` Pendiente
- `[~]` En progreso
- `[x]` Completada
- `[!]` Bloqueada (indicar motivo)
- `[-]` Descartada (indicar motivo)

---

## FASE 0 — Fundamentos de Shelwi OS

> Obligatorio completar el 100% antes de iniciar cualquier fase posterior.

### 0.1 — Architecture Constitution v1.0

- [ ] **0.1.1** Redactar documento `docs/ARCHITECTURE_CONSTITUTION.md`
- [ ] **0.1.2** Regla: Nunca acceder a BD desde un agente IA — documentada y ejemplificada
- [ ] **0.1.3** Regla: Nunca duplicar lógica de negocio — documentada
- [ ] **0.1.4** Regla: Toda lógica vive en Capabilities — documentada
- [ ] **0.1.5** Regla: Toda funcionalidad es reutilizable — documentada
- [ ] **0.1.6** Regla: Todo configurable desde CMS — documentada
- [ ] **0.1.7** Regla: Todo cambio genera auditoría — documentada
- [ ] **0.1.8** Regla: Todo desarrollo soporta Multi Tenant — documentada
- [ ] **0.1.9** Regla: Toda pantalla es Mobile First — documentada
- [ ] **0.1.10** Regla: Toda API documentada — documentada
- [ ] **0.1.11** Regla: Todo respeta el Design System — documentada
- [ ] **0.1.12** Regla: Toda integración usa adaptadores — documentada
- [ ] **0.1.13** Regla: Todo escalable horizontalmente — documentada
- [ ] **0.1.14** Regla: Ninguna funcionalidad depende de un proveedor específico — documentada
- [ ] **0.1.15** Regla: Todo acceso respeta permisos — documentada
- [ ] **0.1.16** Documento revisado y guardado en MCP Memory

### 0.2 — Mobile First Constitution

- [ ] **0.2.1** Redactar documento `docs/MOBILE_FIRST_CONSTITUTION.md`
- [ ] **0.2.2** Definir formalmente: una sola app adaptable (no versiones separadas)
- [ ] **0.2.3** Documentar orden de diseño: Mobile → Fold → Tablet → Laptop → Desktop → UltraWide → Capacitor → PWA
- [ ] **0.2.4** Documentar breakpoints oficiales con rangos exactos
- [ ] **0.2.5** Definir regla de reorganización inteligente vs cambio de flujo
- [ ] **0.2.6** Auditar pantallas existentes contra Mobile First — listar incumplimientos
- [ ] **0.2.7** Documento guardado en MCP Memory

### 0.3 — Enterprise Design System

- [ ] **0.3.1** Auditar componentes actuales en `src/components/ui/`
- [ ] **0.3.2** Documentar: Botones (variantes, estados, tamaños)
- [ ] **0.3.3** Documentar: Cards (tipos, densidades)
- [ ] **0.3.4** Documentar: Inputs (texto, select, fecha, búsqueda, upload)
- [ ] **0.3.5** Documentar: Tablas (básica, paginada, virtual, con acciones)
- [ ] **0.3.6** Documentar: Wizard (pasos, validación, navegación)
- [ ] **0.3.7** Documentar: Dashboard / widgets
- [ ] **0.3.8** Documentar: FAB
- [ ] **0.3.9** Documentar: Bottom Sheet
- [ ] **0.3.10** Documentar: Drawer / Sidebar
- [ ] **0.3.11** Documentar: Navbar (mobile y desktop)
- [ ] **0.3.12** Documentar: Menús y dropdowns
- [ ] **0.3.13** Documentar: Listas y virtualización
- [ ] **0.3.14** Documentar: Alertas y toasts
- [ ] **0.3.15** Documentar: Badges y etiquetas
- [ ] **0.3.16** Documentar: Charts y gráficas
- [ ] **0.3.17** Documentar: Empty states
- [ ] **0.3.18** Documentar: Loading / skeleton screens
- [ ] **0.3.19** Documentar: Pantallas de error
- [ ] **0.3.20** Documentar: Componentes IA (sugerencias, indicadores, acciones)
- [ ] **0.3.21** Crear `docs/DESIGN_SYSTEM.md` con índice de componentes
- [ ] **0.3.22** Establecer versionado del DS (semver)
- [ ] **0.3.23** Registrar DS en MCP Memory

### 0.4 — Capability Registry

- [ ] **0.4.1** Diseñar schema de tabla `capabilities` en BD
- [ ] **0.4.2** Diseñar schema de tabla `capability_versions`
- [ ] **0.4.3** Diseñar schema de tabla `capability_executions` (auditoría)
- [ ] **0.4.4** Crear migration SQL para las 3 tablas
- [ ] **0.4.5** Ejecutar migration vía CLI
- [ ] **0.4.6** Implementar Capability Registry (CRUD)
- [ ] **0.4.7** Implementar API de invocación con validación de permisos
- [ ] **0.4.8** Implementar registro automático de auditoría en cada invocación
- [ ] **0.4.9** Documentar en `docs/CAPABILITY_REGISTRY.md`
- [ ] **0.4.10** Registrar en MCP Memory

### 0.5 — Tool Registry

- [ ] **0.5.1** Diseñar schema de tabla `tools`
- [ ] **0.5.2** Diseñar schema de tabla `tool_executions` (auditoría)
- [ ] **0.5.3** Crear migration SQL
- [ ] **0.5.4** Ejecutar migration vía CLI
- [ ] **0.5.5** Implementar Tool Registry (registro, consulta, versionado)
- [ ] **0.5.6** Implementar middleware que bloquea acceso directo a BD desde agentes
- [ ] **0.5.7** Documentar en `docs/TOOL_REGISTRY.md`
- [ ] **0.5.8** Registrar en MCP Memory

### 0.6 — Enterprise Knowledge Graph

- [ ] **0.6.1** Definir nodos: Cliente, Cotización, Pedido, Factura, Pago, Proyecto, Proveedor, Empleado, Activo, Documento, Conversación, Agente, Automatización
- [ ] **0.6.2** Definir relaciones entre nodos con tipos y cardinalidad
- [ ] **0.6.3** Definir propiedades de cada nodo con tipos de dato
- [ ] **0.6.4** Diseñar schema en BD (tablas de nodos + tabla de relaciones)
- [ ] **0.6.5** Crear migration SQL
- [ ] **0.6.6** Ejecutar migration vía CLI
- [ ] **0.6.7** Implementar API de consulta del grafo
- [ ] **0.6.8** Documentar en `docs/KNOWLEDGE_GRAPH.md`

### 0.7 — Observability Center

- [ ] **0.7.1** Definir qué métricas se capturan (uso IA, errores, costos, latencias, eventos, agentes, etc.)
- [ ] **0.7.2** Diseñar schema de tablas de métricas y logs
- [ ] **0.7.3** Crear migration SQL
- [ ] **0.7.4** Ejecutar migration vía CLI
- [ ] **0.7.5** Implementar servicio de captura de métricas
- [ ] **0.7.6** Implementar sistema de logs centralizados con niveles (debug/info/warn/error)
- [ ] **0.7.7** Crear dashboard de observabilidad en Super Admin
- [ ] **0.7.8** Documentar en `docs/OBSERVABILITY.md`

### 0.8 — Simulation Engine

- [ ] **0.8.1** Definir qué puede simularse (cambios, costos, créditos, correos, mensajes, pedidos, tareas, impacto)
- [ ] **0.8.2** Diseñar interfaz de simulación (modo dry-run por Capability)
- [ ] **0.8.3** Implementar modo simulación en Capability Engine
- [ ] **0.8.4** Implementar estimación de costos IA antes de ejecutar
- [ ] **0.8.5** Implementar preview de correos / mensajes antes de enviar
- [ ] **0.8.6** UI de confirmación de simulación antes de ejecutar automatizaciones
- [ ] **0.8.7** Documentar en `docs/SIMULATION_ENGINE.md`

### 0.9 — Sandbox Environment

- [ ] **0.9.1** Definir aislamiento de datos entre Producción y Sandbox
- [ ] **0.9.2** Agregar campo `environment` (`prod` / `sandbox`) a entidades críticas
- [ ] **0.9.3** Crear migration SQL
- [ ] **0.9.4** Ejecutar migration vía CLI
- [ ] **0.9.5** Implementar selección de entorno (Producción / Sandbox)
- [ ] **0.9.6** Implementar reset de Sandbox
- [ ] **0.9.7** Implementar datos de prueba predefinidos para Sandbox
- [ ] **0.9.8** UI de cambio de entorno en panel de empresa

### 0.10 — Marketplace Ready (Arquitectura)

- [ ] **0.10.1** Definir tipos de items del Marketplace: app, plugin, agente, widget, template, workflow, integración
- [ ] **0.10.2** Diseñar schema de tablas `marketplace_items` y `marketplace_installations`
- [ ] **0.10.3** Crear migration SQL
- [ ] **0.10.4** Ejecutar migration vía CLI
- [ ] **0.10.5** Definir modelo de monetización (gratuito, suscripción, pago único, revenue share)
- [ ] **0.10.6** Documentar en `docs/MARKETPLACE_ARCHITECTURE.md`

### 0.11 — Plugin Engine

- [ ] **0.11.1** Definir contrato de plugin (interface TypeScript)
- [ ] **0.11.2** Definir puntos de extensión: Capabilities, Eventos, Pantallas, Automatizaciones, Agentes
- [ ] **0.11.3** Implementar carga dinámica de plugins sin modificar Core
- [ ] **0.11.4** Implementar sandbox de ejecución de plugins (aislamiento)
- [ ] **0.11.5** Implementar registro/desregistro de plugins por empresa
- [ ] **0.11.6** Documentar en `docs/PLUGIN_ENGINE.md`

### 0.12 — Internacionalización (Arquitectura Base)

- [ ] **0.12.1** Instalar y configurar librería i18n
- [ ] **0.12.2** Extraer todos los strings hardcoded de la UI a archivos de traducción
- [ ] **0.12.3** Crear archivo base `es-CO.json` (español Colombia)
- [ ] **0.12.4** Implementar selector de idioma por empresa
- [ ] **0.12.5** Implementar motor de monedas (formato, símbolo, decimales) por empresa
- [ ] **0.12.6** Implementar motor de impuestos configurable por país
- [ ] **0.12.7** Implementar motor de formatos de fecha/número por región
- [ ] **0.12.8** Implementar zonas horarias por empresa
- [ ] **0.12.9** Documentar en `docs/I18N.md`

### 0.13 — API First

- [ ] **0.13.1** Definir estándar de respuesta de API (estructura, errores, paginación)
- [ ] **0.13.2** Verificar que toda Capability tiene endpoint expuesto
- [ ] **0.13.3** Implementar versionado de API (`/v1/`, `/v2/`)
- [ ] **0.13.4** Implementar autenticación de API (JWT + API keys para Enterprise)
- [ ] **0.13.5** Generar documentación OpenAPI/Swagger automática
- [ ] **0.13.6** Documentar en `docs/API_REFERENCE.md`

### 0.14 — Enterprise Security

- [ ] **0.14.1** Diseñar modelo de roles granulares por empresa
- [ ] **0.14.2** Implementar tabla de permisos por Capability
- [ ] **0.14.3** Implementar tabla de auditoría central (`audit_log`)
- [ ] **0.14.4** Crear migration SQL de tablas de seguridad
- [ ] **0.14.5** Ejecutar migration vía CLI
- [ ] **0.14.6** Implementar registro automático en `audit_log` para todas las acciones críticas
- [ ] **0.14.7** Diseñar flujos de aprobación configurables
- [ ] **0.14.8** Implementar versionado de entidades críticas (historial de cambios)
- [ ] **0.14.9** Implementar rollback de acciones críticas
- [ ] **0.14.10** Documentar en `docs/SECURITY.md`

### 0.15 — Configuration Engine

- [ ] **0.15.1** Diseñar schema de tabla `configurations` (clave/valor por empresa/plan/global)
- [ ] **0.15.2** Crear migration SQL
- [ ] **0.15.3** Ejecutar migration vía CLI
- [ ] **0.15.4** Implementar Configuration Engine (lectura/escritura con caché)
- [ ] **0.15.5** Implementar invalidación de caché al actualizar configuraciones
- [ ] **0.15.6** Migrar primeras configuraciones hardcoded al motor (planes, límites)
- [ ] **0.15.7** Documentar en `docs/CONFIGURATION_ENGINE.md`

### 0.16 — Versioning System

- [ ] **0.16.1** Definir estándar de versionado semántico para Capabilities / Tools / APIs
- [ ] **0.16.2** Implementar tabla `entity_versions` genérica para versionado
- [ ] **0.16.3** Crear migration SQL
- [ ] **0.16.4** Ejecutar migration vía CLI
- [ ] **0.16.5** Implementar versionado en Capabilities
- [ ] **0.16.6** Implementar versionado en Tools
- [ ] **0.16.7** Implementar versionado en Prompts de agentes
- [ ] **0.16.8** Implementar versionado en Automatizaciones
- [ ] **0.16.9** Implementar comparación entre versiones
- [ ] **0.16.10** Documentar en `docs/VERSIONING.md`

### 0.17 — Offline Engine

- [ ] **0.17.1** Definir qué funcionalidades requieren soporte offline
- [ ] **0.17.2** Configurar service worker para PWA
- [ ] **0.17.3** Implementar cache local de datos críticos
- [ ] **0.17.4** Implementar cola de acciones pendientes offline
- [ ] **0.17.5** Implementar sincronización automática al reconectar
- [ ] **0.17.6** Implementar indicador de estado de conectividad en UI
- [ ] **0.17.7** Probar en Capacitor Android + iOS
- [ ] **0.17.8** Documentar en `docs/OFFLINE_ENGINE.md`

### 0.18 — Sync Engine

- [ ] **0.18.1** Definir estrategia de resolución de conflictos (last-write-wins, merge, manual)
- [ ] **0.18.2** Implementar detección de conflictos Usuario vs Usuario
- [ ] **0.18.3** Implementar detección de conflictos Usuario vs Agente
- [ ] **0.18.4** Implementar detección de conflictos Offline vs Online
- [ ] **0.18.5** Implementar UI de resolución de conflictos
- [ ] **0.18.6** Implementar prioridad configurable por empresa
- [ ] **0.18.7** Implementar historial de conflictos resueltos
- [ ] **0.18.8** Documentar en `docs/SYNC_ENGINE.md`

### 0.19 — AI Cost Center

- [ ] **0.19.1** Diseñar schema de tabla `ai_usage` (por empresa, agente, herramienta, fecha)
- [ ] **0.19.2** Crear migration SQL
- [ ] **0.19.3** Ejecutar migration vía CLI
- [ ] **0.19.4** Implementar captura de consumo en cada llamada IA
- [ ] **0.19.5** Crear dashboard AI Cost Center en panel de empresa
- [ ] **0.19.6** Implementar alertas de límite de créditos
- [ ] **0.19.7** Implementar estimación de tiempo ahorrado
- [ ] **0.19.8** Implementar histórico mensual con comparación

### 0.20 — ROI Center

- [ ] **0.20.1** Definir métricas de ROI: horas ahorradas, automatizaciones, seguimientos, correos, pedidos, llamadas, campañas
- [ ] **0.20.2** Diseñar schema de tabla `roi_metrics`
- [ ] **0.20.3** Crear migration SQL
- [ ] **0.20.4** Ejecutar migration vía CLI
- [ ] **0.20.5** Implementar captura automática de métricas de ROI
- [ ] **0.20.6** Crear dashboard ROI Center en panel de empresa
- [ ] **0.20.7** Implementar cálculo de ahorro económico estimado
- [ ] **0.20.8** Implementar comparación de productividad vs línea base

### 0.21 — Capacitor Ready (Abstract Native Services)

- [ ] **0.21.1** Implementar `NotificationService` (abstracción push/web)
- [ ] **0.21.2** Implementar `StorageService` (abstracción local storage)
- [ ] **0.21.3** Implementar `CameraService` (abstracción cámara/galería)
- [ ] **0.21.4** Implementar `LocationService` (abstracción GPS)
- [ ] **0.21.5** Implementar `FileService` (abstracción archivos)
- [ ] **0.21.6** Auditar el código existente — eliminar uso directo de APIs del browser
- [ ] **0.21.7** Probar cada servicio en Web + Capacitor
- [ ] **0.21.8** Documentar en `docs/NATIVE_SERVICES.md`

### 0.22 — Abstract Services Layer

- [ ] **0.22.1** Implementar `IAService` (abstracción multi-modelo IA — Claude / GPT / Gemini)
- [ ] **0.22.2** Implementar `StorageService` (abstracción S3 / Supabase Storage / Drive)
- [ ] **0.22.3** Implementar `PaymentService` (abstracción Wompi / Stripe / MercadoPago)
- [ ] **0.22.4** Implementar `EmailService` (abstracción SMTP / SendGrid / Resend)
- [ ] **0.22.5** Implementar `NotificationService` (abstracción push / email / SMS / WhatsApp)
- [ ] **0.22.6** Implementar `MapsService` (abstracción Google Maps / Mapbox)
- [ ] **0.22.7** Implementar `CalendarService` (abstracción Google / Outlook)
- [ ] **0.22.8** Implementar `AuthService` (abstracción Supabase / SSO / OAuth)
- [ ] **0.22.9** Implementar `OCRService` (extracción de texto de documentos)
- [ ] **0.22.10** Implementar `SpeechService` (voz a texto / texto a voz)
- [ ] **0.22.11** Auditar código existente — eliminar llamadas directas a proveedores
- [ ] **0.22.12** Documentar en `docs/ABSTRACT_SERVICES.md`

### 0.23 — Enterprise Engines (Núcleo)

- [ ] **0.23.1** Especificación de Capability Engine documentada
- [ ] **0.23.2** Especificación de Configuration Engine documentada
- [ ] **0.23.3** Especificación de Policy Engine documentada
- [ ] **0.23.4** Especificación de Memory Engine documentada
- [ ] **0.23.5** Especificación de Workflow Engine documentada
- [ ] **0.23.6** Especificación de AI Orchestrator documentada
- [ ] **0.23.7** Especificación de Integration Engine documentada
- [ ] **0.23.8** Especificación de Experience Engine documentada
- [ ] **0.23.9** Especificación de Event Engine documentada
- [ ] **0.23.10** Especificación de Automation Engine documentada
- [ ] **0.23.11** Contratos de comunicación entre motores definidos
- [ ] **0.23.12** Diagrama de arquitectura de motores guardado en `docs/ENGINES.md`
- [ ] **0.23.13** Todo guardado en MCP Memory

### Validación Final Fase 0 (NO continuar sin esto)

- [ ] **0.V.1** Arquitectura escalable — documentada y validada
- [ ] **0.V.2** Mobile First — aplicado y auditado
- [ ] **0.V.3** Compatible con Capacitor — servicios abstractos implementados
- [ ] **0.V.4** Multiempresa — aislamiento de datos validado
- [ ] **0.V.5** Multiidioma — arquitectura i18n operativa
- [ ] **0.V.6** Configurable — Configuration Engine operativo
- [ ] **0.V.7** Desacoplada — Abstract Services Layer implementada
- [ ] **0.V.8** Auditada — audit_log operativo
- [ ] **0.V.9** Documentada — todos los docs creados
- [ ] **0.V.10** Versionada — Versioning System operativo
- [ ] **0.V.11** Preparada para Marketplace — arquitectura definida
- [ ] **0.V.12** Preparada para IA — IAService + Tool Registry operativos
- [ ] **0.V.13** Preparada para cientos de miles de empresas — multi-tenant validado

---

## FASE 1 — Foundation 2.0

- [ ] **1.1** Auditoría completa de deuda técnica (listar archivos, componentes y servicios problemáticos)
- [ ] **1.2** Inventario de componentes duplicados en `src/components/`
- [ ] **1.3** Eliminar componentes duplicados identificados
- [ ] **1.4** Inventario de servicios/hooks duplicados en `src/services/` y `src/hooks/`
- [ ] **1.5** Eliminar servicios/hooks duplicados
- [ ] **1.6** Establecer versionado semántico (`package.json` + CHANGELOG)
- [ ] **1.7** Crear `docs/CONVENTIONS.md` con convenciones oficiales de código
- [ ] **1.8** Documentar arquitectura actual en MCP Memory
- [ ] **1.9** Completar Dashboard Enterprise pendiente
- [ ] **1.10** Definir estructura de carpetas oficial del proyecto
- [ ] **1.11** Auditar Skills disponibles — listar cuáles aplican al proyecto
- [ ] **1.12** Validar: ningún nuevo desarrollo inicia sin consultar MCP Memory

---

## FASE 2 — Enterprise Capability Engine

- [ ] **2.1** Diseñar schema BD: `capabilities`, `capability_versions`, `capability_executions`
- [ ] **2.2** Crear y ejecutar migration SQL vía CLI
- [ ] **2.3** Implementar Capability Registry (CRUD + API de invocación)
- [ ] **2.4** Implementar validación de permisos en cada invocación
- [ ] **2.5** Implementar registro de auditoría en cada invocación
- [ ] **2.6** Migrar `createClient` como Capability
- [ ] **2.7** Migrar `searchClient` como Capability
- [ ] **2.8** Migrar `updateClient` como Capability
- [ ] **2.9** Migrar `deleteClient` como Capability
- [ ] **2.10** Migrar `createOrder` como Capability
- [ ] **2.11** Migrar `createInvoice` como Capability
- [ ] **2.12** Migrar `sendWhatsApp` como Capability
- [ ] **2.13** Migrar `sendEmail` como Capability
- [ ] **2.14** Migrar `scheduleMeeting` como Capability
- [ ] **2.15** Migrar `createTask` como Capability
- [ ] **2.16** Migrar `createContract` como Capability
- [ ] **2.17** Migrar `registerPayment` como Capability
- [ ] **2.18** Migrar `generateReport` como Capability
- [ ] **2.19** Migrar `queryInventory` como Capability
- [ ] **2.20** Migrar `registerPurchase` como Capability
- [ ] **2.21** Validar: todo nuevo desarrollo usa Capabilities
- [ ] **2.22** Validar: ninguna lógica de negocio fuera de Capabilities

---

## FASE 3 — Enterprise Event Bus

- [ ] **3.1** Diseñar schema BD: `events`, `event_subscriptions`, `event_executions`
- [ ] **3.2** Crear y ejecutar migration SQL vía CLI
- [ ] **3.3** Implementar Event Bus (publish / subscribe)
- [ ] **3.4** Todos los Capabilities publican eventos al crear entidad
- [ ] **3.5** Todos los Capabilities publican eventos al modificar entidad
- [ ] **3.6** Todos los Capabilities publican eventos al eliminar entidad
- [ ] **3.7** Suscriptor de automatizaciones implementado
- [ ] **3.8** Suscriptor de agentes IA implementado
- [ ] **3.9** Suscriptor de dashboard (tiempo real) implementado
- [ ] **3.10** Suscriptor de auditoría implementado (todos los eventos)
- [ ] **3.11** Sistema de reintentos para eventos fallidos
- [ ] **3.12** Dead letter queue implementada
- [ ] **3.13** Dashboard de eventos en Super Admin

---

## FASE 4 — Tool Registry

- [ ] **4.1** Diseñar schema BD: `tools`, `tool_versions`, `tool_executions`
- [ ] **4.2** Crear y ejecutar migration SQL vía CLI
- [ ] **4.3** Implementar Tool Registry (registro, consulta, versionado)
- [ ] **4.4** Implementar middleware que bloquea acceso directo a BD desde agentes
- [ ] **4.5** Implementar `updateClient()` como Tool
- [ ] **4.6** Implementar `sendEmail()` como Tool
- [ ] **4.7** Implementar `createQuote()` como Tool
- [ ] **4.8** Implementar `createInvoice()` como Tool
- [ ] **4.9** Implementar `createTask()` como Tool
- [ ] **4.10** Implementar `scheduleMeeting()` como Tool
- [ ] **4.11** Implementar `createPurchase()` como Tool
- [ ] **4.12** Implementar `assignTechnician()` como Tool
- [ ] **4.13** Implementar `approveExpense()` como Tool
- [ ] **4.14** Migrar agentes existentes a Tool Registry
- [ ] **4.15** Validación automatizada: ningún agente accede a BD directamente
- [ ] **4.16** Documentación de cada Tool disponible en CMS

---

## FASE 5 — Enterprise Memory

- [ ] **5.1** Diseñar schema BD de Memory Layer (por tipo de entidad)
- [ ] **5.2** Crear y ejecutar migration SQL vía CLI
- [ ] **5.3** Implementar Memory Layer (lectura/escritura)
- [ ] **5.4** Implementar memoria de empresa (políticas, procesos, estructura)
- [ ] **5.5** Implementar memoria de clientes
- [ ] **5.6** Implementar memoria de proveedores
- [ ] **5.7** Implementar memoria de productos
- [ ] **5.8** Implementar memoria de decisiones importantes
- [ ] **5.9** Implementar memoria de conversaciones e historial
- [ ] **5.10** Implementar memoria de objetivos e indicadores
- [ ] **5.11** Implementar memoria de documentos y manuales
- [ ] **5.12** Implementar memoria de organigrama
- [ ] **5.13** Integrar Knowledge Graph con Memory Layer
- [ ] **5.14** Agentes consultan Memory antes de actuar — implementado
- [ ] **5.15** Write-back automático tras decisiones relevantes
- [ ] **5.16** API de consulta semántica de memoria
- [ ] **5.17** Particionamiento multi-tenant validado
- [ ] **5.18** Límites de memoria por plan configurados

---

## FASE 6 — Policy Engine

- [ ] **6.1** Diseñar schema BD: `policies`, `policy_overrides`
- [ ] **6.2** Crear y ejecutar migration SQL vía CLI
- [ ] **6.3** Implementar los 4 modos: Observador / Asistente / Semi Autónomo / Autónomo
- [ ] **6.4** Configuración de modo por empresa
- [ ] **6.5** Configuración de modo por agente (override)
- [ ] **6.6** Configuración de modo por Capability (override granular)
- [ ] **6.7** Todos los agentes consultan Policy Engine antes de actuar
- [ ] **6.8** UI de configuración en panel de empresa
- [ ] **6.9** Historial de cambios de política auditado en audit_log

---

## FASE 7 — AI Brain / Orchestrator

- [ ] **7.1** Diseñar protocolo de comunicación Orchestrator ↔ Agentes
- [ ] **7.2** Implementar AI Orchestrator core
- [ ] **7.3** Integración con Tool Registry
- [ ] **7.4** Integración con Event Bus
- [ ] **7.5** Integración con Memory Engine
- [ ] **7.6** Integración con Policy Engine
- [ ] **7.7** División de objetivos en tareas atómicas
- [ ] **7.8** Selección automática del agente más adecuado
- [ ] **7.9** Capacidad de orquestar ≥3 agentes en paralelo
- [ ] **7.10** Supervisión de resultados y re-enrutamiento en fallo
- [ ] **7.11** Dashboard de orquestación para Super Admin
- [ ] **7.12** Logs de razonamiento del Orchestrator (trazabilidad)

---

## FASE 8 — Agentes Core

### Agente Comercial IA
- [ ] **8.1** Seguimiento automático de oportunidades (Tool Registry)
- [ ] **8.2** Generación automática de cotizaciones
- [ ] **8.3** Campañas de outreach
- [ ] **8.4** Recordatorios de seguimiento
- [ ] **8.5** Detección proactiva de oportunidades

### Agente Operaciones IA
- [ ] **8.6** Gestión de pedidos
- [ ] **8.7** Órdenes de Trabajo (OT)
- [ ] **8.8** Monitoreo GPS
- [ ] **8.9** Análisis de productividad
- [ ] **8.10** Detección de riesgos operacionales

### Agente Finanzas IA
- [ ] **8.11** Flujo de caja en tiempo real
- [ ] **8.12** Gestión de cartera vencida
- [ ] **8.13** Análisis de márgenes
- [ ] **8.14** Control de costos

### Agente Dirección IA
- [ ] **8.15** Resumen de qué pasó ayer
- [ ] **8.16** Alertas de qué preocupa hoy
- [ ] **8.17** Recomendaciones del día
- [ ] **8.18** Lista de qué hacer hoy

### Integración obligatoria (todos los agentes)
- [ ] **8.19** Todos integrados con Tool Registry
- [ ] **8.20** Todos integrados con Memory Engine
- [ ] **8.21** Todos integrados con Policy Engine
- [ ] **8.22** Todos integrados con Event Bus
- [ ] **8.23** Auditoría completa de cada acción de cada agente

---

## FASE 9 — Enterprise Departments

- [ ] **9.1** Comercial — Capabilities definidas, documentadas y activas en BD
- [ ] **9.2** Marketing — Capabilities definidas, documentadas y activas en BD
- [ ] **9.3** Servicio al Cliente — Capabilities definidas, documentadas y activas en BD
- [ ] **9.4** Compras — Capabilities definidas, documentadas y activas en BD
- [ ] **9.5** Inventario — Capabilities definidas, documentadas y activas en BD
- [ ] **9.6** Producción — Capabilities definidas, documentadas y activas en BD
- [ ] **9.7** Operaciones — Capabilities definidas, documentadas y activas en BD
- [ ] **9.8** Logística — Capabilities definidas, documentadas y activas en BD
- [ ] **9.9** Proyectos — Capabilities definidas, documentadas y activas en BD
- [ ] **9.10** Calidad — Capabilities definidas, documentadas y activas en BD
- [ ] **9.11** SST — Capabilities definidas, documentadas y activas en BD
- [ ] **9.12** RRHH — Capabilities definidas, documentadas y activas en BD
- [ ] **9.13** Nómina — Capabilities definidas, documentadas y activas en BD
- [ ] **9.14** Finanzas — Capabilities definidas, documentadas y activas en BD
- [ ] **9.15** Contabilidad — Capabilities definidas, documentadas y activas en BD
- [ ] **9.16** Gerencia — Capabilities definidas, documentadas y activas en BD
- [ ] **9.17** Jurídica — Capabilities definidas, documentadas y activas en BD
- [ ] **9.18** Tecnología — Capabilities definidas, documentadas y activas en BD
- [ ] **9.19** BI — Capabilities definidas, documentadas y activas en BD
- [ ] **9.20** IA — Capabilities definidas, documentadas y activas en BD

---

## FASE 10 — Enterprise Experience

### Morning Brief / Dashboard Inteligente
- [ ] **10.1** Saludo personalizado con nombre, fecha y contexto de empresa
- [ ] **10.2** Widget: Clientes en riesgo de abandono (con acción rápida)
- [ ] **10.3** Widget: Pedidos con retraso crítico (con acción rápida)
- [ ] **10.4** Widget: Cobros vencidos con monto total (con acción rápida)
- [ ] **10.5** Widget: Alertas de inventario bajo (con acción rápida)
- [ ] **10.6** Widget: Recomendaciones del día (generadas por Dirección IA)

### Panel de Agentes Activos
- [ ] **10.7** Estado en tiempo real de cada agente activo
- [ ] **10.8** Últimas acciones ejecutadas por agentes
- [ ] **10.9** Próximas acciones planificadas

### Sistema de Alertas
- [ ] **10.10** Alertas priorizadas por impacto (crítico / alto / medio / bajo)
- [ ] **10.11** Acciones rápidas desde cada alerta (resolver en un tap)
- [ ] **10.12** Historial de alertas resueltas

### Centro de Decisiones
- [ ] **10.13** Una sola pantalla para todas las aprobaciones pendientes
- [ ] **10.14** Acciones: Aprobar / Rechazar / Delegar / Posponer
- [ ] **10.15** Notificación push cuando hay decisiones pendientes

### Vista de Salud Empresarial
- [ ] **10.16** KPIs principales en tiempo real
- [ ] **10.17** Tendencias vs período anterior
- [ ] **10.18** Indicadores de riesgo empresarial

---

## FASE 11 — CMS Enterprise

- [ ] **11.1** Módulo Empresa (tipos, categorías, sectores, países, monedas, idiomas)
- [ ] **11.2** Módulo Planes (nombre, precio, límites, créditos IA, funciones, precios adicionales)
- [ ] **11.3** Módulo IA (modelos, costos, créditos, prioridades, fallbacks, límites)
- [ ] **11.4** Módulo Agentes (crear, activar, desactivar, instrucciones, herramientas, permisos, autonomía, planes)
- [ ] **11.5** Módulo Capabilities (crear, activar, desactivar, permisos, departamentos, agentes)
- [ ] **11.6** Módulo Automatizaciones (constructor visual, activar, desactivar, duplicar, exportar, importar)
- [ ] **11.7** Módulo Eventos (crear, relacionar, documentar)
- [ ] **11.8** Módulo Integraciones (habilitar por país / plan / empresa)
- [ ] **11.9** Módulo Branding (logos, colores, plantillas, correos, PDF, portal)
- [ ] **11.10** Módulo Marketplace (activar, desactivar, publicar, ocultar módulos)
- [ ] **11.11** Validación: cero hardcoding de límites en código
- [ ] **11.12** Validación: cero hardcoding de nombres de planes en código
- [ ] **11.13** Validación: cero hardcoding de precios en código

---

## FASE 12 — Sistema de Planes Inteligentes

- [ ] **12.1** Implementar función `canUse(feature: string): Promise<boolean>`
- [ ] **12.2** Implementar función `getLimit(resource: string): Promise<number>`
- [ ] **12.3** Implementar función `getRemainingQuota(resource: string): Promise<number>`
- [ ] **12.4** Auditar todo el código — identificar cada `if(plan===...)` existente
- [ ] **12.5** Migrar todas las verificaciones de plan al motor `canUse()`
- [ ] **12.6** Schema de planes en BD con campos completos del CMS
- [ ] **12.7** Migrar data de planes actuales (Free/Pro/Premium) a BD
- [ ] **12.8** UI de planes actualizada: Start / Growth / Business OS / Enterprise OS
- [ ] **12.9** Textos, precios y funciones configurables desde CMS sin deploy
- [ ] **12.10** Validación automatizada: ningún nombre de plan hardcoded en código

---

## FASE 13 — Integraciones Financieras

- [ ] **13.1** Definir interfaz `PaymentAdapter` (contrato base)
- [ ] **13.2** Implementar adaptador Wompi
- [ ] **13.3** Implementar adaptador Mercado Pago
- [ ] **13.4** Implementar adaptador Stripe
- [ ] **13.5** Implementar adaptador PayPal
- [ ] **13.6** Implementar adaptador PayU
- [ ] **13.7** Implementar adaptador ePayco
- [ ] **13.8** Implementar adaptador Nequi (sujeto a API oficial)
- [ ] **13.9** Implementar adaptador Bancolombia
- [ ] **13.10** Implementar adaptador Transferencias manuales
- [ ] **13.11** CMS: configuración de pago por empresa (país, moneda, proveedor, llaves, comisión, estado)
- [ ] **13.12** Habilitación de proveedores por país
- [ ] **13.13** Habilitación de proveedores por plan
- [ ] **13.14** Webhooks de confirmación de pago — implementados y auditados
- [ ] **13.15** Evento publicado al Event Bus tras cada pago exitoso/fallido
- [ ] **13.16** Auditoría completa de cada transacción

---

## FASE 14 — Marketplace

- [ ] **14.1** Schema BD: `marketplace_items`, `marketplace_installations`, `marketplace_reviews`
- [ ] **14.2** Crear y ejecutar migration SQL vía CLI
- [ ] **14.3** Implementar backend de Marketplace (publicación, activación, desactivación)
- [ ] **14.4** Sistema de activación por empresa (con aislamiento multi-tenant)
- [ ] **14.5** Portal de Marketplace en la app (catálogo)
- [ ] **14.6** Modelo de monetización configurado en CMS
- [ ] **14.7** Publicar Agente Jurídico (primero)
- [ ] **14.8** Publicar Agente SST (segundo)
- [ ] **14.9** Publicar Agente Calidad (tercero)
- [ ] **14.10** Gestión completa desde CMS Super Admin

---

## FASE 15 — Internacionalización

- [ ] **15.1** i18n implementado en toda la UI (español como base)
- [ ] **15.2** Archivo `en.json` — inglés como segundo idioma
- [ ] **15.3** Selector de idioma por empresa en configuración
- [ ] **15.4** Motor de impuestos: Colombia (IVA 19%, ICA, retenciones)
- [ ] **15.5** Motor de impuestos: México (IVA 16%, ISR)
- [ ] **15.6** Motor de impuestos: España (IVA 21%, IRPF)
- [ ] **15.7** Tipos de documento: Colombia (factura, nota crédito, remisión, cotización)
- [ ] **15.8** Tipos de documento: México (CFDI, nota crédito)
- [ ] **15.9** Tipos de documento: España (factura, albarán, presupuesto)
- [ ] **15.10** Formatos de fecha/número/moneda por país configurados
- [ ] **15.11** Zonas horarias por empresa configuradas
- [ ] **15.12** Métodos de pago habilitados por país en CMS
- [ ] **15.13** Colombia — soporte completo validado
- [ ] **15.14** México — soporte completo validado
- [ ] **15.15** España — soporte completo validado

---

## Resumen de Conteo

| Fase | Tareas | Estado |
|---|---|---|
| Fase 0 — Fundamentos (23 entregables) | 157 | 🔴 0% |
| Fase 1 — Foundation 2.0 | 12 | 🔴 0% |
| Fase 2 — Capability Engine | 22 | 🔴 0% |
| Fase 3 — Event Bus | 13 | 🔴 0% |
| Fase 4 — Tool Registry | 16 | 🔴 0% |
| Fase 5 — Enterprise Memory | 18 | 🔴 0% |
| Fase 6 — Policy Engine | 9 | 🔴 0% |
| Fase 7 — AI Orchestrator | 12 | 🔴 0% |
| Fase 8 — Agentes Core | 23 | 🔴 0% |
| Fase 9 — Departments | 20 | 🔴 0% |
| Fase 10 — Enterprise Experience | 18 | 🔴 0% |
| Fase 11 — CMS Enterprise | 13 | 🔴 0% |
| Fase 12 — Planes Inteligentes | 10 | 🔴 0% |
| Fase 13 — Integraciones Financieras | 16 | 🔴 0% |
| Fase 14 — Marketplace | 10 | 🔴 0% |
| Fase 15 — Internacionalización | 15 | 🔴 0% |
| **TOTAL** | **384** | **🔴 0%** |
