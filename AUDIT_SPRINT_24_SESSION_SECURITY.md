# AUDIT_SPRINT_24_SESSION_SECURITY — Shelwi Session Security

> Fecha: 2026-06-23 | Criticidad: ALTA — modelo SaaS en riesgo

---

## 1. PROBLEMA ACTUAL

Una licencia PRO ($59.900/mes) puede ser compartida por N dispositivos simultáneos porque:

1. Supabase Auth genera JWT válidos por 1 hora con refresh automático
2. No existe ningún control de sesiones concurrentes en el sistema
3. No hay tabla `active_sessions`
4. El login en dispositivo B NO revoca la sesión de dispositivo A

**Impacto económico:**
- Usuario con 1 licencia PRO → 10 usuarios simultáneos = 9 licencias perdidas
- A 10K workspaces y 10% de abuso → pérdida de ~$35.7M COP/mes en ingresos potenciales

---

## 2. AUDITORÍA ESTADO ACTUAL

### 2.1 Auth Flow Actual

```
Usuario → supabase.auth.signInWithPassword() 
  → Supabase genera access_token (JWT 1h) + refresh_token
  → Frontend guarda en localStorage
  → Ninguna sesión registrada en DB
  → No hay control concurrente
```

**Archivo auditado:** [src/services/auth.ts](src/services/auth.ts)

- ✅ `signIn()`: usa `signInWithPassword` — correcto
- ✅ `signOut()`: llama `log_auth_event` (RPC) + `supabase.auth.signOut()` — correcto
- ❌ NO registra sesión al login
- ❌ NO revoca sesiones anteriores
- ❌ NO valida `device_id` en requests
- ❌ NO subscribe a revocación en tiempo real

### 2.2 RLS y JWT — Estado Actual

- ✅ RLS habilitado en todas las tablas críticas (migr 0003, 0039, 0091, 0092)
- ✅ `auth.uid()` usado en todas las policies
- ✅ Zero Trust: workspace_id siempre desde DB, nunca del cliente
- ❌ JWT no incluye `device_id` (sin custom claims)
- ❌ No existe revocación de JWT en tiempo real (Supabase limitation)

**Workaround para revocación real:**
Supabase no revoca JWTs individuales antes de expiración. La solución es:
1. Tabla `active_sessions` con estado `revoked_at`
2. Validación en cada request protegido (RPC o middleware)
3. Frontend polling / Realtime para detectar revocación y hacer signOut()

### 2.3 Portal Público — Estado

- ✅ Portal cotización: usa `quote_access_tokens` con expiración → OK
- ✅ Portal cliente: token público, sin JWT de usuario → OK
- ✅ Webhooks entrantes: HMAC-SHA256 firmados → OK
- ✅ OAuth callbacks: usa state param + PKCE → OK

---

## 3. DISEÑO SESSION SECURITY SPRINT 24

### 3.1 Tabla `active_sessions`

```sql
CREATE TABLE public.active_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    text NOT NULL,        -- UUID generado en el cliente, persistido en localStorage
  device_name  text,                 -- "iPhone 14 Pro", "Chrome / Windows", etc.
  ip           inet,                 -- IP del request (desde edge function)
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,          -- NULL = activa, NOT NULL = revocada
  revoke_reason text                 -- 'new_login', 'admin_revoke', 'logout', 'expired'
);
```

### 3.2 Lógica de Login

```
1. Usuario hace signIn() → Supabase devuelve JWT válido
2. Frontend genera device_id (uuid v4, persistido en localStorage)
3. Frontend llama RPC create_session(device_id, device_name, user_agent)
4. Backend:
   a. Obtiene workspace_id + plan del JWT
   b. Verifica límite de sesiones del plan
   c. Si plan NO permite múltiples sesiones:
      → Revoca TODAS las sesiones activas anteriores del user
      → Inserta nueva sesión activa
   d. Si plan permite múltiples sesiones (ENTERPRISE configurable):
      → Solo inserta nueva sesión
5. Frontend subscribe a Realtime channel 'session:{session_id}'
6. Si sesión revocada → signOut() automático
```

### 3.3 Validación Continua (Heartbeat)

```
Cada 30 segundos:
  Frontend llama RPC session_heartbeat(session_id, device_id)
  Backend verifica:
    - Sesión existe y no está revocada
    - device_id coincide
  Si falla: frontend fuerza signOut()
```

### 3.4 Matriz de Sesiones por Plan

| Plan | Max sesiones/usuario | Configurable |
|------|---------------------|--------------|
| FREE | 1 | No |
| PRO | 1 | No |
| PREMIUM | 1 por usuario | No |
| ENTERPRISE | 1-N (config en workspace) | Sí |

---

## 4. HALLAZGOS Y ACCIONES

| # | Hallazgo | Severidad | Acción |
|---|---------|-----------|--------|
| SS-01 | No existe tabla active_sessions | 🔴 CRÍTICA | Crear en migr 0101 |
| SS-02 | Login no crea/revoca sesiones | 🔴 CRÍTICA | Actualizar auth.ts + RPC |
| SS-03 | No hay heartbeat de sesión | 🟠 ALTA | Crear hook useSessionGuard |
| SS-04 | Portal público sin rate limit de auth | 🟡 MEDIA | Ya tiene token con expiración |
| SS-05 | GPS sin validación de sesión activa | 🟡 MEDIA | GPS usa JWT válido → OK por ahora |
| SS-06 | Webhooks sin sesión (inbound) | ⚪ N/A | Son públicos con HMAC → OK |

---

## 5. LO QUE NO SE CAMBIA

- Modelo JWT de Supabase → NO se modifica
- RLS existente → NO se modifica (sigue siendo la barrera principal)
- Portal público → NO requiere sesión activa (correcto)
- auth.ts signOut() → Solo agrega log de revocación

---

## 6. RIESGOS DEL DISEÑO

| Riesgo | Mitigación |
|--------|-----------|
| Latencia en heartbeat (30s polling) | Usar Realtime channel para push inmediato |
| localStorage limpiado → device_id perdido | Regenerar device_id y crear sesión nueva |
| Usuario sin internet pierde sesión | Heartbeat con grace period de 5 minutos |
| ENTERPRISE con sesiones ilimitadas | Cap en 50 sesiones por usuario (reasonable) |
| active_sessions crece sin limpiar | CRON job diario que limpia sesiones > 30 días revocadas |
