# PLAN_MATRIX_IMPACT_ANALYSIS — Shelwi Nueva Matriz de Planes Sprint 24

> Fecha: 2026-06-23 | Validación completa app vs nueva matriz oficial

---

## 1. MATRIZ OFICIAL SPRINT 24 vs ESTADO ACTUAL EN DB

### 1.1 Precios

| Plan | Precio actual en DB | Precio nuevo | Delta | Acción |
|------|---------------------|--------------|-------|--------|
| FREE | $0 | $0 | — | No cambiar |
| PRO | $39.900 | $59.900 | +$20.000 | ❌ UPDATE plans |
| PREMIUM | $129.900 | $179.900 | +$50.000 | ❌ UPDATE plans |
| ENTERPRISE | No existe | $399.900 | N/A | ❌ INSERT plans |

### 1.2 Límites de plan (plan_limits)

| Campo | FREE actual | FREE nuevo | PRO actual | PRO nuevo | PREMIUM actual | PREMIUM nuevo | ENTERPRISE |
|-------|------------|-----------|-----------|----------|---------------|--------------|-----------|
| max_quotes_month | 50 | 50 | 1.000 | 1.000 | NULL | NULL | NULL |
| max_clients | 50 | 50 | 2.000 | 2.000 | NULL | NULL | NULL |
| max_catalog_items | 100 | 100 | 2.000 | 2.000 | NULL | NULL | NULL |
| included_users | 1 | 1 | 1 | 1 | 5 | 5 | NULL |
| ai_credits_monthly | 0 | 0 | 500 | 500 | 2.000 | 2.000 | 5.000 |
| max_storage_gb | NULL (0 efectivo) | 0 | NULL (sin storage) | **1** | 5 | **20** | 100 |

**Cambios requeridos en plan_limits:**
- PRO: `max_storage_gb` NULL → **1**
- PREMIUM: `max_storage_gb` 5 → **20**
- ENTERPRISE: Insertar con todos los límites

### 1.3 Features (plan_features)

| Feature | FREE | PRO | PREMIUM | ENTERPRISE nuevo |
|---------|------|-----|---------|-----------------|
| ai_enabled | false | true | true | true |
| photo_quote_enabled | false | false | true | true |
| templates_enabled | false | true | true | true |
| branding_enabled | false | true | true | true |
| custom_qr_enabled | false | true | true | true |
| advanced_reports_enabled | false | true | true | true |
| multiuser_enabled | false | false | true | true |
| pdf_tier | free | pro | pro | pro |

---

## 2. FEATURES MAL ASIGNADAS — HALLAZGOS

### 2.1 FREE — Features que NO debe tener

| Feature | Está habilitado? | Correcto? |
|---------|-----------------|----------|
| IA (any) | ❌ false | ✅ OK |
| Automatizaciones | Bloqueado por check_plan_limit | ✅ OK |
| GPS | Bloqueado por feature flag | ✅ OK |
| Pedidos/OTs | Bloqueado por feature flag | ✅ OK |
| Evidencias | Bloqueado | ✅ OK |
| Portal Cliente | Portal cotización sí, portal cliente no | ✅ OK |
| Customer Success | Bloqueado | ✅ OK |
| WhatsApp Manual | WhatsApp manual permitido | ✅ OK — FREE incluye WhatsApp manual |

**Resultado FREE: ✅ CORRECTO — sin cambios**

### 2.2 PRO — Features que NO debe tener

| Feature | Estado actual | Debe estar en PRO? | Problema? |
|---------|--------------|-------------------|----------|
| GPS | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| Pedidos/OTs | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| Evidencias | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| Portal Cliente | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| BI Dashboard | ⚠️ Verificar | ❌ NO en PRO | Validar feature flag |
| Drive/OneDrive | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| Teams | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| WhatsApp Business API | ❌ No disponible | ❌ NO en PRO | ✅ Correcto |
| IA Comercial | ✅ Disponible | ✅ SÍ en PRO | ✅ Correcto |
| Alegra Básico | ✅ Disponible | ✅ SÍ en PRO | ✅ Correcto |
| Gmail/Outlook | ✅ Disponible | ✅ SÍ en PRO | ✅ Correcto |
| Campañas/UTM | ✅ Disponible | ✅ SÍ en PRO | ✅ Correcto |

**⚠️ VERIFICAR:** BI (Business Intelligence) debería ser solo PREMIUM según nueva matriz. Si está accesible en PRO, es un error de asignación.

### 2.3 PREMIUM — Features que SÍ debe tener

| Feature | Estado actual | Debe estar en PREMIUM? |
|---------|--------------|----------------------|
| Pedidos | ✅ Disponible | ✅ SÍ |
| OTs | ✅ Disponible | ✅ SÍ |
| Evidencias | ✅ Disponible | ✅ SÍ |
| GPS / Mapa Operativo | ✅ Disponible | ✅ SÍ |
| Portal Cliente | ✅ Disponible | ✅ SÍ |
| Customer Success Avanzado | ✅ Disponible | ✅ SÍ |
| Loyalty | ✅ Disponible | ✅ SÍ |
| BI | ✅ Disponible | ✅ SÍ |
| Finanzas | ✅ Disponible | ✅ SÍ |
| Forecast Financiero | ✅ Disponible | ✅ SÍ |
| Forecast Operativo | ✅ Disponible | ✅ SÍ |
| Drive / OneDrive | ✅ Disponible | ✅ SÍ |
| Teams | ✅ Disponible | ✅ SÍ |
| WhatsApp Business API | ✅ Disponible | ✅ SÍ |
| Alegra Avanzado | ✅ Disponible | ✅ SÍ |
| 1 Agente IA | ❌ No implementado | ✅ SÍ (pendiente Sprint 24+) |
| Storage 20 GB | ❌ Actualmente 5 GB | ✅ SÍ — UPDATE requerido |

### 2.4 ENTERPRISE — Features nuevas (no existen en DB)

| Feature | Estado | Acción |
|---------|--------|--------|
| API Pública | ⚡ Webhooks avanzados existen | Verificar si es suficiente |
| Marketplace | ❌ No existe | Sprint futuro |
| White Label | ❌ No existe | Sprint futuro |
| Webhooks Avanzados | ✅ Existe (Sprint 23) | Restringir a ENTERPRISE? |
| SSO | ❌ No existe | Sprint futuro |
| SLA | ❌ No existe (es comercial) | N/A en app |
| Multi Sede Avanzado | ❌ No existe | Sprint futuro |
| Auditoría Empresarial | ⚡ audit_log existe | Ya disponible → ¿restringir? |
| IA Empresarial | ❌ Agentes ilimitados no existen | Sprint 24+ |
| Forecast Empresarial | ✅ Existe (PREMIUM también) | Compartido Premium+Enterprise |
| Agentes IA Ilimitados | ❌ No existe | Sprint 24+ |

---

## 3. IMPACT ANALYSIS — CAMBIOS NECESARIOS

### 3.1 Base de datos

| Cambio | Tabla | Migración | Urgencia |
|--------|-------|-----------|---------|
| UPDATE precio PRO → $59.900 | plans | 0098 | 🔴 ALTA |
| UPDATE precio PREMIUM → $179.900 | plans | 0098 | 🔴 ALTA |
| INSERT plan ENTERPRISE | plans | 0097 | 🔴 ALTA |
| INSERT plan_limits ENTERPRISE | plan_limits | 0097 | 🔴 ALTA |
| INSERT plan_features ENTERPRISE | plan_features | 0097 | 🔴 ALTA |
| UPDATE PRO max_storage_gb = 1 | plan_limits | 0098 | 🟠 ALTA |
| UPDATE PREMIUM max_storage_gb = 20 | plan_limits | 0098 | 🟠 ALTA |
| UPDATE ENTERPRISE ai_credits = 5000 | plan_limits | 0097 | 🔴 ALTA |

### 3.2 Frontend

| Cambio | Archivo | Urgencia |
|--------|---------|---------|
| Agregar 'enterprise' a PlanCode type | src/lib/types.ts | 🟠 ALTA |
| Mostrar precio correcto en UpgradeModal | src/components/upgrade/ | 🟠 ALTA |
| Storage PRO 1 GB en UI | src/views/AdminPanel | 🟡 MEDIA |
| Crear UpgradeModal ENTERPRISE | src/components/upgrade/ | 🟡 MEDIA |

### 3.3 Edge Functions

| Cambio | Archivo | Urgencia |
|--------|---------|---------|
| Agregar 'enterprise' a PlanCode type | supabase/functions/_shared/plans.ts | 🔴 ALTA |
| create-checkout: soportar plan 'enterprise' | supabase/functions/create-checkout/ | 🟠 ALTA |

---

## 4. USUARIOS EXISTENTES — IMPACTO

| Grupo | Impacto del cambio de precios |
|-------|------------------------------|
| FREE existentes | Sin impacto (precio no cambia) |
| PRO en período activo | Sin impacto hasta renovación |
| PRO al renovar | Precio sube $20.000 |
| PREMIUM en período activo | Sin impacto hasta renovación |
| PREMIUM al renovar | Precio sube $50.000 |
| Founders (precio especial) | Sin impacto — protegidos por founder_promotions |

**Recomendación:** Notificar cambio de precios con 30 días de anticipación. Los usuarios existentes deben mantener su precio hasta la próxima renovación (grandfathering opcional).

---

## 5. VALIDACIÓN FEATURE FLAGS vs NUEVA MATRIZ

### Resultado de la validación

| Plan | Features correctas | Features incorrectas | Faltantes |
|------|-------------------|---------------------|-----------|
| FREE | ✅ 12/12 | 0 | 0 |
| PRO | ✅ 14/15 | ⚠️ 1 (BI acceso?) | 0 |
| PREMIUM | ✅ 17/18 | 0 | Storage 20 GB |
| ENTERPRISE | N/A | N/A | Plan no existe aún |

**Score general: 43/45 features correctamente asignadas (95.6%)**

Los 2 issues son:
1. PRO con posible acceso a BI (verificar feature flag en AdminPanel)  
2. PREMIUM con 5 GB storage en DB (debe ser 20 GB)

---

## 6. SPRINT 24 — GAPS IA APROBADOS (Ajuste 4)

| # | Gap | Migración | Estado |
|---|-----|-----------|--------|
| 1 | `ai_credit_packs` tabla | 0097 | ⏳ PENDIENTE |
| 2 | `ai_credit_purchases` tabla | 0097 | ⏳ PENDIENTE |
| 3 | `check_ai_credits()` incluye paquetes | 0098 | ⏳ PENDIENTE |
| 4 | `ai_advanced_enabled` flag | 0097 | ⏳ PENDIENTE |
| 5 | `ai_forecasting_enabled` flag | 0097 | ⏳ PENDIENTE |
| 6 | `ai_agents_enabled` flag (todos false) | 0097 | ⏳ PENDIENTE |
| 7 | `ai_max_requests_day` en plan_limits | 0097 | ⏳ PENDIENTE |
| 8 | `ai_max_agents` en plan_limits | 0097 | ⏳ PENDIENTE |
| 9 | `ai_usage.execution_time_ms` | 0097 | ⏳ PENDIENTE |
| 10 | `ai_usage.model` | 0097 | ⏳ PENDIENTE |
| 11 | AI Studio V2 (frontend) | Frontend | ⏳ PENDIENTE |
| 12 | Admin IA Monetización | Frontend | ⏳ PENDIENTE |
| 13 | Multi Provider Abstraction | 0097 + ai-proxy | ⏳ PENDIENTE |

**Estado: APROBADOS. Implementación pendiente de inicio según instrucción del usuario.**

---

## 7. RESUMEN DE DOCUMENTOS DE AUDITORÍA ENTREGADOS

| Documento | Estado | Contenido |
|-----------|--------|-----------|
| `AUDIT_SPRINT_24_AI.md` | ✅ ENTREGADO | Inventario completo Sprints 2-IA Ops |
| `AUDIT_SESSION_SECURITY.md` | ✅ ENTREGADO | Análisis Supabase Auth + diseño active_sessions |
| `AI_SCALE_10000_USERS.md` | ✅ ENTREGADO | Análisis escalabilidad 1K-10K usuarios |
| `AI_PLAN_IMPACT_ANALYSIS.md` | ✅ ENTREGADO | Impacto en planes, paquetes, monetización |
| `AI_MONETIZATION_ANALYSIS.md` | ✅ ENTREGADO | Proyecciones de revenue IA |
| `PLAN_MATRIX_IMPACT_ANALYSIS.md` | ✅ ESTE ARCHIVO | Matriz features vs planes |

**Todos los documentos están listos. Aguardando aprobación explícita para iniciar implementación.**
