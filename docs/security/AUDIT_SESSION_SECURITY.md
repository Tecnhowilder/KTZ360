# AUDIT_SESSION_SECURITY.md
# Shelwi — Auditoría de Seguridad de Sesiones
Fecha: 2026-06-23 | Clasificación: NO IMPLEMENTAR — Solo diseño

---

## 1. COMPORTAMIENTO ACTUAL DE SUPABASE AUTH

### 1.1 Sesiones simultáneas en Supabase

**Supabase Auth permite sesiones ilimitadas simultáneas por usuario.** No existe ningún límite nativo de sesiones concurrentes por user_id.

- Un usuario puede iniciar sesión desde N navegadores, dispositivos y aplicaciones.
- Cada dispositivo obtiene su propio `access_token` (JWT) y `refresh_token`.
- Todos los tokens son válidos simultáneamente.
- Supabase no proporciona "single session" de forma nativa.

### 1.2 Ciclo de vida de tokens JWT (Supabase)

| Token | Duración por defecto | Configurable |
|-------|---------------------|-------------|
| Access token (JWT) | 3600 segundos (1 hora) | Sí, en Dashboard → Auth → Settings |
| Refresh token | 604800 segundos (7 días) | Sí |
| Session lifetime | Hasta que refresh token expire | Sí |

**Flujo de refresh:**
```
Usuario activo → access_token vence (1h) → cliente llama refreshSession()
→ Supabase valida refresh_token → emite nuevo access_token + nuevo refresh_token
→ el refresh_token anterior queda INVÁLIDO (rotation habilitada por defecto)
```

Con **refresh token rotation habilitada** (default en Supabase):
- Cada refresh genera un nuevo par de tokens.
- El refresh token anterior se invalida.
- Si dos dispositivos usan el mismo refresh token → race condition → uno queda desconectado.

### 1.3 Compartir credenciales entre dispositivos (análisis)

**Escenario A: Compartir email/password directamente**
- Usuario A comparte credenciales con Usuario B.
- Ambos se autentican → Supabase crea sesiones INDEPENDIENTES para cada uno.
- Ambas sesiones son válidas simultáneamente.
- **Shelwi no puede detectar esto** porque:
  - Ambas sesiones tienen el mismo `user_id` y `workspace_id`.
  - No hay diferenciación por dispositivo en la DB actual.
  - RLS y JWT son idénticos para ambas sesiones.

**Escenario B: Compartir token JWT directamente**
- El JWT tiene 1 hora de vida → limitación temporal.
- Sin embargo, si el receptor también tiene el refresh token, puede renovar indefinidamente.
- El refresh token rotation limita esto: solo un dispositivo puede renovar a la vez.

**Escenario C: SaaS con 1 usuario PRO, 5 operarios usando la misma cuenta**
- Hoy esto es técnicamente posible.
- El plan PRO tiene `included_users = 1`. Pero Supabase Auth no valida esto al hacer login.
- La tabla `profiles` tiene el límite de usuarios, pero la sesión de Supabase Auth no consulta `plan_limits` al autenticarse.

### 1.4 Riesgo de licencia compartida — Análisis actual

| Riesgo | Probabilidad | Impacto | Estado actual |
|--------|-------------|---------|--------------|
| Un usuario PRO compartiendo credentials con 5 operarios | Alta | Alto — múltiples accesos simultáneos | ❌ Sin protección |
| Credential stuffing (compartir tokens) | Media | Alto | ❌ Sin protección activa |
| Cuenta FREE usada por múltiples personas | Alta | Medio | ❌ Sin límite de sesiones |
| Workspace PREMIUM "prestado" a otro workspace | Baja | Alto | ❌ Sin protección |

---

## 2. LO QUE EXISTE HOY EN SHELWI

### 2.1 Control de usuarios por plan

| Componente | Estado | Descripción |
|-----------|--------|-------------|
| `plan_limits.included_users` | ✅ EXISTE | FREE=1, PRO=1, PREMIUM=5 |
| `plan_limits.extra_user_price` | ✅ EXISTE | Precio por usuario adicional |
| `additional_user_licenses` | ✅ EXISTE | Tabla de licencias adicionales compradas |
| `compute_team_seats()` | ✅ EXISTE | Calcula cupos del workspace |
| Límite de sesiones simultáneas | ❌ NO EXISTE | Sin control |
| Detección de dispositivos | ❌ NO EXISTE | Sin tabla `active_sessions` |
| Revocación de sesión remota | ❌ NO EXISTE | Sin control desde UI |

### 2.2 Audit de sesión actual

```typescript
// En AuthProvider.tsx:
supabase.auth.onAuthStateChange((event, newSession) => {
  if (event === 'SIGNED_IN') {
    supabase.rpc('log_auth_event', { p_action: 'login' }).then(() => {});
  }
});
```

`log_auth_event` solo registra en `audit_log` con action='login'. No guarda device, IP, user_agent, ni controla sesiones concurrentes.

---

## 3. DISEÑO DE SOLUCIÓN: active_sessions (NO IMPLEMENTAR AÚN)

### 3.1 Tabla propuesta

```sql
CREATE TABLE public.active_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text        NOT NULL,  -- fingerprint del dispositivo (generado en frontend)
  device_name   text,                  -- 'Chrome / MacOS', 'App iOS', etc.
  user_agent    text,
  ip            inet,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,           -- null = activa, !null = revocada
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)          -- un usuario, un dispositivo = una sesión
);
```

### 3.2 Límites por plan

| Plan | Sesiones máximas | Lógica |
|------|-----------------|--------|
| FREE | 1 sesión simultánea | Si intenta login en 2do dispositivo → desconectar el 1ro |
| PRO | 1 sesión por usuario | `included_users = 1` → máximo 1 sesión total |
| PREMIUM | 1 sesión por usuario licenciado | `included_users = 5` → máximo 5 sesiones (1 por usuario) |
| ENTERPRISE | Configurable | `active_session_limit` en workspace config |

### 3.3 Flujo de control

```
Usuario intenta login
    ↓
Supabase Auth valida credenciales → emite JWT
    ↓
Frontend llama RPC register_session(user_id, device_id, device_name, user_agent, ip)
    ↓
register_session():
  1. Cuenta sesiones activas del workspace
  2. Si count >= limit: revoca sesión más antigua (UPDATE revoked_at = now())
  3. INSERT nueva sesión
  4. Retorna: session_id, sessions_remaining
    ↓
Frontend guarda session_id en localStorage
    ↓
Cada request: check_session_valid(session_id) → si revoked → force signOut()
```

### 3.4 Mecanismo de detección de dispositivo

El `device_id` se genera en el frontend una sola vez y se guarda en `localStorage`:
```typescript
// Al cargar la app por primera vez:
const deviceId = localStorage.getItem('shelwi_device_id') 
  ?? crypto.randomUUID();
localStorage.setItem('shelwi_device_id', deviceId);
```

Limitación: si el usuario borra localStorage, obtendrá un nuevo `device_id` y se contará como dispositivo nuevo.

---

## 4. IMPACTO EN EXPERIENCIA DE USUARIO

### 4.1 Riesgos de UX al implementar límites de sesión

| Escenario | Impacto en UX | Mitigación |
|-----------|--------------|-----------|
| Usuario cierra pestaña sin signOut → segunda sesión falla | 🔴 Mala UX | TTL de inactividad (30 min) antes de liberar sesión |
| Usuario alterna entre mobile y desktop | 🔴 Bloqueante | Solo aplicar si AMBOS están activos simultáneamente |
| App native + web al mismo tiempo | 🔴 Problemático | Distinguir por `device_type` (web vs mobile vs desktop) |
| Usuario tiene sesión activa olvidada en otro dispositivo | 🟡 Confuso | UI de "Sesiones activas" para ver y revocar manualmente |

### 4.2 Consideraciones críticas de Supabase Auth

⚠️ **IMPORTANTE:** Supabase Auth NO tiene un endpoint para invalidar un JWT existente antes de su expiración.

Una vez emitido un JWT, **Supabase no puede revocarlo activamente** hasta que expire (1 hora por defecto).

Opciones para "revocar" una sesión:
1. **Esperar expiración (1 hora)**: el usuario revocado sigue siendo válido hasta que expire su JWT.
2. **Refresh token rotation**: si revocamos el refresh_token de Supabase, el usuario no podrá renovar pero sigue activo hasta la próxima hora.
3. **Middleware de validación**: en cada request, verificar en DB si `active_sessions.revoked_at IS NOT NULL` → retornar 401 (pero esto requiere una llamada a DB en cada RPC).
4. **Server-Side Sessions** (próximamente en Supabase): feature en desarrollo que permitirá invalidación inmediata.

### 4.3 Recomendación de implementación

**NO implementar como bloqueante.** Implementar como:
1. **Warning**: si se detecta sesión concurrente → avisar pero permitir.
2. **Soft limit**: si se supera el límite → enviar email de aviso al owner.
3. **Hard limit** (Sprint futuro): cuando Supabase tenga server-side sessions.

---

## 5. ALTERNATIVAS A EVALUAR ANTES DE IMPLEMENTAR

| Alternativa | Pros | Contras |
|-------------|------|---------|
| Supabase server-side sessions (próximamente) | Invalidación real de JWT | No disponible hoy |
| Rate limit por device_id en middleware | Control efectivo | Requiere middleware en Edge Functions |
| Single sign-on with session webhook | Nativo | Solo con Supabase Enterprise |
| Verificación periódica de sesión válida | Implementable hoy | UX: usuario puede quedar desconectado mid-session |

---

## 6. DECISIÓN REQUERIDA ANTES DE IMPLEMENTAR

1. ¿El límite de sesiones es **hard** (bloquea) o **soft** (avisa)?
2. ¿Qué pasa con el JWT activo cuando se revoca una sesión? ¿Esperamos la expiración?
3. ¿Las apps native (iOS/Android) tienen sesión separada o cuentan como la misma?
4. ¿El usuario puede ver sus sesiones activas y revocarlas manualmente?

**Estado: PENDIENTE de decisión. NO IMPLEMENTAR hasta respuesta.**

---

*Auditoría completada. Ningún código escrito. Ninguna migración creada.*
