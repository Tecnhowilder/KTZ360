# CONFIGURATION STRATEGY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Gestión de configuración por ambiente y por empresa

---

## 1. NIVELES DE CONFIGURACIÓN

```
NIVEL 1 — Plataforma     (Shelwi Team)       → .env.local, Supabase Secrets
NIVEL 2 — Plan/Feature   (Shelwi Team)       → plan_features table
NIVEL 3 — Workspace      (Owner/Admin)       → workspaces.settings JSONB
NIVEL 4 — Usuario        (Cada usuario)      → user_preferences (futuro)
```

---

## 2. CONFIGURACIÓN DE PLATAFORMA

### 2.1 Variables de entorno

**Frontend `.env.local` (desarrollo):**
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_ENV=development
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

**Producción:** Variables configuradas en el hosting provider (Vercel, etc.)

**Edge Functions (Supabase Secrets):**
```bash
supabase secrets set INTEGRATION_ENCRYPTION_KEY=<64-hex-chars>
supabase secrets set GEMINI_API_KEY=<key>
supabase secrets set NVIDIA_API_KEY=<key>
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=<secret>
supabase secrets set RESEND_API_KEY=<key>
supabase secrets set FCM_SERVER_KEY=<key>
```

**Ver lista completa:** `docs/20_DEVSECOPS_GUIDE.md` sección 3.2

### 2.2 Ambientes

| Ambiente | Supabase Project | URL frontend | Uso |
|---|---|---|---|
| Development | supabase local (`supabase start`) | localhost:5173 | Desarrollo diario |
| Staging | proyecto separado en Supabase | staging.shelwi.com | QA pre-release |
| Production | proyecto producción | app.shelwi.com | Clientes reales |

---

## 3. CONFIGURACIÓN DE PLAN/FEATURE

Controlada via `plan_features` table. Singleton por plan.

```sql
-- Ver features habilitadas por plan
SELECT plan_code, feature_key, enabled, metadata
FROM plan_features
WHERE plan_code = 'growth'
ORDER BY feature_key;
```

**Features clave:**
| feature_key | Descripción |
|---|---|
| `crm_access` | Acceso al módulo CRM |
| `finance_access` | Acceso a Finanzas |
| `operations_access` | Acceso a Operaciones |
| `hr_access` | Acceso a RRHH |
| `ai_studio_access` | Acceso a AI Studio |
| `reports_access` | Generación de reportes |
| `integrations_access` | Módulo de integraciones |
| `automation_access` | Automation Engine |
| `gps_access` | GPS y campo |
| `portal_access` | Portal de cliente |

**En código:**
```typescript
const { hasAccess } = useFeatureAccess('reports_access');
```

---

## 4. CONFIGURACIÓN DE WORKSPACE

Cada workspace tiene su configuración en `workspaces.settings` JSONB:

```typescript
interface WorkspaceSettings {
  // Localización
  timezone: string;        // e.g. "America/Bogota"
  currency: string;        // e.g. "COP", "MXN", "USD"
  country: string;         // e.g. "CO", "MX", "AR"
  date_format: string;     // "DD/MM/YYYY" | "MM/DD/YYYY"
  number_format: 'dot' | 'comma';  // separador decimal

  // Branding
  logo_url?: string;
  primary_color?: string;  // hex

  // Notificaciones
  notifications: {
    email: boolean;
    push: boolean;
    whatsapp: boolean;
  };

  // Negocio
  tax_name: string;        // "IVA" | "ITBIS" | "IGV"
  tax_percent: number;     // 19 | 16 | 18 | etc.
  invoice_prefix: string;  // "FV" | "INV" | etc.
  quote_prefix: string;    // "CT" | "QT" | etc.

  // AI
  ai_policy: 'observer' | 'assistant' | 'semi_autonomous' | 'autonomous';
  ai_budget_monthly_usd: number;  // Límite de gasto IA por mes
}
```

**Acceso en frontend:**
```typescript
const { workspace } = useWorkspace();
const currency = workspace.settings.currency ?? 'USD';
```

---

## 5. CAMBIOS DE CONFIGURACIÓN — PROCESO

| Tipo | Quién puede cambiar | Cómo |
|---|---|---|
| Env vars de plataforma | Shelwi Team | CLI o panel de hosting |
| Supabase Secrets | Shelwi Team | `supabase secrets set` |
| plan_features | Shelwi Team | SQL en Supabase |
| workspaces.settings | Owner/Admin | Settings > Workspace en UI |
| AI policy del workspace | Owner | Settings > AI Studio |

---

## 6. CONFIGURACIÓN POR PAÍS — LATAM

| País | Impuesto | % | Moneda | Código |
|---|---|---|---|---|
| Colombia | IVA | 19% | COP | CO |
| México | IVA | 16% | MXN | MX |
| Argentina | IVA | 21% | ARS | AR |
| Chile | IVA | 19% | CLP | CL |
| Perú | IGV | 18% | PEN | PE |
| Ecuador | IVA | 15% | USD | EC |

La configuración de impuesto se captura en el onboarding y es editable en Settings.

---

*Ver: `docs/20_DEVSECOPS_GUIDE.md` para gestión segura de secrets*
*Ver: `docs/33_FEATURE_FLAG_STRATEGY.md` para gestión de feature flags*
