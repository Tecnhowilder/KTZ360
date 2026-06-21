# SHELWI — ROADMAP SPRINT 2 IA COMPLETA

## AUDITORÍA PREVIA

### EXISTE ✅
- `ai-proxy` edge function con JWT verification + rate limit + créditos (Sprint 1.1)
- `ai_usage` tabla con `credits_used` + `period_month` (migración 0038)
- `ai_operation_costs` tabla con 8 operaciones y costos (migración 0038)
- `check_ai_credits` RPC con ownership validation (migración 0040)
- `consume_ai_credits` RPC solo service_role (migración 0040)
- `notifications` tabla + `createNotification()` + `NotificationBell` (Sprint anterior)
- `plan_limits.ai_credits_monthly` columna (FREE=0, PRO=500, PREMIUM=2000)
- `plan_features.ai_enabled` columna (FREE=false, PRO=true, PREMIUM=true)
- `aiStudio.ts` con `AIOperation` tipado + errores de negocio
- `useAI.ts` con `generate(prompt, operation, opts)` firma correcta
- `ShelwiIAMobile.tsx` dashboard copiloto básico
- Dashboard: `generateAISummary`, `getSmartAlerts`, `closeProbability` — CALCULADOS LOCALMENTE (no usan Gemini)

### PARCIAL ⚠️
- `KtzIA.tsx` desktop: solo usa `generate_description`, resto del flujo es legacy (catalogV2 construcción)
- `ShelwiIAMobile.tsx`: muestra recomendaciones IA pero sin consumir créditos ni llamar Gemini
- Dashboard `generateAISummary`: texto generado localmente (strings JS), NO usa Gemini
- Dashboard `getSmartAlerts`: calculado localmente con datos de quotes, NO usa Gemini
- Sistema de alertas de créditos: no existe (no hay notificación al 80%/90%/100%)
- Dashboard IA (créditos usados / restantes / historial): no existe endpoint

### FALTA ❌
- **IA Comercial (PRO):** funciones `mejorar_propuesta`, `resumen_ia`, `probabilidad_cierre`, `recomendaciones` NO conectadas a Gemini
- **IA Premium:** `forecast`, `clientes_en_riesgo`, `priorizacion_oportunidades`, `proxima_mejor_accion` NO implementadas
- **Dashboard IA backend:** endpoint para créditos usados/restantes/historial por operación
- **Alertas de créditos:** notificación automática al 80%, 90%, 100% de consumo
- **Branding:** referencias a KTZ360/Brivia en código y migraciones sin actualizar
- **KtzIA desktop:** flujo completamente refactorizado a IA universal (no catalogV2)
- **RPC `get_ai_credits_summary`:** consulta optimizada para dashboard

### RIESGOS
- Llamadas a Gemini sin cache pueden agotar créditos PRO (500/mes) rápido si usuario prueba mucho
- Dashboard IA que llame Gemini cada render = consumo excesivo → usar cache + trigger manual
- `draftStorage.ts` tiene `ktz360_` como prefix de localStorage → renombrar a `shelwi_`

### OPORTUNIDADES
- Las funciones locales del Dashboard (generateAISummary, closeProbability) ya calculan buenos insights — conectar opcionalmente a Gemini para enriquecer
- El sistema de notificaciones ya existe — solo hay que conectar las alertas de créditos

---

## CHECKLIST

### FASE RENAME — Limpiar nombres antiguos
- [ ] brand.ts: verificar APP_NAME = 'Shelwi'
- [ ] draftStorage.ts: renombrar prefix `ktz360_` → `shelwi_`
- [ ] ShelwiIAMobile.tsx: remover comentario KTZ360
- [ ] materiales: renombrar referencia KTZ360 IA
- [ ] send-email edge function: KTZ360 → Shelwi
- [ ] send-email templates.ts: KTZ360 → Shelwi
- [ ] SQL 0041: update plans description KTZ360 → Shelwi

### FASE 2 — Validaciones Sprint 1
- [~] Prueba 1: Founder Program (validada con SQL, pendiente end-to-end)
- [~] Prueba 2: Workspace cruzado (validada con SQL)
- [~] Prueba 3: FREE → HTTP 403 (lógica implementada, pendiente curl)
- [~] Prueba 4: Créditos 501 → HTTP 429 (validada con SQL)
- [~] Prueba 5: Price tampering (lógica implementada)

### FASE 3 — IA Comercial PRO
- [ ] Crear `src/services/aiCommercial.ts` con todas las funciones IA PRO
- [ ] `generateDescription(prompt)` → 1 crédito
- [ ] `improveProposal(quoteText)` → 2 créditos
- [ ] `generateAISummaryGemini(quotes)` → 2 créditos (enriquecer Dashboard con Gemini)
- [ ] `closeProbabilityAI(quote)` → 3 créditos
- [ ] `getRecommendationsAI(quotes, clients)` → 3 créditos
- [ ] Integrar en KtzIA desktop
- [ ] Integrar en ShelwiIAMobile

### FASE 4 — IA Premium
- [ ] `forecastSales(quotes, months)` → 3 créditos
- [ ] `clientsAtRisk(quotes, clients)` → 3 créditos
- [ ] `prioritizeOpportunities(quotes)` → 3 créditos
- [ ] `nextBestAction(quote, client)` → 3 créditos

### FASE 5 — Dashboard IA Backend
- [ ] SQL 0042: RPC `get_ai_credits_summary(workspace_id)` optimizada
- [ ] `src/services/aiCredits.ts`: servicio de consulta de créditos
- [ ] Hook `useAICredits()` para React Query
- [ ] Widget de créditos en ShelwiIAMobile

### FASE 6 — Alertas de Créditos
- [ ] SQL 0043: función `notify_ai_credits_threshold(workspace_id, used, max)`
- [ ] Integrar en `consume_ai_credits` RPC
- [ ] Alertas al 80%, 90%, 100% via tabla notifications
- [ ] Notificación de bloqueo con CTA de upgrade

### FASE 7 — Seguridad
- [ ] Pentest: workspace cruzado en nuevas RPCs
- [ ] Pentest: bypass créditos
- [ ] Pentest: rate limit bypass
- [ ] Documentar resultados

### BUILD
- [ ] npm run build: 0 errores TypeScript
