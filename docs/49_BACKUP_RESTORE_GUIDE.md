# BACKUP & RESTORE GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Procedimientos de backup y recuperación de datos

---

## 1. BACKUPS AUTOMÁTICOS (Supabase)

### 1.1 Backups de base de datos

Supabase realiza backups automáticos:

| Plan | Frecuencia | Retención | Point-in-Time Recovery |
|---|---|---|---|
| Free | Diario | 7 días | No |
| Pro | Diario | 14 días | No |
| Team | Diario | 30 días | Sí (últimas 7 días) |
| Business | Diario | 60 días | Sí (últimas 30 días) |

**Verificar el plan actual** en: Supabase Dashboard > Settings > Billing

### 1.2 Backup de Storage

Supabase no hace backup automático de Storage en planes gratuitos/pro. Los archivos en los buckets (`evidences`, `reports`, `documents`) deben respaldarse manualmente o via política del proveedor cloud.

---

## 2. BACKUPS MANUALES

### 2.1 Backup completo de la base de datos

```bash
# Exportar schema + datos
supabase db dump --db-url $PRODUCTION_DB_URL -f backup_$(date +%Y%m%d_%H%M%S).sql

# Solo schema (DDL)
supabase db dump --db-url $PRODUCTION_DB_URL --schema-only -f schema_$(date +%Y%m%d).sql

# Solo datos (sin schema)
supabase db dump --db-url $PRODUCTION_DB_URL --data-only -f data_$(date +%Y%m%d).sql
```

### 2.2 Backup de tabla específica

```bash
# Exportar solo una tabla (útil para audit_log, ai_usage)
pg_dump $PRODUCTION_DB_URL -t public.audit_log --data-only > audit_log_$(date +%Y%m%d).sql
```

### 2.3 Cuándo hacer backup manual

- **Antes de cada migration destructiva** (DROP TABLE, DROP COLUMN, ALTER TYPE)
- **Antes de un deploy mayor** (nuevas features con migraciones)
- **Mensualmente** como backup adicional a los automáticos

---

## 3. RESTORE — PROCEDIMIENTOS

### 3.1 Restore desde backup automático de Supabase

```
1. Ir a: Supabase Dashboard > Settings > Backups
2. Seleccionar el punto de restore (fecha/hora)
3. Click en "Restore database"
4. Tiempo estimado: 15-60 minutos dependiendo del tamaño
5. IMPORTANTE: El restore sobreescribe TODOS los datos actuales
```

**Cuándo usar este método:**
- Pérdida catastrófica de datos (DELETE masivo accidental, migration destructiva mal ejecutada)
- Solo cuando no hay otra opción (es el método más drástico)

### 3.2 Restore parcial (tablas específicas)

```bash
# Si tienes un backup manual de la tabla:
psql $PRODUCTION_DB_URL < audit_log_backup.sql

# O via Supabase CLI:
psql $PRODUCTION_DB_URL -c "\COPY public.clients FROM 'clients_backup.csv' CSV HEADER"
```

### 3.3 Soft delete — recuperación de datos "eliminados"

Para la mayoría de entidades principales, el "borrado" es soft delete:

```sql
-- Ver registros "eliminados"
SELECT * FROM clients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 20;

-- Restaurar un cliente eliminado
UPDATE clients SET deleted_at = NULL WHERE id = 'uuid-del-cliente';
```

### 3.4 audit_log — fuente de verdad para recuperación

El `audit_log` guarda el `diff` de cada cambio (before/after). Úsalo para reconstruir el estado anterior:

```sql
-- Ver el historial de cambios de un cliente específico
SELECT action, diff, created_at, user_id
FROM audit_log
WHERE entity_type = 'client' AND entity_id = 'uuid-del-cliente'
ORDER BY created_at DESC;

-- El campo diff tiene: { "before": {...estado anterior...}, "after": {...estado nuevo...} }
-- Para recuperar, aplicar el "before" del último cambio destructivo
```

---

## 4. BACKUP DE EDGE FUNCTIONS

Las Edge Functions están en el repositorio Git — el código siempre está versionado.

```bash
# Ver versiones anteriores de una función
git log --oneline supabase/functions/ai-proxy/index.ts

# Restaurar versión anterior
git checkout <commit-hash> -- supabase/functions/ai-proxy/index.ts
supabase functions deploy ai-proxy
```

---

## 5. BACKUP DE SECRETS

Los secrets de Supabase (API keys, encryption keys) NO se respaldan automáticamente.

**Política de gestión de secrets:**
- Mantener una copia segura de todos los secrets en un gestor de contraseñas (1Password, Bitwarden, etc.)
- Nunca en Git, nunca en email, nunca en Slack
- Rotar secrets cada 90 días o si hay sospecha de compromiso

```bash
# Ver secrets configurados (nombres, no valores)
supabase secrets list

# Exportar secrets (requiere acceso admin — NO COMPARTIR EL OUTPUT)
# No hay comando CLI para exportar valores — mantener copia en gestor de contraseñas
```

---

## 6. STORAGE BUCKETS — BACKUP

Para los 6 buckets de Supabase Storage:

| Bucket | Criticidad | Estrategia |
|---|---|---|
| `evidences` | Alta | Sync periódico a S3 externo |
| `documents` | Alta | Sync periódico a S3 externo |
| `reports` | Media | Regenerables — menos crítico |
| `avatars` | Baja | Regenerables desde upload |
| `company-logos` | Baja | Regenerables desde upload |
| `catalog-images` | Baja | Regenerables desde upload |

```bash
# Backup manual de bucket (requiere supabase-js o rclone configurado con S3)
# Pendiente de implementar: script automático de sync a S3
```

**Deuda técnica:** Implementar backup automático de buckets `evidences` y `documents` — TD-BK-01.

---

## 7. SCHEDULE DE BACKUPS

| Tipo | Frecuencia | Responsable | Verificación |
|---|---|---|---|
| DB automático (Supabase) | Diario | Supabase | Mensual: verificar que el backup existe |
| DB manual pre-migration | Antes de cada migration destructiva | Desarrollador | Inmediata post-backup |
| Secrets en gestor de contraseñas | Al crear/rotar | Desarrollador | Trimestral: verificar que están al día |
| Storage evidences/docs | Pendiente automatizar | — | — |

---

*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para escenarios de uso de backups*
*Ver: `docs/48_INCIDENT_RESPONSE_GUIDE.md` para cuándo activar un restore*
