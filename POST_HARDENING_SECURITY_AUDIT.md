# POST_HARDENING_SECURITY_AUDIT — Shelwi
> Fecha: 2026-06-23 | Post-hardening Sprint 24

---

## COMPARATIVA PRE vs POST HARDENING

| Dimensión | Pre-hardening | Post-hardening | Delta |
|-----------|--------------|----------------|-------|
| Auth & JWT | 88/100 | 96/100 | +8 |
| RLS / Multi Tenant | 95/100 | 98/100 | +3 |
| Storage | 82/100 | 95/100 | +13 |
| Edge Functions | 85/100 | 93/100 | +8 |
| Integraciones OAuth | 96/100 | 96/100 | = |
| Portales Públicos | 80/100 | 94/100 | +14 |
| Session Security | 60/100 | 96/100 | +36 |
| Billing | 78/100 | 95/100 | +17 |
| Observabilidad | 45/100 | 80/100 | +35 |
| **TOTAL** | **84/100** | **94/100** | **+10** |

---

## HALLAZGOS RESUELTOS

### Auth & JWT (88 → 96)

| Check | Pre | Post |
|-------|-----|------|
| useSessionGuard montado | ❌ | ✅ |
| Revocación de sesión en UI | ❌ | ✅ |
| Heartbeat 30s activo | ❌ | ✅ |
| Session cleanup automático (cron 3am) | ❌ | ✅ |
| JWT + device_id validation | ✅ | ✅ |

### Storage (82 → 95)

| Check | Pre | Post |
|-------|-----|------|
| `attachments` con file_size_limit (20MB) | ❌ | ✅ |
| `attachments` con MIME types restringidos | ❌ | ✅ |
| `logos` con file_size_limit (5MB) | ✅ | ✅ |
| `evidences` con 50MB limit | ✅ | ✅ |
| Workspace isolation en paths | ✅ | ✅ |

### Portales Públicos (80 → 94)

| Check | Pre | Post |
|-------|-----|------|
| Rate limiting `/p/:token` (20/min) | ❌ | ✅ |
| Rate limiting `/ref/:refCode` (30/min) | ❌ | ✅ |
| Token expiración validada | ✅ | ✅ |
| `register_quote_view()` RPC segura | ✅ | ✅ |

### Billing (78 → 95)

| Check | Pre | Post |
|-------|-----|------|
| Price delta $5.000 → $500 | ❌ | ✅ |
| ENTERPRISE checkout soportado | ❌ | ✅ |
| Idempotencia via payment_events | ✅ | ✅ |
| Price tampering detection | ✅ | ✅ |

### Session Security (60 → 96)

| Check | Pre | Post |
|-------|-----|------|
| `active_sessions` tabla | ✅ | ✅ |
| `create_session()` al login | ✅ | ✅ |
| `session_heartbeat()` RPC | ✅ | ✅ |
| **useSessionGuard montado en AppShell** | ❌ | ✅ |
| **Cron cleanup sessions** | ❌ | ✅ |
| **Expire AI addons cron** | ❌ | ✅ |

---

## HALLAZGOS RESIDUALES (pendiente)

### 🟡 MEDIO

| # | Hallazgo | Motivo pendiente |
|---|---------|-----------------|
| R-01 | WhatsApp Business API no implementada | Fuera de scope (Sprint 25) |
| R-02 | Sentry DSN no configurado aún | Variable de entorno manual post-deploy |
| R-03 | Session heartbeat 30s (no Realtime) | Aceptable, Realtime es Sprint 25+ |
| R-04 | `mp-webhook` sin HMAC de MP | Mitigado por verificación directa con API MP |
| R-05 | Portal cliente sin rate limit explícito | Protegido por token único; Sprint 25 |

### 🟢 BAJO (no crítico)

| # | Hallazgo | Estado |
|---|---------|--------|
| B-01 | PITR no disponible en Supabase Pro | Upgrade a Team al alcanzar 500 ws |
| B-02 | automation-scheduler CORS `*` | Función interna; JWT de service_role la protege |
| B-03 | ai-proxy CORS `*` | Correcto para API pública autenticada vía JWT |

---

## INVENTARIO RLS FINAL

| Tabla | RLS | Sin (true) abusivo | Workspace isolation |
|-------|-----|--------------------|---------------------|
| workspaces | ✅ | ✅ | ✅ |
| profiles | ✅ | ✅ | ✅ |
| quotes | ✅ | ✅ | ✅ |
| clients | ✅ | ✅ | ✅ |
| orders | ✅ | ✅ | ✅ |
| work_orders | ✅ | ✅ | ✅ |
| evidences/storage | ✅ | ✅ | ✅ |
| gps_events | ✅ | ✅ | ✅ |
| member_locations | ✅ | ✅ | ✅ |
| active_sessions | ✅ | ✅ | ✅ |
| ai_usage | ✅ | ✅ | ✅ |
| audit_log | ✅ | ✅ | ✅ |
| webhook_endpoints | ✅ | ✅ | ✅ |
| integration_events | ✅ | ✅ (uid IS NULL) | ✅ |
| notifications | ✅ | ✅ (uid forzado) | ✅ |
| portal_rate_limit | ✅ | ✅ (uid IS NULL) | N/A (global) |
| workspace_ai_addons | ✅ | ✅ | ✅ |
| ai_credit_packs | ✅ | ✅ | N/A (catálogo) |

**Sin ninguna tabla con `USING (true)` inseguro en datos sensibles.**

---

## SCORE SEGURIDAD FINAL: 94/100

### Deducción de 6 puntos:
- (-2) WhatsApp Business API: feature prometida sin implementar (impacto de confianza)
- (-2) Session heartbeat 30s vs Realtime para sesiones (ventana de 30s)
- (-1) mp-webhook sin HMAC signature de MP (mitigado por verificación directa)
- (-1) Sentry no operativo hasta que el DSN esté configurado

### Para alcanzar 98/100:
1. Configurar VITE_SENTRY_DSN + SENTRY_DSN en producción
2. Implementar Realtime subscription para revocación instantánea de sesiones
