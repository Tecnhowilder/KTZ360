# SESSION_SECURITY_REPORT — Shelwi Sprint 24

> Fecha: 2026-06-23 | Criticidad: ALTA — protección del modelo SaaS

---

## PROBLEMA RESUELTO

**Antes del Sprint 24:**
- 1 licencia PRO podía autenticarse en N dispositivos simultáneamente
- No existía la tabla `active_sessions`
- El login en dispositivo B NO cerraba la sesión de dispositivo A

**Después del Sprint 24:**
- 1 licencia = 1 sesión activa por usuario (FREE/PRO/PREMIUM)
- ENTERPRISE = hasta 3 sesiones por usuario (configurable)
- Login nuevo → revocación automática de sesiones anteriores
- Heartbeat cada 30 segundos detecta revocación → signOut inmediato

---

## IMPLEMENTACIÓN

### Base de Datos — Migración 0101

**Tabla `active_sessions`:**
- `id` (uuid PK)
- `workspace_id` (FK workspaces)
- `user_id` (FK auth.users)
- `device_id` (text — UUID generado en cliente)
- `device_name` (text — "Chrome / Windows", "iPhone")
- `ip` (text)
- `user_agent` (text)
- `created_at`, `last_seen_at`, `revoked_at`, `revoke_reason`

**Índices:**
- `idx_active_sessions_user_active` — lookup rápido de sesiones activas del usuario
- `idx_active_sessions_workspace_active` — para reportes de admin
- `idx_active_sessions_device` — para reconexión del mismo device
- `idx_active_sessions_last_seen` — para cleanup de zombies

**RPCs (todas security definer):**
| RPC | Descripción |
|-----|-------------|
| `create_session(device_id, device_name, ip, user_agent)` | Login: crea sesión, revoca anteriores |
| `session_heartbeat(session_id, device_id)` | Valida sesión activa, 30s interval |
| `revoke_session(session_id, reason)` | Logout manual o admin revoke |
| `revoke_other_sessions(current_session_id)` | "Cerrar en todos los dispositivos" |
| `get_my_sessions()` | Lista sesiones activas del usuario |
| `cleanup_old_sessions()` | Cron: limpia zombies y revocadas >30 días |

### Frontend

**`src/services/auth.ts`:**
- `signIn()`: después del JWT de Supabase, llama `create_session()` best-effort
- `signOut()`: llama `revoke_session()` antes de `supabase.auth.signOut()`
- `getOrCreateDeviceId()`: genera UUID persistido en localStorage
- `getDeviceName()`: detecta tipo de dispositivo del userAgent

**`src/hooks/useSessionGuard.ts`:**
- Heartbeat cada 30 segundos via `session_heartbeat()`
- Si `action === 'logout'` → `signOut()` con grace period de 5 segundos
- No-op si no hay sesión registrada (usuarios login anterior al Sprint 24)

---

## FLUJO COMPLETO

```
1. Usuario abre app en PC → signIn()
   → Supabase genera JWT (1h válido)
   → Frontend genera device_id (UUID en localStorage)
   → create_session() en DB → sesión A creada
   → useSessionGuard inicia heartbeat

2. Mismo usuario abre app en móvil → signIn()
   → Supabase genera JWT (1h válido)
   → create_session() en DB
   → Backend: plan FREE/PRO/PREMIUM → revoca sesión A
   → sesión B creada como activa

3. Heartbeat en PC (30s) → session_heartbeat()
   → Backend: sesión A tiene revoked_at = NOT NULL
   → Retorna: { action: 'logout', reason: 'new_login' }
   → Frontend espera 5s (grace period)
   → signOut() automático
   → UI redirige a login

4. Móvil sigue activo con sesión B
```

---

## MATRIZ DE SESIONES

| Plan | Max sesiones/usuario | Revocación al login |
|------|---------------------|---------------------|
| FREE | 1 | Sí — revoca todas las anteriores |
| PRO | 1 | Sí — revoca todas las anteriores |
| PREMIUM | 1 (por usuario) | Sí — revoca las de ese usuario |
| ENTERPRISE | 3 (default) | Sí — revoca las más antiguas si supera límite |

---

## SEGURIDAD Zero Trust

- ✅ `create_session()` obtiene `workspace_id` del JWT (nunca del cliente)
- ✅ `session_heartbeat()` valida que `user_id` del JWT coincide con el de la sesión
- ✅ `revoke_session()` verifica que el caller es dueño o admin del workspace
- ✅ RLS en `active_sessions`: cada usuario solo ve sus propias sesiones
- ✅ `device_id` en localStorage es opaco (UUID random, sin datos personales)
- ✅ Heartbeat de 30s con grace period de 5s — balance entre seguridad y UX

---

## LIMITACIONES CONOCIDAS

1. **JWT no se revoca en Supabase:** El JWT sigue siendo válido por 1 hora aunque la sesión esté revocada. El usuario revocado puede hacer requests directos a la DB hasta que el JWT expire. Mitigación: RLS + heartbeat cierra la UI antes de que expire.

2. **localStorage limpiado:** Si el usuario limpia el localStorage, pierde el `device_id` y `session_id`. Al reloguear, se crea una sesión nueva (el comportamiento esperado).

3. **Usuarios pre-Sprint 24:** Usuarios con sesión activa antes del Sprint 24 no tienen `session_id` en localStorage. El hook `useSessionGuard` es no-op para ellos. Al hacer signOut + signIn, quedan protegidos.

---

## INSTRUCCIÓN DE DESPLIEGUE

1. Ejecutar `0101_active_sessions.sql` en Supabase SQL Editor
2. Integrar `useSessionGuard()` en el layout raíz autenticado:

```tsx
// En src/router.tsx o en el layout principal autenticado
import { useSessionGuard } from './hooks/useSessionGuard';

function AuthenticatedLayout() {
  useSessionGuard(); // <- agregar aquí
  return <Outlet />;
}
```

3. Agregar cron en Supabase:
```sql
SELECT cron.schedule('cleanup-sessions', '0 2 * * *',
  'SELECT public.cleanup_old_sessions()');
```
