# CONSTITUTION DE ARQUITECTURA SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14 | Autoridad: CTO + Chief Architect
> Este documento es la ley fundamental. Toda decisión de diseño que lo contradiga es rechazada.

---

## ARTÍCULO 1 — NATURALEZA DEL SISTEMA

**Shelwi es un Sistema Operativo Empresarial (Business OS), no un CRM, no un ERP, no un gestor de tareas.**

Consecuencias arquitectónicas no negociables:
- Toda acción de negocio es una **Capability** registrada, no una función suelta.
- Todo módulo es un **Departamento** con sus Capabilities, no una pantalla con su lógica.
- Toda integración externa es un **Tool** en el Tool Registry, no una llamada directa desde el frontend.
- Toda decisión autónoma es ejecutada por un **Agent** bajo una **Policy**, no por lógica fija.

---

## ARTÍCULO 2 — LA SECUENCIA DE ORO (INVIOLABLE)

Antes de escribir una sola línea de código para cualquier nueva función:

```
Necesidad de Negocio
        ↓
 Capability (registrada, con ID, inputs, outputs, permisos, eventos, audit)
        ↓
 Evento (publicado al Event Bus, inmutable, con company_id)
        ↓
 Automatización (opcional, configurable desde BD, no hardcodeada)
        ↓
 Tool (interfaz segura entre agentes e infraestructura)
        ↓
 Agent (usa Tools, respeta Policy, escribe en Memory)
        ↓
 Pantalla (consume Capability via API, nunca lógica de negocio en el frontend)
```

Violar esta secuencia genera deuda técnica de Prioridad 0. No se aprueba ningún PR que la viole.

---

## ARTÍCULO 3 — REGLAS DE DATOS (OBLIGATORIAS)

### 3.1 Multi-tenant
- Toda tabla nueva requiere `company_id UUID NOT NULL REFERENCES companies(id)`.
- Toda tabla nueva requiere política RLS de las 4 operaciones (SELECT, INSERT, UPDATE, DELETE).
- Toda consulta de un agente debe incluir `company_id` en su contexto — jamás puede obtenerlo del input del usuario.
- El generador dinámico en `0003_rls.sql` crea las 4 políticas automáticamente. Usarlo siempre.

### 3.2 Soft Delete
- Toda tabla con registros de negocio usa soft delete: `deleted_at TIMESTAMPTZ DEFAULT NULL`.
- Hard delete solo para tablas de eventos/audit/logs con TTL definido.
- Nunca exponer registros con `deleted_at IS NOT NULL` a agentes sin permiso explícito.

### 3.3 Auditoría obligatoria
- Toda escritura que modifica datos de negocio emite un evento de auditoría.
- `audit_log` es inmutable — INSERT only, sin UPDATE ni DELETE (RLS lo garantiza).
- Todo registro de audit incluye: `company_id`, `user_id`, `action`, `entity_type`, `entity_id`, `diff`, `timestamp`.

### 3.4 Tipado fuerte
- Toda columna nueva tiene tipo explícito — nunca `text` cuando `uuid`, `timestamptz` o `enum` son correctos.
- Enums de PostgreSQL para estados y categorías fijas — nunca verificar valores con `CHECK (value IN (...))` en código.
- Los tipos generados en `src/lib/database.types.ts` son la verdad de tipos — nunca redefinirlos manualmente.

### 3.5 Migraciones
- Toda migración tiene número secuencial: `XXXX_nombre_descriptivo.sql`.
- El siguiente número disponible es `0150_` (confirmado al 2026-07-14).
- Toda migración puede re-ejecutarse sin error (idempotente): usar `IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`.
- Toda migración de schema tiene su DOWN script documentado en comentarios al final del archivo.

---

## ARTÍCULO 4 — REGLAS DE PLANES Y PERMISOS (INVIOLABLE)

### 4.1 Prohibición de hardcoding de planes

```typescript
// PROHIBIDO — genera deuda técnica P0
if (plan === 'premium') { showDashboard(); }
if (plan === 'pro') { enableFeature(); }
plan !== 'free' && plan !== 'pro' && ...

// OBLIGATORIO
const { canUse } = useFeatureAccess('dashboard_executive');
if (canUse) { showDashboard(); }
```

Los nombres de planes actuales en código (`free`, `pro`, `premium`) son **deuda activa** (TD-CRÍTICO-01).
Toda verificación nueva de permisos usa `useFeatureAccess(feature)` desde `src/hooks/usePermissions.ts`.

### 4.2 Verificación en Edge Functions
```typescript
// PROHIBIDO
if (!['pro', 'premium', 'enterprise'].includes(planCode)) { throw Error('Plan required'); }

// OBLIGATORIO
const hasAccess = await checkFeatureAccess(workspaceId, 'feature_name'); // via plan_features table
if (!hasAccess) { throw Error('Feature not available on current plan'); }
```

### 4.3 Límites siempre desde BD
- Nunca hardcodear límites numéricos: `maxUsers = 5`, `maxStorage = 1GB`.
- Los límites viven en la tabla `plan_limits` y se obtienen via `getLimit(resource)`.
- Si el límite no existe en BD, se usa el valor más restrictivo — nunca el más permisivo.

---

## ARTÍCULO 5 — REGLAS DE SEGURIDAD (ZERO TRUST)

### 5.1 Principio Zero Trust
> "El frontend nunca decide acceso. El backend nunca confía en el frontend."

- Todo dato visible en la pantalla pasó por una RPC SECURITY DEFINER o por RLS.
- Ninguna validación de permisos vive solo en el frontend.
- Ningún `workspace_id` o `company_id` viene del frontend — siempre se deriva del JWT en el backend.
- Toda función SECURITY DEFINER verifica: JWT válido → workspace activo → plan válido → acción permitida → ejecutar.

### 5.2 Variables de entorno
- `VITE_SUPABASE_ANON_KEY` y `VITE_SUPABASE_URL` son las ÚNICAS variables permitidas en `VITE_`.
- Todo secret (API keys, tokens de terceros) vive en Supabase Vault o como secret de Edge Function.
- El `ANON_KEY` es público por diseño — la seguridad viene de RLS, no del ocultamiento de la key.
- Nunca pasar secrets de terceros como variables `VITE_*`.

### 5.3 Agentes IA
- Todo agente recibe su `company_id` del sistema (via JWT o parámetro verificado del Orchestrator), nunca del input del usuario.
- Todo parámetro que llega al Orchestrator desde el frontend es tratado como datos no confiables.
- Toda invocación de Tool valida que el agente tenga permiso para ese Tool según su Policy activa.
- Ningún agente puede leer datos de otra empresa — el Orchestrator lo verifica antes de ejecutar.

### 5.4 Prompt Security
- Ningún input del usuario se inyecta directamente en un System Prompt sin sanitización.
- Los System Prompts son plantillas en el Prompt Registry — no strings en el código.
- Todo input del usuario que procesará un agente pasa por el Content Policy Layer antes de llegar al LLM.
- Los documentos externos (PDF, email, WhatsApp) se procesan en un sandbox antes de incluirse en el contexto del agente.

---

## ARTÍCULO 6 — REGLAS DE LA INTERFAZ DE USUARIO

### 6.1 Mobile First (Constitución)
- El diseño comienza desde 320px. Toda pantalla funciona en 320px antes de expandirse.
- Los 7 breakpoints oficiales son: 320px, 375px, 768px, 1024px, 1280px, 1440px, 1920px+.
- Un codebase, una UI, siempre. Nunca bifurcaciones de "versión web" vs "versión móvil".
- `capacitor.config.ts` es el punto único de configuración nativa.

### 6.2 Design System
- Solo componentes de `shadcn/ui` o derivados en `src/components/ui/`.
- Nunca crear componentes de UI primitivos desde cero — extender shadcn.
- Tokens de diseño en `tailwind.config.ts` — nunca valores hardcodeados en JSX (`text-[#ff0000]` prohibido).
- Dark mode desde inicio: toda pantalla nueva soporta ambos modos.

### 6.3 Performance
- Lazy loading obligatorio para rutas y componentes pesados.
- Ningún componente carga más de 50kb de JS en el path inicial.
- Imágenes: WebP, tamaño apropiado al viewport, `loading="lazy"` siempre.
- Core Web Vitals objetivo: LCP < 2.5s, FID < 100ms, CLS < 0.1.

---

## ARTÍCULO 7 — REGLAS DE IA

### 7.1 Tool Registry (INVIOLABLE)
> "Ningún agente puede acceder directamente a la base de datos. Solo a través del Tool Registry."

- Toda acción de un agente sobre datos = invocación de un Tool.
- Cada Tool tiene: ID, nombre, descripción, parámetros tipados, permisos requeridos, rate limit, audit log obligatorio.
- El Tool Registry valida permisos ANTES de ejecutar.
- Si un Tool no existe, el agente responde "Capability not available" — nunca improvisa una alternativa.

### 7.2 Orchestrator
- Un solo Orchestrator (`supabase/functions/ai-proxy`). No duplicar.
- El Orchestrator solo coordina — no responde preguntas, no ejecuta lógica de negocio.
- El Orchestrator inyecta: `company_id`, `policy_mode`, `prompt_version`, `model_id` — el agente no puede cambiarlos.
- Multi-provider: Gemini → NVIDIA NIM → fallback. Agregar nuevos modelos en `_shared/orchestrator.ts`.

### 7.3 Memory
- Cada agente tiene acceso solo a la memoria de su empresa (`company_id` scope).
- La memoria se escribe solo después de que la acción fue completada y auditada.
- La memoria nunca contiene datos sensibles en texto plano — referencias a IDs de registros.
- El contexto de un agente = System Prompt (Prompt Registry) + Memory scope + Policy vigente + Conversación actual.

### 7.4 Policy Engine
- Cada agente opera en uno de 4 modos: `observer`, `assistant`, `semi_autonomous`, `autonomous`.
- `observer`: Solo lee, reporta. Nunca escribe.
- `assistant`: Prepara acciones, espera aprobación humana. Nunca ejecuta solo.
- `semi_autonomous`: Ejecuta acciones reversibles. Escala al humano para irreversibles.
- `autonomous`: Ejecuta con audit trail completo. Solo para tareas totalmente definidas y auditadas.
- El modo se configura por empresa, por agente, por contexto — desde BD. Nunca en código.

---

## ARTÍCULO 8 — REGLAS DE DESARROLLO

### 8.1 Antes de cada sesión de desarrollo

Verificar en orden:
1. ¿La feature que voy a construir tiene una Capability definida en el Capability Catalog?
2. ¿Los eventos que genera están en el Event Catalog?
3. ¿Los Tools que necesita están en el Tool Catalog?
4. ¿Los permisos necesarios están en la Permission Matrix?
5. ¿Existe una migración pendiente que debo ejecutar primero?

Si alguna respuesta es NO, detener y definir lo que falta antes de escribir código.

### 8.2 Definition of Done (extracto — ver EPMO v2.0 sección 11)

Un item está Done cuando:
- [ ] El código pasa `tsc --noEmit` sin errores
- [ ] RLS existe para toda tabla nueva
- [ ] No hay `plan === 'premium'` ni equivalentes
- [ ] No hay secrets en frontend
- [ ] Toda acción genera audit event
- [ ] Component funciona en 320px y en 1920px
- [ ] Dark mode funciona
- [ ] Sin `console.log` en producción
- [ ] Migration idempotente y con DOWN script

### 8.3 Restricciones absolutas

Estos patrones son **siempre rechazados** en code review:
```typescript
// 1. Plan hardcoding
plan === 'premium' | plan === 'pro' | plan !== 'free'

// 2. SQL directo desde agente
await supabase.from('clients').select('*') // dentro de un agente

// 3. Secret en frontend
const apiKey = import.meta.env.VITE_OPENAI_KEY

// 4. Lógica de negocio en componente
const handleSubmit = () => { // 50+ líneas de lógica }

// 5. Sin company_id en tabla de negocio
CREATE TABLE tasks (id uuid, title text); -- falta company_id + RLS

// 6. Agente con parámetro company_id del usuario
const companyId = userInput.companyId; // nunca — siempre del JWT
```

---

## ARTÍCULO 9 — TECH STACK OFICIAL

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Frontend | React | 19.2.6 | Server Components: no (Capacitor) |
| Build | Vite | 8.x | Single build target |
| Lenguaje | TypeScript | ~6.0.2 | Strict mode siempre |
| UI | Tailwind CSS | v3.x | No migrar a v4 sin ADR |
| Components | shadcn/ui | latest | Extender, no reemplazar |
| State (server) | TanStack Query | v5 | Stale-while-revalidate |
| Backend | Supabase | latest | Edge Functions = Deno 2.x |
| Mobile | Capacitor | 8.x | Single codebase |
| Offline | Dexie | 4.x | `offlineDB.ts` — no duplicar |
| Monitoring | Sentry | 10.x | Error tracking + performance |
| AI Models | Gemini + NVIDIA NIM | latest | Via `_shared/orchestrator.ts` |

**Cambios al stack requieren ADR aprobado.** No se introduce tecnología nueva sin ADR.

---

## ARTÍCULO 10 — ADRs VIGENTES

| ADR | Decisión | Fecha |
|---|---|---|
| ADR-001 | Supabase como BaaS único (PostgreSQL + Auth + Edge Functions + Storage) | Original |
| ADR-002 | Capacitor 8 como puente nativo (un codebase React para web + iOS + Android) | Original |
| ADR-003 | Capability-First Architecture (toda acción de negocio = Capability registrada) | Original |
| ADR-004 | Tool Registry (agentes nunca tocan BD directo) | Original |
| ADR-005 | Event Bus para side effects (nada se ejecuta "porque sí") | Original |
| ADR-006 | canUse() / useFeatureAccess() — nunca if(plan===) | Original |
| ADR-007 | shadcn/ui como Design System base | Original |
| ADR-008 | Single Codebase — una UI adaptable, no bifurcaciones mobile/web | Original |
| ADR-009 | [NEW] Trunk Based Development con Feature Flags (no long-lived branches) | 2026-07-14 |
| ADR-010 | [NEW] Content Policy Layer para todos los inputs de agentes IA | 2026-07-14 |
| ADR-011 | [NEW] Particionamiento de audit_log y events desde creación | 2026-07-14 |
| ADR-012 | [NEW] CQRS informal formalizado: RPCs para reads, services para writes | 2026-07-14 |

---

*Este documento requiere aprobación de CTO para ser modificado.*
*Toda modificación genera una nueva versión (v1.1, v1.2...) con registro de cambios.*
*Versión vigente: 1.0 — 2026-07-14*
