# REPORTE DE SEGURIDAD — Sistema de Invitaciones

**Fecha:** 2026-06-28

---

## TOKEN DE INVITACIÓN

| Característica | Implementación | Evaluación |
|---------------|---------------|-----------|
| **Generación** | `gen_random_uuid()` via pgcrypto | ✅ Criptográficamente seguro |
| **Entropía** | 122 bits (UUID v4) | ✅ Imposible de predecir/fuerza bruta |
| **Almacenamiento** | Texto plano en `workspace_invitations.token` | ✅ Aceptable — es solo un token de acceso temporal |
| **Tipo en DB** | `uuid NOT NULL UNIQUE` | ✅ Tipo correcto, unicidad garantizada |
| **Expiración** | `expires_at = created_at + 7 días` | ✅ Tiempo limitado |
| **Un solo uso** | Al aceptar: `status = 'accepted'` → no se puede reusar | ✅ Idempotente |
| **Invalidable** | Owner puede revocar: `status = 'revoked'` | ✅ Control manual |
| **No hashear** | No es necesario — no es un password; es un token de acceso | ✅ Correcto para este caso de uso |

---

## ZERO TRUST

| Control | Implementación | Estado |
|---------|---------------|--------|
| workspace_id nunca del frontend | `auth.uid()` → `profiles.workspace_id` | ✅ |
| Rol del caller validado en DB | `v_caller_role IN ('owner','admin',...)` | ✅ |
| Feature flag validado en backend | `check_feature_access(multiuser_enabled)` | ✅ |
| Email verificado contra invitación | `lower(caller_email) = lower(inv.email)` | ✅ |
| No enumeración de usuarios | Errores genéricos (`invalid_or_expired_invitation`) | ✅ |

---

## MULTI-TENANT

| Control | Implementación | Estado |
|---------|---------------|--------|
| RLS en workspace_invitations | `workspace_id = current_workspace_id()` | ✅ |
| No invitaciones cruzadas | WHERE `workspace_id = p_workspace_id` AND caller pertenece a ese WS | ✅ |
| Técnico no puede invitar a otro WS | Zero Trust verifica workspace_id del JWT | ✅ |

---

## PROTECCIONES ADICIONALES

| Protección | Implementación | Estado |
|-----------|---------------|--------|
| Rate limiting | Supabase RLS + Edge Function natural throttle | ⚠️ Sin rate limiting explícito |
| Replay protection | Token de un solo uso + `status` no-reutilizable | ✅ |
| CSRF protection | Supabase auth con JWT Bearer token | ✅ |
| No fuga de correos | Error `email_mismatch` no revela si el email existe o no | ✅ |
| Escalamiento de privilegios | Rol validado en INSERT, no en frontend | ✅ |
| Token predecible | UUID v4 = 122 bits de aleatoriedad criptográfica | ✅ |

---

## MEJORAS FUTURAS (no bloqueantes)

| Mejora | Prioridad |
|--------|----------|
| Rate limiting en send-email (máx 5 invitaciones/hora por workspace) | MEDIA |
| Hash del token para almacenamiento (overkill para invitaciones temporales) | BAJA |
| Registro de intentos fallidos de aceptación | BAJA |
| Notificación al owner cuando se usa un token expirado | BAJA |
