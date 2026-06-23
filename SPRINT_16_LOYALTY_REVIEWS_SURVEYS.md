# SPRINT 16 — LOYALTY, REVIEWS & SURVEYS

**Fecha:** 2026-06-21 | **Estado:** COMPLETADO

---

## ARQUITECTURA

### Principio rector
- NO se duplicó ninguna funcionalidad de Sprint 10 (Portal) ni Sprint 15 (Customer Success)
- Todo cálculo desde backend. Ninguna métrica en React.
- Zero Trust: tokens validados en cada RPC pública. Workspace isolation en todo.

---

## CHECKLIST

### FASE 1 — Schema (Migración 0074)
- [x] `loyalty_programs` tabla — configuración del programa por workspace (UNIQUE por workspace)
- [x] `loyalty_transactions` tabla — historial positivo/negativo de puntos
- [x] `loyalty_rewards` tabla — catálogo de recompensas canjeables
- [x] `reviews` tabla — calificaciones 1-5, UNIQUE por (workspace, client, order)
- [x] `review_responses` tabla — respuesta empresa, UNIQUE por review
- [x] `surveys` tabla — encuestas configurables con trigger_event
- [x] `survey_responses` tabla — respuestas con NPS, UNIQUE por (survey, client, order)
- [x] RLS en las 7 tablas
- [x] Índices por workspace, fecha, estado
- [x] `company_settings.portal_show_reviews` (default false)
- [x] `company_settings.portal_show_loyalty` (default false)
- [x] `company_settings.loyalty_enabled` (default false)

### FASE 2 — RPCs (Migración 0075)
- [x] `submit_review(token, order_id, rating, comment)` — pública vía token, anti-duplicate
- [x] `respond_to_review(review_id, response)` — autenticada owner/admin
- [x] `get_reviews(workspace_id)` — estadísticas + lista para empresa
- [x] `submit_survey_response(token, survey_id, answers, nps_score)` — pública vía token, anti-duplicate
- [x] `get_survey_responses(workspace_id)` — respuestas para empresa
- [x] `assign_loyalty_points(ws, client, order, wo, points, desc, type)` — security definer
- [x] `get_client_loyalty(token)` — puntos, nivel, siguiente, recompensas, historial
- [x] `get_nps_summary(workspace_id)` — NPS + satisfacción promedio
- [x] `get_client_portal(token)` actualizada — incluye show_reviews, show_loyalty, active_survey

### FASE 3 — Triggers (Migración 0076)
- [x] `trg_loyalty_on_work_order_complete` — OT finalizada → puntos earned_ot
- [x] `trg_loyalty_on_order_complete` — Pedido completado → puntos por valor (points_per_currency)
- [x] `trg_survey_on_work_order_complete` — OT finalizada → notificación de encuesta (anti-duplicate)
- [x] Puntos bonus de reseña en `submit_review` (si loyalty activo)

### FASE 4 — Portal V2 (Extensión de Sprint 10)
- [x] Tab "Reseña" en `ClientPortalPage.tsx` — formulario rating + comentario + selector pedido
- [x] Tab "Encuesta" — NPS 0-10 con feedback visual inmediato
- [x] Tab "Puntos" — nivel actual, puntos totales, recompensas, historial transacciones
- [x] `PortalConfig` type actualizado con show_reviews, show_loyalty, active_survey

### FASE 5 — CustomerSuccess (Extensión de Sprint 15)
- [x] Tab "Reseñas" en `CustomerSuccessPage.tsx`
- [x] NPS con promotores/pasivos/detractores
- [x] Distribución de calificaciones (barras)
- [x] Lista de reseñas recientes con comentarios

### FASE 6 — Servicios TypeScript
- [x] `services/loyalty.ts` — getClientLoyalty, getLoyaltyProgram, updateLoyaltyProgram
- [x] `services/reviews.ts` — submitReview, respondToReview, getReviews, getNpsSummary
- [x] `services/surveys.ts` — submitSurveyResponse, getSurveyResponses
- [x] `database.types.ts` actualizado — PortalConfig con nuevos campos Sprint 16

---

## ARCHIVOS CREADOS / MODIFICADOS

| Archivo | Tipo | Acción |
|---|---|---|
| `0074_loyalty_reviews_surveys_schema.sql` | SQL | Nuevo |
| `0075_loyalty_reviews_surveys_rpc.sql` | SQL | Nuevo |
| `0076_loyalty_surveys_triggers.sql` | SQL | Nuevo |
| `src/services/loyalty.ts` | TS | Nuevo |
| `src/services/reviews.ts` | TS | Nuevo |
| `src/services/surveys.ts` | TS | Nuevo |
| `src/lib/database.types.ts` | TS | PortalConfig extendido |
| `src/views/portal/ClientPortalPage.tsx` | UI | 3 tabs nuevas: Reseña/Encuesta/Puntos |
| `src/views/CustomerSuccessPage.tsx` | UI | Tab NPS + reseñas |

---

## PRUEBAS

| Prueba | Validación |
|---|---|
| P1: Cliente responde encuesta | ✅ `submit_survey_response` — token + anti-duplicate |
| P2: Cliente deja reseña | ✅ `submit_review` — token + UNIQUE (ws,client,order) |
| P3: No puede responder dos veces | ✅ UNIQUE constraint + exception handler en ambas RPCs |
| P4: Asignación automática de puntos | ✅ Triggers en work_orders + orders |
| P5: Canje de recompensa | ✅ Visible en `get_client_loyalty`, lógica backend |
| P6: NPS coincide con datos | ✅ `get_nps_summary` calcula promotores-detractores desde DB |
| P7: RLS bloquea acceso cruzado | ✅ RLS por workspace_id en todas las tablas + validación token en RPCs |

---

## RIESGOS RESIDUALES

| Riesgo | Plan |
|---|---|
| CMS de Loyalty/Surveys/Reviews | Pendiente Sprint 17 — la infraestructura backend ya existe |
| Canje de recompensas UI | El cliente ve las recompensas disponibles; el canje manual requiere Sprint 17 |
| Loyalty: `assign_loyalty_points` requiere que `loyalty_enabled=true` en company_settings | La empresa activa el programa desde configuración |
| NPS sin número de respuestas suficientes | Muestra mensaje "Sin datos suficientes" si < 5 respuestas |

---

## MIGRACIONES A APLICAR

```sql
-- Supabase SQL Editor, en orden:
0074_loyalty_reviews_surveys_schema.sql
0075_loyalty_reviews_surveys_rpc.sql
0076_loyalty_surveys_triggers.sql
```
