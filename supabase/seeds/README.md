# Seeds — Shelwi

Este directorio contiene scripts de gestión de datos que NO son migraciones.

## cleanup_test_data.sql

Script de limpieza de datos de prueba generados por las migraciones seed:
- `0021_seed_test_users.sql`
- `0023_seed_clients_free_test.sql`

**IMPORTANTE:** Ejecutar MANUALMENTE en Supabase SQL Editor. Revisar el SELECT del Paso 1 antes de ejecutar la limpieza del Paso 2.

## Por qué no se modifican las migraciones históricas

Las migraciones 0021, 0023, 0024 ya fueron aplicadas al proyecto. Modificarlas rompería la integridad del historial de migraciones. En su lugar, este script de limpieza se ejecuta manualmente cuando se necesita limpiar un entorno.
