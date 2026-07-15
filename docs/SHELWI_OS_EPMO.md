# SHELWI OS — Enterprise Project Management Office (EPMO)

> ⛔ **DOCUMENTO OBSOLETO — NO USAR**
> Este documento (v1.0) fue reemplazado por [`SHELWI_OS_EPMO_v2.md`](SHELWI_OS_EPMO_v2.md) tras la auditoría arquitectónica del 2026-07-14.
> Contiene 10 contradicciones con el estado real del codebase. Ver [`EPMO_AUDIT_REPORT_v2.md`](EPMO_AUDIT_REPORT_v2.md) para detalle.
> **Usar exclusivamente: `docs/SHELWI_OS_EPMO_v2.md`**

---

> ~~Fuente única de verdad para todo el desarrollo de Shelwi.~~
> ~~Versión: 1.0.0 | Fecha: 2026-07-13 | Estado: Activo~~

---

# ÍNDICE

1. [Project Charter](#1-project-charter)
2. [Product Vision](#2-product-vision)
3. [Master Execution Plan](#3-master-execution-plan)
4. [Work Breakdown Structure (WBS)](#4-work-breakdown-structure)
5. [Dependency Map](#5-dependency-map)
6. [Sprint Plan](#6-sprint-plan)
7. [Task Template](#7-task-template)
8. [Priority Matrix](#8-priority-matrix)
9. [Risk Register](#9-risk-register)
10. [Technical Debt Register](#10-technical-debt-register)
11. [Architecture Decision Records (ADR)](#11-architecture-decision-records)
12. [Quality Gates](#12-quality-gates)
13. [Definition of Done](#13-definition-of-done)
14. [Test Strategy](#14-test-strategy)
15. [Release Plan](#15-release-plan)
16. [KPI Dashboard](#16-kpi-dashboard)
17. [Resource Plan](#17-resource-plan)
18. [Communication Plan](#18-communication-plan)
19. [Change Management](#19-change-management)
20. [Success Metrics](#20-success-metrics)
21. [AI Development Governance](#21-ai-development-governance)
22. [Final Execution Board](#22-final-execution-board)

---

# 1. PROJECT CHARTER

## 1.1 Visión

Convertir Shelwi en el **Sistema Operativo Empresarial (OS) de referencia para PYMEs latinoamericanas**, donde la inteligencia artificial trabaja junto a los equipos humanos para multiplicar su productividad, reducir errores operacionales y acelerar el crecimiento — sin que el usuario tenga que ser un experto en tecnología.

## 1.2 Objetivo General

Evolucionar la plataforma actual (CRM + operaciones + IA) hacia una **arquitectura de capacidades reutilizables, herramientas desacopladas, agentes especializados y memoria empresarial persistente**, capaz de soportar cientos de miles de empresas simultáneamente durante los próximos 10 años sin reescribir su núcleo.

## 1.3 Problema

Las PYMEs latinoamericanas enfrentan tres problemas sistémicos:

| Problema | Causa | Impacto |
|---|---|---|
| **Fragmentación de herramientas** | CRM distinto, ERP distinto, WhatsApp aparte, contabilidad aparte | Pérdida de tiempo, datos duplicados, decisiones tardías |
| **Falta de capacidad humana** | No pueden contratar especialistas en cada área | Oportunidades perdidas, errores costosos, crecimiento limitado |
| **ERPs inasequibles o demasiado complejos** | Odoo/SAP/Dynamics requieren meses de implementación y consultores | Adopción cero o abandonada |

Shelwi resuelve los tres con una sola plataforma configurable y agentes IA especializados.

## 1.4 Misión

> *"Hacer que cada PYME latinoamericana opere como si tuviera un equipo completo de especialistas digitales trabajando 24/7."*

## 1.5 Alcance

**DENTRO del alcance de Shelwi OS 1.0:**
- Refactorización arquitectónica hacia Capability Engine + Tool Registry + Event Bus + Memory Engine
- Implementación de 15+ agentes IA especializados
- CMS Enterprise para configuración sin deploy
- Sistema de planes inteligente basado en BD (`canUse()`)
- Experiencia Enterprise (Morning Brief, Centro de Decisiones)
- Soporte multi-tenant para 100k+ empresas
- Compatibilidad Web / PWA / Android / iOS vía Capacitor
- Internacionalización base (Colombia, México, España)
- Marketplace de agentes y plugins

**FUERA del alcance de Shelwi OS 1.0:**
- Facturación electrónica DIAN (Colombia) — Post v2.0
- Módulo de nómina completo — Post v2.0
- ERP contable certificado — Post v2.0
- Integración bancaria directa (Open Banking) — Post v2.0
- Modelos IA propios / fine-tuning — Post v2.0
- White-label para terceros — Post v2.5

## 1.6 Restricciones

| Restricción | Detalle |
|---|---|
| **Compatibilidad hacia atrás** | Ningún cambio puede romper funcionalidades estables en producción |
| **Sin deuda técnica nueva** | Cada tarea debe quedar completa, documentada y testeada antes de avanzar |
| **Mobile First obligatorio** | Ninguna pantalla se diseña primero para desktop |
| **Tool Registry exclusivo para agentes** | Ningún agente puede ejecutar SQL directamente |
| **Multi-tenant desde el día 0** | Toda tabla nueva requiere `company_id` + RLS |
| **Design System exclusivo** | No se crean componentes aislados sin incorporarlos al DS |
| **Sin proveedores hardcoded** | Todo proveedor externo va detrás de un adaptador |
| **Sin límites en código** | Todo límite de plan sale de BD |
| **Cero hardcoding de plan names** | Reemplazar `if(plan==="premium")` por `canUse()` |

## 1.7 Supuestos

- Claude (Anthropic) es el modelo IA primario; la arquitectura debe soportar fallback a otros modelos
- Supabase continúa como backend de datos y autenticación
- Capacitor es la estrategia mobile — no React Native
- El equipo de desarrollo puede ser 100% asistido por agentes IA
- MCP Memory está disponible en todas las sesiones de desarrollo
- El stack actual (React 19 + Vite + TypeScript + Tailwind + shadcn) no cambia en v1.x

## 1.8 Objetivos SMART

| # | Objetivo | Específico | Medible | Alcanzable | Relevante | Tiempo |
|---|---|---|---|---|---|---|
| O1 | Implementar Capability Engine | Todas las acciones de negocio como Capabilities | 15 Capabilities core migradas | Sí, base existe (migration 0148) | Fundación de toda la arquitectura | Semanas 2-3 |
| O2 | Implementar Tool Registry | Agentes solo usan Tools | 0 queries SQL directas desde agentes | Sí, schema iniciado | Agentes seguros y trazables | Semana 5 |
| O3 | Eliminar hardcoding de planes | `canUse()` en toda verificación | 0 ocurrencias de `if(plan===...)` en código | Sí, lista de archivos identificable | Planes 100% desde BD | Post-12 |
| O4 | Morning Brief funcional | Dashboard inteligente operativo | 5 widgets de acción en pantalla | Sí, datos ya existen | Diferenciador principal | Semana 12 |
| O5 | 4 Agentes Core funcionales | Comercial, Operaciones, Finanzas, Dirección IA | Cada agente ejecuta ≥3 acciones autónomas | Sí, orchestrator iniciado | Mayor ROI para el usuario | Semanas 9-10 |

## 1.9 Criterios de Éxito

- [ ] Cualquier agente IA puede incorporarse al proyecto y producir código válido leyendo solo el EPMO
- [ ] Una Capability puede ser invocada desde: Web, Mobile, Agente IA, Automatización, API
- [ ] Agregar un nuevo departamento no requiere modificar el Core
- [ ] Un Super Admin puede cambiar precios, límites y funciones sin deploy
- [ ] La plataforma soporta 100k empresas sin cambios de arquitectura
- [ ] Toda acción de agente queda auditada y es trazable
- [ ] Toda pantalla carga en <2 segundos en 4G
- [ ] La app funciona en modo offline para flujos básicos

## 1.10 KPIs del Proyecto

| KPI | Meta | Frecuencia de medición |
|---|---|---|
| Capabilities implementadas | ≥30 al final de Fase 2 | Semanal |
| Cobertura de tests | ≥70% en Capabilities y Tools | Por sprint |
| Queries SQL directas desde agentes | 0 | Continuo |
| Instancias de `if(plan===...)` en código | 0 (al final Fase 12) | Por sprint |
| Tiempo de carga de pantallas | <2 segundos | Por release |
| Errores en producción (P0) | 0 por sprint | Continuo |
| Documentación en MCP Memory | Actualizada antes de cerrar cada tarea | Continuo |
| Deuda técnica acumulada | 0 items nuevos por sprint | Semanal |

## 1.11 Stakeholders

| Rol | Responsabilidad | Impacto |
|---|---|---|
| **Product Owner (Usuario)** | Visión, prioridades, validación de negocio | Crítico |
| **AI Development Agent (Claude)** | Implementación, arquitectura, documentación | Crítico |
| **Super Admin de Shelwi** | Configuración de plataforma, CMS, planes | Alto |
| **Empresas clientes** | Usuarios finales de la plataforma | Alto |
| **Supabase** | Proveedor de BD, Auth, Edge Functions | Medio (riesgo de dependencia) |
| **Anthropic (Claude API)** | Proveedor de modelos IA | Medio (riesgo de dependencia) |

## 1.12 Dependencias Externas

| Dependencia | Tipo | Riesgo |
|---|---|---|
| Supabase (DB + Auth + Edge Functions) | Crítica | Migración de proveedor = reescritura parcial |
| Claude API (Anthropic) | Crítica | IAService abstrae el riesgo |
| Capacitor 8.x | Alta | Cambios de API en versiones mayores |
| React 19 + TanStack Query v5 | Alta | Estables, bajo riesgo |
| MCP Memory | Media | Disponibilidad en sesiones de desarrollo |

## 1.13 Riesgos Iniciales

Ver sección 9 — Risk Register para el detalle completo.

| ID | Riesgo | Nivel |
|---|---|---|
| R01 | Deuda técnica acumulada bloquea nuevas features | ALTO |
| R02 | Migration 0028 pendiente en Supabase | ALTO |
| R03 | Agentes actuales hacen queries SQL directas | CRÍTICO |
| R04 | Planes verificados con `if(plan===...)` en código | ALTO |
| R05 | Ausencia de test suite formal | ALTO |
| R06 | SSL issues en entorno de desarrollo | BAJO |

---

# 2. PRODUCT VISION

## 2.1 Qué es Shelwi

Shelwi es un **Sistema Operativo Empresarial (Business OS)** para PYMEs. Es la plataforma donde todos los datos de la empresa convergen, los procesos se automatizan y los agentes IA trabajan en segundo plano para que el equipo humano tome mejores decisiones más rápido.

Shelwi no reemplaza a los humanos — los multiplica.

## 2.2 Qué NO es Shelwi

| Lo que parece | Lo que NO es |
|---|---|
| Tiene clientes y cotizaciones | No es un CRM (no solo vende) |
| Tiene pedidos e inventario | No es un ERP (no es rígido ni caro) |
| Tiene agentes IA | No es un chatbot |
| Tiene automatizaciones | No es un Zapier |
| Tiene reportes | No es un BI tool |
| Tiene portal de cliente | No es un e-commerce |

Es todo eso junto, unificado, inteligente y configurable.

## 2.3 Problema que Resuelve

Una PYME promedio en Colombia usa:
- WhatsApp para ventas (sin registro)
- Excel para inventario (sin tiempo real)
- Un ERP básico que nadie entiende
- Email manual para seguimiento
- Un contador que llega cada mes
- Un equipo que trabaja apagando incendios

Resultado: clientes perdidos, pedidos tardíos, cobros olvidados, oportunidades invisibles.

Shelwi centraliza, automatiza y pone a trabajar agentes IA especializados que antes solo las empresas con $1M+ de presupuesto tecnológico podían tener.

## 2.4 Promesas por Plan

| Plan | Precio | Promesa |
|---|---|---|
| **Start** | $0 | Organiza tus ventas y conoce Shelwi |
| **Growth** | $79.900/mes | Tu primer empleado digital para vender más |
| **Business OS** | $249.900/mes | Tu empresa operando con IA en ventas y operaciones |
| **Enterprise OS** | Desde $599.900/mes | Un equipo completo de agentes trabajando 24/7 para ti |

## 2.5 Diferenciadores vs Competencia

### vs CRM (HubSpot, Pipedrive)
- Shelwi va más allá de ventas — cubre toda la operación
- Agentes IA que actúan, no solo dashboards que muestran
- Precio accesible para PYMEs latinoamericanas
- Integración nativa con WhatsApp, Alegra, procesos de campo

### vs ERP (Odoo, World Office, Siigo)
- Implementación en días, no meses
- Diseñado Mobile First para campo/bodega
- IA integrada desde el primer día
- Sin consultores ni parametrización compleja

### vs Zoho / Dynamics
- Sin curva de aprendizaje empresarial
- Agentes IA que trabajan de forma proactiva
- Precio justo para mercado latinoamericano
- UI moderna y rápida

### vs Salesforce
- 20x más económico
- Sin Salesforce Administrators requeridos
- Diseñado para PYMEs, no para corporaciones
- Implementación propia sin consultoras

### vs Automatización pura (n8n, Make, Zapier)
- Shelwi no necesita configurarse — ya conoce tu negocio
- Los agentes toman contexto del Knowledge Graph
- Auditoría y trazabilidad nativos
- Simulación antes de ejecutar

## 2.6 Visión a 5 Años

**2026:** Shelwi OS 1.0 — Base arquitectónica sólida, 4 agentes core, planes inteligentes, 3 países.

**2027:** Shelwi OS 2.0 — Marketplace con 20+ agentes especializados, facturación electrónica Colombia/México, API pública, SSO Enterprise.

**2028:** Shelwi OS 3.0 — Modelos IA propios fine-tuned con datos de PYMEs, predicción de demanda, gestión autónoma de operaciones.

**2029:** Shelwi OS 4.0 — 10 países, 100k+ empresas, Shelwi como plataforma de agentes para terceros (Marketplace bidireccional).

**2030:** Shelwi como infraestructura — Cualquier empresa puede montar su negocio sobre Shelwi OS como otros montan sobre AWS.

---

# 3. MASTER EXECUTION PLAN

## 3.1 Estructura del Programa

```
SHELWI OS 1.0
│
├── PROGRAMA 0: Fundamentos (Pre-ejecución)
│   └── 23 entregables de arquitectura base
│
├── PROGRAMA 1: Core Platform (Semanas 1-8)
│   ├── Fase 1: Foundation 2.0
│   ├── Fase 2: Capability Engine
│   ├── Fase 3: Event Bus
│   ├── Fase 4: Tool Registry
│   ├── Fase 5: Enterprise Memory
│   ├── Fase 6: Policy Engine
│   └── Fase 7: AI Orchestrator
│
├── PROGRAMA 2: Intelligence (Semanas 9-10)
│   └── Fase 8: Agentes Core
│
├── PROGRAMA 3: Scale (Semanas 11-12)
│   ├── Fase 9: Enterprise Departments
│   └── Fase 10: Enterprise Experience
│
└── PROGRAMA 4: Platform (Post-Semana 12)
    ├── Fase 11: CMS Enterprise
    ├── Fase 12: Planes Inteligentes
    ├── Fase 13: Integraciones Financieras
    ├── Fase 14: Marketplace
    └── Fase 15: Internacionalización
```

## 3.2 Cronograma Master

| Semana | Programa | Fase | Entregable clave | Estado |
|---|---|---|---|---|
| Pre | 0 | Fundamentos | Architecture Constitution + DS + 23 entregables | 🔴 |
| 1 | 1 | Foundation 2.0 | Deuda técnica eliminada, convenciones, MCP actualizado | 🔴 |
| 2 | 1 | Capability Engine | Schema BD + Registry + primeras 5 Capabilities | 🔴 |
| 3 | 1 | Capability Engine | 15 Capabilities core migradas | 🔴 |
| 4 | 1 | Event Bus | Bus implementado + todos los Capabilities publican eventos | 🔴 |
| 5 | 1 | Tool Registry | 9 Tools core + agentes migrados | 🔴 |
| 6 | 1 | Enterprise Memory | Memory Layer + Knowledge Graph + agentes integrados | 🔴 |
| 7 | 1 | Policy Engine | 4 modos + configuración por empresa | 🔴 |
| 8 | 1 | AI Orchestrator | Orchestrator + orquestación de 3 agentes paralelos | 🔴 |
| 9 | 2 | Agentes Core | Comercial IA + Operaciones IA | 🔴 |
| 10 | 2 | Agentes Core | Finanzas IA + Dirección IA (Daily Brief) | 🔴 |
| 11 | 3 | Departments | 20 departamentos con Capabilities | 🔴 |
| 12 | 3 | Experience | Morning Brief + Centro de Decisiones | 🔴 |
| Post | 4 | Platform | CMS + Planes + Finanzas + Marketplace + i18n | 🔴 |

## 3.3 Ruta Crítica

La ruta crítica del proyecto es la cadena de dependencias que, si se retrasa, retrasa todo el programa:

```
Fase 0 (Fundamentos)
    ↓ [BLOQUEANTE]
Fase 1 (Foundation — limpieza)
    ↓ [BLOQUEANTE]
Fase 2 (Capability Engine)
    ↓ [BLOQUEANTE para Event Bus + Tools]
Fase 3 (Event Bus) ←─── Fase 4 (Tool Registry)
         ↓                        ↓
    Fase 5 (Memory)          Fase 5 (Memory)
              ↘             ↙
           Fase 6 (Policy Engine)
                    ↓
           Fase 7 (AI Orchestrator)
                    ↓
           Fase 8 (Agentes Core)
                    ↓
           Fase 10 (Enterprise Experience)
```

Fases 3 y 4 pueden ejecutarse en paralelo una vez que Fase 2 esté completa.

## 3.4 Prioridades de Ejecución

| Prioridad | Justificación |
|---|---|
| **P0 — Fundamentos** | Sin base no hay escalabilidad |
| **P1 — Capability Engine** | Todo lo demás depende de él |
| **P2 — Tool Registry** | Desbloquea agentes seguros |
| **P3 — Event Bus** | Habilita automatizaciones y auditoría |
| **P4 — Memory + Policy** | Habilita agentes con contexto y autonomía controlada |
| **P5 — AI Orchestrator** | Coordina todo lo anterior |
| **P6 — Agentes Core** | Genera el mayor ROI visible para el usuario |
| **P7 — Experience** | Diferenciador de producto |
| **P8 — Platform** | Monetización y escala |

---

# 4. WORK BREAKDOWN STRUCTURE

## Nivel 1 — Programa

```
SHELWI OS 1.0
```

## Nivel 2 — Fases (16)

```
F0 Fundamentos | F1 Foundation | F2 Capabilities | F3 Events | F4 Tools |
F5 Memory | F6 Policy | F7 Orchestrator | F8 Agents | F9 Departments |
F10 Experience | F11 CMS | F12 Plans | F13 Finance | F14 Marketplace | F15 i18n
```

## Nivel 3 — Epics por Fase

### F0 — Fundamentos

| Epic ID | Epic | Descripción |
|---|---|---|
| E0.1 | Architecture Constitution | Documento de gobierno de todo el desarrollo |
| E0.2 | Mobile First Constitution | Estándar único de UI adaptable |
| E0.3 | Design System | Catálogo completo de componentes |
| E0.4 | Capability Registry Schema | BD y API para registrar Capabilities |
| E0.5 | Tool Registry Schema | BD y API para registrar Tools |
| E0.6 | Knowledge Graph | Modelo de relaciones empresariales en BD |
| E0.7 | Observability Center | Métricas, logs, monitoring |
| E0.8 | Simulation Engine | Dry-run antes de ejecutar automatizaciones |
| E0.9 | Sandbox Environment | Entorno de pruebas por empresa |
| E0.10 | Marketplace Architecture | Diseño de infraestructura de Marketplace |
| E0.11 | Plugin Engine | Sistema de extensión sin modificar Core |
| E0.12 | i18n Architecture | Base de internacionalización |
| E0.13 | API First Standards | Estándar de APIs y documentación |
| E0.14 | Enterprise Security | Roles, permisos, auditoría |
| E0.15 | Configuration Engine | Motor de configuración sin deploy |
| E0.16 | Versioning System | Versionado de Capabilities, Tools, Prompts |
| E0.17 | Offline Engine | Soporte offline + cola de sincronización |
| E0.18 | Sync Engine | Resolución de conflictos |
| E0.19 | AI Cost Center | Panel de consumo IA por empresa |
| E0.20 | ROI Center | Panel de retorno de inversión |
| E0.21 | Native Services Abstraction | Servicios nativos Capacitor abstractos |
| E0.22 | Abstract Services Layer | Capa de abstracción de proveedores externos |
| E0.23 | Enterprise Engines Design | Especificación de los 10 motores del núcleo |

### F2 — Capability Engine

| Epic ID | Epic | Descripción |
|---|---|---|
| E2.1 | Capability Schema | Tablas BD + migrations |
| E2.2 | Capability Registry API | CRUD + invocación + permisos |
| E2.3 | Core Capabilities Migration | 15 Capabilities iniciales |
| E2.4 | Capability Governance | Auditoría + versionado por Capability |

### F3 — Event Bus

| Epic ID | Epic | Descripción |
|---|---|---|
| E3.1 | Event Schema | Tablas BD + migrations |
| E3.2 | Event Bus Core | Publish/Subscribe + reintentos + DLQ |
| E3.3 | Event Subscribers | Automatizaciones, agentes, dashboard, auditoría |
| E3.4 | Event Admin | Dashboard de eventos en Super Admin |

### F4 — Tool Registry

| Epic ID | Epic | Descripción |
|---|---|---|
| E4.1 | Tool Schema | Tablas BD + migrations |
| E4.2 | Tool Registry Core | Registro + consulta + versionado |
| E4.3 | Core Tools | 9 tools iniciales implementadas |
| E4.4 | Agent Migration | Migrar agentes existentes a Tool Registry |

### F5 — Enterprise Memory

| Epic ID | Epic | Descripción |
|---|---|---|
| E5.1 | Memory Schema | Tablas BD por tipo de entidad + migrations |
| E5.2 | Memory Layer | API de lectura/escritura |
| E5.3 | Memory Types | Empresa, clientes, proveedores, productos, etc. |
| E5.4 | Memory Integration | Agentes integrados + write-back |

### F6 — Policy Engine

| Epic ID | Epic | Descripción |
|---|---|---|
| E6.1 | Policy Schema | Tablas BD + migrations |
| E6.2 | Policy Core | 4 modos + herencia empresa→agente→acción |
| E6.3 | Policy UI | Configuración en panel de empresa |

### F7 — AI Orchestrator

| Epic ID | Epic | Descripción |
|---|---|---|
| E7.1 | Orchestrator Core | Motor de coordinación de agentes |
| E7.2 | Orchestrator Protocol | Comunicación Orchestrator ↔ Agentes |
| E7.3 | Orchestrator Integration | Tool Registry + Events + Memory + Policy |
| E7.4 | Orchestrator Dashboard | Panel Super Admin de orquestación |

### F8 — Agentes Core

| Epic ID | Epic | Descripción |
|---|---|---|
| E8.1 | Agente Comercial IA | Seguimiento, cotizaciones, campañas |
| E8.2 | Agente Operaciones IA | Pedidos, OTs, GPS, productividad |
| E8.3 | Agente Finanzas IA | Flujo de caja, cartera, márgenes |
| E8.4 | Agente Dirección IA | Daily Brief ejecutivo |

### F10 — Enterprise Experience

| Epic ID | Epic | Descripción |
|---|---|---|
| E10.1 | Morning Brief | Dashboard inteligente con contexto diario |
| E10.2 | Active Agents Panel | Estado en tiempo real de agentes |
| E10.3 | Alert System | Alertas priorizadas con acciones rápidas |
| E10.4 | Decision Center | Centro único de aprobaciones pendientes |
| E10.5 | Business Health | KPIs en tiempo real |

## Nivel 4 — Features (ejemplo para E2.3)

| Feature ID | Feature | Epic | Descripción |
|---|---|---|---|
| FT-2.3.1 | createClient Capability | E2.3 | Crear cliente con validación, auditoría y evento |
| FT-2.3.2 | searchClient Capability | E2.3 | Búsqueda semántica de clientes |
| FT-2.3.3 | updateClient Capability | E2.3 | Actualización con versionado |
| FT-2.3.4 | deleteClient Capability | E2.3 | Eliminación lógica + evento |
| FT-2.3.5 | createOrder Capability | E2.3 | Pedido con evento y auditoría |
| FT-2.3.6 | createInvoice Capability | E2.3 | Factura con datos fiscales |
| FT-2.3.7 | sendWhatsApp Capability | E2.3 | Mensaje vía AbstractService |
| FT-2.3.8 | sendEmail Capability | E2.3 | Email vía EmailService abstracto |
| FT-2.3.9 | scheduleMeeting Capability | E2.3 | Reunión vía CalendarService abstracto |
| FT-2.3.10 | createTask Capability | E2.3 | Tarea con asignación y notificación |
| FT-2.3.11 | createContract Capability | E2.3 | Contrato con versioning |
| FT-2.3.12 | registerPayment Capability | E2.3 | Pago con conciliación |
| FT-2.3.13 | generateReport Capability | E2.3 | Reporte bajo demanda |
| FT-2.3.14 | queryInventory Capability | E2.3 | Consulta de inventario en tiempo real |
| FT-2.3.15 | registerPurchase Capability | E2.3 | Compra con proveedor y OC |

## Nivel 5 — Historias de Usuario (ejemplo para FT-2.3.1)

| Historia ID | Historia | Criterios de aceptación |
|---|---|---|
| US-2.3.1.1 | Como agente IA, quiero crear un cliente invocando la Capability, sin acceder a la BD directamente | La Capability valida permisos, inserta en BD, publica evento `client.created`, registra auditoría |
| US-2.3.1.2 | Como automatización, quiero crear un cliente tras detectar un lead nuevo en WhatsApp | La automatización invoca la Capability `createClient` y recibe el ID del cliente creado |
| US-2.3.1.3 | Como usuario, quiero crear un cliente desde la UI y que la acción quede auditada | La UI llama a la Capability, el registro aparece en el audit log con timestamp y user_id |

## Nivel 6 — Tasks (ejemplo para US-2.3.1.1)

| Task ID | Task | Estimado |
|---|---|---|
| T-2.3.1.1.1 | Diseñar schema de tabla `capabilities` | 2h |
| T-2.3.1.1.2 | Crear migration SQL `0150_capability_engine.sql` | 1h |
| T-2.3.1.1.3 | Ejecutar migration vía CLI Supabase | 30m |
| T-2.3.1.1.4 | Implementar función `invokeCapability(id, inputs, context)` | 4h |
| T-2.3.1.1.5 | Implementar validación de permisos en `invokeCapability` | 2h |
| T-2.3.1.1.6 | Implementar publicación de evento tras invocación exitosa | 1h |
| T-2.3.1.1.7 | Implementar registro en `audit_log` por cada invocación | 1h |
| T-2.3.1.1.8 | Migrar lógica de `createClient` de `src/services/clients.ts` a Capability | 3h |
| T-2.3.1.1.9 | Actualizar la UI para llamar a Capability en lugar de service directo | 2h |
| T-2.3.1.1.10 | Escribir tests unitarios de la Capability | 2h |
| T-2.3.1.1.11 | Escribir tests de integración (BD real) | 2h |
| T-2.3.1.1.12 | Actualizar documentación en `docs/CAPABILITY_REGISTRY.md` | 1h |
| T-2.3.1.1.13 | Actualizar MCP Memory con decisión tomada | 30m |

## Nivel 7 — Checklist (Definition of Done para cada task)

Ver sección 13 — Definition of Done.

---

# 5. DEPENDENCY MAP

## 5.1 Mapa de Dependencias Críticas

```
[E0.4 Capability Registry Schema]
        │
        ▼
[E2.1 Capability Schema BD] ──────────────────────────────┐
        │                                                   │
        ▼                                                   │
[E2.2 Capability Registry API]                             │
        │                                                   │
        ▼                                                   ▼
[E2.3 Core Capabilities Migration] ──── [E0.5 Tool Registry Schema]
        │                                        │
        ▼                                        ▼
[E3.1 Event Schema] ◄──────────── [E4.1 Tool Schema BD]
        │                                  │
        ▼                                  ▼
[E3.2 Event Bus Core]          [E4.2 Tool Registry Core]
        │     │                       │        │
        │     └──── PARALELO ─────────┘        │
        ▼                                       ▼
[E5.1 Memory Schema] ◄──────── [E4.3 Core Tools]
        │
        ▼
[E5.2 Memory Layer]
        │
        ▼
[E6.1 Policy Schema]
        │
        ▼
[E6.2 Policy Engine Core]
        │
        ▼
[E7.1 AI Orchestrator Core] ◄─ (Tool Registry + Event Bus + Memory)
        │
        ▼
[E8.1-4 Agentes Core]
        │
        ▼
[E10.1-5 Enterprise Experience]
```

## 5.2 Qué puede ejecutarse en paralelo

Una vez que **Fase 2 está completa**, pueden ejecutarse simultáneamente:
- Fase 3 (Event Bus) ↔ Fase 4 (Tool Registry)

Una vez que **Fases 3 y 4 están completas**:
- Fase 5 (Memory) puede comenzar

Durante **Fase 9 (Departments)**, puede avanzar en paralelo:
- Diseño visual de **Fase 10 (Experience)**

**Fase 0 (Fundamentos)** tiene entregables independientes entre sí que pueden desarrollarse en paralelo:
- E0.1, E0.2, E0.3 son documentación — pueden ir juntos
- E0.19, E0.20 (Cost Center + ROI) son independientes del núcleo
- E0.21, E0.22 (Native Services + Abstract Layer) son independientes entre sí

## 5.3 Bloqueantes absolutos

| Bloqueante | Qué bloquea | Por qué |
|---|---|---|
| Fase 0 completa | Todo lo demás | Sin arquitectura definida, todo lo que se construya será inconsistente |
| Capability Engine (Fase 2) | Event Bus, Tool Registry, Memory, Policy, Orchestrator, Agentes | Todo el núcleo depende de Capabilities |
| Tool Registry (Fase 4) | Agentes Core | Ningún agente puede construirse sin Tool Registry |
| Policy Engine (Fase 6) | Agentes Core | Los agentes necesitan saber qué pueden hacer autónomamente |
| AI Orchestrator (Fase 7) | Agentes Core coordinados | Sin Orchestrator, los agentes son silos independientes |
| Migration 0028 (Dashboard Widgets) | Dashboard Builder funcional | Las tablas no existen en producción |

---

# 6. SPRINT PLAN

> **Convención:** Un Sprint = 1 semana de trabajo. Cada sprint tiene Definition of Done propio.
> El Sprint 0 cubre la Fase 0 (Fundamentos). No tiene límite de semanas — no se avanza sin completarlo.

## Sprint 0 — Fundamentos Arquitectónicos

**Objetivo:** Construir la base. Sin código de negocio. Sin pantallas nuevas.

**Entregables obligatorios:**
- Architecture Constitution v1.0 (`docs/ARCHITECTURE_CONSTITUTION.md`)
- Mobile First Constitution (`docs/MOBILE_FIRST_CONSTITUTION.md`)
- Enterprise Design System documentado (`docs/DESIGN_SYSTEM.md`)
- Capability Registry Schema (migration SQL lista)
- Tool Registry Schema (migration SQL lista)
- Knowledge Graph Schema (migration SQL lista)
- Observability Center (specification)
- Abstract Services Layer (interfaces TypeScript)
- Enterprise Engines specification (`docs/ENGINES.md`)
- MCP Memory completamente actualizado

**Criterio de cierre:** Los 13 checks de validación de Fase 0 están en verde.

**No iniciar Sprint 1 hasta que Sprint 0 esté 100% completo.**

---

## Sprint 1 — Foundation 2.0

**Objetivo:** Limpiar la arquitectura existente. Zero deuda técnica nueva.

**Entregables:**
- Auditoría de deuda técnica completada y documentada
- Componentes duplicados eliminados
- Servicios/hooks duplicados eliminados
- Versionado semántico establecido en `package.json`
- `docs/CONVENTIONS.md` publicado
- Arquitectura actual documentada en MCP Memory
- Migration 0028 (Dashboard Widgets) **ejecutada** en Supabase
- Dashboard Enterprise validado visualmente en todos los breakpoints

**Dependencias:** Sprint 0 completo.

**Criterio de cierre:** `npm run lint` sin warnings. Dashboard funcional. MCP Memory actualizado.

---

## Sprint 2 — Capability Engine (Parte 1)

**Objetivo:** Capability Registry operativo + primeras 5 Capabilities.

**Entregables:**
- Migration `0150_capability_engine.sql` ejecutada
- Capability Registry API implementada (`invokeCapability`, permisos, auditoría)
- Capabilities: `createClient`, `searchClient`, `updateClient`, `deleteClient`, `createOrder`
- Cada Capability: validación + evento + auditoría

**Dependencias:** Sprint 1 completo.

---

## Sprint 3 — Capability Engine (Parte 2)

**Objetivo:** Completar las 15 Capabilities core.

**Entregables:**
- Capabilities: `createInvoice`, `sendWhatsApp`, `sendEmail`, `scheduleMeeting`, `createTask`
- Capabilities: `createContract`, `registerPayment`, `generateReport`, `queryInventory`, `registerPurchase`
- UI migrada para llamar Capabilities en lugar de services directos
- Tests de integración para cada Capability

**Dependencias:** Sprint 2 completo.

---

## Sprint 4 — Enterprise Event Bus

**Objetivo:** Todo genera eventos. Nada se ejecuta "porque sí".

**Entregables:**
- Migration `0151_event_bus.sql` ejecutada
- Event Bus implementado (publish/subscribe)
- Todos los Capabilities publican eventos
- Suscriptores: automatizaciones, agentes, dashboard, auditoría
- Dead letter queue + sistema de reintentos
- Dashboard de eventos en Super Admin

**Dependencias:** Sprint 3 completo. (Puede iniciarse en paralelo con Sprint 5 una vez que el schema de Capabilities esté listo)

---

## Sprint 5 — Tool Registry

**Objetivo:** Agentes solo usan Tools. Cero SQL directo.

**Entregables:**
- Migration `0152_tool_registry.sql` ejecutada
- Tool Registry implementado
- 9 Tools core implementadas
- Middleware de bloqueo de SQL directo desde agentes
- Agentes existentes migrados a Tool Registry
- Documentación de cada Tool

**Dependencias:** Sprint 3 completo. (Puede ejecutarse en paralelo con Sprint 4)

---

## Sprint 6 — Enterprise Memory

**Objetivo:** La plataforma recuerda. Los agentes tienen contexto.

**Entregables:**
- Migration `0153_memory_engine.sql` ejecutada
- Memory Layer implementada (lectura/escritura)
- 9 tipos de memoria implementados
- Knowledge Graph integrado
- Agentes consultan Memory antes de actuar
- Write-back automático tras decisiones

**Dependencias:** Sprints 4 y 5 completos.

---

## Sprint 7 — Policy Engine

**Objetivo:** Cada empresa controla la autonomía de sus agentes.

**Entregables:**
- Migration `0154_policy_engine.sql` ejecutada
- 4 modos implementados: Observador / Asistente / Semi Autónomo / Autónomo
- Configuración por empresa + por agente + por Capability
- UI en panel de empresa
- Historial de cambios auditado

**Dependencias:** Sprint 6 completo.

---

## Sprint 8 — AI Orchestrator

**Objetivo:** Cerebro coordinador de agentes funcional.

**Entregables:**
- AI Orchestrator core implementado
- Integración completa con Tool Registry + Event Bus + Memory + Policy
- Orquestación de ≥3 agentes en paralelo validada
- División de objetivos en tareas atómicas
- Dashboard de orquestación para Super Admin
- Logs de razonamiento del Orchestrator

**Dependencias:** Sprint 7 completo.

---

## Sprint 9 — Agentes Core (Parte 1)

**Objetivo:** Agente Comercial IA + Agente Operaciones IA funcionales.

**Entregables:**
- Agente Comercial IA: seguimiento + cotizaciones + campañas + recordatorios + oportunidades
- Agente Operaciones IA: pedidos + OTs + GPS + productividad + riesgos
- Ambos integrados con Tool Registry + Memory + Policy + Event Bus
- Auditoría completa de cada acción

**Dependencias:** Sprint 8 completo.

---

## Sprint 10 — Agentes Core (Parte 2)

**Objetivo:** Agente Finanzas IA + Agente Dirección IA funcionales.

**Entregables:**
- Agente Finanzas IA: flujo de caja + cartera + márgenes + costos
- Agente Dirección IA: Daily Brief diario (qué pasó / qué preocupa / qué recomienda / qué hacer hoy)
- Todos los agentes auditados y testeados

**Dependencias:** Sprint 9 completo.

---

## Sprint 11 — Enterprise Departments

**Objetivo:** 20 departamentos con Capabilities definidas.

**Entregables:**
- Capabilities de los 20 departamentos registradas en BD y activas
- Cada departamento: mínimo 3 Capabilities operativas
- Documentación completa en `docs/CAPABILITY_REGISTRY.md`

**Dependencias:** Sprint 5 completo. (Puede ejecutarse parcialmente en paralelo con sprints 9-10)

---

## Sprint 12 — Enterprise Experience

**Objetivo:** El usuario no ve un ERP — ve un asistente inteligente.

**Entregables:**
- Morning Brief / Dashboard Inteligente completo
- Panel de Agentes Activos en tiempo real
- Sistema de Alertas priorizadas
- Centro de Decisiones (aprobaciones pendientes)
- Vista de Salud Empresarial
- Responsive Mobile → Desktop validado en todos los breakpoints

**Dependencias:** Sprint 10 completo.

---

## Sprints Post-12 — Platform

Fases 11-15 se planifican en detalle al inicio de cada una, siguiendo el mismo formato.

---

# 7. TASK TEMPLATE

## Formato Oficial de Tarea

Toda tarea creada en este proyecto debe usar este formato. Una tarea que no cumpla este formato no puede comenzarse.

```markdown
---
TASK ID: [FASE]-[EPIC]-[FEATURE]-[SECUENCIA]
  Ejemplo: T-2.3.1.1.4
---

## Nombre
[Nombre corto y preciso en modo imperativo]
Ejemplo: "Implementar función invokeCapability con validación de permisos"

## Descripción
[Qué hay que hacer, por qué, y qué problema resuelve. 2-5 líneas.]

## Epic
[E2.2 Capability Registry API]

## Feature
[FT-2.2.1 Core Invocation Function]

## Capability relacionada
[Nombre de la Capability que crea, modifica o usa esta tarea. "N/A" si no aplica]

## Departamento
[Tecnología / Comercial / Operaciones / etc.]

## Prioridad
[P0 Critical | P1 High | P2 Medium | P3 Low | P4 Future]

## Impacto si no se hace
[Qué falla o qué bloquea si esta tarea no se completa]

## Riesgo de implementación
[Alto | Medio | Bajo — con justificación]

## Tiempo estimado
[Xh / Xd]

## Dependencias (debe estar completo antes de iniciar)
- [ ] [TASK ID anterior]
- [ ] [Otro TASK ID]

## Skills a usar
[Listar Skills del sistema que deben consultarse antes de implementar]
- [ ] shelwi-development-standard
- [ ] security-review (si toca autenticación o BD)
- [ ] database-review (si crea/modifica tablas)

## Consultar MCP Memory antes de iniciar
- [ ] ¿Existe algo similar ya implementado?
- [ ] ¿Hay una decisión previa de arquitectura que aplique?
- [ ] ¿Qué convenciones debo seguir?

## Actualizar MCP Memory al terminar
- [ ] Decisión de arquitectura tomada: [describir]
- [ ] Nueva Capability/Tool/patrón creado: [describir]

## Documentación requerida
- [ ] `docs/[archivo]` actualizado
- [ ] Código comentado donde el WHY no es obvio
- [ ] OpenAPI actualizado (si es endpoint)

## Tests requeridos
- [ ] Test unitario del caso feliz
- [ ] Test unitario de casos de error
- [ ] Test de integración con BD real
- [ ] Test E2E (si aplica)

## Definition of Done
Ver sección 13. Marcar todos los ítems antes de cerrar la tarea:
- [ ] Código implementado
- [ ] Tests pasando (cobertura ≥70%)
- [ ] Sin warnings en TypeScript
- [ ] Sin warnings en ESLint
- [ ] Documentación actualizada
- [ ] MCP Memory actualizado
- [ ] Auditoría registrada (si la acción lo requiere)
- [ ] Responsive validado (si es UI)
- [ ] Capacitor compatible (si toca APIs del dispositivo)
- [ ] Performance validada (<2s en 4G para UI)
- [ ] Seguridad revisada (si toca auth/permisos/BD)
- [ ] Accessibilidad AA (si es UI)

## Responsable
[Claude Agent | Desarrollador humano | Ambos]

## Estado
[ ] Pendiente | [~] En progreso | [x] Completada | [!] Bloqueada | [-] Descartada
```

---

# 8. PRIORITY MATRIX

## Criterios de Clasificación

| Criterio | Descripción |
|---|---|
| **Impacto en arquitectura** | ¿Bloquea otras fases si falta? |
| **Impacto en usuario** | ¿El usuario final nota la diferencia? |
| **Riesgo de deuda técnica** | ¿Si no se hace ahora, costará 10x más después? |
| **ROI de negocio** | ¿Genera ingresos o retiene clientes? |
| **Seguridad** | ¿Expone vulnerabilidades si no se hace? |

## Niveles de Prioridad

### P0 — Critical (debe hacerse ahora, bloquea todo)

| Tarea | Razón |
|---|---|
| Ejecutar migration 0028 en Supabase | Dashboard Builder no funciona sin las tablas |
| Implementar Capability Engine | Toda la arquitectura depende de él |
| Implementar Tool Registry | Agentes actuales son inseguros sin él |
| Eliminar queries SQL directas desde agentes | Riesgo de seguridad y auditoría |
| Architecture Constitution | Sin ella, todo el desarrollo futuro es improvisado |

### P1 — High (debe hacerse en el sprint actual o el siguiente)

| Tarea | Razón |
|---|---|
| Event Bus | Habilita automatizaciones y auditoría real |
| Enterprise Memory | Sin memoria, los agentes no tienen contexto |
| Policy Engine | Los agentes necesitan control de autonomía |
| AI Orchestrator | Coordina los agentes core |
| Eliminar `if(plan===...)` del código | Bloquea planes flexibles |
| Abstract Services Layer | Sin ella, los proveedores están hardcoded |

### P2 — Medium (planificado en el sprint siguiente)

| Tarea | Razón |
|---|---|
| Agentes Core (4) | Mayor ROI pero depende de P0+P1 |
| Enterprise Experience / Morning Brief | Diferenciador de producto |
| Internacionalización base | Necesario para expansión |
| CMS Enterprise | Habilita configuración sin deploy |
| Simulation Engine | Reduce errores en automatizaciones |

### P3 — Low (backlog para después de Semana 12)

| Tarea | Razón |
|---|---|
| Sandbox Environment | Útil pero no bloqueante |
| ROI Center | Valor para upsell, no urgente |
| Marketplace | Depende de que todo lo demás esté maduro |
| Offline Engine completo | Casos de uso específicos de campo |

### P4 — Future (Post v1.0, no en roadmap actual)

| Tarea | Razón |
|---|---|
| Facturación electrónica DIAN | Complejidad regulatoria alta |
| Nómina completa | Alcance fuera de v1.0 |
| Modelos IA propios | Requiere datos masivos y presupuesto |
| White-label | Complejidad de multi-tenancy adicional |

---

# 9. RISK REGISTER

## Formato de Riesgo

| Campo | Descripción |
|---|---|
| ID | Identificador único |
| Descripción | Qué puede salir mal |
| Probabilidad | Alta / Media / Baja |
| Impacto | Crítico / Alto / Medio / Bajo |
| Nivel | (Probabilidad × Impacto) |
| Mitigación | Qué hacer para evitarlo |
| Plan B | Qué hacer si ocurre |
| Owner | Responsable de monitorear |
| Estado | Activo / Mitigado / Cerrado |

---

| ID | Descripción | Probabilidad | Impacto | Nivel | Mitigación | Plan B | Estado |
|---|---|---|---|---|---|---|---|
| **R01** | Migration 0028 pendiente en Supabase — tablas de Dashboard Builder no existen en producción | Alta | Alto | 🔴 CRÍTICO | Ejecutar como primera tarea del Sprint 1 | Usar `as any` temporalmente hasta ejecutar | Activo |
| **R02** | Agentes IA actuales ejecutan queries SQL directas sin Tool Registry | Alta | Crítico | 🔴 CRÍTICO | Implementar Tool Registry en Sprint 5 + middleware bloqueador | Auditar queries existentes y documentarlas | Activo |
| **R03** | Verificaciones de plan hardcoded (`if(plan===...)`) en todo el código | Alta | Alto | 🔴 ALTO | Auditarse en Sprint 1, migrar en Fase 12 | Refactoring incremental por módulo | Activo |
| **R04** | Ausencia de test suite formal — cambios pueden romper features sin detectarse | Alta | Alto | 🔴 ALTO | Implementar tests en cada Sprint desde Sprint 2 | Revisar manualmente cada feature antes de release | Activo |
| **R05** | SSL issues en entorno de desarrollo — `npm install` puede fallar | Media | Medio | 🟡 MEDIO | `.npmrc` con `strict-ssl=false` ya documentado en tech_fixes | Usar flag `--strict-ssl=false` en cada install | Activo |
| **R06** | Duplicación de lógica de negocio en múltiples services — inconsistencias silenciosas | Alta | Alto | 🔴 ALTO | Auditoría en Sprint 1, migrar a Capabilities | Documentar duplicados y consolidar | Activo |
| **R07** | MCP Memory no disponible en una sesión — agente toma decisiones sin contexto previo | Media | Alto | 🟡 ALTO | Documentar decisiones críticas también en `docs/` | Revisar EPMO + roadmap al inicio de cada sesión | Activo |
| **R08** | Cambio de API en Supabase (Edge Functions / Auth) rompe integraciones | Baja | Crítico | 🟡 MEDIO | Abstract Services Layer aísla el riesgo | Mantener versión de `@supabase/supabase-js` fija hasta validar | Activo |
| **R09** | Cambio de precios o modelo de Claude API afecta el AI Cost Center | Media | Medio | 🟡 MEDIO | IAService abstracto + configuración de modelo en CMS | Tener al menos 2 modelos configurados como fallback | Activo |
| **R10** | Capacitor versión 8.x introduce breaking changes en APIs nativas | Baja | Medio | 🟢 BAJO | Abstract Native Services aísla el riesgo | Congelar versión de Capacitor hasta validar nueva | Activo |
| **R11** | Diseño de Capability Engine sin compatibilidad con el schema existente (migration 0148) | Media | Crítico | 🟡 ALTO | Revisar migration 0148 antes de diseñar E2.1 | Extender schema existente en lugar de reemplazar | Activo |
| **R12** | Performance degradada por Event Bus en alta concurrencia | Baja | Alto | 🟢 BAJO | Implementar cola asíncrona + Dead Letter Queue | Rate limiting + circuit breaker | Activo |
| **R13** | Componentes UI creados fuera del Design System — inconsistencia visual | Alta | Medio | 🟡 MEDIO | DS documentado en Sprint 0, Linter/review en cada PR | Auditoría de UI antes de cada release | Activo |

---

# 10. TECHNICAL DEBT REGISTER

## Deuda Técnica Conocida al 2026-07-13

| ID | Descripción | Motivo | Impacto | Prioridad | Acción requerida | Sprint |
|---|---|---|---|---|---|---|
| **TD01** | Migration 0028 (`dashboard_widgets`) pendiente de ejecutar en Supabase | Se creó en código pero no se aplicó en la BD real | Dashboard Builder no funciona | P0 | Ejecutar migration en Supabase SQL Editor | Sprint 1 |
| **TD02** | Queries SQL directas desde agentes IA (sin Tool Registry) | Tool Registry no existía cuando se construyeron los agentes | Inseguro, no auditable, no reusable | P0 | Migrar a Tool Registry en Sprint 5 | Sprint 5 |
| **TD03** | Plan checks con `if(plan === "premium")` hardcoded en múltiples archivos | Sistema de planes basado en strings, no en BD | Planes no configurables, difícil de cambiar | P1 | Auditar en Sprint 1, migrar en Fase 12 | Fase 12 |
| **TD04** | `company.logo_path` (no `.logo`) — diferencia entre convención y uso real | Refactor incompleto de campo | Bugs silenciosos en logo display | P2 | Grep y corregir todas las referencias | Sprint 1 |
| **TD05** | `useUIContext` en algunos archivos en lugar de `useUI()` | Refactor incompleto del hook | Error en runtime si el nombre cambia | P2 | Grep y corregir todas las referencias | Sprint 1 |
| **TD06** | `as any` en `dashboardWidgets.ts` (tablas sin tipos generados) | Migration 0028 pendiente | TypeScript sin protección de tipos | P0 | Ejecutar migration 0028 + regenerar tipos Supabase | Sprint 1 |
| **TD07** | Lógica de negocio duplicada entre `src/services/clients.ts` y CRM service | Evolución sin refactoring | Bugs inconsistentes entre flujos | P1 | Consolidar en Capability `createClient` | Sprint 2-3 |
| **TD08** | Ausencia de test suite formal (sin cobertura medida) | Velocidad de desarrollo inicial | Regresiones silenciosas | P1 | Implementar suite de tests desde Sprint 2 | Sprint 2+ |
| **TD09** | `baseUrl` deprecated en tsconfig (warning TS5101) | TypeScript 6 cambió la API | Warnings en build | P3 | Agregar `"ignoreDeprecations": "6.0"` | Sprint 1 |
| **TD10** | Schema de `ai_orchestrator` (migration 0143) sin implementación frontend completa | Schema creado pero no consumido | Feature incompleto en producción | P1 | Conectar con AI Orchestrator en Sprint 8 | Sprint 8 |
| **TD11** | Componentes de UI sin documentación en Design System | DS no fue documentado formalmente | Duplicación de componentes | P1 | Auditar y documentar en Sprint 0 | Sprint 0 |
| **TD12** | No existe Abstract Services Layer — providers llamados directamente | Arquitectura inicial sin abstracción | Difícil cambiar de proveedor | P1 | Implementar en Sprint 0 (E0.22) | Sprint 0 |
| **TD13** | Nombres de plan en UI hardcoded (Free/Pro/Premium) — nuevos nombres: Start/Growth/Business OS | Rebranding no aplicado | Inconsistencia entre UI y promesa comercial | P2 | Migrar en Fase 12 al motor de planes | Fase 12 |

---

# 11. ARCHITECTURE DECISION RECORDS

> Un ADR documenta una decisión arquitectónica importante: por qué se tomó, qué alternativas se consideraron y qué consecuencias tiene. Toda decisión significativa debe tener su ADR.

## ADR-001 — Supabase como Backend Principal

**Fecha:** Pre-2026 (decisión preexistente)
**Estado:** Aceptado

**Contexto:** Se necesita un backend con BD relacional, autenticación, storage, funciones serverless y soporte para multi-tenant con RLS.

**Problema:** Elegir entre construir backend propio vs. usar un BaaS.

**Alternativas consideradas:**
- Firebase (no relacional, limitado para queries complejas)
- Backend propio en Node.js (más tiempo, más costo)
- PlanetScale + Auth0 (complejidad de múltiples proveedores)

**Decisión:** Supabase — PostgreSQL + Auth + Edge Functions + Storage + RLS nativo.

**Consecuencias:**
- (+) Velocidad de desarrollo alta
- (+) RLS para multi-tenant sin código adicional
- (+) Migraciones versionadas en `supabase/migrations/`
- (-) Dependencia de vendor — mitigada con Abstract Services Layer
- (-) Edge Functions limitadas a Deno — mitigada manteniendo lógica en Capabilities

---

## ADR-002 — Capacitor como Estrategia Mobile

**Fecha:** Pre-2026 (decisión preexistente)
**Estado:** Aceptado

**Contexto:** Shelwi necesita ser usable en Android e iOS sin duplicar el codebase.

**Alternativas:**
- React Native (codebase separado)
- Flutter (lenguaje nuevo, equipo diferente)
- PWA puro (limitaciones de notificaciones push, cámara)

**Decisión:** Capacitor 8 — mismo código React, APIs nativas abstractas.

**Consecuencias:**
- (+) Un solo codebase para Web + Android + iOS
- (+) Acceso a GPS, cámara, push notifications, storage local
- (+) Dexie para offline storage ya integrado
- (-) Algunas APIs nativas requieren plugins específicos
- (-) Build process más complejo que web puro

---

## ADR-003 — Capability-First Architecture

**Fecha:** 2026-07-13
**Estado:** Aceptado — OBLIGATORIO

**Contexto:** El codebase tiene lógica de negocio dispersa en servicios, hooks, components y Edge Functions. Esto hace difícil la reutilización por agentes IA y automatizaciones.

**Problema:** ¿Cómo organizar la lógica de negocio para que sea reutilizable por humanos, agentes y automatizaciones?

**Alternativas:**
- Service layer convencional (ya existe, no resuelve el problema)
- GraphQL schema como contrato (complejidad sin beneficio claro)
- Event-driven architecture pura (dificulta trazabilidad)

**Decisión:** Capability-First — toda acción de negocio es una Capability registrada en BD con ID, permisos, eventos, auditoría y Tool API.

**Consecuencias:**
- (+) Toda acción es invocable desde Web, API, Agente, Automatización
- (+) Permisos centralizados — un solo lugar para controlar acceso
- (+) Auditoría automática en cada invocación
- (+) Versionado de Capabilities independiente del deploy
- (-) Requiere refactoring de services existentes (costo inicial)
- (-) Mayor overhead por invocación vs. llamada directa (aceptable)

---

## ADR-004 — Tool Registry como Capa de Agentes

**Fecha:** 2026-07-13
**Estado:** Aceptado — OBLIGATORIO

**Contexto:** Los agentes IA actualmente pueden ejecutar cualquier query SQL, lo que es inseguro, no auditable y no reutilizable.

**Decisión:** Todo agente IA solo puede interactuar con el mundo a través del Tool Registry. Cero acceso directo a BD.

**Consecuencias:**
- (+) Acciones de agentes son auditables y trazables
- (+) Fácil limitar qué puede hacer un agente (permisos en Tool Registry)
- (+) Tools son reutilizables entre agentes
- (-) Requiere migrar agentes existentes (deuda técnica identificada)

---

## ADR-005 — Event Bus sobre Llamadas Directas

**Fecha:** 2026-07-13
**Estado:** Aceptado

**Contexto:** Las automatizaciones y agentes necesitan reaccionar a cambios en la plataforma sin polling ni acoplamiento directo.

**Decisión:** Toda Capability publica un evento al completarse. Automatizaciones, agentes y dashboard se suscriben a eventos relevantes.

**Consecuencias:**
- (+) Desacoplamiento total entre productores y consumidores
- (+) Auditoría de cada cambio en el sistema
- (+) Nuevas automatizaciones sin modificar código de Capabilities
- (-) Mayor complejidad de debugging (eventos asíncronos)
- (-) Necesita Dead Letter Queue para eventos no procesados

---

## ADR-006 — canUse() vs if(plan===)

**Fecha:** 2026-07-13
**Estado:** Aceptado — OBLIGATORIO

**Contexto:** Los planes de Shelwi están hardcoded en el código. Cambiar un límite requiere deploy.

**Decisión:** Implementar función `canUse(feature)` y `getLimit(resource)` que consultan BD. Eliminar toda verificación de plan en código.

**Consecuencias:**
- (+) Super Admin puede cambiar planes sin deploy
- (+) Nuevos planes sin modificar código
- (+) A/B testing de planes configurable
- (-) Latencia adicional por consulta a BD (mitigada con caché)

---

## ADR-007 — shadcn/ui + Tailwind como Design System Base

**Fecha:** Pre-2026 (decisión preexistente)
**Estado:** Aceptado

**Contexto:** Se necesita una librería de componentes robusta, personalizable y mantenida.

**Decisión:** shadcn/ui (componentes copiados, no instalados como dependency) + Tailwind v3 + estilos inline para variaciones específicas de Shelwi.

**Consecuencias:**
- (+) Control total sobre los componentes (no son black box)
- (+) Tailwind para utilidades + inline styles para brand
- (-) Cada componente nuevo requiere incorporarlo al DS antes de usarlo
- (-) `npx shadcn@latest add` falla por SSL — crear componentes manualmente

---

## ADR-008 — Single Codebase Responsive vs Versiones Separadas

**Fecha:** 2026-07-13
**Estado:** Aceptado — OBLIGATORIO

**Contexto:** ¿Mantener una versión mobile y una desktop separadas, o una sola UI adaptable?

**Decisión:** Una sola UI adaptable con breakpoints oficiales. Mobile First en diseño. Sin layouts paralelos — solo reorganización inteligente del mismo contenido.

**Consecuencias:**
- (+) Un solo codebase para mantener
- (+) Consistencia de experiencia entre dispositivos
- (+) Capacitor usa el mismo código
- (-) Mayor complejidad en el diseño de cada pantalla
- (-) Requiere probar en 7 breakpoints en lugar de 2

---

# 12. QUALITY GATES

> Un Quality Gate es una barrera que debe superarse antes de avanzar a la siguiente fase. Si un Gate falla, el desarrollo se detiene hasta resolverlo.

## Gate 0 — Fundamentos (Pre-Sprint 1)

**Obligatorio antes de:** Cualquier desarrollo de Fase 1+

| Check | Criterio | Validado por |
|---|---|---|
| Architecture Constitution publicada | `docs/ARCHITECTURE_CONSTITUTION.md` existe y tiene las 16 reglas | Revisión manual |
| Mobile First Constitution publicada | `docs/MOBILE_FIRST_CONSTITUTION.md` existe | Revisión manual |
| Design System documentado | `docs/DESIGN_SYSTEM.md` con todos los componentes | Revisión manual |
| Schemas de BD listos | SQL de Capability Registry + Tool Registry + Knowledge Graph preparados | Revisión manual |
| MCP Memory actualizado | Todas las decisiones de Sprint 0 en MCP Memory | Revisión manual |

---

## Gate 1 — Foundation (Fin Sprint 1)

**Obligatorio antes de:** Sprint 2

| Check | Criterio | Validado por |
|---|---|---|
| Zero deuda técnica nueva | 0 items nuevos en Technical Debt Register | Revisión EPMO |
| Migration 0028 ejecutada | Tablas de dashboard en Supabase existen | `\dt` en SQL Editor |
| ESLint limpio | `npm run lint` sin warnings ni errores | CI |
| TypeScript limpio | `tsc --noEmit` sin errores | CI |
| Dashboard funcional | Dashboard Builder funciona en todos los breakpoints | Test manual |

---

## Gate 2 — Core Architecture (Fin Sprint 3)

**Obligatorio antes de:** Sprint 4

| Check | Criterio | Validado por |
|---|---|---|
| Capability Engine operativo | `invokeCapability()` funciona y audita | Test de integración |
| 15 Capabilities migradas | Todas las Capabilities core en BD y activas | Query a tabla `capabilities` |
| Auditoría activa | Cada invocación genera registro en `audit_log` | Test de integración |
| Tests de Capabilities | Cobertura ≥70% en cada Capability | `npm run test` |
| Sin SQL directo en services | Código migrado a Capabilities | Revisión + grep |

---

## Gate 3 — Event + Tool (Fin Sprint 5)

**Obligatorio antes de:** Sprint 6

| Check | Criterio | Validado por |
|---|---|---|
| Event Bus operativo | Events publicados y suscritos correctamente | Test de integración |
| Tool Registry operativo | 9 Tools registradas y funcionales | Test de integración |
| 0 SQL directo desde agentes | Middleware de bloqueo activo | Test automatizado |
| Dead Letter Queue funcional | Eventos fallidos van a DLQ | Test de integración |

---

## Gate 4 — Intelligence (Fin Sprint 8)

**Obligatorio antes de:** Sprint 9

| Check | Criterio | Validado por |
|---|---|---|
| Memory Layer operativo | Lectura/escritura por tipo de entidad | Test de integración |
| Policy Engine operativo | 4 modos configurables por empresa | Test manual |
| AI Orchestrator funcional | Orquestación de 3 agentes en paralelo | Test de integración |
| Write-back de memoria | Decisiones de agentes se escriben en Memory | Test de integración |

---

## Gate 5 — Agents (Fin Sprint 10)

**Obligatorio antes de:** Sprint 11

| Check | Criterio | Validado por |
|---|---|---|
| 4 Agentes Core funcionales | Cada agente ejecuta ≥3 acciones autónomas | Test de integración |
| Auditoría de agentes | Cada acción de agente en `audit_log` | Query a BD |
| Policy Engine respetado | Agentes en modo Observador no ejecutan | Test manual |
| Daily Brief funcional | Dirección IA genera briefing diario | Test manual |

---

## Gate 6 — Experience (Fin Sprint 12)

**Obligatorio antes de:** Fase 11+

| Check | Criterio | Validado por |
|---|---|---|
| Morning Brief funcional | 5 widgets de acción visibles | Test manual |
| Performance <2s | Carga en todos los breakpoints en <2s en 4G simulado | Lighthouse |
| Responsive validado | Sin overflow ni elementos rotos en 7 breakpoints | Test visual |
| Capacitor funcional | App carga en Android/iOS sin errores | Test en dispositivo |
| Accesibilidad AA | Contraste y navegación por teclado | axe DevTools |

---

## Gate 7 — Production (Pre-Release)

**Obligatorio antes de:** Cualquier release a producción

Usar la Skill `/production-readiness` que cubre:
- Build exitoso
- Lint sin warnings
- TypeScript sin errores
- Tests pasando
- Performance validada
- RLS validado
- Migraciones revisadas
- Secretos seguros
- CSP configurado
- Error boundaries en su lugar
- Logging y monitoring activo

---

# 13. DEFINITION OF DONE

> Una tarea NO está terminada hasta que **todos** estos puntos estén cumplidos.
> No hay excepciones. No hay "casi listo".

## DoD Universal (toda tarea)

### Código
- [ ] Implementación completa del comportamiento descrito
- [ ] Sin `console.log`, `debugger`, `TODO`, `FIXME` sin issue asociado
- [ ] Sin código comentado innecesariamente
- [ ] Sin `as any` a menos que sea temporal documentado con `// TECH-DEBT: TD0X`
- [ ] Variables y funciones con nombres que expliquen su propósito
- [ ] Sin lógica duplicada — si existe algo similar, reutilizarlo

### TypeScript
- [ ] `tsc --noEmit` sin errores
- [ ] Sin `@ts-ignore` o `@ts-expect-error` sin justificación
- [ ] Tipos explícitos en todas las funciones exportadas

### ESLint
- [ ] `npm run lint` sin warnings ni errores

### Tests
- [ ] Test unitario del caso feliz — pasa
- [ ] Test unitario de casos de error esperados — pasa
- [ ] Test de integración con BD real (para Capabilities y Tools) — pasa
- [ ] Cobertura de la nueva lógica ≥70%

### Documentación
- [ ] JSDoc en funciones públicas complejas (solo si el WHY no es obvio)
- [ ] `docs/` actualizado si la tarea crea/modifica arquitectura
- [ ] OpenAPI actualizado si es un endpoint nuevo

### MCP Memory
- [ ] Decisión de arquitectura registrada (si aplica)
- [ ] Nueva Capability / Tool / patrón registrado (si aplica)
- [ ] Inconsistencia detectada documentada (si aplica)

### Auditoría
- [ ] Toda acción de negocio genera registro en `audit_log`
- [ ] Toda invocación de Capability genera registro
- [ ] Toda ejecución de Tool genera registro

## DoD Adicional para UI

### Responsive
- [ ] Validado en Mobile (375px)
- [ ] Validado en Tablet (769px)
- [ ] Validado en Desktop (1440px)
- [ ] Sin overflow horizontal en ningún breakpoint
- [ ] Sin elementos rotos o solapados

### Performance
- [ ] Carga inicial <2 segundos en 4G simulado (Lighthouse)
- [ ] No bloquea el hilo principal (sin operaciones síncronas pesadas)
- [ ] Lazy loading en componentes pesados y rutas

### Capacitor
- [ ] No usa APIs exclusivas del browser (window.open, navigator.mediaDevices directos)
- [ ] Usa Abstract Native Services donde aplica
- [ ] Testado en Capacitor si toca GPS, cámara, push o storage nativo

### Accesibilidad
- [ ] Contraste de texto ≥ 4.5:1 (AA)
- [ ] Áreas táctiles mínimo 44x44px
- [ ] Navegable por teclado
- [ ] Atributos `aria-label` donde el texto no es suficiente

### Design System
- [ ] Solo usa componentes del DS documentado
- [ ] Si creó un componente nuevo, lo incorporó al DS y lo documentó

## DoD Adicional para BD / Migrations

### Schema
- [ ] Toda tabla nueva tiene `company_id` (multi-tenant) + RLS policy
- [ ] Toda tabla nueva tiene `created_at`, `updated_at`
- [ ] Índices en columnas de búsqueda frecuente
- [ ] Foreign keys con ON DELETE apropiado

### Migration
- [ ] Archivo de migration en `supabase/migrations/` con nombre `XXXX_description.sql`
- [ ] Migration ejecutada vía CLI (nunca manual)
- [ ] Migration es idempotente (puede ejecutarse dos veces sin error)
- [ ] Revisada con Skill `database-review` antes de ejecutar

## DoD Adicional para Agentes IA

### Seguridad
- [ ] Solo usa Tools del Tool Registry — cero SQL directo
- [ ] Respeta Policy Engine (modo configurado por empresa)
- [ ] No accede a datos de otras empresas (multi-tenant)

### Trazabilidad
- [ ] Cada acción registrada en `audit_log` con agent_id + company_id + timestamp
- [ ] Logs de razonamiento del agente guardados
- [ ] Decisiones importantes escritas en Memory Engine

---

# 14. TEST STRATEGY

## 14.1 Pirámide de Testing

```
        [E2E]          ← 10% del total
      [Integration]    ← 30% del total
    [Unit Tests]       ← 60% del total
```

## 14.2 Test Unitarios

**Qué:** Funciones puras, lógica de Capabilities, validaciones, transformaciones de datos.

**Herramienta:** Vitest (ya configurado en el proyecto)

**Cobertura mínima:** 70% en toda lógica nueva de Capabilities y Tools.

**Convención de archivo:** `[nombre].test.ts` junto al archivo que prueba.

**Ejemplo:**
```typescript
// src/capabilities/createClient.test.ts
describe('createClient Capability', () => {
  it('creates client and returns id', async () => { ... })
  it('throws if company_id missing', async () => { ... })
  it('throws if email invalid', async () => { ... })
  it('publishes client.created event', async () => { ... })
})
```

## 14.3 Tests de Integración

**Qué:** Capabilities con BD real, Tool Registry invocación, Event Bus publish/subscribe.

**Herramienta:** Vitest + Supabase local (si disponible) o BD de desarrollo.

**Convención:** `[nombre].integration.test.ts`

**Regla:** Toda Capability debe tener al menos un test de integración que valide el flujo completo: invocación → BD → evento → auditoría.

## 14.4 Tests E2E

**Qué:** Flujos críticos de usuario — crear cotización, aprobar pedido, generar factura.

**Herramienta:** Playwright (a instalar)

**Cobertura:** Los 5 flujos de mayor retorno:
1. Crear cliente → cotización → pedido → factura
2. Agente Comercial ejecuta seguimiento automático
3. Aprobación de OT desde Centro de Decisiones
4. Morning Brief carga con datos correctos
5. Cambio de plan sin deploy (canUse() responde correctamente)

## 14.5 Tests de Performance

**Herramienta:** Lighthouse CI

**Umbrales:**
- Performance score ≥90
- LCP <2.5s
- CLS <0.1
- FID <100ms

**Cuándo:** Antes de cada release.

## 14.6 Tests de Seguridad

**Herramienta:** Skill `security-review` + revisión manual de RLS policies.

**Qué revisar:**
- RLS activo en toda tabla multi-tenant
- Ningún endpoint expone datos de otras empresas
- Supabase Edge Functions no exponen credenciales
- No hay SQL injection posible en queries dinámicas

## 14.7 Tests Offline / Capacitor

**Qué:** Flujos que deben funcionar sin conexión.

**Cómo:**
- Chrome DevTools → Network → Offline
- Capacitor emulator / dispositivo real

**Flows a probar offline:**
- Ver lista de clientes (cacheada)
- Ver pedidos pendientes (cacheados)
- Crear evidencia con foto (cola de sincronización)

## 14.8 Tests de IA / Agentes

**Qué:** Validar que los agentes ejecutan las acciones correctas con los permisos correctos.

**Cómo:** Mock del modelo IA — probar que el agente invoca la Tool correcta con los parámetros correctos.

**Regla:** Los tests de agentes no deben llamar a la API real de Claude — usar mocks que retornan tool calls predefinidas.

---

# 15. RELEASE PLAN

## v1.5 — Foundation (Post-Sprint 3)

**Cuándo:** Al completar Sprints 0-3

**Contenido:**
- Architecture Constitution publicada
- Capability Engine operativo con 15 Capabilities
- Technical debt crítico resuelto (TD01, TD03, TD06)
- Dashboard Enterprise funcional

**Migraciones:** 0150 (Capability Engine) + 0028 (Dashboard Widgets — pendiente)

**Rollback:** Desactivar Capability Engine y volver a services directos (feature flag)

---

## v1.6 — Event + Tools (Post-Sprint 5)

**Cuándo:** Al completar Sprints 4-5

**Contenido:**
- Event Bus operativo
- Tool Registry con 9 Tools
- Agentes migrados a Tool Registry
- Auditoría automática activa

**Migraciones:** 0151 (Event Bus) + 0152 (Tool Registry)

**Rollback:** Desactivar Event Bus (sin consecuencias para Capabilities)

---

## v1.7 — Memory + Policy + Orchestrator (Post-Sprint 8)

**Cuándo:** Al completar Sprints 6-8

**Contenido:**
- Enterprise Memory con 9 tipos
- Policy Engine con 4 modos
- AI Orchestrator funcional

**Migraciones:** 0153 (Memory) + 0154 (Policy Engine)

**Rollback:** Desactivar Orchestrator (agentes funcionan independientemente)

---

## v2.0 — Agentes Core + Enterprise Experience (Post-Sprint 12)

**Cuándo:** Al completar Sprints 9-12

**Contenido:**
- 4 Agentes Core funcionales
- Morning Brief / Dashboard Inteligente
- Centro de Decisiones
- Enterprise Experience completa

**Migraciones:** Depende de lo creado en Sprints 9-12

**Rollback:** Morning Brief desactivable por feature flag

---

## v2.1+ — Platform (Post-Semana 12)

- Fases 11-15 planificadas sprint a sprint al acercarse a cada una

---

# 16. KPI DASHBOARD

## KPIs de Arquitectura

| KPI | Meta | Frecuencia | Dónde medir |
|---|---|---|---|
| Capabilities registradas | ≥15 al fin Sprint 3, ≥50 al fin Fase 9 | Semanal | `SELECT COUNT(*) FROM capabilities` |
| Tools registradas | ≥9 al fin Sprint 5, ≥25 al fin Fase 9 | Semanal | `SELECT COUNT(*) FROM tools` |
| Eventos publicados/semana | Crecimiento sostenido | Semanal | `SELECT COUNT(*) FROM events WHERE created_at > now()-'7d'` |
| Items en deuda técnica | 0 nuevos por sprint | Semanal | Technical Debt Register |
| Instancias `if(plan===)` | Decreciente hasta 0 | Mensual | `grep -r "plan ===" src/` |
| Queries SQL directas en agentes | 0 | Continuo | Middleware + grep |

## KPIs de Código

| KPI | Meta | Frecuencia | Herramienta |
|---|---|---|---|
| Cobertura de tests | ≥70% en Capabilities/Tools | Por sprint | Vitest coverage |
| ESLint warnings | 0 | Continuo | CI |
| TypeScript errors | 0 | Continuo | CI |
| Componentes fuera del DS | 0 nuevos | Por sprint | Revisión de PR |

## KPIs de Performance

| KPI | Meta | Frecuencia | Herramienta |
|---|---|---|---|
| Lighthouse Performance score | ≥90 | Por release | Lighthouse CI |
| LCP (Largest Contentful Paint) | <2.5s | Por release | Lighthouse |
| CLS (Layout Shift) | <0.1 | Por release | Lighthouse |
| Tiempo de carga en 4G | <2s | Por release | DevTools Network throttle |

## KPIs de IA

| KPI | Meta | Frecuencia | Dónde medir |
|---|---|---|---|
| Créditos IA consumidos/empresa/mes | Dentro del límite del plan | Mensual | `ai_usage` table |
| Acciones de agentes auditadas | 100% | Continuo | `audit_log` |
| Agentes en Policy = Autónomo | Configurable por empresa | Por empresa | `policies` table |
| Latencia de respuesta de agentes | <5s por acción | Semanal | Observability Center |

## KPIs de Producto

| KPI | Meta | Frecuencia | Dónde medir |
|---|---|---|---|
| Empresas activas | Crecimiento MoM | Mensual | `workspaces` |
| Automatizaciones ejecutadas/semana | Crecimiento MoM | Semanal | `events` + `automations` |
| Morning Brief views/día | ≥1 por empresa activa | Diario | Analytics |
| Decisiones aprobadas desde Centro | Crecimiento sostenido | Mensual | `audit_log` |

---

# 17. RESOURCE PLAN

## Herramientas de Desarrollo

| Herramienta | Rol | Configuración |
|---|---|---|
| **Claude (claude-sonnet-4-6)** | Agente de desarrollo principal | Sesiones vía Claude Code CLI |
| **VS Code** | Editor — extensión Claude Code activa | Workspace en `c:\Users\karni\brivia-app` |
| **MCP Memory** | Memoria persistente entre sesiones | Archivos en `C:\Users\karni\.claude\projects\...` |
| **GitHub Copilot** | Autocompletado secundario | Cuando Claude no está disponible |
| **Supabase CLI** | Migraciones, funciones, deploy | `supabase` disponible en terminal |
| **Vitest** | Test runner | `npm run test` |
| **ESLint** | Linting | `npm run lint` |
| **TypeScript** | Type checking | `tsc --noEmit` |
| **Capacitor CLI** | Build mobile | `npx cap run android/ios` |

## Skills del Sistema

Las siguientes Skills deben consultarse antes de implementar en su dominio:

| Skill | Cuándo usar |
|---|---|
| `shelwi-development-standard` | Antes de cualquier implementación nueva |
| `database-review` | Antes de crear/modificar migrations |
| `security-review` | Antes de tocar auth, RLS, Edge Functions, o datos de empresa |
| `performance-review` | Antes de cada release |
| `production-readiness` | Antes de hacer deploy |
| `architecture-review` | Antes de decisiones de arquitectura |
| `code-review` | Después de completar una Epic |
| `systematic-debugging` | Cuando hay un bug difícil de reproducir |

## Stack Técnico

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React | 19.x |
| Build | Vite | 8.x |
| Lenguaje | TypeScript | ~6.0.2 |
| Estilos | Tailwind CSS | v3 + inline styles |
| Componentes | shadcn/ui | Última estable |
| Data fetching | TanStack Query | v5.x |
| Mobile | Capacitor | 8.x |
| Offline | Dexie (IndexedDB) | 4.x |
| Backend | Supabase | Latest |
| Error tracking | Sentry | 10.x |
| Testing | Vitest | Latest |

## Tiempo Estimado por Fase

| Fase | Estimado (semanas de trabajo de agente) | Paralelismo |
|---|---|---|
| Fase 0 — Fundamentos | 1 | Alto (documentación) |
| Fase 1 — Foundation | 1 | Medio |
| Fase 2 — Capability Engine | 2 | Bajo (secuencial) |
| Fase 3 — Event Bus | 1 | Paralelo con Fase 4 |
| Fase 4 — Tool Registry | 1 | Paralelo con Fase 3 |
| Fase 5 — Enterprise Memory | 1 | Secuencial |
| Fase 6 — Policy Engine | 1 | Secuencial |
| Fase 7 — AI Orchestrator | 1 | Secuencial |
| Fase 8 — Agentes Core | 2 | Parcialmente paralelo |
| Fase 9 — Departments | 1 | Paralelo con diseño Fase 10 |
| Fase 10 — Experience | 1 | Secuencial |
| Fases 11-15 — Platform | 4-6 | Variable |

---

# 18. COMMUNICATION PLAN

## 18.1 Documentar Decisiones

**Regla:** Toda decisión de arquitectura, diseño o estrategia que no sea obvia debe documentarse.

**Dónde:**
- Decisiones de arquitectura → ADR en este EPMO (sección 11)
- Decisiones de implementación → MCP Memory (archivo específico)
- Decisiones de producto → `docs/SHELWI_OS_ROADMAP.md`
- Decisiones de sprint → Comentario en la tarea cerrada

**Formato para documentar una decisión en MCP Memory:**
```
Decisión: [Qué se decidió]
Contexto: [Por qué surgió la necesidad]
Alternativas: [Qué más se consideró]
Resultado: [Qué se eligió y por qué]
Consecuencias: [Qué cambia en el código o la arquitectura]
Fecha: [YYYY-MM-DD]
```

## 18.2 Actualizar Documentación

**Cuándo actualizar cada documento:**

| Documento | Cuándo actualizar |
|---|---|
| `docs/SHELWI_OS_EPMO.md` | Al cambiar arquitectura, riesgos, o decisiones |
| `docs/SHELWI_OS_ROADMAP.md` | Al completar una fase o cambiar prioridades |
| `docs/SHELWI_OS_TASKS.md` | Al completar tareas o agregar nuevas |
| `docs/CAPABILITY_REGISTRY.md` | Al crear o modificar una Capability |
| `docs/TOOL_REGISTRY.md` | Al crear o modificar una Tool |
| `docs/DESIGN_SYSTEM.md` | Al crear o modificar un componente |
| MCP Memory | Al tomar cualquier decisión significativa |

## 18.3 Inicio de Sesión de Desarrollo

**Todo agente o desarrollador, al iniciar una sesión:**
1. Leer este EPMO (especialmente secciones: Quality Gates, DoD, ADRs relevantes)
2. Consultar MCP Memory para contexto de sesiones anteriores
3. Revisar `docs/SHELWI_OS_TASKS.md` — tareas actuales del sprint
4. Identificar si hay bloqueantes (deuda técnica, dependencias)
5. Verificar estado de Skills disponibles

## 18.4 Cierre de Sesión

**Al terminar una sesión:**
1. Actualizar estado de tareas en `docs/SHELWI_OS_TASKS.md`
2. Escribir en MCP Memory las decisiones tomadas
3. Documentar cualquier inconsistencia detectada (nunca ignorar)
4. Si se detectó deuda técnica nueva, agregarla al registro (sección 10)
5. Si se tomó una decisión de arquitectura, crear un ADR

## 18.5 Comunicar Cambios

**Cambios en el roadmap:**
1. Documentar en `docs/SHELWI_OS_ROADMAP.md`
2. Documentar en MCP Memory
3. Revisar si el cambio afecta dependencias (Dependency Map)
4. Verificar si algún Gate queda invalidado

**Cambios en la arquitectura:**
1. Crear ADR en este EPMO
2. Actualizar Architecture Constitution si aplica
3. Actualizar MCP Memory
4. Notificar en comentario de la tarea que originó el cambio

---

# 19. CHANGE MANAGEMENT

## 19.1 Proceso de Cambio

**Regla:** Ningún cambio significativo puede implementarse sin seguir este proceso.

**¿Qué cuenta como cambio significativo?**
- Cambiar una decisión de arquitectura documentada en un ADR
- Cambiar la estructura de una tabla existente en producción
- Cambiar el proveedor de un servicio abstracto
- Agregar o eliminar una fase del roadmap
- Cambiar los precios o estructura de los planes
- Cambiar el modelo de IA primario o secundario
- Modificar el Tool Registry (agregar/deprecar Tools)
- Cambiar el contrato de una Capability (inputs/outputs)

## 19.2 Pasos del Proceso de Cambio

```
1. IDENTIFICAR el cambio y su impacto
   ↓
2. DOCUMENTAR propuesta (qué cambia, por qué, alternativas)
   ↓
3. VERIFICAR compatibilidad hacia atrás
   ↓
4. VERIFICAR que no genera deuda técnica
   ↓
5. ACTUALIZAR ADR existente o crear uno nuevo
   ↓
6. ACTUALIZAR MCP Memory
   ↓
7. ACTUALIZAR documentación afectada
   ↓
8. IMPLEMENTAR el cambio
   ↓
9. VALIDAR Quality Gates afectados
   ↓
10. REGISTRAR cambio en audit_log de arquitectura
```

## 19.3 Cambio de Proveedor de IA (Ejemplo)

**Escenario:** Anthropic sube precios 3x. Considerar migración a otro modelo.

**Proceso:**
1. `IAService` ya abstrae el proveedor — el cambio es en el adaptador, no en la lógica
2. Crear nuevo adaptador en `src/services/ai/providers/[nuevo-proveedor].ts`
3. Actualizar `IAService` para usar el nuevo adaptador por defecto
4. Mantener Claude como fallback en configuración del CMS
5. Probar con los mismos tests de integración
6. Actualizar ADR-007 con la nueva decisión
7. Sin cambios en agentes, Tools ni Capabilities

## 19.4 Cambio de Schema de BD (Proceso)

1. Revisar migration más reciente (`supabase/migrations/`)
2. Crear nueva migration `XXXX_descripcion.sql`
3. Usar Skill `database-review` antes de ejecutar
4. Ejecutar vía CLI: `supabase db push` o SQL Editor
5. Regenerar tipos TypeScript de Supabase
6. Actualizar interfaces TypeScript afectadas
7. Ejecutar tests de integración
8. Documentar cambio en MCP Memory

## 19.5 Cambio de Planes (Sin deploy)

Una vez que Fase 12 esté implementada:
1. Super Admin entra al CMS → Módulo Planes
2. Modifica nombre / precio / límites / funciones
3. El motor `canUse()` responde automáticamente con los nuevos valores
4. Zero deploy requerido

## 19.6 Deprecar una Capability

1. Marcar la Capability como `status: deprecated` en BD
2. Crear nueva Capability que reemplaza la anterior (nueva versión)
3. Mantener la antigua activa por al menos 2 sprints (compatibilidad)
4. Actualizar todos los agentes y automatizaciones que la usen
5. Eliminar la antigua en el siguiente ciclo de limpieza

---

# 20. SUCCESS METRICS

## 20.1 Productividad del Desarrollo

| Métrica | Línea base | Meta v1.0 |
|---|---|---|
| Capabilities implementadas | 0 (pendiente) | ≥30 |
| Tools en Tool Registry | 0 | ≥15 |
| Cobertura de tests | 0% formal | ≥70% en núcleo |
| Deuda técnica items | 13 conocidos | 0 nuevos por sprint |
| Sprints completados sin regresiones | N/A | 100% |

## 20.2 Calidad

| Métrica | Meta |
|---|---|
| Errores P0 en producción | 0 por sprint |
| Errores P1 en producción | <2 por sprint |
| Tiempo de resolución de P0 | <4h |
| Regressions detectadas por tests (no por usuarios) | >90% |

## 20.3 Escalabilidad

| Métrica | Meta |
|---|---|
| Nuevos departamentos sin modificar Core | Posible desde Fase 9 |
| Nuevos agentes sin modificar Core | Posible desde Fase 4 |
| Nuevos planes sin deploy | Posible desde Fase 12 |
| Nuevas integraciones sin modificar lógica de negocio | Posible desde E0.22 |

## 20.4 ROI para el Usuario

| Métrica | Meta (por empresa en Business OS) |
|---|---|
| Horas ahorradas/mes estimadas | ≥40h (ROI Center) |
| Seguimientos automáticos/mes | ≥50 |
| Oportunidades detectadas por Agente Comercial | ≥5/mes |
| Pedidos procesados sin intervención humana | ≥30% |
| Cobros gestionados automáticamente | ≥20% de la cartera vencida |

## 20.5 Costo IA

| Métrica | Meta |
|---|---|
| Costo IA por empresa / mes (Start) | $0 (sin IA) |
| Costo IA por empresa / mes (Growth) | <$10 USD equivalente en créditos |
| Costo IA por empresa / mes (Business OS) | <$30 USD equivalente |
| Ratio valor/costo IA | ≥10x (10x más valor que costo) |

---

# 21. AI DEVELOPMENT GOVERNANCE

> Toda entidad — agente IA, Claude Code, automatización o script — que contribuya al desarrollo de Shelwi debe cumplir TODAS estas reglas sin excepción.

## 21.1 Antes de Implementar (Obligatorio)

```
✓ Consultar MCP Memory
  → ¿Existe algo similar ya implementado?
  → ¿Hay una decisión previa de arquitectura que aplique?
  → ¿Qué convenciones debo seguir?

✓ Consultar Skills disponibles
  → ¿Existe una Skill especializada para esta tarea?
  → shelwi-development-standard SIEMPRE
  → security-review si toca auth/BD/RLS
  → database-review si crea/modifica tablas

✓ Consultar EPMO (este documento)
  → ¿Está esta tarea en el roadmap?
  → ¿Hay dependencias que debo respetar?
  → ¿Qué Quality Gate aplica?
  → ¿Cumple la Definition of Done?

✓ Verificar Regla de Oro
  → ¿Sigo la secuencia? Necesidad→Capability→Evento→Tool→Agente→Pantalla
```

## 21.2 Durante la Implementación

```
✓ NO duplicar lógica de negocio
  → Si ya existe: reusarla, no copiarla

✓ NO crear componentes aislados
  → Incorporar al Design System antes de usar

✓ NO acceder a BD directamente desde agentes
  → Tool Registry exclusivamente

✓ NO hardcodear planes, límites o nombres
  → canUse() y getLimit() siempre

✓ NO ignorar inconsistencias
  → Documentarlas inmediatamente en Technical Debt Register

✓ NO romper compatibilidad
  → Verificar con grep + tests antes de cambiar interfaces

✓ NO improvisar arquitecturas
  → Consultar ADRs + MCP Memory + EPMO
```

## 21.3 Al Terminar

```
✓ Actualizar MCP Memory
  → Decisión tomada: [descripción]
  → Nueva Capability/Tool creada: [nombre]
  → Inconsistencia detectada: [descripción]

✓ Verificar Definition of Done
  → Todos los ítems del DoD marcados

✓ Verificar Quality Gate aplicable
  → ¿El gate del sprint actual sigue verde?

✓ Documentar en docs/
  → Archivo correcto actualizado

✓ Si creó deuda técnica (inevitable a veces)
  → Agregar al Technical Debt Register con ID, descripción, impacto y sprint para resolver
  → Nunca ignorar

✓ Si tomó decisión de arquitectura
  → Crear o actualizar ADR en este EPMO
```

## 21.4 Lo que Nunca Está Permitido

1. Ejecutar SQL directamente desde un agente IA
2. Hacer `if(plan === "premium")` o equivalente
3. Crear lógica fija que no sea configurable desde CMS
4. Duplicar una Capability que ya existe
5. Crear un componente UI sin incorporarlo al Design System
6. Ignorar una inconsistencia detectada
7. Generar deuda técnica sin documentarla
8. Romper una funcionalidad estable sin autorización explícita
9. Hardcodear credenciales, tokens o URLs de proveedores
10. Diseñar primero para desktop en lugar de mobile

## 21.5 Protocolo de Inconsistencias

Cuando un agente detecta algo que contradice la arquitectura definida:

```
1. DETENER la implementación
2. DOCUMENTAR la inconsistencia:
   - Qué encontré
   - Dónde está (archivo:línea)
   - Por qué es un problema
   - Opciones para resolverlo
3. AGREGAR al Technical Debt Register
4. NOTIFICAR al usuario (nunca ignorar silenciosamente)
5. ESPERAR instrucción antes de continuar si el impacto es Alto o Crítico
```

---

# 22. FINAL EXECUTION BOARD

## Tablero Maestro de Ejecución

> Este es el panel de control de todo el proyecto. Consultar al inicio de cada sesión.

### Estado por Fase

| Fase | Nombre | Semana | Prioridad | Estado | Bloqueante | Owner |
|---|---|---|---|---|---|---|
| **F0** | Fundamentos (23 entregables) | Pre-1 | P0 | 🔴 Pendiente | — | Claude |
| **F1** | Foundation 2.0 | 1 | P0 | 🔴 Pendiente | F0 completo | Claude |
| **F2** | Enterprise Capability Engine | 2-3 | P0 | 🔴 Pendiente | F1 + E0.4 | Claude |
| **F3** | Enterprise Event Bus | 4 | P1 | 🔴 Pendiente | F2 | Claude |
| **F4** | Tool Registry | 5 | P1 | 🔴 Pendiente | F2 | Claude |
| **F5** | Enterprise Memory | 6 | P1 | 🔴 Pendiente | F3+F4 | Claude |
| **F6** | Policy Engine | 7 | P1 | 🔴 Pendiente | F5 | Claude |
| **F7** | AI Brain / Orchestrator | 8 | P1 | 🔴 Pendiente | F6 | Claude |
| **F8** | Agentes Core | 9-10 | P2 | 🔴 Pendiente | F7 | Claude |
| **F9** | Enterprise Departments | 11 | P2 | 🔴 Pendiente | F4 | Claude |
| **F10** | Enterprise Experience | 12 | P2 | 🔴 Pendiente | F8 | Claude |
| **F11** | CMS Enterprise | Post-12 | P2 | 🔴 Pendiente | F10 | Claude |
| **F12** | Sistema de Planes Inteligentes | Post-12 | P2 | 🔴 Pendiente | F11 | Claude |
| **F13** | Integraciones Financieras | Post-12 | P3 | 🔴 Pendiente | F11 + E0.22 | Claude |
| **F14** | Marketplace | Post-12 | P3 | 🔴 Pendiente | F11 + E0.10 | Claude |
| **F15** | Internacionalización | Post-12 | P3 | 🔴 Pendiente | F12 + E0.12 | Claude |

---

### Deuda Técnica Activa (resumen)

| ID | Descripción | Prioridad | Sprint objetivo |
|---|---|---|---|
| TD01 | Migration 0028 pendiente en Supabase | P0 | Sprint 1 |
| TD02 | Queries SQL directas en agentes | P0 | Sprint 5 |
| TD03 | Plan checks hardcoded `if(plan===...)` | P1 | Fase 12 |
| TD04-13 | Ver Technical Debt Register completo (sección 10) | P1-P3 | Varios |

---

### Riesgos Activos (resumen)

| ID | Riesgo | Nivel | Acción inmediata |
|---|---|---|---|
| R01 | Migration 0028 pendiente | 🔴 CRÍTICO | Ejecutar en Sprint 1 |
| R02 | SQL directo en agentes | 🔴 CRÍTICO | Tool Registry en Sprint 5 |
| R03 | Plan checks hardcoded | 🔴 ALTO | Auditar en Sprint 1 |
| R04 | Sin test suite formal | 🔴 ALTO | Iniciar en Sprint 2 |

---

### Próxima Acción (al momento de crear este documento)

```
→ INICIAR Sprint 0 — Fase 0 Fundamentos
  
  Primera tarea: 0.1.1 — Redactar Architecture Constitution
  Depende de: Nada (primer entregable del proyecto)
  
  Regla: No escribir código hasta que Sprint 0 esté 100% completo.
```

---

### Checklist de Inicio de Sesión

Al comenzar cualquier sesión de desarrollo:

- [ ] Leer estado actual del Final Execution Board (esta sección)
- [ ] Consultar MCP Memory — ¿qué quedó pendiente de la sesión anterior?
- [ ] Identificar la tarea actual en `docs/SHELWI_OS_TASKS.md`
- [ ] Verificar que la tarea cumple todos los pre-requisitos del Task Template
- [ ] Consultar Skills relevantes antes de implementar
- [ ] Confirmar que el Quality Gate del sprint actual sigue verde

### Checklist de Cierre de Sesión

Al terminar cualquier sesión de desarrollo:

- [ ] Tareas completadas marcadas en `docs/SHELWI_OS_TASKS.md`
- [ ] MCP Memory actualizado con decisiones de la sesión
- [ ] Deuda técnica nueva documentada en Technical Debt Register
- [ ] Quality Gate revisado — ¿sigue verde?
- [ ] Próxima tarea identificada y documentada

---

*Fin del EPMO — Shelwi OS 1.0*
*Versión: 1.0.0 | Creado: 2026-07-13*
*Este documento es la fuente única de verdad para todo el desarrollo de Shelwi.*
