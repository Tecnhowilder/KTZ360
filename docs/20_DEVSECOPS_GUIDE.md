# DEVSECOPS GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Prácticas de seguridad integradas en el ciclo de desarrollo
> Stack: React 19 + Vite 8 + TypeScript + Supabase + Deno Edge Functions

---

## 1. PRINCIPIOS DEVSECOPS

1. **Shift-Left Security** — la seguridad se valida antes del merge, no en producción
2. **Zero Trust by Default** — ningún componente confía implícitamente en otro
3. **Secrets Never in Code** — las credenciales viven en `.env` local y en Supabase Secrets
4. **Immutable Audit Trail** — `audit_log` solo permite INSERT, nunca DELETE/UPDATE
5. **RLS as First Defense** — todas las tablas con datos empresariales tienen RLS habilitado

---

## 2. CHECKLIST PRE-COMMIT (obligatorio)

### 2.1 Seguridad de código
- [ ] No hay tokens, API keys o secretos hardcodeados
- [ ] No hay `console.log` con datos sensibles (PII, tokens, credentials)
- [ ] Ninguna variable `VITE_` expone información de backend interno
- [ ] SQL queries no construidas por concatenación de strings (usar RPC o parámetros)
- [ ] Inputs de usuario no se pasan directamente a queries (siempre via tipos TypeScript)

### 2.2 Multi-tenancy
- [ ] Toda nueva tabla tiene `company_id` / `workspace_id`
- [ ] Toda nueva tabla tiene RLS habilitado
- [ ] Las políticas RLS usan `current_workspace_id()` o verifican membership via `profiles`
- [ ] Ninguna query omite el filtro de `company_id`

### 2.3 Zero Trust (Edge Functions)
- [ ] `workspace_id` se obtiene de DB (via `profiles`), NUNCA del body del request
- [ ] Se verifica el JWT antes de cualquier operación
- [ ] Se verifica el rol del usuario para operaciones privilegiadas
- [ ] Errores devuelven mensaje genérico (no exponer detalles internos)

### 2.4 Plan/feature gates
- [ ] No hay checks hardcodeados `plan === 'premium'` o similares
- [ ] Toda restricción de feature usa `useFeatureAccess()` o `plan_features` table
- [ ] Los límites de uso se validan server-side (no solo en el frontend)

---

## 3. VARIABLES DE ENTORNO

### 3.1 Variables del frontend (prefijo VITE_)
Solo exponer lo estrictamente necesario para el cliente:

```
# ✅ Permitidas — son públicas por diseño
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=    # Anon key — protegida por RLS
VITE_APP_ENV=              # production | staging | development
VITE_SENTRY_DSN=           # Para error tracking en frontend

# ❌ PROHIBIDAS en variables VITE_
# - SUPABASE_SERVICE_ROLE_KEY
# - INTEGRATION_ENCRYPTION_KEY
# - API keys de terceros (Alegra, MercadoPago, etc.)
# - Secrets de HMAC o JWT
```

### 3.2 Secrets de Edge Functions (solo en Supabase)
```
SUPABASE_SERVICE_ROLE_KEY          # Auto-provisto
SUPABASE_ANON_KEY                  # Auto-provisto
INTEGRATION_ENCRYPTION_KEY         # AES-256-GCM para credenciales OAuth
MERCADOPAGO_WEBHOOK_SECRET         # HMAC para validar webhooks MP
ALEGRA_WEBHOOK_SECRET              # HMAC para validar webhooks Alegra
GEMINI_API_KEY                     # Google AI
NVIDIA_API_KEY                     # NVIDIA NIM
RESEND_API_KEY                     # Email service
FCM_SERVER_KEY                     # Firebase push notifications
```

---

## 4. CHECKLIST DE NUEVA MIGRATION

Antes de ejecutar cualquier migration nueva:

- [ ] Nombrado secuencial: `NNNN_descripcion_clara.sql`
- [ ] Sin DROP TABLE o DROP COLUMN sin respaldo previo
- [ ] Toda nueva tabla tiene: `id UUID PK`, `workspace_id/company_id FK`, `created_at TIMESTAMPTZ`, `RLS habilitado`
- [ ] Nuevas policies RLS no reutilizan nombres (pueden colisionar)
- [ ] Las funciones SECURITY DEFINER tienen `set search_path = public`
- [ ] No hay datos sensibles hardcodeados en la migration

---

## 5. CHECKLIST DE NUEVA EDGE FUNCTION

- [ ] Verifica Bearer JWT en el primer paso (`req.headers.get('Authorization')`)
- [ ] Obtiene `workspace_id` de DB, nunca del request body
- [ ] Usa `createClient` con ANON key para verificar JWT del usuario
- [ ] Usa `createClient` con SERVICE_ROLE key solo para operaciones admin
- [ ] CORS configurado: permite los orígenes correctos (no `*` en producción)
- [ ] Rate limiting implementado para operaciones costosas (IA, emails)
- [ ] Errores devuelven código HTTP correcto y mensaje sin detalles internos
- [ ] Toda operación importante se registra en `audit_log`

---

## 6. DEPENDENCIAS — POLÍTICA

### 6.1 Agregar una dependencia nueva
1. Verificar que la licencia es compatible (MIT, Apache 2.0, ISC)
2. Verificar last publish date (evitar paquetes sin mantenimiento > 2 años)
3. Verificar downloads/week (popularidad = menor riesgo supply chain)
4. Correr `npm audit` después de agregar
5. Pinear versión exacta en `package.json` si es dependencia crítica de seguridad

### 6.2 Dependencias críticas actuales

| Paquete | Versión | Notas |
|---|---|---|
| `@supabase/supabase-js` | ~2.x | Core — nunca actualizar minor sin probar |
| `@sentry/react` | 10.x | Error tracking — sensible a configuración |
| `dexie` | 4.x | Offline DB — rompe IndexedDB si migra mal |
| `@capacitor/core` | 8.x | Mobile bridge — actualizar con cuidado |

---

## 7. GESTIÓN DE SECRETOS EN DESARROLLO LOCAL

```bash
# Crear archivo .env.local (nunca commitear)
cp .env.example .env.local

# Para Edge Functions en desarrollo
supabase secrets set INTEGRATION_ENCRYPTION_KEY=<hex-64-chars>

# Verificar que .gitignore incluye
.env
.env.local
.env.*.local
```

---

## 8. RESPUESTA A INCIDENTES DE SEGURIDAD

| Severidad | Ejemplo | SLA respuesta | SLA resolución |
|---|---|---|---|
| P0 — Crítico | Credenciales expuestas, acceso no autorizado | 15 min | 4 horas |
| P1 — Alto | Vulnerabilidad en Edge Function, RLS bypass | 1 hora | 24 horas |
| P2 — Medio | Dependency vulnerability, secret en git | 4 horas | 72 horas |
| P3 — Bajo | Hardcoded plan check, console.log con datos | Próximo sprint | — |

**Contacto de seguridad:** wildercaicedo88@gmail.com (solo owner por ahora)

---

*Ver: `docs/19_SECURITY_GOVERNANCE.md` para políticas de seguridad completas*
*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para recuperación ante incidentes*
*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` Artículo VI para reglas Zero Trust*
