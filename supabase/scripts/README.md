# supabase/scripts/

Directorio para scripts de administración, auditoría y operaciones de mantenimiento.

## Qué va aquí

- Scripts de auditoría del estado del schema (verificación de tablas, índices, políticas).
- Herramientas de administración puntual (backfills, correcciones manuales documentadas).
- Scripts de diagnóstico para soporte.
- Operaciones que se ejecutan manualmente en el SQL Editor de Supabase, no via CLI.

## Qué NO va aquí

- Cambios de esquema permanentes → van en `migrations/`.
- Seeds de datos iniciales → van en `seeds/`.
- Datos de QA o usuarios de prueba → van en `qa/`.

## Convención de nombres

```
descripcion_del_objetivo.sql

Ejemplos:
  audit_rls_policies.sql
  backfill_workspace_storage_bytes.sql
  diagnose_session_conflicts.sql
```

## Nota

Los scripts en este directorio **no son rastreados por el sistema de migraciones de Supabase**.
Son herramientas idempotentes y documentadas para uso interno del equipo de operaciones.

> ⚠️ Cada script debe incluir un comentario en la cabecera indicando:
> - Propósito
> - Precondiciones
> - Efectos secundarios
> - Si es idempotente o no
