# TOOL DEVELOPMENT GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Guía para crear nuevas herramientas del Tool Registry
> Referencia: `docs/06_TOOL_CATALOG.md` (12 herramientas actuales)

---

## 1. QUÉ ES UNA HERRAMIENTA (TOOL)

Una Tool es una función predefinida, auditada y con permisos explícitos que los agentes IA pueden invocar para interactuar con el sistema.

**Regla fundamental (ADR-012):** Los agentes IA NUNCA generan SQL directamente. Toda interacción con datos pasa por una Tool del registry.

---

## 2. CLASIFICACIÓN DE TOOLS

| Tipo | Riesgo | Aprobación | Ejemplos |
|---|---|---|---|
| READ | Bajo | Automático | Buscar clientes, ver facturas |
| WRITE-Low | Medio | Automático (semi_autonomous+) | Crear tarea, agregar nota |
| WRITE-High | Alto | Requiere aprobación humana | Crear factura, enviar email al cliente |
| SYSTEM | Variable | Según subtipo | Health check, system status |

---

## 3. ESTRUCTURA DE UNA TOOL

```typescript
interface Tool {
  id:           string;    // TOOL-001, TOOL-SYS-01, etc.
  name:         string;    // Nombre legible
  type:         'READ' | 'WRITE-Low' | 'WRITE-High' | 'SYSTEM';
  description:  string;    // Qué hace (para el LLM y para humanos)

  // Quién puede usar esta tool
  agent_whitelist: string[];  // ['AGT-ALL'] o ['AGT-001', 'AGT-002']

  // Rate limiting
  rate_limit: {
    calls_per_minute: number;
    calls_per_hour: number;
  };

  // Si requiere aprobación humana
  requires_approval: boolean;
  approval_conditions?: string;  // Cuándo sí/no requiere

  // Input/Output schema (JSON Schema)
  input_schema:  JSONSchema;
  output_schema: JSONSchema;

  // Implementación
  handler: (input: ToolInput, context: ToolContext) => Promise<ToolOutput>;
}
```

---

## 4. EJEMPLO COMPLETO — CREAR UNA TOOL READ

```typescript
// TOOL-006: Buscar clientes por nombre o email

const searchClientsTool: Tool = {
  id: 'TOOL-001',  // Verificar en 06_TOOL_CATALOG.md que el ID no esté tomado
  name: 'search_clients',
  type: 'READ',
  description: 'Busca clientes activos de la empresa por nombre, email o teléfono. Devuelve máximo 20 resultados.',
  agent_whitelist: ['AGT-ALL'],
  rate_limit: { calls_per_minute: 30, calls_per_hour: 500 },
  requires_approval: false,

  input_schema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Texto a buscar (nombre, email, teléfono)' },
      status: { type: 'string', enum: ['active', 'inactive', 'all'], default: 'active' },
    },
  },

  output_schema: {
    type: 'object',
    properties: {
      clients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
      total: { type: 'number' },
    },
  },

  handler: async (input, context) => {
    // SIEMPRE filtrar por company_id del contexto (Zero Trust)
    const { data: clients } = await context.supabase
      .from('clients')
      .select('id, name, email, phone, status')
      .eq('company_id', context.workspace_id)   // NUNCA omitir esto
      .or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%`)
      .limit(20);

    return { clients: clients ?? [], total: clients?.length ?? 0 };
  },
};
```

---

## 5. EJEMPLO COMPLETO — CREAR UNA TOOL WRITE-High

```typescript
// Nueva tool: crear factura desde una orden

const createInvoiceTool: Tool = {
  id: 'TOOL-009',  // WRITE-High
  name: 'create_invoice',
  type: 'WRITE-High',
  description: 'Crea una factura a partir de una orden o cotización aceptada. REQUIERE APROBACIÓN DEL USUARIO antes de ejecutar.',
  agent_whitelist: ['AGT-002'],  // Solo el AI Financial Advisor
  rate_limit: { calls_per_minute: 5, calls_per_hour: 50 },
  requires_approval: true,
  approval_conditions: 'Siempre requiere aprobación. El usuario debe confirmar el monto y el cliente antes de crear la factura.',

  input_schema: {
    type: 'object',
    required: ['order_id'],
    properties: {
      order_id: { type: 'string', description: 'UUID de la orden desde la que generar la factura' },
      due_date: { type: 'string', format: 'date', description: 'Fecha de vencimiento (ISO 8601)' },
    },
  },

  handler: async (input, context) => {
    // 1. Verificar que la orden pertenece a la empresa (Zero Trust)
    const { data: order } = await context.supabase
      .from('orders')
      .select('id, client_id, total, company_id')
      .eq('id', input.order_id)
      .eq('company_id', context.workspace_id)  // Verificación crítica
      .single();

    if (!order) throw new Error('order_not_found_or_unauthorized');

    // 2. Usar RPC (no INSERT directo) para la lógica de negocio
    const { data, error } = await context.supabase.rpc('generate_invoice_from_order', {
      p_order_id:     input.order_id,
      p_workspace_id: context.workspace_id,
      p_due_date:     input.due_date ?? null,
    });

    if (error) throw error;

    return { invoice_id: data.invoice_id, invoice_number: data.invoice_number };
  },
};
```

---

## 6. CONTEXT DISPONIBLE PARA LAS TOOLS

```typescript
interface ToolContext {
  workspace_id:  string;           // SIEMPRE usar esto para filtros de DB
  user_id:       string;           // Usuario que inició la conversación con el agente
  agent_id:      string;           // Qué agente está ejecutando
  supabase:      SupabaseClient;   // Cliente con service_role (¡CUIDADO! Bypass RLS)
  execution_id:  string;           // Para el audit log
  policy:        AgentPolicy;      // observer | assistant | semi_autonomous | autonomous
}
```

**CRÍTICO:** El cliente `supabase` en el contexto tiene `service_role` (bypass de RLS). Esto significa que **las tools DEBEN filtrar por `workspace_id` manualmente** en todas las queries.

---

## 7. PROCESO PARA AGREGAR UNA NUEVA TOOL

1. Verificar que la tool no existe ya en `docs/06_TOOL_CATALOG.md`
2. Clasificar el tipo: READ, WRITE-Low, WRITE-High, SYSTEM
3. Definir el ID en secuencia
4. Escribir el input_schema y output_schema
5. Implementar el handler con Zero Trust (filtrar por workspace_id)
6. Agregar audit log en tools WRITE-*:
   ```typescript
   await context.supabase.from('audit_log').insert({
     company_id:  context.workspace_id,
     agent_id:    context.agent_id,
     action:      'TOOL_EXECUTED',
     entity_type: 'invoice',
     entity_id:   result.invoice_id,
     metadata:    { tool_id: 'TOOL-009', input: sanitizedInput },
   });
   ```
7. Actualizar `docs/06_TOOL_CATALOG.md` con la nueva tool
8. Actualizar `docs/07_AGENT_CATALOG.md` si agentes la usan

---

## 8. REGLAS DE SEGURIDAD — NO NEGOCIABLES

- [ ] Toda tool filtra por `context.workspace_id` en cada query
- [ ] Las tools WRITE-High tienen `requires_approval: true`
- [ ] Ninguna tool genera SQL dinámico
- [ ] Las tools no reciben `workspace_id` del agente — siempre del `context`
- [ ] Toda tool WRITE-* registra en `audit_log`
- [ ] Las tools tienen rate limits definidos

---

*Ver: `docs/06_TOOL_CATALOG.md` para el catálogo actual de 12 herramientas*
*Ver: `docs/31_ARCHITECTURE_DECISION_RECORDS.md` ADR-012 para el fundamento*
*Ver: `supabase/functions/ai-proxy/index.ts` para la implementación del tool executor*
