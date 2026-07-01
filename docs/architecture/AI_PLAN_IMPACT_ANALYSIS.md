# AI_PLAN_IMPACT_ANALYSIS.md
# Shelwi — Análisis de Impacto en Planes: IA Enterprise
Fecha: 2026-06-23

---

## 1. ESTADO ACTUAL DE PLANES vs REQUERIDO

### FREE

| Aspecto | Estado actual | Requerido Sprint 24 | Delta |
|---------|--------------|---------------------|-------|
| ai_enabled | false ✅ | false | Sin cambio |
| ai_credits_monthly | 0 ✅ | 0 | Sin cambio |
| Puede ver AI Studio | SÍ (pero bloqueado en UI) | NO — ocultar completamente | UI change |
| Puede comprar paquetes | No relevante | NO | Sin cambio |
| Forecasts IA | Bloqueados | Bloqueados | Sin cambio |

### PRO

| Aspecto | Estado actual | Requerido Sprint 24 | Delta |
|---------|--------------|---------------------|-------|
| ai_enabled | true ✅ | true | Sin cambio |
| ai_credits_monthly | 500 ✅ | 500 | Sin cambio |
| Puede comprar paquetes | No implementado | SÍ | CREAR |
| ai_forecasting_enabled | No existe | true (comercial) | CREAR flag |
| ai_advanced_enabled | No existe | false (solo básico) | CREAR flag |
| ai_agents_enabled | No existe | false | CREAR flag |
| Funciones disponibles | generate_description, improve_proposal, ai_summary, close_probability, recommendations, forecast, risk_analysis | Todo lo anterior | Sin cambio |

### PREMIUM

| Aspecto | Estado actual | Requerido Sprint 24 | Delta |
|---------|--------------|---------------------|-------|
| ai_enabled | true ✅ | true | Sin cambio |
| ai_credits_monthly | 2000 ✅ | 2000 | Sin cambio |
| Puede comprar paquetes | No implementado | SÍ | CREAR |
| ai_forecasting_enabled | No existe | true (todos los forecasts) | CREAR flag |
| ai_advanced_enabled | No existe | true | CREAR flag |
| ai_agents_enabled | No existe | false (preparado) | CREAR flag |
| Funciones disponibles | Todo aiCommercial.ts | Todo incluyendo ops, BI, finanzas | Sin cambio |

---

## 2. NUEVOS FEATURE FLAGS REQUERIDOS

### Propuesta de flags:

```sql
-- ai_advanced_enabled: IA de BI, Customer Success, Operaciones
-- FALSE en PRO, TRUE en PREMIUM
ALTER TABLE plan_features ADD COLUMN ai_advanced_enabled boolean NOT NULL DEFAULT false;
UPDATE plan_features SET ai_advanced_enabled = false WHERE plan_code IN ('free','pro');
UPDATE plan_features SET ai_advanced_enabled = true  WHERE plan_code = 'premium';

-- ai_forecasting_enabled: Forecast comercial en PRO, todos en PREMIUM
ALTER TABLE plan_features ADD COLUMN ai_forecasting_enabled boolean NOT NULL DEFAULT false;
UPDATE plan_features SET ai_forecasting_enabled = false WHERE plan_code = 'free';
UPDATE plan_features SET ai_forecasting_enabled = true  WHERE plan_code IN ('pro','premium');

-- ai_agents_enabled: Para el futuro (agentes autónomos)
ALTER TABLE plan_features ADD COLUMN ai_agents_enabled boolean NOT NULL DEFAULT false;
-- FREE, PRO, PREMIUM: false (preparado para Sprint futuro)
```

### Mapping de operaciones por plan:

| Operación | FREE | PRO | PREMIUM | Flag requerida |
|-----------|------|-----|---------|---------------|
| generate_description | ❌ | ✅ | ✅ | ai_enabled |
| improve_proposal | ❌ | ✅ | ✅ | ai_enabled |
| ai_summary | ❌ | ✅ | ✅ | ai_enabled |
| close_probability | ❌ | ✅ | ✅ | ai_enabled |
| recommendations | ❌ | ✅ | ✅ | ai_enabled |
| photo_quote | ❌ | ❌ | ✅ | photo_quote_enabled |
| forecast | ❌ | ✅ | ✅ | ai_forecasting_enabled |
| risk_analysis | ❌ | ✅ | ✅ | ai_enabled |
| forecast_finance | ❌ | ❌ | ✅ | ai_forecasting_enabled + ai_advanced_enabled |
| bi_* (4 ops) | ❌ | ❌ | ✅ | ai_advanced_enabled |
| ops_* (6 ops) | ❌ | ❌ | ✅ | ai_advanced_enabled |

---

## 3. NUEVOS LÍMITES EN plan_limits

```sql
ALTER TABLE plan_limits
  ADD COLUMN ai_max_requests_day int,    -- null = sin límite
  ADD COLUMN ai_max_agents        int NOT NULL DEFAULT 0;

UPDATE plan_limits SET ai_max_requests_day = 0,    ai_max_agents = 0 WHERE plan_code = 'free';
UPDATE plan_limits SET ai_max_requests_day = 50,   ai_max_agents = 0 WHERE plan_code = 'pro';
UPDATE plan_limits SET ai_max_requests_day = null, ai_max_agents = 0 WHERE plan_code = 'premium';
-- ai_max_agents = 0 para todos hasta que se implementen agentes
```

---

## 4. PAQUETES IA — CATÁLOGO

### Tabla `ai_credit_packs`:

| pack_key | credits | price_cop | price_label |
|----------|---------|-----------|-------------|
| pack_100 | 100 | 9900 | $9.900 |
| pack_500 | 500 | 39900 | $39.900 |
| pack_1000 | 1000 | 69900 | $69.900 |
| pack_5000 | 5000 | 249900 | $249.900 |

### Flujo de compra (integra con MercadoPago existente):
1. Usuario selecciona paquete → `create-checkout` (extender para paquetes IA)
2. Pago aprobado → `mp-webhook` → `activate_ai_credit_pack(workspace_id, pack_id, payment_id)`
3. `activate_ai_credit_pack` → INSERT en `ai_credit_purchases` + UPDATE `ai_usage` (agregar créditos extras)
4. `check_ai_credits` debe leer: créditos del plan + créditos adicionales comprados

### Cambio crítico en `check_ai_credits`:
Actualmente solo lee `plan_limits.ai_credits_monthly` como máximo fijo.
Con paquetes: máximo = plan_credits + sum(purchased_credits no expirados).

---

## 5. IMPACTO EN check_ai_credits Y consume_ai_credits

### check_ai_credits — CAMBIO NECESARIO:
```sql
-- Actual: solo compara con plan_limits.ai_credits_monthly
-- Nuevo: compara con plan_credits + créditos adicionales activos

-- Nuevo cálculo de v_credits_max:
v_credits_max := (SELECT ai_credits_monthly FROM plan_limits WHERE plan_code = v_plan_code)
              + (SELECT COALESCE(SUM(credits_remaining), 0) 
                 FROM ai_credit_purchases 
                 WHERE workspace_id = p_workspace_id 
                   AND expires_at > now() 
                   AND credits_remaining > 0);
```

### consume_ai_credits — CAMBIO NECESARIO:
Descontar primero de créditos adicionales (FIFO por expiración), luego del plan.

---

## 6. MULTI-PROVIDER PREPAREDNESS

### Estado actual: 100% Gemini

El `ai-proxy` Edge Function tiene hardcoded:
```typescript
// Solo Gemini via GEMINI_API_KEY
```

### Propuesta de abstracción (sin romper):
Añadir columna `provider` como campo seleccionable en `ai_operation_costs`:
```sql
ALTER TABLE ai_operation_costs ADD COLUMN provider text NOT NULL DEFAULT 'gemini';
-- 'gemini' | 'openai' | 'anthropic'
```

El `ai-proxy` lee el provider de la operación y usa el modelo correspondiente.
Las claves `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` se añaden como Supabase Secrets cuando se activen.

### SIN ACCIÓN INMEDIATA en Sprint 24:
El multi-provider es una preparación arquitectural. Implementar en Sprint 25+.

---

## 7. CRONOGRAMA DE IMPLEMENTACIÓN SPRINT 24

### Migración 0097 — Schema IA Enterprise:
- `ai_credit_packs` tabla
- `ai_credit_purchases` tabla
- `ai_usage.execution_time_ms` y `ai_usage.model` columnas
- `plan_features.ai_advanced_enabled`, `ai_forecasting_enabled`, `ai_agents_enabled`
- `plan_limits.ai_max_requests_day`, `ai_max_agents`
- `ai_operation_costs.provider` columna

### Migración 0098 — RPCs IA Enterprise:
- `check_ai_credits()` actualizada para incluir paquetes
- `consume_ai_credits()` actualizada con FIFO de paquetes
- `activate_ai_credit_pack(workspace_id, pack_id, payment_id)`
- `get_ai_credit_packs()` — catálogo público
- `get_ai_credit_purchases(workspace_id)` — historial
- `get_ai_admin_dashboard()` — para Admin IA
- `check_ai_operation_permission(workspace_id, operation)` — valida plan + créditos + flag

### Frontend:
- `AIStudioV2Page.tsx` — `/app/ia` rediseñado con tabs
- `AICreditPacksPage.tsx` — `/app/ia/creditos`
- `IAAdminTab.tsx` — extensión con métricas de monetización
- Actualizar `ai-proxy` para registrar `execution_time_ms` y `model`
