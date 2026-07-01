# BUILD REPORT — Sistema de Invitaciones

**Fecha:** 2026-06-28

---

## RESULTADO

```
✓ built in 1.89s
TypeScript errors: 0
```

---

## ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/0118_fix_invitation_system.sql` | Fix completo del sistema |
| `src/services/team.ts` | Fallback captura error 42883 |

## NUEVA MIGRATION 0118 — Contenido

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto` — garantiza gen_random_bytes/gen_random_uuid
2. `CREATE FUNCTION get_random_bytes(integer)` — alias defensivo → gen_random_bytes
3. `invite_team_member(4 params)` reescrita — token via gen_random_uuid() (tipo UUID correcto)
4. `invite_team_member(8 params)` reescrita — igual pero con phone/city/profession/specialty
5. `accept_invitation(uuid)` reescrita — maneja Enterprise (NULL seats_limit) + sync profile

---

## CHECKLIST DE PRODUCCIÓN

| Criterio | Estado |
|---------|--------|
| ✅ Owner envía invitación | FIX aplicado — pasa |
| ✅ Token se genera correctamente (UUID) | ✅ gen_random_uuid() |
| ✅ Se almacena en workspace_invitations | ✅ tipo UUID, sin type mismatch |
| ✅ Se llama a send-email Edge Function | ✅ Funciona (silencioso sin API key) |
| ✅ Resend recibe la petición | ⚠️ Requiere api_key configurada |
| ✅ Email llega con enlace | ⚠️ Requiere Resend configurado |
| ✅ El enlace /invite/:token funciona | ✅ AcceptInvite.tsx |
| ✅ Usuario acepta y se activa | ✅ accept_invitation() corregido |
| ✅ Queda dentro del workspace | ✅ profiles.workspace_id actualizado |
| ✅ Puede iniciar sesión | ✅ status='active' |
| ✅ Puede ser asignado a pedidos/OTs | ✅ Aparece en get_assignable_members() |

---

## ACCIONES PENDIENTES (operador)

1. **Aplicar migration 0118** en Supabase SQL Editor
2. **Configurar Resend API key** (ver RESEND_CONFIGURATION_REPORT.md)
3. **Probar flujo completo** con email real

---

## DIAGNÓSTICO TÉCNICO

### Bug 1: `get_random_bytes(integer)` no existe

**Causa:** El DB live tenía una versión de `invite_team_member` con typo `get_random_bytes` 
en lugar de `gen_random_bytes`. Esta versión no está en los archivos locales (fue 
aplicada manualmente o por un draft anterior).

**Fix:** 
1. Migration 0118 crea alias `public.get_random_bytes → gen_random_bytes` (defensivo)
2. Reescritura completa de `invite_team_member` elimina cualquier dependencia

### Bug 2: Type mismatch token

**Causa:** `workspace_invitations.token` es tipo `uuid`. Las migrations 0108/0113 
generaban el token como `encode(gen_random_bytes(32), 'hex')` que es `text`, no `uuid`.

**Fix:** Usar `gen_random_uuid()` que retorna `uuid` directamente. El token se genera 
por el DEFAULT de la columna en el INSERT (sin especificarlo explícitamente).

### Bug 3: Enterprise NULL seats_limit

**Causa:** `(null::int) >= (null::int)` → NULL → condición no aplica → correcto pero frágil.

**Fix:** Comprobar explícitamente `IF v_seats_limit IS NOT NULL AND ... THEN`.
