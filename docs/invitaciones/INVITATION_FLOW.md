# FLUJO COMPLETO — Sistema de Invitaciones

```
OWNER pulsa "Enviar invitación"
         │
         ▼
[Frontend] inviteTeamMember() — team.ts
  Campos: email, nombre, teléfono, ciudad, profesión, especialidad, rol
         │
         ▼ RPC supabase.rpc('invite_team_member', { ...8 params })
         │
    ┌────┴────────────────────────────────────────────────────┐
    │  invite_team_member (PostgreSQL — SECURITY DEFINER)      │
    │                                                          │
    │  1. Zero Trust: auth.uid() → profiles.workspace_id      │
    │  2. Validar rol caller (owner/admin)                     │
    │  3. check_feature_access(multiuser_enabled)              │
    │  4. Validar rol del invitado                             │
    │  5. Validar email                                        │
    │  6. Verificar cuota (NULL = ilimitado Enterprise)        │
    │  7. Revocar invitaciones pendientes del mismo email      │
    │  8. INSERT workspace_invitations                         │
    │     token = gen_random_uuid() ← DEFAULT de la columna   │
    │     expires_at = now() + 7 days                         │
    │  9. INSERT audit_log                                     │
    │  10. RETURN { ok, invitation_id, token, email, role }    │
    └────────────────────────────────────────────────────────┘
         │
         ▼ token (UUID)
[Frontend] sendInvitationEmail()
  URL: https://shelwi.app/invite/{token}
         │
         ▼ supabase.functions.invoke('send-email', { template, to, data })
         │
    ┌────┴────────────────────────────────────────────────────┐
    │  send-email Edge Function                                │
    │                                                          │
    │  1. Validar template = 'team_invite'                    │
    │  2. Leer Resend API key de system_configuration         │
    │  3. Si api_key vacío → return { ok: false } (no bloquea)│
    │  4. Renderizar template:                                 │
    │     Asunto: "{inviterName} te invitó a {workspaceName}" │
    │     Body: rol, botón "Aceptar invitación", link 7 días  │
    │  5. POST https://api.resend.com/emails                   │
    └────────────────────────────────────────────────────────┘
         │
         ▼ Email llega al invitado
[Browser] /invite/{token} → AcceptInvite.tsx
         │
    ┌────┴────────────────────────────────────────────────────┐
    │  Si NO autenticado:                                      │
    │    Mostrar preview: empresa, rol                        │
    │    Botón: "Crear cuenta" → /registro?redirect=...       │
    │    Botón: "Iniciar sesión" → /login?redirect=...        │
    │                                                          │
    │  Si SÍ autenticado:                                     │
    │    Auto-acepta vía accept_invitation(token)             │
    │    Navigate → /app/dashboard                            │
    └────────────────────────────────────────────────────────┘
         │
         ▼ RPC supabase.rpc('accept_invitation', { p_token })
         │
    ┌────┴────────────────────────────────────────────────────┐
    │  accept_invitation (PostgreSQL — SECURITY DEFINER)       │
    │                                                          │
    │  1. Buscar token en workspace_invitations               │
    │  2. Verificar no expirada                               │
    │  3. Verificar status = 'pending'                        │
    │  4. Verificar email caller = email invitación           │
    │  5. Verificar cuota de asientos                         │
    │  6. UPDATE profiles:                                     │
    │       workspace_id = inv.workspace_id                   │
    │       role = inv.role                                   │
    │       status = 'active'                                 │
    │       phone/city/specialty ← sync desde invitación     │
    │  7. UPDATE workspace_invitations: status='accepted'     │
    │  8. INSERT audit_log                                    │
    │  9. INSERT notifications → owner                        │
    │  10. RETURN { workspace_name, role }                    │
    └────────────────────────────────────────────────────────┘
         │
         ▼
USUARIO ACTIVO en el workspace
  - Puede iniciar sesión
  - Ve onboarding por su rol
  - Puede ser asignado a pedidos y OTs
  - Aparece en panel Equipo y usuarios
```

---

## ESTADOS DE INVITACIÓN

```
pending  ──(accepted)──► accepted  (token usado)
pending  ──(revoked)───► revoked   (owner la canceló)
pending  ──(expired)───► expired   (7 días sin usar)
revoked  ──(re-invite)─► pending   (nueva invitación)
expired  ──(re-invite)─► pending   (nueva invitación)
```

## TOKEN LIFECYCLE

```
Generado: gen_random_uuid() al crear invitación
Enviado:  en email como /invite/{uuid}
Usado:    una sola vez — accept_invitation() cambia status a 'accepted'
Inválido: status != 'pending' → error invalid_or_expired_invitation
```
