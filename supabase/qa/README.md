# supabase/qa/

Directorio exclusivo para datos de QA, usuarios de prueba y escenarios de testing temporales.

## Qué va aquí

- Usuarios y workspaces de prueba para QA manual o automatizado.
- Datos sintéticos para validar flujos de negocio.
- Escenarios de testing que se aplican **solo en desarrollo o staging**, nunca en producción.

## Qué NO va aquí

- Cambios de esquema (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, etc.) → van en `migrations/`.
- Seeds necesarios para el funcionamiento del sistema → van en `seeds/`.
- Herramientas de auditoría o administración → van en `scripts/`.

## Convención de nombres

```
NNN_descripcion_del_escenario.sql

Ejemplos:
  001_qa_workspace_owner_premium.sql
  002_qa_workspace_operario_gps.sql
  003_qa_cleanup_all.sql
```

## Cómo aplicar

```bash
# Aplicar un escenario específico (solo en dev/staging)
psql $DATABASE_URL < supabase/qa/001_qa_workspace_owner_premium.sql

# Limpiar después del QA
psql $DATABASE_URL < supabase/qa/003_qa_cleanup_all.sql
```

> ⚠️ NUNCA aplicar estos scripts en la base de datos de producción.
