# SHELWI — ROADMAP SPRINT 1 (Backend Only)

## AUDITORÍA — ESTADO PREVIO

### EXISTE ✅
- `plans` (FREE/PRO/PREMIUM con precios incorrectos)
- `subscriptions` con estados completos
- `plan_features` con 8 columnas (falta pipeline, orders, gps, ai_credits, founder)
- `plan_limits` con columnas básicas (valores incorrectos)
- `subscription_usage` (tracking cotizaciones)
- `ai_usage` (tokens/costo — sin créditos descontados)
- `notifications` con RLS
- Edge functions: ai-proxy, create-checkout, mp-webhook, send-email
- RLS en todas las tablas core
- RPCs: get_effective_plan_code, check_feature_access, check_plan_limit, enforce_quote_limit

### PARCIAL ⚠️
- `ai_credits_monthly` columna existe en plan_limits pero valores incorrectos (PRO=0, PREMIUM=100)
- `ai-proxy` edge function funciona pero sin control de créditos ni bloqueo
- Roles: owner/admin/employee (faltan Supervisor/Comercial/Operario)
- `ai_enabled` en PRO = false (debería ser true con créditos)

### FALTA ❌
- `founder_promotions` tabla
- `founder_expires_at` en subscriptions
- `pipeline_enabled` en plan_features
- `orders_enabled` en plan_features
- `work_orders_enabled` en plan_features
- `gps_enabled` en plan_features
- `ai_credits_enabled` en plan_features
- `max_catalog_items` en plan_limits
- `max_storage_gb` en plan_limits
- Control de créditos IA en ai-proxy
- RPC `check_ai_credits` + `consume_ai_credits`
- Precios correctos: PRO=$39.900, PREMIUM=$129.900
- Límites correctos: FREE=50 cots/50 clientes/100 items

---

## CHECKLIST DE IMPLEMENTACIÓN

### SQL Migrations

- [x] 0035_plans_v2.sql — Precios + límites + features correctas ✅
- [x] 0036_founder_program.sql — Tabla founder_promotions + founder_expires_at ✅
- [x] 0037_feature_flags_v2.sql — Nuevas columnas plan_features ✅
- [x] 0038_ai_credits_system.sql — RPCs créditos IA + enforce en ai-proxy ✅
- [x] 0039_security_audit.sql — RLS audit + rate limiting IA ✅

### Edge Functions

- [x] ai-proxy — Control de créditos + JWT verify + Zero Trust ✅

### Seguridad

- [x] Auditar RLS en todas las tablas ✅
- [x] Verificar bypass de planes ✅
- [x] RPCs con security definer ✅
- [x] Rate limiting IA (100 calls/hora) ✅

---

## AUDITORÍA ADICIONAL — HALLAZGOS (PRE-PRODUCCIÓN)

### CRÍTICOS — Bloquean producción

- [ ] BUG-1: `consume_ai_credits` permite consumir créditos de cualquier workspace (falta validación ownership)
- [ ] BUG-2: `create-checkout` acepta workspaceId sin verificar JWT del usuario
- [ ] BUG-3: `mp-webhook` usa PLAN_PRICES con precio PREMIUM=$69.900 (debe ser $129.900)
- [ ] BUG-4: `mp-webhook` no activa Founder Program al detectar pago founder

### ALTOS — No bloquean producción inicial

- [ ] BUG-5: Rate limit declarado en 0039 pero nunca llamado en ai-proxy
- [ ] BUG-6: No hay expiración automática del precio Founder al mes 13
- [ ] BUG-7: Downgrade desde plan Founder sin regla de protección

### MEDIOS

- [ ] BUG-8: `check_ai_credits` devuelve datos de cualquier workspace (lectura)
- [ ] BUG-9: `aiStudio.ts` no envía `operation` → siempre cobra 1 crédito (defecto correcto pero sin granularidad)

### BAJOS

- [ ] BUG-10: Nombre `max_storage_gb` vs `storage_quota_gb` (inconsistencia con brief)

---

## PRÓXIMAS MIGRACIONES REQUERIDAS

- [ ] 0040_security_fixes.sql — Corregir BUG-1, BUG-2 y BUG-8
- [ ] 0041_founder_webhook.sql — Lógica Founder en mp-webhook y plans.ts
- [ ] 0042_founder_expiration.sql — Job/trigger de expiración Founder

---

## CHANGELOG

### 0035_plans_v2.sql
- FREE: 50 cotizaciones/mes, 50 clientes, 100 items catálogo
- PRO: $39.900, 1000 cots/mes, 2000 clientes, 2000 items, ai_enabled=true
- PREMIUM: $129.900, ilimitado, 2000 créditos IA, 5 GB storage

### 0036_founder_program.sql
- Tabla founder_promotions (plan, price, discount_price, expires_at, active)
- Columna founder_expires_at en subscriptions
- Columna is_founder en subscriptions
- Seed: PRO Founder $29.900 x 12m → $39.900; PREMIUM Founder $89.900 x 12m → $129.900

### 0037_feature_flags_v2.sql
- pipeline_enabled: FREE=false, PRO=true, PREMIUM=true
- orders_enabled: FREE=false, PRO=false, PREMIUM=true
- work_orders_enabled: FREE=false, PRO=false, PREMIUM=true
- gps_enabled: FREE=false, PRO=false, PREMIUM=true
- ai_credits_enabled: FREE=false, PRO=true, PREMIUM=true
- founder_eligible: FREE=false, PRO=true, PREMIUM=true

### 0038_ai_credits_system.sql
- RPC check_ai_credits(workspace_id, cost) → boolean
- RPC consume_ai_credits(workspace_id, cost, feature) → void
- Trigger de validación en ai_usage

### ai-proxy (edge function)
- Leer plan del workspace desde DB
- Verificar créditos disponibles
- Bloquear si sin créditos
- Registrar consumo post-llamada
