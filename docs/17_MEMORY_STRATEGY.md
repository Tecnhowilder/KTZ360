# MEMORY STRATEGY — SHELWI OS
> Versión: 0.1 (stub — implementación en Sprint 6) | Fecha: 2026-07-14
> Describe cómo los agentes IA acumulan, consultan y olvidan información empresarial

---

## 1. PRINCIPIO FUNDAMENTAL

> "La memoria de un agente es el activo más valioso de una empresa en Shelwi. Es lo que hace que el agente se vuelva más inteligente con el tiempo. Por eso está aislada por empresa y nunca puede mezclarse entre tenants."

---

## 2. TIPOS DE MEMORIA

### 2.1 Memoria de Corto Plazo (Contexto de Conversación)

- **Qué es:** El historial de la conversación actual entre usuario y agente
- **Duración:** Solo durante la sesión activa
- **Almacenamiento:** En memoria del proceso del Orchestrator + tabla `agent_executions`
- **Límite:** Budget de tokens del contexto del modelo (configurable por plan)
- **Aislamiento:** Garantizado por `agent_execution_id` único por sesión

### 2.2 Memoria de Largo Plazo (Knowledge Graph por Empresa)

- **Qué es:** Hechos, preferencias, patrones y contexto que persisten entre sesiones
- **Duración:** Configurable por tipo (semanas a años)
- **Almacenamiento:** Tabla `company_memory` en BD con `company_id` obligatorio
- **Límite:** Configurable por plan en `plan_limits` (número de nodos del grafo)
- **Aislamiento:** RLS con `company_id` + verificación adicional en Orchestrator

### 2.3 Memoria de Entidades (Entity Memory)

- **Qué es:** Lo que el agente sabe sobre entidades específicas (un cliente, un proveedor, un proyecto)
- **Estructura:** `entity_type` + `entity_id` + `facts` (JSONB)
- **Ejemplo:** "Cliente ABC prefiere comunicación por email, tiene presupuesto limitado, decide en Viernes"
- **TTL:** 180 días de inactividad → archivado; 365 días → eliminado

### 2.4 Memoria de Patrones (Pattern Memory)

- **Qué es:** Tendencias y reglas que el agente ha aprendido de la empresa
- **Ejemplo:** "Esta empresa paga facturas siempre los días 15 y 30"; "El gerente aprueba proyectos > $5k"
- **TTL:** 90 días sin refuerzo → revisión; 365 días → eliminado
- **Validación:** Los patrones se marcan como `confirmed` solo si ocurren ≥3 veces

### 2.5 Memoria de Procedimientos (Procedure Memory)

- **Qué es:** Cómo esta empresa hace las cosas (su proceso, no el proceso genérico)
- **Ejemplo:** "El proceso de ventas de esta empresa tiene 7 etapas, no 5"
- **TTL:** Larga vida (1-2 años) — los procedimientos son estables

---

## 3. SCHEMA DE BD (borrador)

```sql
-- Migration 0152_memory_engine.sql (a crear en Sprint 6)

CREATE TABLE company_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  memory_type     TEXT NOT NULL CHECK (memory_type IN ('entity','pattern','procedure','fact')),
  scope           TEXT NOT NULL, -- 'crm', 'finance', 'hr', 'ops', 'global'
  entity_type     TEXT, -- 'client', 'supplier', 'project', null si es global
  entity_id       UUID, -- ID del registro al que aplica, null si es global
  content         TEXT NOT NULL, -- el hecho/patrón en lenguaje natural
  content_vector  vector(1536), -- embedding para búsqueda semántica
  confidence      FLOAT NOT NULL DEFAULT 1.0, -- 0-1, baja con el tiempo sin refuerzo
  occurrences     INT NOT NULL DEFAULT 1, -- cuántas veces se ha observado este patrón
  last_reinforced TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ, -- null = sin expiración
  created_by_agent TEXT NOT NULL, -- agent_id que creó este recuerdo
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS obligatorio
ALTER TABLE company_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_memory_select" ON company_memory
  FOR SELECT USING (company_id = (SELECT current_workspace_id()));

-- Índices
CREATE INDEX ON company_memory (company_id, memory_type);
CREATE INDEX ON company_memory (company_id, entity_type, entity_id);
CREATE INDEX ON company_memory USING ivfflat (content_vector vector_cosine_ops);
```

---

## 4. API DE MEMORIA

### 4.1 Escribir memoria

```typescript
// Llamada desde Tool Registry tras completar una acción
await writeMemory({
  companyId: context.companyId,
  memoryType: 'entity',
  scope: 'crm',
  entityType: 'client',
  entityId: clientId,
  content: 'Prefiere reuniones por Zoom los martes a las 10am',
  confidence: 1.0,
  createdByAgent: context.agentId,
  expiresAt: addDays(new Date(), 180),
});
```

### 4.2 Consultar memoria

```typescript
// Búsqueda semántica por contexto
const memories = await queryMemory({
  companyId: context.companyId,
  query: 'preferencias de contacto del cliente',
  scope: 'crm',
  entityId: clientId, // si es sobre una entidad específica
  limit: 10,
  minConfidence: 0.5,
});
```

### 4.3 Reforzar memoria (aumenta confidence)

```typescript
await reinforceMemory(memoryId, {
  companyId: context.companyId, // seguridad: verificar que pertenece a esta empresa
  incrementOccurrences: true,
});
```

---

## 5. REGLAS DE AISLAMIENTO (CRÍTICO)

### 5.1 Tenant isolation

```typescript
// CORRECTO: company_id del contexto verificado del Orchestrator
const memories = await queryMemory({ companyId: context.companyId, ... });

// INCORRECTO: company_id de parámetros del agente
const memories = await queryMemory({ companyId: request.params.companyId, ... }); // ❌
```

### 5.2 Verificación doble

El Memory Engine verifica `company_id` en dos capas:
1. **RLS de PostgreSQL:** A nivel de BD — una query incorrecta no puede leer datos de otra empresa
2. **Verificación en código:** El Orchestrator verifica que el `company_id` del resultado coincide con el del contexto

### 5.3 Contexto del agente no puede mezclar empresas

- Un agente nunca tiene contexto de múltiples empresas simultáneamente
- Si un agente se ejecuta para empresa A, su `context.companyId` es inmutable durante esa ejecución
- Ninguna función del Memory Engine acepta `companyId = null` o `companyId = undefined`

---

## 6. TTL Y EXPIRACIÓN

| Tipo | TTL sin refuerzo | TTL máximo | Acción al expirar |
|---|---|---|---|
| Entity Memory | 180 días | 365 días | Soft delete → archivado |
| Pattern Memory | 90 días | 365 días | `confidence -= 0.1` por semana sin refuerzo |
| Procedure Memory | 365 días | 730 días | Soft delete → archivado |
| Conversation Context | Duración de sesión | 24 horas | Hard delete |
| Archived memories | — | — | Hard delete a 2 años (configurable) |

---

## 7. LIMITS POR PLAN

| Métrica | Free | Start | Growth | Business OS | Enterprise OS |
|---|---|---|---|---|---|
| Nodos de memoria total | 0 | 100 | 1.000 | 10.000 | Ilimitado |
| Entity memories | 0 | 50 | 500 | 5.000 | Ilimitado |
| Búsquedas semánticas / día | 0 | 50 | 500 | 5.000 | Ilimitado |
| Vectores almacenados | 0 | 100 | 1.000 | 10.000 | Ilimitado |

Todos los límites vienen de `plan_limits` en BD — nunca hardcodeados.

---

## 8. PRIVACIDAD Y CUMPLIMIENTO

### 8.1 Qué NO almacenar en memoria

- Datos financieros en texto plano (montos, cuentas bancarias) — solo referencias a IDs
- Contraseñas, tokens, secrets
- Datos de salud
- Documentos completos — solo resúmenes estructurados

### 8.2 Derecho al olvido

Para solicitudes de eliminación de datos (GDPR):
```typescript
await purgeCompanyMemory(companyId); // elimina TODOS los nodos de memoria de la empresa
```
El proceso registra la solicitud y eliminación en `audit_log`.

### 8.3 Exportación de datos

La memoria de una empresa puede exportarse en JSON (derecho de acceso):
```typescript
await exportCompanyMemory(companyId); // devuelve JSON con todos los nodos
```

---

## 9. PRÓXIMOS PASOS (Sprint 6)

1. Instalar `pgvector` en Supabase (habilitar extensión)
2. Crear migration `0152_memory_engine.sql` con schema de arriba
3. Implementar `writeMemory()` y `queryMemory()` como RPCs SECURITY DEFINER
4. Integrar Memory Engine al Orchestrator en `_shared/orchestrator.ts`
5. Implementar job de expiración automática (Supabase scheduled function)
6. Tests: tenant isolation (empresa A ≠ empresa B), TTL, confidence decay

---

*Este documento es el diseño. La implementación comienza en Sprint 6.*
*Si migration 0152 tiene estructura diferente a este diseño, actualizar este documento.*
