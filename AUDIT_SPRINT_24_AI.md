# AUDIT_SPRINT_24_AI.md
# Shelwi — Auditoría Plataforma IA Enterprise
Fecha: 2026-06-23 | Sprints auditados: 2, 5, 9, 13, 15, 18, 19, IA Ops

---

## 1. INVENTARIO COMPLETO — LO QUE YA EXISTE

### 1.1 Tablas IA

| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `ai_usage` | workspace_id, user_id, feature, provider, tokens_used, estimated_cost, credits_used, period_month, created_at | ✅ EXISTE (Sprint 2) |
| `ai_operation_costs` | operation (PK), credits_cost, description, active | ✅ EXISTE (Sprint 2) |
| `ai_credits_ledger` | workspace_id, credits_delta, reason, created_at | ✅ EXISTE (Sprint 2) |
| `v_ai_credits_summary` | VIEW — créditos disponibles por workspace | ✅ EXISTE (Sprint 2) |
| `ai_credit_packs` | ❌ NO EXISTE |
| `ai_credit_purchases` | ❌ NO EXISTE |

**Columnas FALTANTES en `ai_usage`:**
- `execution_time_ms` — tiempo de respuesta del proveedor
- `model` — modelo específico usado (gemini-1.5-flash, etc.)
- `user_id` ✅ YA EXISTE en la definición original

### 1.2 RPCs IA

| RPC | Sprint | Estado |
|-----|--------|--------|
| `check_ai_credits(workspace_id, credits_needed)` | 2 | ✅ EXISTE |
| `consume_ai_credits(workspace_id, operation, tokens, cost)` | 2 | ✅ EXISTE |
| `get_ai_credits_summary(workspace_id)` | 2 | ✅ EXISTE |
| `get_ai_usage_history(workspace_id, days)` | 2 | ✅ EXISTE |
| `check_ai_rate_limit()` | — | ❌ NO EXISTE |
| `get_ai_admin_dashboard()` | — | ❌ NO EXISTE (solo admin_get_ai_usage_global) |
| `purchase_ai_credits(workspace_id, pack_id)` | — | ❌ NO EXISTE |

### 1.3 plan_features — Feature Flags IA

| Columna | FREE | PRO | PREMIUM | Estado |
|---------|------|-----|---------|--------|
| `ai_enabled` | false | true | true | ✅ EXISTE |
| `photo_quote_enabled` | false | false | true | ✅ EXISTE |
| `ai_credits_enabled` | false | true | true | ✅ EXISTE (Sprint 8) |
| `advanced_reports_enabled` | false | true | true | ✅ EXISTE |
| `ai_advanced_enabled` | — | — | — | ❌ NO EXISTE |
| `ai_forecasting_enabled` | — | — | — | ❌ NO EXISTE |
| `ai_agents_enabled` | — | — | — | ❌ NO EXISTE |

### 1.4 plan_limits — Límites IA

| Columna | FREE | PRO | PREMIUM | Estado |
|---------|------|-----|---------|--------|
| `ai_credits_monthly` | 0 | 500 | 2000 | ✅ EXISTE (Sprint 2/Sprint 16.2) |
| `max_automations` | 0 | 5 | ilimitado | ✅ EXISTE (Sprint 13) |
| `automation_ai_credits_pct` | 0 | 20% | 30% | ✅ EXISTE (Sprint 13) |
| `ai_max_requests_day` | — | — | — | ❌ NO EXISTE |
| `ai_max_agents` | — | — | — | ❌ NO EXISTE |

### 1.5 Edge Functions IA

| Función | Estado | Descripción |
|---------|--------|-------------|
| `ai-proxy` | ✅ EXISTE | Intermediario Gemini. check_ai_credits + consume_ai_credits. Rate limit interno. |
| Motor de agentes IA | ❌ NO EXISTE | |

### 1.6 Servicios Frontend IA

| Archivo | Estado | Cobertura |
|---------|--------|-----------|
| `src/services/aiCommercial.ts` | ✅ EXISTE | 14 funciones: comercial (9) + finanzas (1) + BI (4) + ops (6) |
| `src/services/aiStudio.ts` | ✅ EXISTE | `callAistudio()` + types. 21 operaciones en `AIOperation` |
| `src/services/aiCredits.ts` | ✅ EXISTE | `getAICreditsSnapshot`, `getAIUsageHistory`, labels |
| `src/hooks/useAI.ts` | ✅ EXISTE | `useAI()` → `callAistudio` con invalidación de créditos |
| `src/hooks/useAICredits.ts` | ✅ EXISTE | `useAICredits()`, `useInvalidateAICredits()` |
| Compra de paquetes | ❌ NO EXISTE | |

### 1.7 Vistas AI Studio

| Vista | Ruta | Estado |
|-------|------|--------|
| AI Studio Mobile (Copiloto) | `/app/ia` → `ShelwiIAMobile` | ✅ EXISTE |
| AI Studio Desktop | `/app/ia` → `KtzIADesktop` | ✅ EXISTE |
| IA Operativa | `/app/ia/operaciones` | ✅ EXISTE (Sprint IA Ops) |
| AI Studio V2 consolidado | — | ❌ NO EXISTE |
| Dashboard de créditos IA | En `ShelwiIAMobile` via `useAICredits` | ✅ PARCIAL |

### 1.8 Admin IA

| Componente | Estado |
|-----------|--------|
| `IAAdminTab.tsx` | ✅ EXISTE — muestra costos por operación + uso global |
| `admin_get_ai_usage_global()` | ✅ EXISTE (Sprint 9) |
| Créditos vendidos vs consumidos | ❌ NO EXISTE |
| Margen IA | ❌ NO EXISTE |
| Dashboard unificado admin IA | ⚡ PARCIAL |

### 1.9 Operaciones IA Registradas en ai_operation_costs

Las siguientes operaciones YA ESTÁN en DB (0038 + 0087 + 0088 + 0096):
- generate_description (1 cr), improve_proposal (2), ai_summary (2)
- close_probability (3), recommendations (3), photo_quote (5), forecast (3), risk_analysis (3)
- forecast_finance (3), bi_executive_summary (3), bi_business_forecast (3), bi_risk_assessment (3), bi_growth_recs (3)
- ops_risk_detection (3), ops_delay_analysis (3), ops_productivity_analysis (3), ops_cost_analysis (3), ops_project_risk (3), ops_recommendations (3)

**Total: 20 operaciones activas.**

---

## 2. LO QUE FALTA CREAR

### Gap 1 — `ai_credit_packs` y `ai_credit_purchases` (Sprint 24 solicita)
Catálogo de paquetes con precios y compras por workspace.

### Gap 2 — Feature flags `ai_advanced_enabled`, `ai_forecasting_enabled`, `ai_agents_enabled`
Solo `ai_enabled` y `ai_credits_enabled` existen. No hay separación por nivel.

### Gap 3 — `plan_limits.ai_max_requests_day` y `ai_max_agents`
No existen límites diarios por operación ni límite de agentes.

### Gap 4 — `ai_usage.execution_time_ms` y `ai_usage.model`
Las columnas de tiempo de respuesta y modelo específico no existen.

### Gap 5 — AI Studio V2 unificado
Las secciones (Comercial, Operaciones, Finanzas, etc.) están dispersas. No hay una vista unificada.

### Gap 6 — Dashboard Admin IA ampliado
Solo existe `IAAdminTab` con costos y uso global. Falta: créditos vendidos vs consumidos, margen, análisis por proveedor.

### Gap 7 — Multi-provider preparedness
`ai-proxy` solo usa Gemini hardcoded. No hay abstracción de proveedor.

### Gap 8 — Compra de paquetes de créditos
No hay flujo de compra de paquetes adicionales. Ni UI ni backend.

---

## 3. MODELO DE DATOS ACTUAL vs REQUERIDO (Sprint 24)

| Requisito Sprint 24 | Estado actual | Acción |
|--------------------|--------------|--------|
| FREE: 0 créditos, sin IA | ✅ plan_limits.ai_credits_monthly = 0 | VERIFICAR que ai_enabled=false |
| PRO: 500 créditos/mes | ✅ ai_credits_monthly = 500 | OK |
| PREMIUM: 2.000 créditos/mes | ✅ ai_credits_monthly = 2000 | OK |
| Paquetes adicionales | ❌ No existen | CREAR |
| ai_advanced_enabled flag | ❌ No existe | CREAR |
| ai_forecasting_enabled flag | ❌ No existe | CREAR |
| ai_agents_enabled flag | ❌ No existe | CREAR |
| ai_max_requests_day | ❌ No existe | CREAR |
| execution_time_ms en ai_usage | ❌ No existe | CREAR |
| model en ai_usage | ❌ No existe | CREAR |
| Multi-provider abstraction | ❌ Solo Gemini | PREPARAR |
| AI Studio V2 consolidado | ❌ Disperso | CREAR |
| Admin IA Dashboard | ⚡ Parcial | EXTENDER |
| Compra de créditos | ❌ No existe | CREAR |

---

## 4. LO QUE NO SE TOCA (sin duplicar)

- `check_ai_credits()` → NO recrear, reutilizar
- `consume_ai_credits()` → NO recrear, extender solo si necesario
- `get_ai_credits_summary()` → NO recrear
- `ai-proxy` Edge Function → extender con multi-provider, NO reescribir
- `aiCommercial.ts` → NO recrear, añadir secciones missing
- `IAAdminTab.tsx` → EXTENDER, NO reemplazar
- `ShelwiIAMobile.tsx` → EXTENDER tabs, NO reemplazar
- `ai_operation_costs` → AÑADIR operaciones, NO limpiar

---

## 5. RIESGOS IDENTIFICADOS

| Riesgo | Nivel | Descripción |
|--------|-------|-------------|
| FREE con IA expuesta | 🔴 CRÍTICO | Si `ai_enabled=false` no está validado en todos los paths, FREE podría ejecutar IA |
| Sin rate limit diario | 🟠 ALTO | Un workspace PRO podría consumir 500 créditos en un request con automatizaciones |
| Costo IA no controlado si compran paquetes | 🟠 ALTO | Sin `purchase_ai_credits` validado en backend, posible fraude |
| `ai_usage` sin model/execution_time | 🟡 MEDIO | No hay observabilidad del proveedor real usado |
| Multi-provider hardcoded en Gemini | 🟡 MEDIO | Si Gemini tiene outage, toda la plataforma IA cae |
