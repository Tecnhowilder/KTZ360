# AUDITORÍA COMPLETA — Sistema de Invitaciones Shelwi

**Fecha:** 2026-06-28 | **Migration de fix:** 0118

---

## FLUJO COMPLETO AUDITADO

### Paso 1 — Frontend: usuario pulsa "Enviar invitación"

**Archivo:** `src/services/team.ts` — `inviteTeamMember()`  
**Flujo:**
1. Llama `supabase.rpc('invite_team_member', { p_workspace_id, p_email, p_role, p_full_name, p_phone, p_city, p_profession, p_specialty })`
2. Si error 404/42883/undefined_function → fallback a 4-param RPC
3. Parsea respuesta: formato A `{ ok, invitation_id, token, email, role }` ← nuestras RPCs

### Paso 2 — RPC: `invite_team_member`

**Versiones disponibles:**
- 4 params: `(uuid, text, text, text)` — migration 0107 + 0118
- 8 params: `(uuid, text, text, text, text, text, text, text)` — migration 0113 + 0118

**Validaciones en orden:**
1. Zero Trust: `auth.uid()` → `profiles.workspace_id` = `p_workspace_id`
2. Rol del caller: solo `owner | admin | super_admin | support_admin`
3. Feature flag: `check_feature_access(multiuser_enabled)` = PREMIUM/ENTERPRISE
4. Rol del invitado: solo `admin | supervisor | comercial | operario`
5. Validación de email: no vacío, contiene @
6. Cuota de asientos: `seats_used < seats_limit` (NULL = Enterprise = ilimitado)
7. Revocar invitaciones pendientes previas del mismo email
8. INSERT con token = `gen_random_uuid()` (UUID, 122 bits entropía)
9. Retorna `{ ok, invitation_id, token, email, role, full_name }`

### Paso 3 — Frontend: construye URL de invitación

**Archivo:** `src/services/team.ts` — `sendInvitationEmail()`  
URL: `${window.location.origin}/invite/${invitation.token}`  
Token: UUID string (`550e8400-e29b-41d4-a716-446655440000`)

### Paso 4 — Edge Function: `send-email`

**Archivo:** `supabase/functions/send-email/index.ts`  
**Flujo:**
1. Verifica `template: 'team_invite'` existe en `templates.ts`
2. Lee config Resend desde `system_configuration.key='resend'`
3. Si `api_key` vacío → retorna 501 `resend_not_configured` (NO bloquea el flujo)
4. Construye HTML con template `team_invite`
5. POST a `https://api.resend.com/emails`

**Template `team_invite` requiere:** `inviterName`, `workspaceName`, `role`, `appUrl`, `token`

### Paso 5 — Email recibido

Asunto: `{inviterName} te invitó a unirte a {workspaceName} en Shelwi`  
Contenido: nombre del invitado, empresa, rol, botón "Aceptar invitación", URL de 7 días

### Paso 6 — Usuario hace clic en el enlace

**Ruta:** `/invite/:token` → `src/views/public/AcceptInvite.tsx`

**Si autenticado:**
- Auto-acepta via `acceptInvitation(token)`
- Navega a `/app/dashboard`

**Si no autenticado:**
- Muestra preview de la invitación (empresa, rol)
- Botones: "Crear cuenta" → `/registro?redirect=/invite/TOKEN&email=EMAIL`
- "Iniciar sesión" → `/login?redirect=...`

### Paso 7 — RPC: `accept_invitation(p_token uuid)`

**Validaciones:**
1. Buscar token en `workspace_invitations`
2. Verificar no expirada (`expires_at > now()`)
3. Verificar `status = 'pending'`
4. Verificar email del caller = email de la invitación (case-insensitive)
5. Verificar cuota (Enterprise = NULL = sin límite)
6. UPDATE profiles: `workspace_id`, `role`, `status='active'`, sync phone/city/specialty
7. UPDATE invitations: `status='accepted'`, `accepted_at=now()`
8. INSERT audit_log
9. INSERT notifications → owner recibe notificación

### Paso 8 — Base de datos resultado

- `profiles.workspace_id` = workspace del invitador
- `profiles.role` = rol asignado en la invitación
- `profiles.status` = 'active'
- `workspace_invitations.status` = 'accepted'
- `workspace_invitations.accepted_at` = now()
- Onboarding se muestra según el rol (desde `profile.onboarding_seen = false`)

---

## INCIDENCIAS ENCONTRADAS

| # | Tipo | Descripción | Estado |
|---|------|-------------|--------|
| 1 | CRÍTICA | `get_random_bytes(integer)` no existe — typo en función del DB live | ✅ FIX en 0118 |
| 2 | CRÍTICA | Token generado como hex text vs columna UUID → type mismatch | ✅ FIX en 0118 |
| 3 | MEDIA | `accept_invitation` falla con NULL seats_limit (Enterprise) | ✅ FIX en 0118 |
| 4 | MEDIA | Fallback en team.ts no capturaba error 42883 (undefined_function) | ✅ FIX en team.ts |
| 5 | INFO | send-email silencioso si Resend no está configurado (501, no 400) | ✅ Correcto — no bloquea |
