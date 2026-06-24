# PRODUCTION_READINESS_AUDIT — Shelwi
> Fecha: 2026-06-23 | Sprint 1 → Sprint 24 | Auditoría completa de producción

---

## SCORES FINALES

| Dimensión | Score | Veredicto |
|-----------|-------|-----------|
| Seguridad | 84/100 | Sólido, 1 crítico (useSessionGuard) |
| Escalabilidad | 72/100 | OK hasta 1K ws, necesita trabajo para 5K+ |
| Operaciones | 80/100 | Funcional, observabilidad limitada |
| Mobile (Capacitor) | 65/100 | Listo para web, app nativa incompleta |
| Monetización | 82/100 | Sólida, price delta y ENTERPRISE pendiente |
| Infraestructura | 70/100 | Supabase Pro suficiente hasta 1K ws |
| **SCORE GENERAL** | **76/100** | |

---

## VEREDICTOS

### ¿Shelwi está lista para producción (lanzamiento web)?

**SÍ — CON CONDICIONES**

Se puede lanzar en producción web con estas 3 condiciones previas:
1. Integrar `useSessionGuard()` en el router (2 líneas de código)
2. Verificar que `create-checkout` soporta plan 'enterprise' (o no lanzar ENTERPRISE aún)
3. Reducir price delta en mp-webhook de $5.000 a ≤ $500 COP

El resto de los bloqueadores son de escala (para 3K+ usuarios) o de features adicionales.

---

### ¿Shelwi está lista para 1.000 usuarios activos?

**SÍ — CON MONITOREO**

A 1.000 workspaces activos la plataforma escala correctamente. El pool de conexiones de Supabase Pro (100) empieza a ponerse bajo presión en hora pico, pero PgBouncer de Supabase maneja el connection pooling.

Acciones previas al 1K:
- Configurar cron jobs de Sprint 24 (expire_ai_addons, cleanup_old_sessions)
- Agregar índices faltantes (orders, work_orders, ai_usage history)
- Activar uptime monitoring externo

---

### ¿Shelwi está lista para 3.000 usuarios activos?

**NO — REQUIERE CAMBIOS DE INFRAESTRUCTURA**

A 3.000 workspaces activos:
- Pool de conexiones Supabase Pro se satura → necesita upgrade a Team
- RPCs BI empiezan a tener latencias de 500ms-1s → necesita materialized views
- integration-worker empieza a acumular backlog → necesita sharding
- gps_events sin partición empieza a crecer peligrosamente

**Plazo para prepararse:** 3-4 semanas de trabajo antes de alcanzar ese nivel.

---

### ¿Shelwi está lista para 10.000 usuarios activos?

**NO — REQUIERE REDISEÑO DE INFRAESTRUCTURA**

A 10.000 workspaces activos:
- Supabase Pro saturado completamente → upgrade a Team obligatorio
- Partición de ai_usage, gps_events, audit_log obligatorios
- Materialized views para todo BI
- Multiple workers para integration-worker
- Realtime connections: 10K vs 200 límite Pro → necesita upgrade

**Plazo para prepararse:** 2-3 meses de trabajo técnico.

---

## ESTADO POR MÓDULO

| Módulo | Sprint | Madurez | En producción? |
|--------|--------|---------|---------------|
| CRM + Cotizaciones | 1-5 | ⭐⭐⭐⭐⭐ | ✅ SI |
| PDF Templates | 3 | ⭐⭐⭐⭐ | ✅ SI |
| Portal Cotización | 4 | ⭐⭐⭐⭐⭐ | ✅ SI |
| Auth + Planes + Billing | 1-7 | ⭐⭐⭐⭐ | ✅ SI |
| Equipo + Roles | 5-6 | ⭐⭐⭐⭐ | ✅ SI |
| IA Comercial | 2-5 | ⭐⭐⭐⭐⭐ | ✅ SI |
| Pedidos + OTs | 7-9 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| Evidencias + Storage | 7 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| GPS + Mapa | 10 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| Portal Cliente | 10 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| Integraciones (OAuth) | 11-14 | ⭐⭐⭐⭐ | ✅ SI (PRO+) |
| Growth + Marketing | 16-17 | ⭐⭐⭐⭐ | ✅ SI (PRO) |
| IA Finanzas | 18 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| BI Analytics | 19 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| Customer Success + Loyalty | 20 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| Automatizaciones | 13 | ⭐⭐⭐⭐ | ✅ SI (PRO+) |
| Webhooks salientes | 23 | ⭐⭐⭐⭐ | ✅ SI (ENTERPRISE) |
| IA Operativa | 24 | ⭐⭐⭐⭐ | ✅ SI (PREMIUM) |
| Plan ENTERPRISE | 24 | ⭐⭐ | ⚠️ PARCIAL — checkout sin verificar |
| Session Security | 24 | ⭐⭐⭐ | ⚠️ DB listo, frontend sin integrar |
| Addons IA | 24 | ⭐⭐⭐ | ✅ SI — falta cron expiry |
| WhatsApp Business API | — | ⭐ | ❌ NO — solo wa.me manual |
| App Nativa (Capacitor) | 22 | ⭐⭐ | ⚠️ PARCIAL — build no verificado |

---

## RIESGOS TOP 5

| # | Riesgo | Probabilidad | Impacto |
|---|--------|-------------|---------|
| 1 | Sesiones concurrentes abusivas (useSessionGuard sin montar) | Alta | Alto |
| 2 | Saturación DB en primeros 1.000 ws | Media | Crítico |
| 3 | WhatsApp Business API prometida y no implementada | Alta | Medio (churn) |
| 4 | Price tampering en mp-webhook | Baja | Medio |
| 5 | Sin error tracking → bugs en producción invisibles | Alta | Medio |

---

## FORTALEZAS DE LA PLATAFORMA

1. **Zero Trust consistente:** workspace_id siempre obtenido de DB, nunca del cliente. Sin excepción detectada en 24 sprints.

2. **RLS sólido:** Todas las tablas tienen RLS habilitado. `current_workspace_id()` como función base de aislamiento es un patrón correcto y robusto.

3. **Seguridad de integraciones:** OAuth tokens cifrados AES-256-GCM, nunca expuestos al frontend. PKCE implementado.

4. **Motor IA sin duplicación:** Un único punto de entrada (`ai-proxy`), un único proveedor (Gemini), control de créditos en DB. Arquitectura limpia.

5. **Webhooks enterprise-grade:** HMAC-SHA256, retry exponencial, auto-disable, idempotencia.

6. **Billing seguro:** Verificación directa con MP API (más seguro que solo HMAC), idempotencia via payment_events.

7. **Hardening continuo:** Migraciones 0039, 0040, 0091, 0092 muestran un proceso de hardening activo. WITH CHECK (true) sistemáticamente eliminados.

8. **Feature flags en DB:** Toda restricción de plan está en `plan_features` y `plan_limits` — nunca hardcodeada en frontend.

---

## PLAN DE ACCIÓN PRIORIZADO

### Antes del lanzamiento (HOY)
1. Integrar `useSessionGuard()` en layout autenticado
2. Verificar `create-checkout` con plan 'enterprise'
3. Reducir price delta mp-webhook a ≤ 500 COP

### Semana 1 post-lanzamiento
4. Configurar crons Sprint 24 (expire_ai_addons, cleanup_old_sessions)
5. Agregar índices faltantes (orders, work_orders, ai_usage history)
6. Configurar uptime monitoring externo (UptimeRobot o similar)
7. Agregar `file_size_limit` a bucket `attachments`

### Al alcanzar 500 usuarios activos
8. Upgrade Supabase Pro → Team
9. Implementar Materialized Views para RPCs BI
10. Integrar error tracking (Sentry)

### Al alcanzar 1.000 usuarios activos
11. Partición `ai_usage` por period_month
12. Partición `gps_events` por mes
13. Múltiples workers para integration-worker
14. Redis/caché para plan lookups

### Al alcanzar 3.000 usuarios activos
15. Partición `audit_log` y `webhook_deliveries`
16. Read replicas para queries analíticas
17. CDN para assets estáticos
18. Rate limiting robusto en portales públicos

---

## CONCLUSIÓN

Shelwi es una plataforma SaaS técnicamente sólida con 24 sprints de desarrollo bien estructurado. El sistema Zero Trust, la separación multi-tenant y el modelo de seguridad son correctos. Los bloqueadores de producción son **4 issues específicos y corregibles** — ninguno requiere rediseño arquitectónico.

La plataforma puede lanzarse en producción esta semana con las 3 correcciones críticas indicadas, y escalar a 1.000 usuarios activos con trabajo adicional de 1-2 semanas.
