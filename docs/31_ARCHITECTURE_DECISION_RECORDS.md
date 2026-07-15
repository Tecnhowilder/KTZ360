# ARCHITECTURE DECISION RECORDS — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> 15 ADRs — decisiones arquitectónicas fundamentales del sistema
> Índice: `docs/30_ADR_INDEX.md`

---

## ADR-001: React 19 + Vite 8 como stack frontend

**Fecha:** Sprint 1 (2024)
**Estado:** ✅ Aceptado

### Contexto
Necesitábamos un stack frontend moderno, con soporte a Mobile (via Capacitor), TypeScript estricto, y que permitiera un bundle optimizado para redes lentas de LATAM.

### Alternativas consideradas
1. **Next.js** — SSR completo, ideal para SEO. Descartado: Shelwi es una app autenticada (SSR aporta poco), agrega complejidad para Capacitor.
2. **Remix** — Bueno para forms y routing. Descartado: ecosistema más pequeño, menos compatibilidad con Capacitor.
3. **React + Vite (elegida)** — SPA pura, bundle minimalista, hot reload ultra-rápido, compatible con Capacitor, amplia comunidad.

### Decisión
React 19 con Vite 8 como bundler. Reasoning: compatibilidad con Capacitor 8, velocity de desarrollo con hot reload, tree-shaking agresivo para bundle pequeño.

### Consecuencias
**Positivas:**
- Bundle < 300 KB gzip con tree-shaking
- Dev experience excelente (HMR < 100ms)
- Compatible con Capacitor para iOS/Android

**Negativas:**
- Sin SSR nativo (no aplica para app autenticada)
- SEO limitado (no relevante para app B2B autenticada)

### Implementación
`vite.config.ts`, `src/main.tsx`, `package.json`

---

## ADR-002: Supabase como BaaS (DB + Auth + Storage + Edge)

**Fecha:** Sprint 1 (2024)
**Estado:** ✅ Aceptado

### Contexto
Shelwi necesitaba DB relacional, auth, storage y lógica server-side sin operar infraestructura propia, con soporte a multi-tenant via RLS y capacidad de escalar.

### Alternativas consideradas
1. **Firebase** — NoSQL, Auth y Storage. Descartado: sin RLS nativo, queries relacionales difíciles.
2. **PlanetScale + Auth0 + S3** — Más control. Descartado: demasiada complejidad operacional para equipo pequeño.
3. **Supabase (elegida)** — Postgres + RLS + Auth + Storage + Edge Functions, todo integrado.

### Decisión
Supabase como plataforma completa. Permite implementar multi-tenancy real via RLS, Edge Functions en Deno, Storage con RLS, Auth con JWTs.

### Consecuencias
**Positivas:**
- Multi-tenancy via RLS sin código adicional
- Edge Functions con acceso directo a DB (sin latencia de red inter-service)
- Migraciones versionadas via supabase CLI

**Negativas:**
- Lock-in con Supabase (mitigado: Postgres estándar bajo el capó)
- Límites de plan pueden requerir upgrade al crecer

### Implementación
`supabase/migrations/0001-0149`, `src/lib/supabase.ts`, `supabase/functions/`

---

## ADR-003: Capacitor 8 para mobile (no React Native)

**Fecha:** Sprint 2 (2024)
**Estado:** ✅ Aceptado

### Contexto
Shelwi necesita una app móvil para iOS/Android. El equipo tiene experiencia en web, no en React Native.

### Alternativas consideradas
1. **React Native** — Performance nativo, gran comunidad. Descartado: requiere equipo separado, no reutiliza código web.
2. **Flutter** — Excelente performance, multi-plataforma. Descartado: requiere aprender Dart, no reutiliza código React.
3. **Capacitor 8 (elegido)** — Wrapper nativo de la WebApp, comparte 100% del código con web.

### Decisión
Capacitor 8 para empaquetar la React app como app nativa. Allows compartir 100% del código entre web y mobile.

### Consecuencias
**Positivas:**
- Un solo codebase para web, iOS y Android
- Acceso a APIs nativas (GPS, cámara, push notifications)
- Velocidad de desarrollo: misma app, diferente empaquetado

**Negativas:**
- Performance algo inferior a nativo puro (no relevante para nuestro use case)
- Updates de iOS/Android pueden romper Capacitor (mitigado con versioning cuidadoso)

### Implementación
`capacitor.config.ts`, `ios/`, `android/`

---

## ADR-004: Dexie 4 para base de datos offline

**Fecha:** Sprint 4 (2024)
**Estado:** ✅ Aceptado

### Contexto
Técnicos de campo trabajan en zonas sin conexión. Las acciones (GPS, evidencias, tareas) deben funcionar offline y sincronizar al recuperar red.

### Alternativas consideradas
1. **localStorage** — Simple pero sin query capabilities. Descartado: no soporta queries complejas ni transacciones.
2. **IndexedDB nativo** — API del browser. Descartado: API compleja, sin TypeScript nativo.
3. **RxDB** — Realtime sync. Descartado: complejidad excesiva para nuestro caso.
4. **Dexie 4 (elegida)** — Wrapper TypeScript de IndexedDB, simple, soporta queries.

### Decisión
Dexie 4 como capa de abstracción sobre IndexedDB. API simple, TypeScript nativo, soporta transacciones.

### Consecuencias
**Positivas:**
- API similar a Supabase (fácil de aprender)
- TypeScript types nativos
- Transacciones y queries complejas

**Negativas:**
- Schema migrations de Dexie deben versionarse cuidadosamente
- Datos offline son persistentes pero no replicados entre dispositivos

### Implementación
`src/lib/offlineDB.ts`

---

## ADR-005: Edge Functions (Deno) para lógica server-side

**Fecha:** Sprint 1 (2024)
**Estado:** ✅ Aceptado

### Contexto
Necesitábamos lógica server-side para: validar JWT, cifrar credenciales, llamar APIs externas, procesar webhooks — sin exponer secrets al frontend.

### Alternativas consideradas
1. **API propia (Express/Fastify)** — Control total. Descartado: infraestructura a operar, cold starts, costo.
2. **Vercel Functions** — Integrado con hosting. Descartado: no tiene acceso directo a Supabase DB, latencia adicional.
3. **Supabase Edge Functions (Deno) (elegida)** — Corre en la misma infraestructura que la DB, acceso directo, cold start bajo.

### Decisión
14 Edge Functions en Deno, todas siguiendo Zero Trust. Cada función verifica JWT y obtiene workspace_id de DB.

### Consecuencias
**Positivas:**
- Acceso directo a Postgres (sin latencia de red adicional)
- Secrets seguros (variables de entorno solo en Supabase)
- Deno sandbox seguro por defecto

**Negativas:**
- Deno, no Node.js (algunas librerías npm no son directamente compatibles)
- Debugging más complejo que serverless tradicional

### Implementación
`supabase/functions/` (14 funciones)

---

## ADR-006: Gemini 2.5 Pro como modelo IA primario

**Fecha:** Sprint 8 (2024)
**Estado:** ✅ Aceptado

### Contexto
Shelwi necesita un modelo IA para el AI Orchestrator (análisis de negocio, generación de reportes, agentes). Se evaluaron múltiples proveedores.

### Alternativas consideradas
1. **GPT-4o (OpenAI)** — Excelente calidad. Descartado: costo elevado, sin modelo de embedding integrado.
2. **Claude 3.5 Sonnet** — Excelente para análisis. Descartado (inicialmente): falta de SDK para Deno en ese momento.
3. **Gemini 2.5 Pro (elegido)** — Ventana de contexto de 1M tokens, embeddings integrados, pricing competitivo, fuerte en análisis estructurado.

### Decisión
Gemini 2.5 Pro como primario, con fallback a Gemini 2.5 Flash para operaciones de menor complejidad y latencia.

### Consecuencias
**Positivas:**
- Contexto 1M tokens: puede procesar todo el historial de una empresa
- Embeddings via `text-embedding-004` integrado
- Multimodal: puede analizar imágenes de evidencias de campo

**Negativas:**
- Dependencia de Google (mitigado con NVIDIA como fallback)
- Latencia variable en horas pico

### Implementación
`supabase/functions/ai-proxy/index.ts`, `supabase/functions/_shared/orchestrator.ts`, `src/services/aiProviders.ts`

---

## ADR-007: NVIDIA NIM como proveedor IA secundario/fallback

**Fecha:** Sprint 12 (2025)
**Estado:** ✅ Aceptado

### Contexto
Necesitábamos redundancia para el sistema de IA. Si Gemini falla, los agentes no pueden operar. También queríamos explorar modelos open-source para casos específicos.

### Alternativas consideradas
1. **OpenAI como fallback** — Bien conocido. Considerado pero no elegido como secundario para no tener dos proveedores cloud cerrados.
2. **Ollama local** — Sin dependencia cloud. Descartado: requiere infraestructura propia, latencia.
3. **NVIDIA NIM (elegido)** — Llama 3.3 70B y Nemotron 70B via API, compatible con OpenAI SDK, excelente para LATAM business context.

### Decisión
NVIDIA NIM como proveedor secundario. Compatible con OpenAI SDK (mismo interface), fácil de alternar. Probado en ai-benchmark (Sprint 12).

### Consecuencias
**Positivas:**
- Fallback automático si Gemini falla
- Llama 3.3 70B: excelente para español y contexto LATAM
- API compatible con OpenAI SDK

**Negativas:**
- Latencia algo mayor que Gemini para respuestas largas
- Costo adicional si se usa como primario

### Implementación
`src/services/aiProviders.ts`, `supabase/functions/_shared/orchestrator.ts`, `supabase/functions/ai-benchmark/`

---

## ADR-008: Arquitectura de AI Orchestrator (ai-proxy único)

**Fecha:** Sprint 8 (2024)
**Estado:** ✅ Aceptado

### Contexto
Con múltiples agentes y modelos, necesitábamos un punto de entrada único para toda la IA — para controlar costos, aplicar seguridad, routing de modelos, y registro de uso.

### Alternativas consideradas
1. **Llamadas directas a IA desde frontend** — Descartado: expone API keys al cliente.
2. **Una Edge Function por agente** — Descartado: duplicación de lógica de auth, rate limiting, logging.
3. **ai-proxy único (elegido)** — Un solo punto de entrada, shared logic para auth + rate limiting + model selection + audit.

### Decisión
`ai-proxy` Edge Function como orchestrator único. Recibe el agente y contexto, selecciona el modelo, ejecuta, registra en ai_usage.

### Consecuencias
**Positivas:**
- Un solo lugar para seguridad IA (Zero Trust, rate limiting, plan checks)
- Fácil cambiar de modelo sin tocar el frontend
- Logging centralizado de todo el uso IA

**Negativas:**
- Bottleneck potencial (mitigado con Edge Functions escalables)
- Single point of failure (mitigado con health checks y fallback a NVIDIA)

### Implementación
`supabase/functions/ai-proxy/index.ts`, `supabase/functions/_shared/orchestrator.ts`

---

## ADR-009: Zero Trust: workspace_id nunca del cliente

**Fecha:** Sprint 3 (2024)
**Estado:** ✅ Aceptado

### Contexto
En arquitecturas multi-tenant, un error común es confiar en el `workspace_id` que el cliente envía en el body del request. Esto permite a un atacante acceder a datos de otro workspace.

### Decisión
**Regla absoluta:** En toda Edge Function, el `workspace_id` se obtiene **siempre** de la base de datos (tabla `profiles`) usando el JWT del usuario. Nunca del body del request.

```typescript
// ✅ Correcto — workspace_id de DB
const { data: profile } = await admin.from('profiles')
  .select('workspace_id, role')
  .eq('id', user.id)
  .single();
const workspaceId = profile.workspace_id;

// ❌ PROHIBIDO — workspace_id del request
const { workspace_id } = await req.json();
```

### Consecuencias
**Positivas:**
- Imposible el tenant leakage por manipulación de request
- Simplifica el modelo de seguridad: el JWT es la única fuente de identidad

**Negativas:**
- Un query adicional a DB por request (< 5ms — aceptable)

### Implementación
Verificado en: `supabase/functions/connect-integration/index.ts:99-110`, `supabase/functions/mp-webhook/`, `supabase/functions/ai-proxy/`

---

## ADR-010: RLS como mecanismo primario de multi-tenancy

**Fecha:** Sprint 1 (2024)
**Estado:** ✅ Aceptado

### Contexto
Shelwi es multi-tenant. Cada empresa debe ver solo sus datos. Se necesitaba un mecanismo que funcione incluso si hay bugs en el código de la aplicación.

### Decisión
Row Level Security (RLS) de Postgres como primera línea de defensa. Incluso si el código tiene un bug de filtrado, RLS previene que los datos se expongan entre empresas.

**Regla:** Toda tabla con datos empresariales tiene:
1. `company_id UUID NOT NULL REFERENCES workspaces(id)`
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
3. Al menos una política SELECT que filtra por `current_workspace_id()` o `profiles` membership

### Consecuencias
**Positivas:**
- Defense in depth: incluso si hay bug en el app code, la DB no expone datos
- Las políticas son auditables y testeables
- Consistente con el modelo de Supabase

**Negativas:**
- Policies mal escritas pueden crear bugs difíciles de debuggear
- Performance: RLS agrega overhead (mitigado con índices en `company_id`)

### Implementación
`supabase/migrations/0003_rls.sql` (275+ políticas), todas las migrations de tablas

---

## ADR-011: Event-Driven Architecture (DOMAIN.ENTITY.ACTION)

**Fecha:** Sprint 6 (2024)
**Estado:** ✅ Aceptado

### Contexto
Al crecer la cantidad de módulos, necesitábamos desacoplar las acciones de sus efectos secundarios (notificaciones, automatizaciones, integraciones). Un modelo directo crearía dependencias cruzadas.

### Decisión
Adoptar eventos inmutables con naming convention `DOMAIN.ENTITY.ACTION`. Los módulos emiten eventos; los subscribers (Automation Engine, Integration Engine, agentes IA) reaccionan sin que el emisor los conozca.

### Consecuencias
**Positivas:**
- Desacoplamiento entre módulos
- Fácil agregar nuevos subscribers sin tocar el emisor
- Auditable: el audit_log puede representar el stream de eventos

**Negativas:**
- Eventual consistency (la acción y sus efectos no son síncronos)
- Más difícil debuggear flujos completos

### Implementación
`docs/05_EVENT_CATALOG.md`, `evaluate_and_queue_automations` RPC, `automation-scheduler` Edge Function

---

## ADR-012: Tool Registry: agentes nunca acceden SQL directo

**Fecha:** Sprint 8 (2024)
**Estado:** ✅ Aceptado

### Contexto
Los agentes IA necesitan acceder a datos y ejecutar acciones. Una solución ingenua sería dejar que el agente genere SQL y lo ejecute. Esto crea riesgos severos de seguridad.

### Decisión
**Regla absoluta:** Los agentes IA NUNCA generan ni ejecutan SQL directamente. Todas las acciones pasan por un Tool Registry con herramientas predefinidas, versionadas y auditadas.

```
Agente → Tool Registry → Herramienta predefinida → DB (via service_role)
                      ↑
               (no SQL generado por IA)
```

### Consecuencias
**Positivas:**
- Previene SQL injection por IA (prompt injection que genera DROP TABLE, etc.)
- Las herramientas son auditables y testeables
- Rate limiting por herramienta

**Negativas:**
- Las herramientas deben desarrollarse antes de que el agente las use (no es "plug and play")
- Más trabajo de desarrollo inicial

### Implementación
`docs/06_TOOL_CATALOG.md` (12 herramientas), `supabase/functions/ai-proxy/index.ts`

---

## ADR-013: Capability Engine: toda acción de negocio = Capability

**Fecha:** Sprint 8 (2024)
**Estado:** ✅ Aceptado

### Contexto
Necesitábamos un modelo mental unificador para decidir si algo debe implementarse: ¿esto es una feature de UI? ¿un agente? ¿una automatización?

### Decisión
La "Secuencia de Oro": toda acción de negocio comienza como una Capability con ID único. La UI, los agentes y las automatizaciones son formas de ejecutar esa Capability.

```
Necesidad → Capability → Evento → Tool → Agente → Pantalla
```

### Consecuencias
**Positivas:**
- Modelo mental claro para priorizar desarrollo
- Las Capabilities son la unidad de plan/permission (feature flags)
- Facilita el diseño de agentes IA (cada agente maneja un conjunto de Capabilities)

**Negativas:**
- Requiere disciplina para no saltarse el modelo

### Implementación
`docs/04_CAPABILITY_CATALOG.md` (15 capabilities), `docs/01_ARCHITECTURE_CONSTITUTION.md` Artículo II

---

## ADR-014: Memory Engine: 5 tipos de memoria para agentes IA

**Fecha:** Sprint 9 (2024)
**Estado:** ✅ Aceptado

### Contexto
Los agentes IA necesitan contexto persistente entre conversaciones. Sin memoria, cada conversación empieza desde cero y el agente no puede aprender patrones del negocio.

### Alternativas consideradas
1. **Memoria via contexto largo** — Pasar todo el historial en cada prompt. Descartado: costo prohibitivo de tokens.
2. **Memoria en localStorage** — Simple. Descartado: no persistente cross-device, no multi-tenant.
3. **5 tipos de memoria en DB (elegido)** — Short-term, Long-term (Knowledge Graph), Entity, Pattern, Procedure.

### Decisión
5 tipos de memoria estructurada en base de datos, con TTLs y límites por plan.

### Consecuencias
**Positivas:**
- Agentes que recuerdan contexto de negocio de la empresa
- Cross-device (la memoria está en la DB)
- GDPR compliant (se puede borrar por empresa)

**Negativas:**
- Requiere migration adicional (0152_memory_engine.sql — pendiente)
- Riesgo de memoria "envenenada" (ver ADR-012 sobre Tool injection)

### Implementación
`docs/17_MEMORY_STRATEGY.md`, migration 0152 pendiente

---

## ADR-015: Policy Engine: 4 modos de autonomía de agentes

**Fecha:** Sprint 9 (2024)
**Estado:** ✅ Aceptado

### Contexto
Los agentes IA pueden tomar acciones con consecuencias reales (crear facturas, enviar emails, modificar datos). Una empresa necesita controlar cuánta autonomía tiene un agente.

### Decisión
4 modos de autonomía configurables por empresa y por agente:
- **observer** — Solo lee, nunca actúa
- **assistant** — Sugiere acciones, el humano decide
- **semi_autonomous** — Actúa en acciones de bajo riesgo, pide aprobación para las demás
- **autonomous** — Actúa sin aprobación (solo para empresas que explícitamente lo habiliten)

### Consecuencias
**Positivas:**
- Las empresas confían más en el sistema cuando pueden controlar la autonomía
- Permite rollout progresivo: empezar en "assistant" y avanzar según confianza
- Reduce riesgo de acciones no deseadas

**Negativas:**
- Más complejidad en el Orchestrator (debe verificar modo antes de ejecutar)
- El modo "autonomous" requiere más cuidado en el diseño de las herramientas

### Implementación
`docs/18_AI_GOVERNANCE.md`, `supabase/functions/_shared/orchestrator.ts`, enum `agent_policy` en DB

---

*Ver: `docs/30_ADR_INDEX.md` para el índice y proceso de creación de nuevos ADRs*
*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` para los principios que guían las decisiones*
