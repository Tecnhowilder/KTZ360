# FEATURE FLAG STRATEGY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Gestión de feature flags para control de acceso por plan y rollout progresivo
> Implementación: `plan_features` table + `useFeatureAccess()` hook

---

## 1. TIPOS DE FEATURE FLAGS

### 1.1 Plan-based flags (principal)
Controlan qué features están disponibles por plan. Son los más usados en Shelwi.

```
plan_code  |  feature_key      |  enabled  |  metadata
-----------+-------------------+-----------+------------------
free       |  crm_access       |  true     |  {}
free       |  reports_access   |  false    |  {}
start      |  crm_access       |  true     |  {}
start      |  reports_access   |  false    |  {}
growth     |  reports_access   |  true     |  {}
growth     |  ai_studio_access |  true     |  {}
```

### 1.2 Limit-based flags (en metadata)
Complementan los plan flags con límites numéricos:

```json
// plan_features.metadata para 'automation_access'
{
  "max_automations": 20,
  "max_actions_per_automation": 5,
  "max_executions_per_month": 5000
}
```

### 1.3 Beta flags (via metadata) — Planificado
Para activar features en beta para un subconjunto de empresas:

```json
// plan_features.metadata
{
  "beta": true,
  "beta_workspace_ids": ["uuid1", "uuid2"]
}
```

---

## 2. IMPLEMENTACIÓN

### 2.1 Backend: plan_features table

```sql
CREATE TABLE plan_features (
  id         UUID PRIMARY KEY,
  plan_code  TEXT REFERENCES plans(code),
  feature_key TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  metadata   JSONB NOT NULL DEFAULT '{}',
  UNIQUE(plan_code, feature_key)
);
```

### 2.2 Frontend: hook useFeatureAccess

```typescript
// src/hooks/useFeatureAccess.ts
export function useFeatureAccess(featureKey: string) {
  const { planFeatures } = usePlanFeatures();

  const feature = planFeatures.find(f => f.feature_key === featureKey);
  const hasAccess = feature?.enabled ?? false;
  const metadata = feature?.metadata ?? {};

  return { hasAccess, metadata };
}

// Uso en componente
function AIStudioButton() {
  const { hasAccess } = useFeatureAccess('ai_studio_access');

  if (!hasAccess) {
    return <UpgradePrompt feature="AI Studio" requiredPlan="growth" />;
  }

  return <Button>Abrir AI Studio</Button>;
}
```

### 2.3 Frontend: hook useFeatureFlags (para límites)

```typescript
// Para verificar límites numéricos
const { metadata } = useFeatureAccess('automation_access');
const maxAutomations = metadata.max_automations ?? 5;

if (currentAutomations >= maxAutomations) {
  return <LimitReachedPrompt feature="automatizaciones" current={currentAutomations} max={maxAutomations} />;
}
```

### 2.4 Server-side: validación en Edge Functions

```typescript
// En Edge Functions que ejecutan acciones costosas
const { data: feature } = await admin
  .from('plan_features')
  .select('enabled, metadata')
  .eq('plan_code', workspace.plan_code)
  .eq('feature_key', 'ai_studio_access')
  .single();

if (!feature?.enabled) {
  return new Response(JSON.stringify({ error: 'plan_upgrade_required' }), { status: 403 });
}
```

---

## 3. CATÁLOGO COMPLETO DE FEATURE FLAGS

| feature_key | Free | Start | Growth | Business OS | Enterprise OS |
|---|---|---|---|---|---|
| `crm_access` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `finance_access` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `operations_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `hr_access` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `gps_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `reports_access` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `integrations_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `automation_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `ai_studio_access` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `portal_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `catalog_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `loyalty_access` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `advanced_reports` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `custom_roles` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `agent_autonomous` | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 4. GESTIÓN DE FLAGS — PROCESO

### Agregar un nuevo feature flag

```sql
-- 1. Insertar en todos los planes (deshabilitado por defecto)
INSERT INTO plan_features (plan_code, feature_key, enabled) VALUES
  ('free',        'nueva_feature', false),
  ('start',       'nueva_feature', false),
  ('growth',      'nueva_feature', false),
  ('business_os', 'nueva_feature', true),
  ('enterprise_os','nueva_feature', true);
```

### Habilitar para un plan específico

```sql
UPDATE plan_features
SET enabled = true
WHERE plan_code = 'growth' AND feature_key = 'nueva_feature';
```

### Habilitar para una empresa específica (beta)

```sql
UPDATE plan_features
SET metadata = jsonb_set(metadata, '{beta_workspace_ids}', '["uuid-empresa"]')
WHERE feature_key = 'nueva_feature';
```

---

## 5. REGLAS ABSOLUTAS

1. **NUNCA** verificar el plan con `if (plan === 'premium')` — siempre via `useFeatureAccess()`
2. Los feature flags se validan **tanto en frontend como en backend** (defense in depth)
3. Un flag deshabilitado en UI **siempre** muestra el prompt de upgrade con el plan mínimo requerido
4. Los cambios de flags en `plan_features` requieren PR + revisión (afectan a todos los clientes del plan)

---

*Ver: `docs/12_PERMISSION_MATRIX.md` para la matriz completa de RBAC*
*Ver: `docs/32_CONFIGURATION_STRATEGY.md` para configuración general*
*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` Artículo IV — prohibición de hardcodeo de plan*
