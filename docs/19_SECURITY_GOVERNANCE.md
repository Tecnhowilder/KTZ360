# SECURITY GOVERNANCE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14 | Autoridad: Security Architect
> Aplica a: todo código, toda Edge Function, todo agente, toda migración

---

## 1. MODELO DE SEGURIDAD: ZERO TRUST

### Principio Raíz

> "Nunca confiar, siempre verificar. El frontend NUNCA decide acceso. El backend NUNCA confía en el frontend."

Zero Trust ya está implementado parcialmente en el codebase (confirmado por auditoría MCP):
- `src/services/crm.ts`, `evidences.ts`, `gps.ts`, `quotes.ts` — "Zero Trust: todas las validaciones en backend via RPCs SECURITY DEFINER"
- `src/lib/permissions.ts` — "el frontend nunca decide acceso"
- RLS en 275+ políticas generadas dinámicamente
- `SECURITY DEFINER` en RPCs críticos: `invite_team_member`, `accept_invitation`, `current_workspace_id`

Este documento formaliza ese patrón y establece los gaps que deben cubrirse.

---

## 2. CAPAS DE SEGURIDAD

```
┌─────────────────────────────────────────────────┐
│  CAPA 1: FRONTEND (No autoridad — solo display) │
│  React + Capacitor — muestra lo que el backend  │
│  autoriza. Nunca decide acceso.                 │
├─────────────────────────────────────────────────┤
│  CAPA 2: SUPABASE AUTH (JWT)                    │
│  Emite y verifica tokens. Toda sesión tiene     │
│  user_id verificado criptográficamente.         │
├─────────────────────────────────────────────────┤
│  CAPA 3: ROW LEVEL SECURITY (PostgreSQL)        │
│  275+ políticas. Ninguna query bypassa RLS.     │
│  workspace_id derivado del JWT, nunca del body. │
├─────────────────────────────────────────────────┤
│  CAPA 4: SECURITY DEFINER RPCs                 │
│  Para operaciones que cruzan tenant boundaries  │
│  (invitaciones, onboarding). Verifican JWT +    │
│  workspace + plan antes de ejecutar.            │
├─────────────────────────────────────────────────┤
│  CAPA 5: EDGE FUNCTIONS (Zero Trust)            │
│  Toda Edge Function verifica: JWT → workspace   │
│  activo → plan válido → feature habilitada.     │
│  Secrets vía Vault/env vars del servidor.       │
├─────────────────────────────────────────────────┤
│  CAPA 6: CONTENT POLICY LAYER (IA) [A IMPL.]   │
│  Sanitiza inputs/outputs de agentes IA.         │
│  Previene prompt injection y data leakage.      │
└─────────────────────────────────────────────────┘
```

---

## 3. AUTENTICACIÓN Y SESIÓN

### 3.1 JWT Management
- Supabase Auth emite JWTs con expiración de 1 hora.
- Refresh tokens: 30 días máximo, rotation habilitado.
- El `user_id` del JWT es inmutable — ningún código puede sobreescribirlo.
- Todo acceso a datos usa el JWT del usuario — nunca la service role key en el frontend.

### 3.2 Service Role Key
- La `SERVICE_ROLE_KEY` **nunca** llega al frontend.
- Uso permitido: migraciones (Supabase CLI), Edge Functions que necesitan bypassar RLS con propósito administrativo.
- Toda operación con service role se registra en `audit_log` con `actor = 'system'`.

### 3.3 Variables de entorno (regla definitiva)
```
PERMITIDO en frontend (VITE_*):
  VITE_SUPABASE_URL        → URL pública de Supabase
  VITE_SUPABASE_ANON_KEY   → Key pública (RLS protege los datos)
  VITE_SENTRY_DSN          → Error tracking, no es secret

PROHIBIDO en frontend:
  VITE_OPENAI_KEY, VITE_GEMINI_KEY, VITE_NVIDIA_KEY   → En Supabase Vault
  VITE_SERVICE_ROLE_KEY                                → Nunca, jamás
  VITE_STRIPE_SECRET_KEY, VITE_STRIPE_WEBHOOK_SECRET  → En Supabase Vault
  Cualquier API key de tercero                         → En Edge Function secrets
```

### 3.4 Secrets Management
- Secrets de Edge Functions → `supabase secrets set NAME=value` → accesibles via `Deno.env.get()`
- Secrets rotativos (Stripe webhook, tokens OAuth) → Supabase Vault
- `.env.example` puede contener nombres de variables pero NUNCA valores reales
- `.env` está en `.gitignore` — verificar en cada onboarding

---

## 4. AUTORIZACIÓN: RBAC + FEATURE FLAGS

### 4.1 Sistema actual (implementado)

```typescript
// RBAC: rol del usuario en el workspace
src/hooks/usePermissions.ts  → usePermission(action)
src/lib/permissions.ts       → getEffectivePlanCode(), checkPermission()

// Feature Flags: features habilitadas por plan  
src/hooks/useFeatureFlags.ts → useFeatureFlags()
src/hooks/usePermissions.ts  → useFeatureAccess(feature)

// Plan features en BD
tabla: plan_features (plan_code, feature_key, enabled, metadata)
tabla: workspace_features (workspace_id, feature_key, enabled) ← override por workspace
```

### 4.2 Roles del sistema

| Rol | Descripción | Capacidades base |
|---|---|---|
| `owner` | Propietario del workspace | Todo |
| `admin` | Administrador | Casi todo, excepto eliminar workspace |
| `manager` | Gerente de departamento | Su departamento + reportes |
| `member` | Miembro del equipo | Solo sus datos + datos compartidos |
| `viewer` | Solo lectura | No puede escribir nada |
| `guest` | Invitado temporal | Acceso limitado por tiempo |
| `superadmin` | Administrador de plataforma | Solo accesible via AdminPanel |

### 4.3 Brecha identificada: ABAC/PBAC

El sistema actual es RBAC. Para escalabilidad enterprise necesitará:
- **ABAC (Attribute-Based Access Control):** Permisos basados en atributos (`solo mis clientes`, `solo mi región`, `solo factura < 10k`)
- **PBAC (Policy-Based Access Control):** Permisos definidos por reglas dinámicas

**Plan:** 
- Fase 6 (Policy Engine) implementa la infraestructura ABAC/PBAC.
- Hasta entonces, RBAC + Feature Flags es suficiente.
- No anticipar la implementación — genera over-engineering.

---

## 5. ROW LEVEL SECURITY (RLS)

### 5.1 Patrón estándar

Toda tabla de negocio tiene exactamente estas 4 políticas (generadas por `0003_rls.sql:125`):

```sql
-- SELECT: el usuario puede ver solo datos de su workspace
CREATE POLICY "tablename_select_workspace" ON public.tablename
  FOR SELECT USING (
    company_id = (SELECT current_workspace_id())
  );

-- INSERT: solo puede insertar en su workspace
CREATE POLICY "tablename_insert_workspace" ON public.tablename
  FOR INSERT WITH CHECK (
    company_id = (SELECT current_workspace_id())
  );

-- UPDATE: solo puede modificar datos de su workspace  
CREATE POLICY "tablename_update_workspace" ON public.tablename
  FOR UPDATE USING (
    company_id = (SELECT current_workspace_id())
  );

-- DELETE: solo puede eliminar (soft) en su workspace
CREATE POLICY "tablename_delete_workspace" ON public.tablename
  FOR DELETE USING (
    company_id = (SELECT current_workspace_id())
  );
```

### 5.2 Excepciones documentadas

| Tabla | Excepción | Justificación |
|---|---|---|
| `plans` | Sin RLS — pública | Los planes son información pública |
| `plan_features` | Sin RLS — pública | Features de planes son públicas |
| `companies` | RLS propia — owner ve su company | Acceso especial para onboarding |
| `audit_log` | INSERT only — no UPDATE/DELETE | Inmutabilidad garantizada |
| `invitations` | RLS por `invitee_email` + token | Acceso cross-tenant controlado |

### 5.3 Verificación de RLS

Antes de cada deploy, verificar:
```sql
-- Verificar que toda tabla nueva tiene RLS habilitada
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;
-- Resultado debe ser solo las tablas de la lista de excepciones
```

---

## 6. EDGE FUNCTIONS — CHECKLIST DE SEGURIDAD

Toda Edge Function nueva debe implementar este patrón (basado en las existentes):

```typescript
export default async function handler(req: Request): Promise<Response> {
  // 1. CORS — siempre
  if (req.method === 'OPTIONS') return corsResponse();
  
  // 2. Autenticación — siempre antes de cualquier lógica
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return unauthorized('Invalid token');
  
  // 3. Workspace activo — derivado del JWT, nunca del body
  const workspaceId = await getWorkspaceId(user.id); // RPC SECURITY DEFINER
  if (!workspaceId) return unauthorized('No active workspace');
  
  // 4. Plan válido y feature habilitada
  const hasAccess = await checkFeatureAccess(workspaceId, 'feature_name');
  if (!hasAccess) return forbidden('Feature not available');
  
  // 5. Rate limiting
  const rateLimitOk = await checkRateLimit(workspaceId, 'endpoint_name');
  if (!rateLimitOk) return tooManyRequests('Rate limit exceeded');
  
  // 6. Validar y sanitizar body
  const body = await req.json();
  const validated = schema.parse(body); // Zod o similar
  
  // 7. Ejecutar lógica de negocio
  const result = await businessLogic(validated, workspaceId, user.id);
  
  // 8. Audit log
  await auditLog({ userId: user.id, workspaceId, action: 'ACTION_NAME', result });
  
  return jsonResponse(result);
}
```

---

## 7. RATE LIMITING

### 7.1 Implementación actual

Rate limiting ya implementado (confirmado MCP):
- `rate_limit_exceeded` en `aiStudio.ts:115` — AI requests
- `rate_limit_exceeded` en `TeamMobile.tsx:96` — Team operations

### 7.2 Estrategia completa

| Endpoint | Límite | Ventana | Acción al superar |
|---|---|---|---|
| `/api/ai-proxy` | 60 requests | Por empresa/minuto | 429 + retry-after header |
| `/api/create-checkout` | 10 requests | Por usuario/hora | 429 + alert |
| `/api/invite` | 20 invitaciones | Por workspace/hora | 429 |
| Toda Edge Function pública | 100 requests | Por IP/minuto | 429 |
| Autenticación | 5 intentos fallidos | Por IP/15min | Bloqueo temporal |

### 7.3 Rate Limiting en PostgreSQL

Para operaciones que pasan por RPCs (no Edge Functions):
```sql
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_workspace_id UUID,
  p_action TEXT,
  p_limit INT,
  p_window_minutes INT
) RETURNS BOOLEAN
SECURITY DEFINER AS $$
  SELECT COUNT(*) < p_limit
  FROM rate_limit_log
  WHERE workspace_id = p_workspace_id
    AND action = p_action
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
$$ LANGUAGE SQL;
```

---

## 8. GESTIÓN DE DATOS SENSIBLES

### 8.1 Clasificación de datos

| Nivel | Tipo | Ejemplos | Tratamiento |
|---|---|---|---|
| L1 — Público | Información general | Planes, precios, documentación | Sin restricción |
| L2 — Interno | Datos operativos | Tareas, proyectos, clientes básicos | RLS workspace |
| L3 — Confidencial | Datos financieros | Facturación, sueldos, contratos | RLS + audit obligatorio |
| L4 — Secreto | Credenciales, auth | Tokens, API keys, contraseñas | Vault + hash + nunca en BD plano |

### 8.2 Datos personales (PII)

- Emails de clientes: almacenar, no exponer en logs.
- Teléfonos: almacenar, no incluir en ai context sin necesidad explícita.
- Datos financieros personales: nunca en contexto de agente IA directamente — referencias a IDs.
- Para futura expansión a Europa: `data_residence` field en workspace para routing de datos.

### 8.3 Eliminación de datos

- Soft delete para todos los datos de negocio (`deleted_at`).
- Hard delete solo para PII bajo solicitud explícita del owner del workspace.
- El proceso de hard delete requiere verificación de identidad + registro en audit.
- Los eventos publicados al Event Bus son inmutables — no se pueden eliminar (punto importante para GDPR).

---

## 9. AUDITORÍA DE SEGURIDAD

### 9.1 Qué se audita siempre

- Todo login exitoso y fallido
- Toda modificación de datos L3 o L4
- Toda invocación de Edge Function con datos sensibles
- Todo cambio de plan o features
- Toda acción de un agente IA
- Todo acceso administrativo (AdminPanel)
- Toda invitación de nuevo miembro
- Toda exportación de datos

### 9.2 Formato de audit log

```typescript
interface AuditLogEntry {
  id: string;
  company_id: string;       // tenant
  user_id: string | null;   // null para acciones de sistema/agentes
  agent_id: string | null;  // si fue una acción de agente
  action: string;           // 'CLIENT_UPDATED', 'INVOICE_CREATED', etc.
  entity_type: string;      // 'client', 'invoice', etc.
  entity_id: string | null; // ID del registro modificado
  diff: Record<string, { before: unknown; after: unknown }>; // qué cambió
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>; // contexto adicional
  created_at: string;       // timestamptz
}
```

### 9.3 Retención de audit logs

- Datos de auditoría: 7 años (requisito legal típico para empresas)
- Particionamiento por año para mantener performance con años de datos
- Archivado automático a cold storage (Supabase Storage) para logs > 2 años

---

## 10. CHECKLIST DE SEGURIDAD — PRE-DEPLOY

### Por cada PR:
- [ ] Sin secrets hardcodeados (grep por `APIKEY`, `SECRET`, `PASSWORD`, `TOKEN` en diff)
- [ ] Sin `VITE_` con secrets reales
- [ ] Sin `console.log` con datos de usuarios
- [ ] Todo nuevo endpoint tiene autenticación
- [ ] Toda tabla nueva tiene RLS habilitada
- [ ] Ningún query directo a Supabase en componentes (usar services/hooks)
- [ ] Rate limiting en endpoints nuevos
- [ ] Validación de inputs en Edge Functions

### Por cada Sprint:
- [ ] Ejecutar `supabase db push --dry-run` en staging antes de producción
- [ ] Verificar que `pg_tables WHERE rowsecurity = false` solo tiene tablas aprobadas
- [ ] Revisar logs de rate_limit_exceeded para patrones de abuso
- [ ] Revisar AI usage por empresa para detectar anomalías

---

## 11. PLAN DE MEJORAS DE SEGURIDAD (ROADMAP)

| Item | Fase | Prioridad |
|---|---|---|
| Content Policy Layer para IA | Fase 7 (AI Brain) | P0 — antes de agentes |
| ABAC/PBAC | Fase 6 (Policy Engine) | P1 |
| MFA (TOTP) | Fase 1 (Foundation 2.0) | P1 |
| Tenant Isolation tests automatizados | Sprint 1 | P0 |
| Security regression test suite | Sprint 1 | P0 |
| Secrets rotation automatizada | Fase 3 | P2 |
| SOC 2 Type I preparation | Fase 12 | P2 |
| Penetration testing | Pre-v2.0 | P1 |
| WAF (via Supabase/Cloudflare) | Fase 9 | P2 |
| Data residency (GDPR Europa) | Fase 15 | P2 |

---

*Revisión obligatoria: inicio de cada Fase que involucre autenticación, datos de usuario, o agentes IA.*
*Incidentes de seguridad → documentar en Risk Register del EPMO + post-mortem en docs/security/*
