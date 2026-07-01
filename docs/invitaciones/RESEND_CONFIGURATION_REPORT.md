# CONFIGURACIÓN RESEND — Reporte

**Fecha:** 2026-06-28

---

## ESTADO ACTUAL

| Componente | Estado |
|-----------|--------|
| Edge Function `send-email` | ✅ Existe y funciona |
| Template `team_invite` | ✅ Implementado |
| `system_configuration.resend` | ⚠️ Placeholder vacío — necesita api_key real |
| Dominio remitente | ⚠️ Pendiente configurar en Resend |
| Resend API Key | 🔴 NO configurada — emails no se envían |

---

## COMPORTAMIENTO SIN RESEND CONFIGURADO

El sistema es **graceful** — la invitación se crea en DB aunque el email falle:

```
send-email → api_key vacío → 501 resend_not_configured
Frontend → emailSent: false → muestra enlace para copiar manualmente
```

El Owner ve el enlace copiable y puede enviarlo por WhatsApp/Telegram/SMS.

---

## CÓMO CONFIGURAR RESEND

### 1. Crear cuenta en Resend
- Ir a https://resend.com
- Crear cuenta gratuita (100 emails/día gratis)

### 2. Verificar dominio (recomendado para producción)
- En Resend: Domains → Add Domain → `shelwi.app` (o el dominio del cliente)
- Agregar registros DNS: SPF, DKIM, DMARC
- Sin dominio verificado: los emails se envían desde `onboarding@resend.dev`

### 3. Obtener API Key
- En Resend: API Keys → Create API Key
- Permisos: `Sending access` es suficiente
- Copiar: `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 4. Configurar en Supabase SQL Editor

```sql
UPDATE public.system_configuration
   SET value = jsonb_set(
     jsonb_set(
       jsonb_set(value, '{api_key}', '"re_TU_API_KEY_AQUÍ"'),
       '{from_email}', '"no-reply@tu-dominio.com"'
     ),
     '{from_name}', '"Shelwi"'
   )
 WHERE key = 'resend';
```

### 5. Verificar
```sql
SELECT value FROM system_configuration WHERE key = 'resend';
-- Debe mostrar api_key no vacío
```

### 6. Probar (desde el SQL Editor o curl)
```bash
curl -X POST https://TU_SUPABASE_URL/functions/v1/send-email \
  -H "Authorization: Bearer TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "team_invite",
    "to": "test@test.com",
    "data": {
      "inviterName": "Admin",
      "workspaceName": "Mi Empresa",
      "role": "operario",
      "token": "test-token",
      "appUrl": "https://tu-app.com"
    }
  }'
```

---

## TEMPLATE team_invite — Campos Requeridos

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `inviterName` | Nombre del Owner que invita | "Carlos Martínez" |
| `workspaceName` | Nombre del workspace | "Constructora ABC" |
| `role` | Rol asignado | "operario" |
| `token` | UUID de la invitación | "550e8400-..." |
| `appUrl` | URL base de la app | "https://app.shelwi.com" |

---

## NOTAS DE PRODUCCIÓN

- Sin Resend configurado: el flujo funciona (invitación creada, enlace manual)
- Con Resend: email automático con botón y diseño profesional
- Los emails se almacenan en `audit_log` (acción `invitation_sent`)
- Resend Free: 100 emails/día, 3.000/mes
- Resend Pro: $20/mes, 50.000 emails/mes
