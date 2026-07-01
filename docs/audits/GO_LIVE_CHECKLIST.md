# GO_LIVE_CHECKLIST — Shelwi
> Fecha: 2026-06-23 | Versión para revisión — No ejecutar cambios sin aprobación

---

## LEYENDA

- ✅ LISTO — ya está hecho
- ❌ FALTA — debe completarse antes de go-live
- ⚠️ PARCIAL — hecho pero incompleto
- 📋 VALIDAR — verificar manualmente antes de go-live

---

## BLOQUE 1: SEGURIDAD CRÍTICA

| # | Check | Estado | Responsable |
|---|-------|--------|-------------|
| S-01 | RLS habilitado en TODAS las tablas | ✅ | DB |
| S-02 | `current_workspace_id()` como función base RLS | ✅ | DB |
| S-03 | Tablas críticas sin `USING (true)` no intencional | ✅ | DB (0092) |
| S-04 | `integration_credentials` inaccesible desde frontend | ✅ | DB |
| S-05 | Tokens OAuth cifrados AES-256-GCM | ✅ | Edge Functions |
| S-06 | workspace_id obtenido de DB en Edge Functions | ✅ | ai-proxy, create-checkout |
| S-07 | `useSessionGuard()` integrado en layout autenticado | ❌ | Frontend |
| S-08 | Price delta mp-webhook reducido a ≤ 500 COP | ❌ | mp-webhook |
| S-09 | `GEMINI_API_KEY` configurado como secret (no expuesto) | 📋 VALIDAR | Supabase Secrets |
| S-10 | `MP_ACCESS_TOKEN` configurado como secret | 📋 VALIDAR | Supabase Secrets |
| S-11 | `INTEGRATION_ENCRYPTION_KEY` configurado | 📋 VALIDAR | Supabase Secrets |
| S-12 | `SUPABASE_SERVICE_ROLE_KEY` no expuesto en frontend | ✅ | Zero Trust |
| S-13 | No hay `VITE_SUPABASE_SERVICE_KEY` en .env frontend | 📋 VALIDAR | .env files |
| S-14 | active_sessions tabla y RLS creados | ✅ | DB (0101) |
| S-15 | `create_session()` llamado en signIn() | ✅ | auth.ts |

---

## BLOQUE 2: INFRAESTRUCTURA

| # | Check | Estado | Responsable |
|---|-------|--------|-------------|
| I-01 | Supabase Pro activo (no Free) | 📋 VALIDAR | Cuenta Supabase |
| I-02 | Dominio custom configurado (app.shelwi.com) | 📋 VALIDAR | DNS |
| I-03 | SSL/TLS habilitado | ✅ | Supabase / Vercel |
| I-04 | Edge Functions desplegadas y activas | 📋 VALIDAR | Supabase Dashboard |
| I-05 | Todas las migraciones ejecutadas (0001-0101) | 📋 VALIDAR | SQL Editor |
| I-06 | Variables de entorno en producción (Vercel) | 📋 VALIDAR | Vercel Dashboard |
| I-07 | Backup automático habilitado (Supabase Pro) | ✅ | Supabase Pro default |
| I-08 | Uptime monitoring configurado | ❌ | Pendiente configurar |
| I-09 | Email transaccional (Resend) configurado y verificado | 📋 VALIDAR | Resend Dashboard |

---

## BLOQUE 3: MIGRACIONES BASE DE DATOS

| # | Migración | Estado |
|---|-----------|--------|
| DB-01 | 0001_schema → 0096 (migraciones previas) | 📋 VALIDAR en prod |
| DB-02 | 0097_enterprise_plan.sql | ❌ Pendiente ejecutar |
| DB-03 | 0098_plans_v3_matrix.sql | ❌ Pendiente ejecutar |
| DB-04 | 0099_ai_usage_audit_extend.sql | ❌ Pendiente ejecutar |
| DB-05 | 0100_workspace_ai_addons.sql | ❌ Pendiente ejecutar |
| DB-06 | 0101_active_sessions.sql | ❌ Pendiente ejecutar |

**ORDEN OBLIGATORIO DE EJECUCIÓN:**
```
0097 → 0098 → 0099 → 0100 → 0101
```

---

## BLOQUE 4: CRON JOBS

| # | Tarea | Cron expression | RPC | Estado |
|---|-------|-----------------|-----|--------|
| C-01 | Cleanup automation_logs | `0 3 * * *` | `cleanup_automation_logs()` | 📋 VALIDAR activo |
| C-02 | Cleanup integration_events | `0 3 * * *` | `cleanup_processed_integration_events()` | 📋 VALIDAR activo |
| C-03 | Cleanup oauth_states | `0 3 * * *` | `cleanup_expired_oauth_states()` | 📋 VALIDAR activo |
| C-04 | Expire overdue quotes | `0 3 * * *` | `expire_overdue_quotes()` | 📋 VALIDAR activo |
| C-05 | Automation scheduler | `* * * * *` | Edge Function trigger | 📋 VALIDAR activo |
| **C-06** | **Expire AI addons** | **`5 0 * * *`** | **`expire_ai_addons()`** | **❌ FALTA configurar** |
| **C-07** | **Cleanup old sessions** | **`0 2 * * *`** | **`cleanup_old_sessions()`** | **❌ FALTA configurar** |

**Cómo configurar C-06 y C-07:**
```sql
-- En Supabase Dashboard → Database → Extensions → habilitar pg_cron
-- Luego ejecutar:
SELECT cron.schedule('expire-ai-addons', '5 0 * * *',
  'SELECT public.expire_ai_addons()');

SELECT cron.schedule('cleanup-sessions', '0 2 * * *',
  'SELECT public.cleanup_old_sessions()');
```

---

## BLOQUE 5: MONETIZACIÓN

| # | Check | Estado |
|---|-------|--------|
| M-01 | Precios PRO y PREMIUM actualizados en DB | ❌ (migración 0098 pendiente) |
| M-02 | Plan ENTERPRISE en DB | ❌ (migración 0097 pendiente) |
| M-03 | `create-checkout` soporta plan 'enterprise' | ❌ VERIFICAR manualmente |
| M-04 | `mp-webhook` bloquea plans no pagados | ✅ |
| M-05 | Founder Program funcional | ✅ |
| M-06 | Price tampering detection activo | ✅ (reducir delta pendiente) |
| M-07 | Addons de créditos IA disponibles | ❌ (migración 0100 pendiente) |
| M-08 | Addons de storage funcionando | ✅ (migración 0071 existente) |

---

## BLOQUE 6: PLANES Y FEATURES

| # | Check | Estado |
|---|-------|--------|
| P-01 | FREE: 0 créditos IA, sin features operativas | ✅ |
| P-02 | PRO: 500 créditos IA, price $59.900 | ❌ (migración 0098 pendiente) |
| P-03 | PREMIUM: 2.000 créditos IA, price $179.900, 20 GB | ❌ (migración 0098 pendiente) |
| P-04 | ENTERPRISE: 5.000 créditos IA, price $399.900, 100 GB | ❌ (migración 0097 pendiente) |
| P-05 | IA bloqueada en FREE (`ai_enabled = false`) | ✅ |
| P-06 | GPS bloqueado en FREE/PRO | ✅ |
| P-07 | Storage bloqueado en FREE/PRO | ✅ |
| P-08 | Portales bloqueados en FREE/PRO | ✅ |
| P-09 | Límites de cotizaciones y clientes enforced | ✅ |

---

## BLOQUE 7: MOBILE Y CAPACITOR

| # | Check | Estado |
|---|-------|--------|
| Mob-01 | App funciona correctamente en web browser | ✅ |
| Mob-02 | Capacitor config existe (`capacitor.config.ts`) | ✅ |
| Mob-03 | Android build exitoso | 📋 VALIDAR |
| Mob-04 | iOS build exitoso | 📋 VALIDAR |
| Mob-05 | Deep links funcionan en native | 📋 VALIDAR |
| Mob-06 | In-app browser para Mercado Pago | ✅ (`navigateToUrl` de capacitorBridge) |
| Mob-07 | Push notifications configuradas | 📋 VALIDAR (pushNotifications.ts existe) |
| Mob-08 | GPS funciona en native (Capacitor Geolocation) | 📋 VALIDAR |
| Mob-09 | Offline sync configurado | ⚠️ PARCIAL (`offlineSync.ts` existe) |
| Mob-10 | Network banner para offline | ✅ (`NetworkBanner.tsx` existe) |
| Mob-11 | App aprobada en Play Store / App Store | ❌ No enviada |

---

## BLOQUE 8: OBSERVABILIDAD BÁSICA

| # | Check | Estado |
|---|-------|--------|
| O-01 | Logs de Edge Functions visibles en Supabase | ✅ |
| O-02 | audit_log registra acciones críticas | ✅ |
| O-03 | Price tampering alert en audit_log | ✅ |
| O-04 | Error tracking frontend (Sentry) | ❌ No integrado |
| O-05 | Uptime monitoring externo | ❌ No configurado |
| O-06 | Alertas storage 80/90/100% | ✅ Trigger automático |
| O-07 | Proceso de respuesta a incidentes documentado | ❌ No documentado |

---

## RESUMEN EJECUTIVO GO-LIVE

### Para lanzar HOY (web, plan FREE/PRO/PREMIUM):

**Deben completarse ANTES:**
1. ❌ Integrar `useSessionGuard()` en router
2. ❌ Ejecutar migraciones 0097-0101
3. ❌ Configurar crons C-06 y C-07
4. ❌ Reducir price delta mp-webhook a ≤ 500 COP
5. ❌ Verificar `create-checkout` con 'enterprise'
6. 📋 Validar todas las variables de entorno en producción

### Para lanzar ENTERPRISE:
- Todo lo anterior PLUS
- Verificar/corregir `create-checkout` para plan 'enterprise'
- Test end-to-end de compra ENTERPRISE en staging

### Para Mobile (Play Store):
- Todo lo anterior PLUS
- Android build exitoso
- Play Store listing aprobado
- GPS en native verificado

---

## CHECKLIST RÁPIDO — GO / NO-GO

| Criterio | Ahora | Con 3 correcciones |
|---------|-------|-------------------|
| Seguridad básica | ⚠️ | ✅ |
| Multi tenant | ✅ | ✅ |
| Zero Trust | ✅ | ✅ |
| IA funcional | ✅ | ✅ |
| Billing funcional | ⚠️ | ✅ |
| Session security | ⚠️ | ✅ |
| **VEREDICTO** | **NO-GO** | **GO** |
