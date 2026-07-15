# ÍNDICE DE DOCUMENTOS — SHELWI OS ENTERPRISE ARCHITECTURE
> Versión: 1.0 | Fecha: 2026-07-14
> Catálogo de los 25 documentos de arquitectura enterprise requeridos

---

## Estado de documentos

| # | Documento | Archivo | Estado | Prioridad | Fase |
|---|---|---|---|---|---|
| 01 | Architecture Constitution | [01_ARCHITECTURE_CONSTITUTION.md](01_ARCHITECTURE_CONSTITUTION.md) | ✅ Completo | P0 | Pre-desarrollo |
| 02 | Enterprise Domain Model | [02_ENTERPRISE_DOMAIN_MODEL.md](02_ENTERPRISE_DOMAIN_MODEL.md) | 🔴 Pendiente | P0 | Fase 0 |
| 03 | Business Blueprint | [03_BUSINESS_BLUEPRINT.md](03_BUSINESS_BLUEPRINT.md) | 🔴 Pendiente | P1 | Fase 0 |
| 04 | Capability Catalog | [04_CAPABILITY_CATALOG.md](04_CAPABILITY_CATALOG.md) | 🔴 Pendiente | P0 | Fase 0 |
| 05 | Event Catalog | [05_EVENT_CATALOG.md](05_EVENT_CATALOG.md) | 🔴 Pendiente | P1 | Fase 0 |
| 06 | Tool Catalog | [06_TOOL_CATALOG.md](06_TOOL_CATALOG.md) | 🔴 Pendiente | P0 | Fase 0 |
| 07 | Agent Catalog | [07_AGENT_CATALOG.md](07_AGENT_CATALOG.md) | ⚠️ Parcial (en 18_AI_GOVERNANCE.md) | P1 | Fase 0 |
| 08 | Prompt Registry | [08_PROMPT_REGISTRY.md](08_PROMPT_REGISTRY.md) | 🔴 Pendiente (schema 0149 existe) | P1 | Fase 0 |
| 09 | Model Registry | [09_MODEL_REGISTRY.md](09_MODEL_REGISTRY.md) | 🔴 Pendiente | P1 | Fase 0 |
| 10 | Process Catalog | [10_PROCESS_CATALOG.md](10_PROCESS_CATALOG.md) | 🔴 Pendiente | P2 | Fase 2 |
| 11 | Workflow Library | [11_WORKFLOW_LIBRARY.md](11_WORKFLOW_LIBRARY.md) | 🔴 Pendiente | P2 | Fase 3 |
| 12 | Permission Matrix | [12_PERMISSION_MATRIX.md](12_PERMISSION_MATRIX.md) | 🔴 Pendiente | P0 | Fase 0 |
| 13 | Data Dictionary | [13_DATA_DICTIONARY.md](13_DATA_DICTIONARY.md) | 🔴 Pendiente | P1 | Fase 0 |
| 14 | KPI Catalog | [14_KPI_CATALOG.md](14_KPI_CATALOG.md) | ⚠️ Parcial (en EPMO v2.0) | P2 | Fase 9 |
| 15 | Automation Library | [15_AUTOMATION_LIBRARY.md](15_AUTOMATION_LIBRARY.md) | 🔴 Pendiente | P2 | Fase 5 |
| 16 | Integration Catalog | [16_INTEGRATION_CATALOG.md](16_INTEGRATION_CATALOG.md) | 🔴 Pendiente | P2 | Fase 13 |
| 17 | Memory Strategy | [17_MEMORY_STRATEGY.md](17_MEMORY_STRATEGY.md) | 🔴 Pendiente | P0 | Fase 0 |
| 18 | AI Governance | [18_AI_GOVERNANCE.md](18_AI_GOVERNANCE.md) | ✅ Completo | P0 | Pre-desarrollo |
| 19 | Security Governance | [19_SECURITY_GOVERNANCE.md](19_SECURITY_GOVERNANCE.md) | ✅ Completo | P0 | Pre-desarrollo |
| 20 | DevSecOps Guide | [20_DEVSECOPS_GUIDE.md](20_DEVSECOPS_GUIDE.md) | 🔴 Pendiente | P1 | Sprint 1 |
| 21 | Observability Guide | [21_OBSERVABILITY_GUIDE.md](21_OBSERVABILITY_GUIDE.md) | 🔴 Pendiente | P1 | Sprint 1 |
| 22 | Release Guide | [22_RELEASE_GUIDE.md](22_RELEASE_GUIDE.md) | ⚠️ Parcial (en EPMO v2.0) | P1 | Sprint 1 |
| 23 | Engineering Playbook | [23_ENGINEERING_PLAYBOOK.md](23_ENGINEERING_PLAYBOOK.md) | 🔴 Pendiente | P1 | Sprint 0 |
| 24 | Product Roadmap | [SHELWI_OS_ROADMAP.md](SHELWI_OS_ROADMAP.md) | ✅ Completo | — | — |
| 25 | EPMO | [SHELWI_OS_EPMO_v2.md](SHELWI_OS_EPMO_v2.md) | ✅ v2.0 Completo | — | — |

**Progreso:** 5/25 completos · 4/25 parciales · 16/25 pendientes

---

## Documentos P0 — Requeridos antes de escribir código

Estos documentos deben existir antes de cualquier sprint de implementación:

### [01] Architecture Constitution ✅
- **Qué es:** Las leyes fundamentales del sistema. Todo PR las verifica.
- **Clave:** La Secuencia de Oro, prohibición de plan-hardcoding, Zero Trust, Tool Registry obligatorio.
- **Listo para usar**

### [04] Capability Catalog 🔴
- **Qué es:** Registro de todas las Capabilities del sistema con ID, inputs, outputs, permisos, eventos que genera, Tools que usa.
- **Por qué P0:** Sin esto, dos desarrolladores pueden crear la misma Capability con nombres diferentes y romper la arquitectura.
- **Contenido mínimo requerido:**
  - ID único (CAP-001, CAP-002...)
  - Nombre y descripción
  - Departamento
  - Inputs con tipos
  - Outputs con tipos
  - Eventos que emite (referencia a Event Catalog)
  - Tools que usa (referencia a Tool Catalog)
  - Permisos requeridos (RBAC + Feature Flag)
  - Estado: Definida / En desarrollo / Implementada / Deprecada
- **Schema:** Migration 0148 (`ai_capability_registry`) — auditar y documentar schema existente

### [06] Tool Catalog 🔴
- **Qué es:** Registro de todos los Tools que los agentes pueden invocar.
- **Por qué P0:** Sin esto, agentes hacen SQL directo (TD-CRÍTICO-03: 149 nodos de acceso directo).
- **Contenido mínimo requerido:**
  - ID único (TOOL-001...)
  - Nombre y descripción
  - Agentes que pueden usarlo
  - Parámetros (tipados, validados)
  - Rate limit
  - Requiere aprobación humana: sí/no
  - Estado: Definida / Implementada

### [12] Permission Matrix 🔴
- **Qué es:** Tabla de qué rol puede hacer qué en cada módulo/Capability.
- **Por qué P0:** Sin esto, la implementación de RBAC es inconsistente por módulo.
- **Formato:** Roles (filas) × Capabilities (columnas) × Acción (CRUD) = Permitido/Denegado/Condicional

### [17] Memory Strategy 🔴
- **Qué es:** Cómo persiste y recupera memoria cada agente IA.
- **Por qué P0:** Sin esto, cada agente implementa su propia memoria y no hay coherencia entre sesiones.
- **Contenido:** Schema de knowledge graph, TTL de memorias, separación por tenant, qué recordar vs qué olvidar.

---

## Descripción de documentos P1

### [02] Enterprise Domain Model
Mapa de las 15 entidades de dominio y sus relaciones (Company, Workspace, User, Client, Invoice, Task, Project, Employee, Supplier, Inventory, Automation, Agent, Event, Tool, Capability). Diagrama ER + glosario de términos de negocio.

### [03] Business Blueprint
Mapa del negocio Shelwi: propuesta de valor por segmento, journey del usuario, diferenciadores vs competencia, métricas de éxito del producto. No es técnico — es el contrato de producto.

### [05] Event Catalog
Todos los eventos que el sistema emite al Event Bus. Formato: `DOMAIN.ENTITY.ACTION` (ej: `CRM.CLIENT.CREATED`). Incluye: payload schema, quién emite, quién suscribe, SLA de procesamiento.

### [07] Agent Catalog
Expansión del catálogo parcial en 18_AI_GOVERNANCE.md. Incluye: lifecycle diagram por agente, Tools que puede usar, memory scope, ejemplos de uso, casos edge.

### [08] Prompt Registry
Inventario de todos los System Prompts con versiones. Conectar al schema de migration 0149. Incluir proceso de aprobación de cambios y A/B testing.

### [09] Model Registry
Catálogo de modelos IA disponibles: Gemini Pro 2.5, Gemini Flash, NVIDIA NIM Llama 3.3 70B, embeddings. Incluye: caso de uso ideal, costo por 1k tokens, latencia típica, límites de contexto.

### [13] Data Dictionary
Glosario de todas las tablas y columnas de la BD con descripción de negocio. Los tipos ya están en `database.types.ts` — este documento agrega el "qué significa" en lenguaje de negocio.

### [20] DevSecOps Guide
- Branch strategy: Trunk Based Development con feature flags
- CI/CD: GitHub Actions (lint → typecheck → test → build → deploy staging → deploy prod)
- Environment strategy: local → staging → production
- Secrets management: Supabase Vault + .env local
- Rollback procedure: migración DOWN + git revert

### [21] Observability Guide
- Sentry: configuración de alertas, performance monitoring
- Supabase: queries lentas, dead tuples, index usage
- AI usage: dashboard de costos por empresa
- Custom metrics: qué medir, cómo alertar
- AdminPanel `observability` tab: qué mostrar

### [23] Engineering Playbook
- Cómo iniciar un nuevo feature
- Cómo crear una nueva Capability
- Cómo escribir una migración
- Cómo crear un agente
- Cómo deployar
- Cómo hacer rollback
- Proceso de code review
- Onboarding de nuevo desarrollador/sesión de Claude

---

## Documentos P2 (Fases 5+)

### [10] Process Catalog
Procesos de negocio que Shelwi automatiza. Ej: "Proceso de cobranza: factura generada → enviar recordatorio 7d → enviar reminder 14d → escalar a colección 30d".

### [11] Workflow Library
Flujos de automatización pre-construidos disponibles para empresas. Ej: "Nuevo Lead → Asignar comercial → Programar llamada → Enviar email de bienvenida".

### [14] KPI Catalog
Todas las métricas que Shelwi calcula y presenta. Por departamento, por agente, por plan. Incluye: fórmula, fuente de datos, frecuencia de actualización.

### [15] Automation Library
Catálogo de automatizaciones disponibles por plan. Incluye triggers, condiciones, acciones, agente responsable.

### [16] Integration Catalog
Todas las integraciones con terceros: WhatsApp, Stripe, QuickBooks, Salesforce, Zapier, etc. Para cada una: endpoints, auth method, datos que fluyen, frecuencia.

---

## Protocolo de creación de nuevos documentos

1. Crear el archivo con el nombre correcto: `NN_NOMBRE_DOCUMENTO.md`
2. Añadir frontmatter con versión, fecha, autoridad
3. Completar el contenido mínimo requerido (ver descripción de cada doc)
4. Actualizar este índice cambiando el estado a ✅ o ⚠️
5. Actualizar `MEMORY.md` si aplica
