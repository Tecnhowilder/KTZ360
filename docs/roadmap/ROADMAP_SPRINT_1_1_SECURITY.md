# SHELWI — SPRINT 1.1 SECURITY HOTFIXES

## AUDITORÍA PREVIA

### EXISTE ✅
- ai-proxy: JWT verify + workspace desde DB (post Sprint 1)
- mp-webhook: consulta pago en MP (no confía en webhook body)
- check_ai_credits RPC: security definer ✅ pero sin validación ownership
- PLAN_PRICES en _shared/plans.ts: hardcodeado

### PARCIAL ⚠️
- consume_ai_credits: security definer pero acepta workspace_id arbitrario
- check_ai_credits: no valida que workspace_id pertenezca al auth.uid()
- rate_limit: función existe (0039) pero no integrada en ai-proxy
- plans.ts: precios PRO correcto ($39.900) pero PREMIUM incorrecto ($69.900 vs $129.900 objetivo)

### VULNERABILIDADES ❌
- BUG-1: consume_ai_credits(any_uuid) → descuenta créditos de cualquier workspace
- BUG-2: create-checkout acepta workspaceId del body sin verificar JWT
- BUG-3: PLAN_PRICES hardcodeados + PREMIUM precio incorrecto
- BUG-4: mp-webhook no activa Founder Program
- RATE: check_ai_rate_limit no integrado en ai-proxy
- OPS: aiStudio.ts no envía `operation` → siempre 1 crédito

---

## CHECKLIST

### FASE 2 — BUG-1 (consume_ai_credits)
- [x] Migración 0040: agregar validación ownership en check_ai_credits
- [x] Migración 0040: agregar validación ownership en consume_ai_credits
- [x] Migración 0040: get_effective_plan_code sin RLS de lectura (solo lectura — aceptable)
- [x] Test workspace cruzado documentado

### FASE 3 — BUG-2 (create-checkout)
- [x] create-checkout: eliminar workspaceId del body
- [x] create-checkout: JWT → auth.uid() → profiles → workspace_id
- [x] create-checkout: validar usuario activo en DB
- [x] create-checkout: registrar auditoría

### FASE 4 — BUG-3 (precios hardcodeados)
- [x] _shared/plans.ts: eliminar PLAN_PRICES hardcodeado
- [x] _shared/plans.ts: agregar función para obtener precio desde DB
- [x] create-checkout: obtener precio desde plans table
- [x] mp-webhook: validar monto contra plans table (no hardcoded)
- [x] Soporte Founder price en external_reference

### FASE 5 — BUG-4 (Founder Program)
- [x] mp-webhook: detectar pago Founder
- [x] mp-webhook: llamar activate_founder_subscription()
- [x] mp-webhook: registrar founder_price + founder_expires_at
- [x] Soporte PRO Founder y PREMIUM Founder

### FASE 6 — RATE LIMIT
- [x] ai-proxy: integrar check_ai_rate_limit() antes de llamar Gemini
- [x] ai-proxy: HTTP 429 con mensaje claro

### FASE 7 — IA OPERATIONS
- [x] aiStudio.ts: agregar campo operation
- [x] useAI.ts: pasar operation desde contexto

### FASE 8 — PENTEST
- [x] Test workspace cruzado documentado
- [x] Test checkout workspace ajeno
- [x] Test consumo IA workspace ajeno
- [x] Test price tampering en mp-webhook

---

## CHANGELOG

### 0040_security_rpc_ownership.sql
- NUEVO: `assert_workspace_membership(uuid)` — helper Zero Trust que valida JWT → profiles → workspace
- FIX: `check_ai_credits` — ahora llama `assert_workspace_membership` antes de consultar
- FIX: `consume_ai_credits` — revocado de `authenticated`, solo `service_role`; valida membership si auth.uid() != null
- AUDIT: acceso no autorizado se registra en `audit_log` con acción `unauthorized_workspace_access`

### _shared/plans.ts (reescrito)
- ELIMINADO: `PLAN_PRICES` hardcodeado
- NUEVO: `resolvePrice(supabaseUrl, key, planCode, billingCycle, isFounder)` → consulta DB
- NUEVO: `validatePaymentAmount(...)` → valida monto contra DB (tolerancia ±1 COP)
- Soporte Founder: price desde `founder_promotions`
- isFounder tipado como boolean explícito

### create-checkout/index.ts (reescrito)
- FIX BUG-2: workspaceId ya NO viene del body — se obtiene desde JWT → profiles
- NUEVO: verifica usuario autenticado con `auth.getUser()`
- NUEVO: obtiene workspace desde DB con service_role
- NUEVO: registra intento en `audit_log` antes de crear checkout
- NUEVO: soporte `isFounder: boolean` en el body
- NUEVO: `external_reference` incluye `expectedAmount` para validación en webhook
- Precios desde DB via `resolvePrice()`

### mp-webhook/index.ts (reescrito)
- FIX BUG-3: precios validados desde DB via `validatePaymentAmount()` (no hardcoded)
- FIX BUG-4: detecta `isFounder=true` en external_reference → llama `activate_founder_subscription()`
- NUEVO: bloquea activación si monto difiere > $5.000 COP
- NUEVO: registra `price_tampering_detected` en audit_log si hay discrepancia
- NUEVO: registra `subscription_activated_founder` vs `subscription_activated`
- Mantiene idempotencia via payment_events

### ai-proxy/index.ts (actualizado)
- FASE 6: integra rate limit (100 llamadas/hora por workspace via ai_usage count)
- FASE 7: obtiene costo real de operación desde `ai_operation_costs` table
- HTTP 429 con mensaje claro si rate limit alcanzado
- `creditsNeeded` calculado por operación, no hardcodeado en 1

### aiStudio.ts (reescrito)
- FASE 7: `operation: AIOperation` ahora es parámetro OBLIGATORIO
- `AIOperation` tipo exportado con 8 operaciones definidas
- `AIResponse` tipado correctamente (text, tokens_used, credits_consumed, credits_remaining)
- Errores de negocio manejados: `AICreditsExhaustedError`, `AIPlanNotIncludedError`
- Compatible con `erasableSyntaxOnly` de TypeScript

### useAI.ts (actualizado)
- `generate(prompt, operation, opts)` — operation obligatorio
- Expone `credits` state (remaining, consumed) para el UI

### KtzIA.tsx (actualizado)
- Usa nueva firma: `generate(prompt, 'generate_description', opts)`
- `content = resp.text` (no más acceso a campos de Gemini raw)

---

## RESULTADOS PENTEST INTERNO

### TEST 1 — Workspace cruzado en check_ai_credits
ANTES: `select check_ai_credits('otro-workspace-uuid'::uuid)` → devolvía datos de otro workspace
AHORA: `assert_workspace_membership()` lanza `access_denied` + registra en audit_log ✅

### TEST 2 — Workspace cruzado en consume_ai_credits
ANTES: `select consume_ai_credits('otro-workspace-uuid'::uuid, 'recommendations')` → descuentaba créditos
AHORA: `revoke execute from authenticated` → función no callable desde cliente ✅

### TEST 3 — Checkout con workspaceId ajeno
ANTES: `POST /create-checkout {workspaceId: "otro-uuid", planCode: "pro"}` → creaba checkout para otra empresa
AHORA: workspaceId ignorado del body → se obtiene desde JWT. Request con otro UUID usa el workspace del JWT ✅

### TEST 4 — Price tampering en mp-webhook
ANTES: atacante podría modificar `transaction_amount` en MP (imposible — MP firma) pero si extrae external_reference podría reutilizarlo
AHORA: monto validado contra DB. Si Δ > $5.000 → bloqueo de activación + audit log ✅

### TEST 5 — Founder fraud (activar Founder sin pagar precio Founder)
ANTES: `external_reference` no tenía `expectedAmount` ni `isFounder` → imposible distinguir
AHORA: `external_reference` incluye `isFounder` y `expectedAmount`. El webhook valida el monto contra la promo en DB ✅

### TEST 6 — Rate limit bypass
ANTES: no había rate limit en ai-proxy
AHORA: consulta `count(ai_usage WHERE created_at > now()-1h)` → HTTP 429 si ≥ 100 ✅

### TEST 7 — JWT manipulado
Imposible falsificar JWT de Supabase sin la clave privada del proyecto. La función `auth.getUser()` valida la firma del JWT contra Supabase internamente ✅
