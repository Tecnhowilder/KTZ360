# AUDIT_CUSTOMER_EXPERIENCE.md
# Shelwi — Auditoría Customer Experience CMS
Fecha: 2026-06-23

---

## INVENTARIO SPRINT 15–16 (NO DUPLICAR)

### Sprint 15 — Customer Success (ya existe, NO tocar)

| Entidad | RPC / Service | Estado |
|---------|---------------|--------|
| Health scores (0–100) | `get_customer_success_dashboard()` | ✅ EXISTE |
| Clientes en riesgo | `get_clients_at_risk()` | ✅ EXISTE |
| Clientes VIP | `get_vip_clients()` | ✅ EXISTE |
| Oportunidades de recompra | `get_repurchase_opportunities()` | ✅ EXISTE |
| Recalcular scores | `recalculate_all_health_scores()` | ✅ EXISTE |
| Vista en `/app/customer-success` | `CustomerSuccessPage.tsx` | ✅ EXISTE |

### Sprint 16 — Loyalty / Reviews / Surveys

#### Tablas (todas con RLS, no re-crear)
| Tabla | Estado |
|-------|--------|
| `loyalty_programs` (1 por workspace, UNIQUE) | ✅ EXISTE |
| `loyalty_transactions` (historial de puntos) | ✅ EXISTE |
| `loyalty_rewards` (catálogo de recompensas canjeables) | ✅ EXISTE |
| `reviews` (calificaciones 1–5 + comentario) | ✅ EXISTE |
| `review_responses` (respuesta de la empresa, UNIQUE por review) | ✅ EXISTE |
| `surveys` (encuestas configurables con NPS) | ✅ EXISTE |
| `survey_responses` (respuestas de clientes) | ✅ EXISTE |

#### RPCs existentes (NO re-crear)
| RPC | Quién la llama | Estado |
|-----|---------------|--------|
| `submit_review(token, order_id, rating, comment)` | Portal del cliente (anon) | ✅ EXISTE |
| `respond_to_review(review_id, response)` | Owner/admin desde UI | ✅ EXISTE |
| `get_reviews(workspace_id, limit)` | Frontend admin | ✅ EXISTE |
| `submit_survey_response(token, survey_id, answers, nps)` | Portal del cliente | ✅ EXISTE |
| `get_survey_responses(workspace_id, survey_id?)` | Frontend admin | ✅ EXISTE |
| `assign_loyalty_points(workspace_id, client_id, points, type)` | Triggers + manual | ✅ EXISTE |
| `get_client_loyalty(token)` | Portal del cliente | ✅ EXISTE |
| `get_nps_summary(workspace_id)` | `CustomerSuccessPage`, `BIPage` | ✅ EXISTE |

#### Servicios frontend existentes (NO re-crear)
| Archivo | Funciones | Estado |
|---------|-----------|--------|
| `src/services/loyalty.ts` | `getLoyaltyProgram`, `updateLoyaltyProgram`, `getClientLoyalty`, `LOYALTY_TYPE_LABELS` | ✅ EXISTE |
| `src/services/reviews.ts` | `getReviews`, `respondToReview`, `getNpsSummary`, `starLabel` | ✅ EXISTE |
| `src/services/surveys.ts` | `getSurveyResponses`, `submitSurveyResponse` | ✅ EXISTE |

---

## GAPS REALES — LO QUE FALTA

### GAP 1: No existen RPCs de administración para Loyalty

**Problema:** `updateLoyaltyProgram` usa `supabase.from('loyalty_programs').upsert()` directamente desde el frontend (violación menor de Zero Trust — aunque RLS protege). No hay RPC `SECURITY DEFINER` para:
- Configurar el programa de loyalty (puntos_per_currency, puntos_on_ot, puntos_on_review, niveles)
- Crear/editar/eliminar recompensas (loyalty_rewards)
- Ajuste manual de puntos de un cliente
- Historial de transacciones por workspace (no solo por cliente)

### GAP 2: No existen RPCs de administración para Surveys

**Problema:** No existe ninguna RPC para:
- Crear encuesta
- Actualizar encuesta
- Activar/desactivar encuesta
- Eliminar encuesta

Solo existe `get_survey_responses()` (lectura). La gestión de encuestas se hace directamente sobre la tabla.

### GAP 3: No existe moderación de Reviews

**Problema:** `respond_to_review()` existe, pero no hay RPC para:
- Ocultar/mostrar una reseña (`reviews.visible`)
- Eliminar una reseña
- Ver reseñas con filtros (rating, con/sin respuesta, fecha)
- Resumen de reviews con tendencia

### GAP 4: No existe sección CMS en AdminPanel para Customer Experience

**Problema:** `AdminPanel.tsx` tiene tabs: dashboard, subscriptions, plans, founder, ia, storage, users, workspaces, audit, system, support, finanzas, pero NO tiene Customer Experience.

La sección `/app/customer-success` existe pero es por workspace, NO es administración global.

### GAP 5: No hay UI para gestionar loyalty_rewards

**Problema:** La tabla `loyalty_rewards` existe con RLS correcto (owner/admin puede gestionar), pero no hay ninguna pantalla para crear/editar/eliminar recompensas en el frontend.

### GAP 6: Loyalty program se inicializa pero no hay UI de configuración

**Problema:** `updateLoyaltyProgram` existe en el servicio pero no hay pantalla para que el owner configure: puntos por pedido, puntos por OT, puntos por reseña, niveles.

La configuración de loyalty está en `company_settings` (portal_show_loyalty, loyalty_enabled) pero la gestión del programa en sí no tiene UI propia.

---

## PLAN DE IMPLEMENTACIÓN

### Lo que se implementa (sin duplicar)

1. **Migración 0092**: RPCs CMS — `upsert_loyalty_program()`, `upsert_loyalty_reward()`, `delete_loyalty_reward()`, `adjust_loyalty_points()`, `get_loyalty_dashboard()`, `upsert_survey()`, `delete_survey()`, `toggle_review_visibility()`, `get_cx_dashboard()`

2. **`src/components/admin/CustomerExperienceTab.tsx`**: Componente admin con 3 secciones: Loyalty, Reviews, Surveys.

3. **Actualizar `AdminPanel.tsx`**: Añadir tab 'cx' con `CustomerExperienceTab`.

### Lo que NO se toca (ya existe)
- `submit_review` / `respond_to_review` / `get_reviews` → NO duplicar
- `get_nps_summary` → reutilizar
- `get_client_loyalty` / `assign_loyalty_points` → reutilizar
- `get_survey_responses` → reutilizar
- `CustomerSuccessPage.tsx` → NO modificar
- `BIPage.tsx` Tab Clientes → NO modificar
- Tablas del Schema → NO re-crear
