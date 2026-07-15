# SECURITY CHECKLIST — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Lista de verificación de seguridad para desarrollo y deploys
> Para detalle completo ver: `docs/19_SECURITY_GOVERNANCE.md` y `docs/20_DEVSECOPS_GUIDE.md`

---

## CHECKLIST PRE-MERGE (cada PR)

### Código
- [ ] Sin secrets hardcodeados (tokens, API keys, passwords) en código fuente
- [ ] Sin `console.log` con datos sensibles (PII, tokens)
- [ ] Sin variables `VITE_` exponiendo secretos de backend
- [ ] SQL no construido por concatenación de strings
- [ ] Inputs de usuario validados y sanitizados antes de usar

### Multi-tenancy
- [ ] Toda nueva tabla tiene `company_id` / `workspace_id` NOT NULL
- [ ] Toda nueva tabla tiene RLS habilitado
- [ ] Las queries del frontend filtran por `company_id` del contexto autenticado
- [ ] En Edge Functions: `workspace_id` obtenido de DB (profiles), nunca del body

### Feature gates
- [ ] Sin `plan === 'premium'` u otros checks hardcodeados de plan
- [ ] Toda restricción de feature usa `useFeatureAccess()` o verifica `plan_features`
- [ ] Límites de uso validados server-side (no solo en frontend)

### Edge Functions
- [ ] JWT verificado en el primer bloque
- [ ] `workspace_id` del JWT/profiles, no del request
- [ ] Rol del usuario verificado para operaciones privilegiadas
- [ ] Respuestas de error sin detalles internos
- [ ] CORS configurado correctamente

---

## CHECKLIST DE NUEVA MIGRATION

- [ ] Nombramiento secuencial: `NNNN_descripcion.sql`
- [ ] Nueva tabla: `id UUID PK`, `company_id FK`, `created_at TIMESTAMPTZ`
- [ ] RLS habilitado en tabla nueva
- [ ] Policies RLS creadas (SELECT y ALL según caso)
- [ ] Sin datos sensibles hardcodeados en la migration
- [ ] Sin DROP TABLE / DROP COLUMN sin backup

---

## CHECKLIST PRE-DEPLOY A PRODUCCIÓN

### Secrets y configuración
- [ ] Secrets en Supabase verificados (no en código, no en Git)
- [ ] `.env.local` no commitado
- [ ] Variables de entorno de staging difieren de producción
- [ ] `INTEGRATION_ENCRYPTION_KEY` configurado y con >= 32 bytes

### Base de datos
- [ ] Migraciones probadas en staging
- [ ] Rollback plan definido para migrations destructivas
- [ ] Backups verificados (Supabase Dashboard)

### Edge Functions
- [ ] Todas las funciones desplegadas y respondiendo 200 en staging
- [ ] Webhooks (MP, Alegra) verificados con HMAC correcto
- [ ] Rate limits configurados en ai-proxy

### Código
- [ ] Sin `console.log` en código de producción (o solo errores)
- [ ] Sentry DSN configurado para captura de errores
- [ ] Build exitoso (`npm run build` sin errores ni warnings críticos)
- [ ] TypeScript sin errores (`npx tsc --noEmit`)

---

## CHECKLIST MENSUAL DE SEGURIDAD

- [ ] Revisar `audit_log` por actividad sospechosa (accesos inusuales, volumen anormal)
- [ ] Verificar `integration_credentials`: ¿algún token expirado?
- [ ] Revisar `ai_usage`: ¿hay empresa con consumo anormal?
- [ ] Revisar dependencias npm: `npm audit` (atender High/Critical)
- [ ] Verificar que los webhooks (MP, Alegra) siguen validando HMAC
- [ ] Rotar secrets si hay sospecha de compromiso
- [ ] Revisar accesos de miembros del equipo: ¿hay cuentas de ex-empleados activas?

---

## CHECKLIST DE RESPUESTA A VULNERABILIDAD

Si se descubre una vulnerabilidad:

1. **Evaluar severidad** (P0/P1/P2/P3)
2. **¿Está siendo explotada?** → Si sí, P0 inmediato
3. **Parchear** → Fix mínimo que cierra la vulnerabilidad
4. **Verificar** → El fix resuelve el problema sin introducir nuevos
5. **Deploy** → Seguir proceso de hotfix si es P0/P1
6. **Rotar credenciales** si pueden estar comprometidas
7. **Notificar** → Usuarios afectados si hubo acceso a sus datos
8. **Post-mortem** → Análisis de causa raíz y medidas preventivas

---

*Ver: `docs/19_SECURITY_GOVERNANCE.md` para la política de seguridad completa*
*Ver: `docs/20_DEVSECOPS_GUIDE.md` para DevSecOps en el ciclo de desarrollo*
*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para incidentes de seguridad mayores*
