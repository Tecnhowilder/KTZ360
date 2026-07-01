# PRODUCTION_SECURITY_AUDIT — Shelwi
> Fecha: 2026-06-23 | Alcance: Sprint 1 → Sprint 24 | Modo: Solo lectura, sin cambios

---

## 1. AUTENTICACIÓN Y SESIONES

### 1.1 Login / JWT

| Check | Estado | Detalle |
|-------|--------|---------|
| JWT firmado por Supabase Auth | ✅ OK | RS256, expiración 1 hora |
| Refresh token rotation | ✅ OK | Supabase maneja automáticamente |
| `signIn()` usa `signInWithPassword` | ✅ OK | No hay credenciales expuestas |
| Contraseñas hasheadas (bcrypt) | ✅ OK | Supabase Auth gestiona |
| Email confirmation requerido | ✅ OK | Configurado en Supabase Auth settings |
| Reset password usa deep link seguro | ✅ OK | `DeepLinks.resetPassword()` con token de 1 uso |
| `create_session()` al login | ✅ OK | Sprint 24 — RPC security definer |
| Session revocada al logout | ✅ OK | Sprint 24 — `revoke_session()` |
| `useSessionGuard` heartbeat | ❌ NO INTEGRADO | Hook creado pero NO montado en router |

**CRÍTICO:** El hook `useSessionGuard` existe en `src/hooks/useSessionGuard.ts` pero no está importado ni usado en `src/router.tsx` ni en ningún layout. La session security del Sprint 24 está incompleta en frontend.

---

### 1.2 Session Security (Sprint 24)

| Check | Estado | Detalle |
|-------|--------|---------|
| Tabla `active_sessions` creada | ✅ OK | Migración 0101 |
| RLS en `active_sessions` | ✅ OK | SELECT propio, INSERT/UPDATE via SECURITY DEFINER |
| `create_session()` RPC | ✅ OK | Revoca sesiones previas según plan |
| `session_heartbeat()` | ✅ OK | Valida user_id + device_id |
| `revoke_session()` | ✅ OK | Verifica ownership |
| FREE/PRO/PREMIUM = 1 sesión | ✅ OK | Implementado en create_session() |
| ENTERPRISE = 3 sesiones | ✅ OK | Default configurable |
| Cleanup de sesiones zombie | ✅ OK | cleanup_old_sessions() 7 días |
| **useSessionGuard en router** | **❌ FALTA** | **Hook sin montar = sistema sin efecto** |

---

### 1.3 JWT Abuse / Session Fixation

| Ataque | Mitigación | Estado |
|--------|-----------|--------|
| Session fixation | JWT nuevo en cada login (Supabase) | ✅ OK |
| Session hijacking JWT robado | JWT dura 1h + device_id validation en heartbeat | ⚠️ PARCIAL — heartbeat no está activo |
| Concurrent session abuse | `create_session()` revoca anteriores | ✅ OK (si useSessionGuard se monta) |
| JWT con workspace_id falsificado | workspace_id obtenido de DB en todos los RPCs/EFs | ✅ OK — Zero Trust correcto |
| Replay de JWT expirado | Supabase Auth valida `exp` claim | ✅ OK |

---

## 2. ROW LEVEL SECURITY (RLS)

### 2.1 Función base de aislamiento

```sql
current_workspace_id() → SELECT workspace_id FROM profiles WHERE id = auth.uid()
```
✅ Correcta: `SECURITY DEFINER`, `STABLE`, `SET search_path = public`

### 2.2 Inventario RLS por tabla (Sprint 1-24)

| Tabla | RLS | SELECT | INSERT | UPDATE | DELETE | Observación |
|-------|-----|--------|--------|--------|--------|-------------|
| `plans` | ✅ | `USING (true)` | ❌ (solo service) | ❌ | ❌ | Público — correcto |
| `workspaces` | ✅ | workspace propio | ❌ | admin propio | ❌ | ✅ |
| `profiles` | ✅ | workspace propio | ❌ | self o admin | ❌ | ✅ |
| `subscriptions` | ✅ | workspace propio | ❌ | ❌ | ❌ | ✅ Solo lectura |
| `quotes` | ✅ | workspace propio | workspace propio | workspace propio | workspace propio | ✅ |
| `clients` | ✅ | workspace propio | workspace propio | workspace propio | workspace propio | ✅ |
| `orders` | ✅ | workspace propio | workspace propio | workspace propio | workspace propio | ✅ |
| `work_orders` | ✅ | workspace propio | workspace propio | workspace propio | workspace propio | ✅ |
| `evidence_files` | ✅ | workspace + feature gate | workspace + feature gate | workspace | workspace | ✅ |
| `gps_events` | ✅ | workspace propio | workspace + user | ❌ | ❌ | ✅ |
| `member_locations` | ✅ | rol-based (owner/admin/supervisor/own) | workspace + user | workspace + user | ❌ | ✅ |
| `ai_usage` | ✅ | workspace propio | workspace + user | ❌ | ❌ | ✅ |
| `audit_log` | ✅ | workspace propio | workspace + user | ❌ | ❌ | ✅ |
| `automation_templates` | ✅ | `USING (true)` | super_admin | super_admin | super_admin | ⚠️ Templates globales — intencional |
| `active_sessions` | ✅ | user propio | SECURITY DEFINER only | SECURITY DEFINER only | ❌ | ✅ Sprint 24 |
| `webhook_endpoints` | ✅ | workspace propio | owner/admin | owner/admin | owner/admin | ✅ Secret oculto en RPCs |
| `webhook_deliveries` | ✅ | workspace propio | SECURITY DEFINER | ❌ | ❌ | ✅ |
| `integration_events` | ✅ | workspace propio | `auth.uid() IS NULL` | SECURITY DEFINER | ❌ | ✅ 0092 fix |
| `integration_credentials` | ✅ | ❌ solo service_role | ❌ solo service_role | ❌ solo service_role | ❌ | ✅ Credentials nunca al frontend |
| `communication_log` | ✅ | workspace propio | `auth.uid() IS NULL` | ❌ | ❌ | ✅ 0092 fix |
| `loyalty_transactions` | ✅ | workspace propio | `auth.uid() IS NULL` | ❌ | ❌ | ✅ 0092 fix |
| `quote_views` | ✅ | workspace propio | quote_id existe | ❌ | ❌ | ✅ 0092 fix — usa `register_quote_view()` |
| `utm_events` | ✅ | workspace propio | workspace activo | ❌ | ❌ | ✅ 0092 fix |
| `referral_links` | ✅ | workspace propio | `auth.uid() IS NULL` | ❌ | ❌ | ✅ 0092 fix |
| `workspace_ai_addons` | ✅ | workspace propio | admin/owner | admin/owner | ❌ | ✅ Sprint 24 |
| `ai_credit_packs` | ✅ | `active = true` | super_admin | super_admin | ❌ | ✅ Sprint 24 |
| `notifications` | ✅ | user propio + workspace | workspace | user propio | user propio | ⚠️ INSERT no fuerza user_id = auth.uid() |

### 2.3 Hallazgos RLS

**CRÍTICO (C):**
- Ninguno detectado en las tablas auditadas.

**ALTO (A):**
- `notifications` INSERT policy: `with check (workspace_id = current_workspace_id())` no valida `user_id = auth.uid()`. Un usuario podría crear una notificación asignada a otro usuario del mismo workspace. **Impacto bajo en práctica** (mismo workspace), pero técnicamente incorrecto.

**MEDIO (M):**
- `automation_templates` SELECT `USING (true)`: todos los usuarios autenticados pueden leer templates del sistema. Esto es intencional para el motor de automatizaciones. No hay datos sensibles en templates.

**BAJO (B):**
- DW views ya tienen REVOKE SELECT (migr 0091). ✅
- `plans` SELECT `USING (true)`: público para pricing page. Correcto.

### 2.4 Cross-workspace Access — Verificación

- ✅ Sin bypass detectado: todas las tablas usan `workspace_id = current_workspace_id()`
- ✅ `current_workspace_id()` es `SECURITY DEFINER` — no puede ser falseada desde el cliente
- ✅ Tablas con FK a otras tablas sin `workspace_id` directo usan `EXISTS` subquery (ej: `service_materials`)

---

## 3. STORAGE

### 3.1 Buckets

| Bucket | Visibilidad | File size limit | MIME types | RLS path |
|--------|------------|----------------|-----------|---------|
| `logos` | Public | 5 MB | jpeg/png/webp/gif/svg | `[1] = workspace_id` |
| `attachments` | Private | No definido | No definido | `[1] = workspace_id` |
| `evidences` | Private | 50 MB | jpeg/png/webp/mp4/pdf/etc | `[1] = workspace_id` + feature gate |

**HALLAZGO:** Bucket `attachments` no tiene `file_size_limit` definido. Cualquier archivo de cualquier tamaño puede subirse. Riesgo de abuso de storage sin cuota de cost control.

**HALLAZGO:** Bucket `logos` es `public = true` → cualquier persona con la URL puede ver cualquier logo. Esto es intencional (logos en PDFs públicos), pero significa que logos no pueden ser privados.

---

## 4. EDGE FUNCTIONS

### 4.1 ai-proxy

| Check | Estado |
|-------|--------|
| JWT verificado antes de procesar | ✅ OK |
| workspace_id desde DB (nunca del cliente) | ✅ OK |
| Rate limit 100 calls/hora | ✅ OK |
| Créditos verificados antes de Gemini call | ✅ OK |
| CORS: `*` | ⚠️ Permite cualquier origen |
| GEMINI_API_KEY en env secret | ✅ OK |
| Error handling no expone stack traces | ✅ OK |

### 4.2 mp-webhook

| Check | Estado |
|-------|--------|
| MP HMAC signature verificada (`x-signature`) | ❌ NO — verifica via API directa |
| Pago verificado consultando MP API directamente | ✅ OK — mejor que HMAC |
| Idempotencia via `payment_events` unique | ✅ OK |
| Precio validado contra DB (no hardcodeado) | ✅ OK |
| Price tampering detection | ✅ OK — pero delta $5.000 es demasiado amplio |
| workspace_id validado | ✅ OK — viene de `external_reference` firmado por MP |
| Audit log registrado | ✅ OK |
| Siempre retorna HTTP 200 a MP | ✅ OK — evita reintentos |

**HALLAZGO:** `delta > 5000` = permite pagar $54.900 por un plan de $59.900 (PRO). Alguien que conozca el sistema podría pagar $5.000 menos y obtener el plan. Se recomienda reducir a ≤ 100 COP (solo tolerancia de redondeo).

### 4.3 oauth-callback

| Check | Estado |
|-------|--------|
| State parameter validado contra DB | ✅ OK |
| PKCE code_verifier verificado | ✅ OK |
| Tokens cifrados AES-256-GCM antes de guardar | ✅ OK |
| Tokens NUNCA expuestos al frontend | ✅ OK |
| oauth_states con expiración | ✅ OK |

### 4.4 integration-worker

| Check | Estado |
|-------|--------|
| workspace_id obtenido del JWT, no del body | ✅ OK |
| Tokens de integración desencriptados en backend | ✅ OK |
| EXECUTION_BUDGET_MS = 25s (prevent timeout) | ✅ OK |
| HMAC-SHA256 en webhook delivery | ✅ OK |
| Timeout 10s por delivery de webhook | ✅ OK |

### 4.5 automation-scheduler

| Check | Estado |
|-------|--------|
| Usa service_role (no JWT user) | ✅ OK |
| No acepta parámetros externos sensibles | ✅ OK |
| CORS: `*` | ⚠️ Cualquier origen puede trigger el scheduler |
| No valida que el caller sea el cron de Supabase | ⚠️ Sin token de autorización en scheduler |

**NOTA:** El automation-scheduler no verifica que el caller sea el cron de Supabase. Cualquier persona con la URL puede dispararlo. Impacto bajo (el scheduler solo hace queries de DB y llama al worker), pero podría generar carga extra.

---

## 5. INTEGRACIONES

### 5.1 OAuth (Google, Microsoft)
- ✅ Tokens cifrados con AES-256-GCM
- ✅ Refresh automático si expiran en < 5 minutos
- ✅ Credenciales NUNCA en frontend (solo en Edge Functions + DB cifrada)
- ✅ PKCE usado en el flujo OAuth

### 5.2 Alegra
- ✅ API Key cifrada en `integration_credentials`
- ✅ Solo accesible via integration-worker (service_role)

### 5.3 Mercado Pago
- ✅ MP_ACCESS_TOKEN solo en Edge Functions (env secret)
- ⚠️ webhook sin HMAC verification (mitigado por verificación directa en API MP)

### 5.4 WhatsApp (wa.me manual)
- ✅ Solo genera URL de WhatsApp, no almacena tokens
- ✅ Sin credenciales de WhatsApp Business API aún

---

## 6. PORTAL PÚBLICO

### 6.1 Portal de Cotización (`/p/:token`)
- ✅ Token UUID único, expiración 7 días (configurable)
- ✅ `get_public_quote()` valida `expires_at > now()` (Sprint 10 fix)
- ✅ Muestra solo datos del cliente y cotización, no datos del workspace
- ✅ `register_quote_view()` RPC valida que la cotización existe antes de insertar
- ⚠️ Sin rate limiting por IP en consultas al portal — puede ser scrapeado

### 6.2 Portal del Cliente (`/portal/:token`)
- ✅ Token independiente por cliente/workspace
- ✅ Muestra solo datos del cliente específico
- ✅ Sin acceso a datos de otros clientes

---

## 7. SCORE SEGURIDAD

| Dimensión | Score | Detalle |
|-----------|-------|---------|
| Auth & JWT | 88/100 | useSessionGuard no montado |
| RLS / Multi Tenant | 95/100 | Sólido, 1 hallazgo menor en notifications |
| Storage | 82/100 | attachments sin file_size_limit |
| Edge Functions | 85/100 | mp-webhook delta $5K, CORS * |
| Integraciones OAuth | 96/100 | AES-256-GCM, PKCE, sin exposición |
| Portales Públicos | 80/100 | Sin rate limit por IP |
| Session Security | 60/100 | useSessionGuard sin integrar en router |
| **TOTAL** | **84/100** | |
