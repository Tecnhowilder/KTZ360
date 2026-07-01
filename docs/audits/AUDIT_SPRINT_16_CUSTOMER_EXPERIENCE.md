# AUDIT — SPRINT 16: PORTAL DE CLIENTES, POSTVENTA Y FIDELIZACIÓN

**Fecha:** 2026-06-21  
**Regla absoluta:** No programar hasta finalizar auditoría.  
**Zero Trust obligatorio** — toda validación en backend.

---

## ALERTA CRÍTICA ANTES DE LEER

Sprint 16 solicita algunas funcionalidades que **ya existen** de Sprints anteriores.  
Implementarlas de nuevo crearía **duplicados y conflictos**.  
Esta auditoría las identifica claramente para evitarlo.

---

## 1. PORTAL DE CLIENTES — ESTADO

### Infraestructura existente (Sprint 10)

| Elemento | Estado | Detalle |
|---|---|---|
| `client_portal_tokens` tabla | ✅ EXISTE | id, workspace_id, client_id, token, expires_at (90d), revoked_at, last_access_at |
| `portal_access_log` tabla | ✅ EXISTE | action: portal_opened/quote_viewed/order_viewed/ot_viewed/evidence_viewed |
| `company_settings.portal_enabled` | ✅ EXISTE | Toggle portal por empresa |
| `company_settings.portal_show_evidences` | ✅ EXISTE | default false |
| `company_settings.portal_show_responsible` | ✅ EXISTE | default true |
| `company_settings.portal_show_comments` | ✅ EXISTE | default false |
| `company_settings.portal_show_timeline` | ✅ EXISTE | default true |
| `evidence_files.visible_to_client` | ✅ EXISTE | default false — Zero Trust (Sprint 7) |
| `work_logs.visible_to_client` | ✅ EXISTE | default false — comentarios visibles (Sprint 10) |

### RPCs del portal (Sprint 10)

| RPC | Estado |
|---|---|
| `get_client_portal(token)` | ✅ EXISTE — dashboard: client + company + config + summary + active_orders |
| `get_portal_quotes(token)` | ✅ EXISTE |
| `get_portal_orders(token)` | ✅ EXISTE — incluye responsable si `show_responsible=true` |
| `get_portal_work_orders(token, order_id)` | ✅ EXISTE — incluye comentarios si `show_comments=true` |
| `get_portal_evidences(token, order_id?)` | ✅ EXISTE — solo `visible_to_client=true` |
| `get_portal_timeline(token)` | ✅ EXISTE — quotes + orders + evidencias |
| `get_portal_analytics(workspace_id)` | ✅ EXISTE — métricas para empresa |
| `create_client_portal_token(ws, client, days)` | ✅ EXISTE |
| `revoke_client_portal_token(ws, client)` | ✅ EXISTE |

### Frontend del portal (Sprint 10)

| Elemento | Estado | Tabs disponibles |
|---|---|---|
| `/portal/:token` — `ClientPortalPage.tsx` | ✅ EXISTE | dashboard / cotizaciones / pedidos / fotos / historial |
| Detalle de pedido con OTs y comentarios | ✅ EXISTE | Dentro de tab Pedidos |
| Galería de evidencias visible_to_client | ✅ EXISTE | Tab Fotos |
| Branding empresa (logo, colores) | ✅ EXISTE | |

### LO QUE FALTA en el portal (genuinamente nuevo Sprint 16)

| Elemento | Estado |
|---|---|
| Tab "Reseñas" — el cliente deja calificación | ❌ FALTA |
| Tab "Encuesta" — satisfacción post-servicio | ❌ FALTA |
| Tab "Puntos de fidelización" — loyalty | ❌ FALTA |
| `portal_show_reviews` config | ❌ FALTA |
| `portal_show_loyalty` config | ❌ FALTA |

---

## 2. CUSTOMER HEALTH SCORE — ESTADO

### ⚠️ YA EXISTE — Sprint 15

| Elemento | Estado | Migración |
|---|---|---|
| `customer_health_scores` tabla | ✅ EXISTE | `0073_customer_success.sql` |
| `calculate_customer_health(ws, client?)` RPC | ✅ EXISTE | Variables: recencia, conversión, valor, frecuencia, CRM, aperturas |
| `get_clients_at_risk(workspace_id)` RPC | ✅ EXISTE | Amarillo/naranja/rojo |
| `get_vip_clients(workspace_id)` RPC | ✅ EXISTE | Score>=75 AND approved>=2 |
| `get_repurchase_opportunities(workspace_id)` RPC | ✅ EXISTE | Patrón de ciclo de recompra |
| `get_customer_success_dashboard(workspace_id)` RPC | ✅ EXISTE | Dashboard consolidado |
| `CustomerSuccessPage.tsx` | ✅ EXISTE | `/app/customer-success` — 4 tabs |
| Trigger auto-recalculo en quotes + seguimientos | ✅ EXISTE | |

**CONFLICTO CRÍTICO:** La Fase 1 y Fases 2/3 del Sprint 16 piden crear lo que ya existe.  
**Decisión:** No duplicar. Extender/enriquecer lo existente si Sprint 16 lo requiere.

---

## 3. PEDIDOS Y ÓRDENES DE TRABAJO — ESTADO

| Elemento | Estado |
|---|---|
| `orders` tabla con status, timestamps, order_snapshot | ✅ EXISTE |
| `work_orders` tabla con priority, assigned_to, started_at, finished_at | ✅ EXISTE |
| `work_logs` tabla con bitácora + visible_to_client | ✅ EXISTE |
| Métricas OT (count, done) en portal | ✅ EXISTE |
| Trazabilidad completa pedido → OT → bitácora | ✅ EXISTE |

**Falta para Sprint 16:**
- Calificación del servicio una vez finalizado el pedido
- Encuesta post-servicio asociada al pedido/OT

---

## 4. EVIDENCIAS — ESTADO

| Elemento | Estado |
|---|---|
| `evidence_files` tabla con `visible_to_client` | ✅ EXISTE |
| Bucket `evidences` privado con RLS | ✅ EXISTE |
| `get_portal_evidences(token)` RPC filtra `visible_to_client=true` | ✅ EXISTE |
| Galería en portal móvil | ✅ EXISTE |
| Signed URLs con expiración | ✅ EXISTE |
| Sincronización Drive/OneDrive | ✅ EXISTE (Sprint 14) |

**Nada falta** en evidencias para Sprint 16 — completamente cubierto.

---

## 5. COMUNICACIÓN — ESTADO

| Elemento | Estado |
|---|---|
| `communication_log` tabla | ✅ EXISTE (Sprint 12) |
| WhatsApp enriched + `get_whatsapp_message` RPC | ✅ EXISTE (Sprint 11) |
| Gmail adapter + `queue_email_send` RPC | ✅ EXISTE (Sprint 12) |
| Outlook Mail adapter | ✅ EXISTE (Sprint 12) |
| Template `review_request` (envía WhatsApp solicitando reseña) | ✅ EXISTE (Sprint 13) |

**Falta para Sprint 16:**
- Plantilla de WhatsApp/email específica para encuesta de satisfacción
- Registro de respuestas en `survey_responses`

---

## 6. AUTOMATIZACIONES — ESTADO

| Elemento | Estado |
|---|---|
| `automation_rules` + `automation_templates` | ✅ EXISTE (Sprint 13) |
| Template `review_request_on_completion` | ✅ EXISTE (Sprint 13) |
| Templates VIP, recompra, riesgo crítico | ✅ EXISTE (Sprint 15) |
| Motor `evaluate_and_queue_automations()` | ✅ EXISTE |
| Anti-loops (depth max=3) | ✅ EXISTE |

**Falta para Sprint 16:**
- Template de encuesta post-servicio (disparado por OT finalizada)
- Template de puntos de fidelización asignados

---

## 7. IA — ESTADO

| Función IA | Estado | Operación / Plan |
|---|---|---|
| `analyzeClientsAtRisk()` | ✅ EXISTE | risk_analysis — PREMIUM |
| `getCommercialRecommendations()` | ✅ EXISTE | recommendations — PRO |
| `forecastSales()` | ✅ EXISTE | forecast — PREMIUM |
| `nextBestAction()` | ✅ EXISTE | recommendations — PREMIUM |
| `analyzeCloseProbability()` | ✅ EXISTE | close_probability — PRO |
| Motor autónomo de IA | ⚠️ PARCIAL | Sprint 13 scheduler puede llamarla; Sprint 16 puede activar análisis automático |

**Falta para Sprint 16:**
- Análisis IA de NPS/satisfacción (nuevo tipo de operación)
- Recomendaciones de programa de fidelidad basadas en historial

---

## 8. GENUINAMENTE NUEVO EN SPRINT 16

Los siguientes elementos **no existen** en ningún sprint anterior:

### 8.1 Programa de Fidelización (Fase 4) — FALTA COMPLETO

| Elemento | Estado |
|---|---|
| `loyalty_programs` tabla | ❌ NO EXISTE |
| `loyalty_transactions` tabla | ❌ NO EXISTE |
| `loyalty_rewards` tabla | ❌ NO EXISTE |
| Niveles: Bronce/Plata/Oro/Diamante | ❌ NO EXISTE |
| Asignación de puntos por evento | ❌ NO EXISTE |
| Canje de puntos | ❌ NO EXISTE |
| Visualización en portal cliente | ❌ NO EXISTE |
| CMS para configurar programas | ❌ NO EXISTE |

### 8.2 Reseñas y Calificaciones (Fase 6) — FALTA COMPLETO

| Elemento | Estado |
|---|---|
| `reviews` tabla (1-5 stars, comment, order_id, client_id) | ❌ NO EXISTE |
| `review_responses` tabla (empresa responde) | ❌ NO EXISTE |
| RPC `submit_review(token, rating, comment)` | ❌ NO EXISTE |
| RPC `respond_to_review(review_id, response)` | ❌ NO EXISTE |
| UI en portal cliente | ❌ NO EXISTE |
| UI en dashboard empresa | ❌ NO EXISTE |
| Template WhatsApp `review_request` envía mensaje → EXISTE (Sprint 13) pero no captura la respuesta |

### 8.3 Encuestas de Satisfacción (Fase 7) — FALTA COMPLETO

| Elemento | Estado |
|---|---|
| `surveys` tabla | ❌ NO EXISTE |
| `survey_responses` tabla | ❌ NO EXISTE |
| RPC `submit_survey_response(token, answers)` | ❌ NO EXISTE |
| Automatización: OT finalizada → encuesta automática | ⚠️ PARCIAL — template `review_request_on_completion` existe pero no captura respuesta |
| NPS (Net Promoter Score) cálculo | ❌ NO EXISTE |

### 8.4 Dashboard Customer Success ampliado (Fase 8) — PARCIAL

| Elemento | Estado |
|---|---|
| `CustomerSuccessPage.tsx` con 4 tabs (Resumen/Riesgo/VIP/Recompra) | ✅ EXISTE (Sprint 15) |
| KPI NPS | ❌ NO EXISTE |
| KPI satisfacción promedio | ❌ NO EXISTE |
| KPI reseñas | ❌ NO EXISTE |
| Widget reseñas en dashboard principal | ❌ NO EXISTE |

### 8.5 CMS Customer Success (Fase 10) — FALTA

| Elemento | Estado |
|---|---|
| Configurar niveles VIP | ❌ NO EXISTE |
| Configurar programas de puntos | ❌ NO EXISTE |
| Configurar encuestas | ❌ NO EXISTE |
| Gestionar reseñas | ❌ NO EXISTE |

---

## 9. RIESGOS IDENTIFICADOS

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | Fase 1/2/3 del Sprint 16 duplican Sprint 15 | 🔴 CRÍTICO | No reimplementar. Extender lo existente. |
| R2 | `loyalty_programs` sin integración con pagos | 🟡 MEDIO | Los puntos son virtuales en Sprint 16. No implementar canje con pago todavía. |
| R3 | Reseñas deben tener RLS — cliente A no puede ver reseña de cliente B | 🔴 CRÍTICO | RLS por workspace_id + client_id en todas las políticas |
| R4 | Encuestas enviadas automáticamente pueden generar spam | 🟡 MEDIO | Límite: una encuesta por pedido. Anti-duplicate check. |
| R5 | El portal accede vía token — reseñas y encuestas deben validar token, no auth | 🔴 CRÍTICO | RPCs de submit_review/submit_survey validan token como get_client_portal |
| R6 | NPS requiere mínimo 5 respuestas para ser estadísticamente válido | 🟢 BAJO | Mostrar "Sin datos suficientes" si <5 respuestas |
| R7 | Loyalty programs sin definición de "cómo se ganan puntos" | 🟡 MEDIO | Definir en la arquitectura antes de construir la tabla |

---

## 10. CONFLICTOS DETECTADOS

| Conflicto | Descripción | Resolución |
|---|---|---|
| C1 | Sprint 16 Fase 1 pide crear `customer_health_score` que ya existe en Sprint 15 | Usar Sprint 15. No duplicar. |
| C2 | Sprint 16 Fase 2 pide crear `get_clients_at_risk()` que ya existe en Sprint 15 | Usar Sprint 15. No duplicar. |
| C3 | Sprint 16 Fase 3 pide crear `get_vip_clients()` que ya existe en Sprint 15 | Usar Sprint 15. No duplicar. |
| C4 | Sprint 16 Fase 5 pide crear `/portal/:token` que ya existe en Sprint 10 | Extender el portal existente con nuevas tabs (reseñas, encuestas, loyalty) |
| C5 | Sprint 16 Fase 8 pide crear Dashboard Customer Success que ya existe en Sprint 15 | Extender `CustomerSuccessPage.tsx` con NPS y reseñas |
| C6 | Template `review_request` existe (Sprint 13) pero no captura respuesta del cliente | Mantener el template. Agregar UI de respuesta en el portal. |

---

## 11. CHECKLIST DE LO QUE REALMENTE HAY QUE CONSTRUIR

### Migraciones SQL nuevas (genuinamente nuevas)

- [ ] `loyalty_programs` tabla (id, workspace_id, name, levels config JSONB, points_per_currency, active)
- [ ] `loyalty_transactions` tabla (workspace_id, client_id, order_id, points, type: earned/redeemed, description, created_at)
- [ ] `loyalty_rewards` tabla (workspace_id, name, points_required, description, active)
- [ ] `reviews` tabla (workspace_id, client_id, order_id, rating 1-5, comment, visible_to_company, created_via_token)
- [ ] `review_responses` tabla (review_id, workspace_id, responded_by, response, created_at)
- [ ] `surveys` tabla (workspace_id, title, questions JSONB, active, trigger_event)
- [ ] `survey_responses` tabla (survey_id, client_id, order_id, answers JSONB, nps_score, created_via_token)
- [ ] Campos nuevos en `company_settings`: `portal_show_reviews`, `portal_show_loyalty`, `loyalty_enabled`

### RPCs nuevas (Zero Trust)

- [ ] `submit_review(token, order_id, rating, comment)` — desde portal sin auth
- [ ] `respond_to_review(review_id, response)` — autenticado, owner/admin
- [ ] `get_reviews(workspace_id, limit)` — empresa ve sus reseñas
- [ ] `submit_survey_response(token, survey_id, answers, nps_score)` — desde portal sin auth
- [ ] `get_survey_responses(workspace_id, survey_id)` — empresa ve respuestas
- [ ] `assign_loyalty_points(workspace_id, client_id, order_id, points, description)` — security definer
- [ ] `get_client_loyalty(token)` — portal: puntos del cliente
- [ ] `get_nps_summary(workspace_id)` — cálculo NPS backend

### Triggers

- [ ] OT finalizada → encolar encuesta de satisfacción (si survey activo)
- [ ] Pedido completado → asignar puntos de fidelidad (si loyalty_program activo)

### Frontend — Portal V2 (extensión del portal existente)

- [ ] Tab "Reseñas" en `ClientPortalPage.tsx` (si `portal_show_reviews=true`)
- [ ] Tab "Puntos" en `ClientPortalPage.tsx` (si `portal_show_loyalty=true`)
- [ ] Modal de encuesta post-servicio (disparado automáticamente o desde tab)

### Frontend — Dashboard empresa

- [ ] Sección reseñas en `CustomerSuccessPage.tsx` (nueva tab o nuevo widget)
- [ ] Widget NPS en dashboard/customer-success
- [ ] UI para responder reseñas

### CMS nuevas secciones

- [ ] CMS: gestionar loyalty_programs (configurar niveles, puntos)
- [ ] CMS: ver survey_responses
- [ ] CMS: ver y responder reviews

---

## 12. ARQUITECTURA RECOMENDADA

### Loyalty Points — modelo simple

```
Pedido completado → X puntos (configurable por empresa)
OT finalizada     → Y puntos
Reseña dejada     → Z puntos bonus

Niveles (ejemplo):
  0-499: Bronce
  500-1499: Plata
  1500-2999: Oro
  3000+: Diamante
```

### Reviews — flujo Zero Trust

```
OT finalizada
↓
WhatsApp "¿Cómo fue el servicio?" (template existente Sprint 13)
↓
Cliente entra al portal (/portal/:token)
↓
Tab "Reseñas" → formulario 1-5 estrellas + comentario
↓
submit_review(token, rating, comment) — valida token
↓
INSERT reviews (visible_to_company=true)
↓
Notificación al owner/admin
```

### Encuestas NPS — flujo Zero Trust

```
Pedido finalizado
↓
Trigger → encuesta activada (delay 24h)
↓
Portal cliente → tab "Encuesta"
↓
submit_survey_response(token, answers, nps_score=0-10)
↓
get_nps_summary() → calcula promotores(9-10) - detractores(0-6)
```

---

## 13. FEATURE GATING

| Feature | FREE | PRO | PREMIUM |
|---|---|---|---|
| Reviews básicas | ❌ | ✅ | ✅ |
| Encuestas NPS | ❌ | ✅ | ✅ |
| Loyalty programs | ❌ | ❌ | ✅ |
| Dashboard reseñas/NPS | ❌ | ✅ | ✅ |

**Reutilizar `advanced_reports_enabled` para reviews/NPS. Crear `loyalty_enabled` para loyalty.**

---

## 14. CONCLUSIÓN

**Lo que EXISTE y no debe duplicarse:**
- Customer Health Score → Sprint 15
- Clients at Risk / VIP → Sprint 15
- Portal /portal/:token → Sprint 10
- IA comercial → Sprint 2
- Dashboard Customer Success → Sprint 15
- Comunicaciones (WhatsApp/Gmail) → Sprints 11-12

**Lo que ES NUEVO y debe construirse:**
1. Loyalty Programs (tablas + RPCs + portal UI + CMS)
2. Reviews & Ratings (tablas + RPCs + portal UI + empresa UI)
3. Encuestas NPS (tablas + RPCs + portal UI + NPS dashboard)
4. Extensión del portal existente (nuevas tabs: reseñas, puntos, encuestas)
5. CMS para loyalty, surveys, reviews

**Fases 1, 2, 3 y 9 del spec se cubren con lo existente de Sprint 15.**  
**Fase 5 es una extensión del portal de Sprint 10, no una creación.**

**¿Autorización para proceder con la implementación?**
