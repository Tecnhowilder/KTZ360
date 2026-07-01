# docs/adr/ — Architecture Decision Records

Registro de decisiones de arquitectura del proyecto Shelwi.

## Qué va aquí

Un ADR (Architecture Decision Record) documenta una decisión de arquitectura importante: el contexto, las opciones evaluadas, la decisión tomada y sus consecuencias.

## Formato estándar

```markdown
# ADR-NNN — Título de la decisión

**Estado**: Aceptado | Supersedido por ADR-NNN | Deprecado
**Fecha**: YYYY-MM-DD
**Deciders**: [nombres]

## Contexto
¿Cuál es el problema o situación que motivó esta decisión?

## Opciones consideradas
1. Opción A — [pros/cons]
2. Opción B — [pros/cons]

## Decisión
¿Qué se decidió y por qué?

## Consecuencias
¿Qué impacto tiene esta decisión? ¿Qué se hace más fácil/difícil?
```

## ADRs registrados

| Número | Título | Estado | Fecha |
|---|---|---|---|
| ADR-001 | Supabase como backend único (BaaS) | Aceptado | 2024-Q1 |
| ADR-002 | Arquitectura Desktop/Mobile con componentes separados | Aceptado | 2024-Q2 |
| ADR-003 | TanStack Query para gestión de datos remotos | Aceptado | 2024-Q2 |
| ADR-004 | Capacitor para empaquetado móvil nativo | Aceptado | 2024-Q3 |
| ADR-005 | Multi-tenant via workspace_id en JWT (Zero Trust) | Aceptado | 2024-Q3 |
| ADR-006 | WorkspaceProvider como single source of truth de tenant | Aceptado | 2025-Q1 |

> Los ADRs formales en formato extendido se añaden como `ADR-NNN_titulo.md` en este directorio.
> El grafo de arquitectura generado por codebase-memory MCP también actúa como ADR vivo del estado actual.
