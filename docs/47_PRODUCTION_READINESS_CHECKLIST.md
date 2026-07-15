# PRODUCTION READINESS CHECKLIST — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Lista de verificación de preparación para deploy a producción
> Ejecutar antes de cada release

---

## SECCIÓN 1: CÓDIGO Y CALIDAD

### 1.1 TypeScript y Build
- [ ] `npx tsc --noEmit` — cero errores de tipo
- [ ] `npm run build` — build exitoso sin warnings críticos
- [ ] Bundle JS < 350 KB gzip (verificar con vite-bundle-visualizer)
- [ ] Sin dependencias con vulnerabilidades High/Critical (`npm audit`)

### 1.2 Funcionalidad
- [ ] Todos los módulos del release smoke-tested en staging
- [ ] Feature flags configurados correctamente para cada plan
- [ ] El módulo nuevo no rompe módulos existentes (regression check)
- [ ] Funciona en mobile (Capacitor) — si el release toca mobile

### 1.3 Seguridad
- [ ] Sin secrets hardcodeados detectados (búsqueda manual en el diff del PR)
- [ ] Sin `plan === 'x'` checks hardcodeados
- [ ] Zero Trust verificado en toda Edge Function nueva o modificada

---

## SECCIÓN 2: BASE DE DATOS

### 2.1 Migraciones
- [ ] Todas las migraciones del release probadas en staging
- [ ] Las migraciones son idempotentes (usando `IF NOT EXISTS`, `OR REPLACE`)
- [ ] No hay migraciones destructivas sin backup verificado
- [ ] El estado de migraciones en staging coincide con el code

### 2.2 Performance
- [ ] Tablas nuevas tienen índices en `company_id` y `created_at`
- [ ] Nuevas queries verificadas con EXPLAIN ANALYZE (sin Seq Scan en tablas > 10K filas)
- [ ] Políticas RLS probadas para el caso happy path y deny path

---

## SECCIÓN 3: EDGE FUNCTIONS

- [ ] Todas las Edge Functions desplegadas y respondiendo 200 en staging
- [ ] Los logs de staging muestran 0 errores en las últimas 24h
- [ ] Los secrets necesarios están configurados en el proyecto de producción
- [ ] Las funciones que dependen de servicios externos (Gemini, NVIDIA, MP) se verificaron con `ai-health-check`

---

## SECCIÓN 4: OBSERVABILIDAD

- [ ] Sentry DSN configurado y recibiendo eventos de staging
- [ ] Los errores esperados tienen `captureException` apropiado
- [ ] El `audit_log` registra correctamente las nuevas acciones del release
- [ ] `ai_usage` registra correctamente los nuevos tipos de uso

---

## SECCIÓN 5: ROLLBACK PLAN

Para este release específico, documentar:

```
Versión siendo deployada: vX.X.X
Versión anterior: vX.X.X-anterior

Rollback de Frontend: [cómo revertir — Vercel, comando, etc.]
Rollback de Edge Functions: [git checkout <commit> + supabase functions deploy]
Rollback de Migraciones: [irreversible / restore desde backup / migration de rollback]
Tiempo estimado de rollback: [X minutos]
```

---

## SECCIÓN 6: COMUNICACIÓN

- [ ] Equipo notificado del deploy: hora y qué cambia
- [ ] Si hay mantenimiento que afecta a usuarios: banner o email enviado con 24h de anticipación
- [ ] Si hay cambio de plan o precios: email previo al cambio

---

## SECCIÓN 7: POST-DEPLOY INMEDIATO (primeros 30 minutos)

Ejecutar inmediatamente después del deploy:

- [ ] Login con cuenta de prueba: funciona
- [ ] Crear un cliente de prueba: funciona
- [ ] Edge Function ai-proxy responde: `ai-health-check` retorna 200
- [ ] Sentry no muestra errores nuevos en los primeros 15 minutos
- [ ] La nueva feature del release funciona para el happy path
- [ ] Supabase Dashboard: CPU y connections normales

---

## SECCIÓN 8: GATE DE APROBACIÓN

Este checklist requiere la firma de quien hace el deploy:

```
Fecha de deploy: _______________
Versión deployada: _______________
Responsable: _______________
Staging smoke test: ✅ / ❌
Rollback plan documentado: ✅ / ❌
Post-deploy smoke test: ✅ / ❌

Estado: APROBADO / REVERTIDO (eliminar el que no aplica)
```

---

*Ver: `docs/27_RELEASE_STRATEGY.md` para el proceso completo de release*
*Ver: `docs/46_SECURITY_CHECKLIST.md` para checklist de seguridad específico*
*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para qué hacer si el deploy falla*
