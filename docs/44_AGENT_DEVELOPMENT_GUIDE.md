# AGENT DEVELOPMENT GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Guía para diseñar e implementar nuevos agentes IA
> Referencia: `docs/07_AGENT_CATALOG.md` (15 agentes definidos)

---

## 1. QUÉ ES UN AGENTE EN SHELWI

Un agente es una entidad IA especializada con:
- **Un dominio de responsabilidad** (CRM, Finanzas, RRHH...)
- **Un conjunto de Tools** que puede invocar
- **Un ciclo de vida** definido (IDLE → EXECUTING → COMPLETED)
- **Una política de autonomía** (observer/assistant/semi_autonomous/autonomous)
- **Memoria** para recordar contexto entre sesiones

Los agentes NO tienen acceso directo a la DB — solo via el Tool Registry.

---

## 2. CICLO DE VIDA DEL AGENTE

```
IDLE
  ↓ (trigger: evento o usuario)
TRIGGERED
  ↓ (orchestrator recibe la tarea)
PLANNING
  ↓ (selecciona tools y plan de acción)
      ↙ WRITE-High or policy requires approval
AWAITING_APPROVAL ←────────────────┐
  ↓ (usuario aprueba)              │
EXECUTING ──────── (si falla) ─────┤
  ↓                                 │
COMPLETED                   ERROR ──┘
                              │
                        DEAD_LETTER (si falla > 3 veces)
```

---

## 3. ESTRUCTURA DE UN AGENTE

```typescript
interface AgentDefinition {
  id:          string;    // AGT-NNN
  name:        string;    // Nombre descriptivo
  emoji:       string;    // Emoji para UI
  description: string;    // Qué hace para el usuario

  // Dominio y política
  department:  string;    // CRM | FINANCE | OPS | HR | CX | SYSTEM
  policy:      AgentPolicy;  // Default policy

  // Triggers
  triggers: AgentTrigger[];  // Cuándo se activa el agente

  // Tools disponibles
  tools_core: string[];     // IDs de Tools que puede usar (TOOL-001, etc.)

  // Memoria
  memory: {
    short_term:   boolean;  // Contexto de la sesión actual
    long_term:    boolean;  // Knowledge Graph del negocio
    entity:       boolean;  // Estado de clientes, facturas, etc.
  };

  // Limitaciones explícitas
  limitations: string[];   // Lo que el agente NO puede hacer

  // Implementación
  prompt_base: string;    // System prompt de referencia (ver Prompt Registry)
  model:       string;    // Modelo preferido (puede hacer override del default)
}
```

---

## 4. EJEMPLO COMPLETO — NUEVO AGENTE

Supongamos que se quiere crear un agente para gestión de inventario (AGT-016):

```typescript
const inventoryAgent: AgentDefinition = {
  id: 'AGT-016',
  name: 'AI Inventory Manager',
  emoji: '📦',
  description: 'Monitorea el inventario, alerta cuando hay stock bajo y sugiere órdenes de compra.',

  department: 'OPS',
  policy: 'assistant',  // Sugiere, el humano decide

  triggers: [
    { type: 'schedule', schedule: '0 8 * * MON', description: 'Reporte semanal lunes' },
    { type: 'event', event: 'OPS.ORDER.CONFIRMED', description: 'Al confirmar orden, actualizar stock' },
    { type: 'manual', description: 'Usuario solicita análisis de inventario' },
  ],

  tools_core: [
    'TOOL-001',  // get_business_context (READ)
    'TOOL-002',  // search_records (READ)
    'TOOL-006',  // create_task (WRITE-Low — para alertas)
  ],

  memory: {
    short_term: true,
    long_term:  true,  // Recordar patrones de consumo
    entity:     true,  // Estado de cada producto
  },

  limitations: [
    'No puede crear órdenes de compra directamente (WRITE-High requiere aprobación)',
    'No accede a datos financieros de proveedores',
    'No modifica precios del catálogo',
  ],

  prompt_base: 'PROMPT-AGT-016-v1.0',
  model: 'gemini-2.5-flash',  // Flash para análisis de inventario (velocidad > precisión)
};
```

---

## 5. PROCESO PARA CREAR UN NUEVO AGENTE

### Paso 1: Verificar necesidad
- ¿El agente cubre un dominio que ningún agente existente cubre?
- ¿No es más simple agregar una Tool a un agente existente?

### Paso 2: Definir el agente

Completar la estructura de `AgentDefinition`:
- Asignar el próximo ID secuencial (AGT-016 si el último es AGT-015)
- Definir el dominio y política default
- Listar los triggers (cuándo se activa)
- Seleccionar las Tools del registry que necesita
- Definir las limitaciones explícitas

### Paso 3: Crear el prompt base

```typescript
// En el Prompt Registry (docs/08_PROMPT_REGISTRY.md)
// Registro: PROMPT-AGT-016-v1.0

const promptTemplate = `
Eres el AI Inventory Manager de {company_name}, una empresa de {industry}.

TU ROL:
Eres un asistente especializado en gestión de inventario. Tu trabajo es:
1. Monitorear niveles de stock
2. Alertar cuando hay riesgo de desabastecimiento
3. Sugerir órdenes de compra basadas en histórico de consumo

HERRAMIENTAS DISPONIBLES:
{tools_description}

RESTRICCIONES:
- NUNCA crees órdenes de compra sin aprobación del usuario
- NUNCA modifiques precios del catálogo
- Siempre indica el nivel de confianza de tus predicciones

CONTEXTO DEL NEGOCIO:
{business_context}

HISTORIAL RECIENTE:
{entity_memory}
`;
```

### Paso 4: Registrar en el catálogo

1. Agregar a `docs/07_AGENT_CATALOG.md`
2. Agregar el prompt a `docs/08_PROMPT_REGISTRY.md`
3. Actualizar `docs/04_CAPABILITY_CATALOG.md` si el agente habilita nuevas Capabilities
4. Si el agente usa Tools nuevas: crearlas primero (`docs/43_TOOL_DEVELOPMENT_GUIDE.md`)

### Paso 5: Implementar en ai-proxy

El `ai-proxy` Edge Function actúa como router. Para registrar el nuevo agente:

```typescript
// En supabase/functions/_shared/orchestrator.ts
// Agregar el agente al registry interno
const AGENT_REGISTRY: Record<string, AgentConfig> = {
  'AGT-016': {
    id: 'AGT-016',
    model: 'gemini-2.5-flash',
    tools: ['TOOL-001', 'TOOL-002', 'TOOL-006'],
    prompt_key: 'PROMPT-AGT-016-v1.0',
  },
  // ... otros agentes
};
```

---

## 6. DISEÑO DE PROMPTS — GUÍA RÁPIDA

```
Sistema prompt SIEMPRE debe incluir:
1. Identidad del agente (quién es, qué hace)
2. Tools disponibles con su descripción
3. Restricciones explícitas (qué NO puede hacer)
4. Contexto del negocio (variables de memoria)
5. Formato de respuesta esperado

Slots de variables (se rellenan en runtime):
{company_name}          — Nombre de la empresa
{industry}              — Industria/sector
{tools_description}     — Lista de tools disponibles
{business_context}      — Resumen del negocio
{entity_memory}         — Estado de entidades relevantes
{user_name}             — Nombre del usuario que invoca
{current_date}          — Fecha actual
```

---

## 7. CHECKLIST DE NUEVO AGENTE

- [ ] ID asignado (AGT-NNN, siguiente disponible)
- [ ] Dominio y política default definidos
- [ ] Triggers documentados
- [ ] Tools del registry seleccionadas (ninguna nueva sin crear primero)
- [ ] Limitaciones explícitas documentadas
- [ ] Prompt base creado y registrado en Prompt Registry
- [ ] Modelo asignado (Flash para velocidad, Pro para análisis complejo)
- [ ] Registrado en `docs/07_AGENT_CATALOG.md`
- [ ] Registrado en `supabase/functions/_shared/orchestrator.ts`
- [ ] ADR creado si el agente introduce decisiones arquitectónicas nuevas

---

*Ver: `docs/07_AGENT_CATALOG.md` para los 15 agentes actuales*
*Ver: `docs/06_TOOL_CATALOG.md` para las herramientas disponibles*
*Ver: `docs/08_PROMPT_REGISTRY.md` para gestión de prompts*
*Ver: `docs/18_AI_GOVERNANCE.md` para seguridad de agentes*
