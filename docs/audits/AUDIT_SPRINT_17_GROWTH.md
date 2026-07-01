# AUDIT — SPRINT 17: GROWTH & MARKETING ENGINE

**Fecha:** 2026-06-22  
**Regla:** No implementar nada hasta aprobación de esta auditoría.  
**Zero Trust obligatorio.**

---

## ⚠️ ALERTA CRÍTICA: 6 CONFLICTOS CON SPRINTS ANTERIORES

Sprint 17 solicita funcionalidades que **parcial o totalmente ya existen**. Implementarlas sin leer esta auditoría crearía duplicados graves.

---

## 1. CRM

### ✅ EXISTE (completo)

| Elemento | Estado | Sprint | Relevancia Sprint 17 |
|---|---|---|---|
| `clients` tabla | ✅ | 1 | Base para lead scoring, campañas, UTM |
| `leads` tabla | ✅ EXISTE SIN USO | 1 | Tiene: name, phone, email, **source**, status, notes. Nunca integrada. |
| `leads.source` campo | ✅ EXISTE | 1 | Campo `source text` en leads — base para UTM/atribución |
| `quotes` tabla | ✅ | 1 | Datos de cotización para scoring |
| `seguimientos` tabla | ✅ | 4 | Base para automatizaciones de recuperación |
| `recordatorios` tabla | ✅ | 4 | Base para campañas programadas |
| `client_timeline_events` tabla | ✅ | 4 | Historial completo por cliente |
| `communication_log` tabla | ✅ | 12 | WhatsApp/Gmail/Outlook — base para métricas de campañas |
| `get_crm_dashboard` RPC | ✅ | 4 | Conversión, sin seguimiento, vencimientos |
| `get_smart_alerts` RPC | ✅ | 5 | Detecta: clientes perdidos, sin seguimiento, rechazos |

**CONFLICTO C1:** Sprint 17 Fase 3 pide "Lead Scoring" con `lead_scores` + variables de cotizaciones/aperturas/seguimientos. **Esto es exactamente `customer_health_scores` de Sprint 15** con score 0-100 y clasificación VIP/saludable/riesgo/critico/perdido. NO DUPLICAR.

**CONFLICTO C2:** Sprint 17 Fase 4 pide "Recuperación de Clientes" con detección 30/60/90 días. **Esto es exactamente `get_clients_at_risk()` de Sprint 15** + templates `client_recovery_60d` de Sprint 13. NO DUPLICAR.

---

## 2. CUSTOMER SUCCESS

### ✅ EXISTE (completo — Sprints 15 y 16)

| Elemento | Estado | Relevancia Sprint 17 |
|---|---|---|
| `customer_health_scores` tabla | ✅ Sprint 15 | **ES el lead scoring** (score 0-100, VIP/riesgo/critico) |
| `calculate_customer_health()` RPC | ✅ Sprint 15 | Motor de scoring ya implementado |
| `get_clients_at_risk()` RPC | ✅ Sprint 15 | Detección 30/60/90 días |
| `get_vip_clients()` RPC | ✅ Sprint 15 | Clientes VIP |
| `get_repurchase_opportunities()` RPC | ✅ Sprint 15 | Oportunidades de recompra |
| `loyalty_programs` tabla | ✅ Sprint 16 | Programa de puntos — relacionado con referidos |
| `loyalty_transactions` tabla | ✅ Sprint 16 | Historial de puntos — puede incluir recompensas de referidos |
| `loyalty_rewards` tabla | ✅ Sprint 16 | Recompensas canjeables |
| `reviews` + `survey_responses` tablas | ✅ Sprint 16 | NPS y satisfacción |

---

## 3. AUTOMATIZACIONES

### ✅ EXISTE (completo — Sprint 13)

| Elemento | Estado | Relevancia Sprint 17 |
|---|---|---|
| `automation_rules` tabla | ✅ | Motor extensible — nuevas campañas de growth se agregan como reglas |
| `automation_templates` tabla | ✅ | Ya tiene: quote_followup, client_hot_signal, review_request, client_recovery, work_order_overdue, vip_special, repurchase_detected, high_risk_ia |
| `evaluate_and_queue_automations()` RPC | ✅ | Evalúa y encola cualquier acción |
| `automation-scheduler` Edge Function | ✅ | Ejecuta reglas periódicas |

**CONFLICTO C3:** Sprint 17 Fase 5 pide "Campañas" con `marketing_campaigns`, `campaign_metrics`. El sistema de automatizaciones de Sprint 13 **ya es un motor de campañas** (reglas + acciones + logs + métricas). Las campañas de growth deben modelarse como `automation_rules` con trigger `periodic` o crear una capa ligera sobre el motor existente.

---

## 4. PORTAL CLIENTE

### ✅ EXISTE (completo — Sprint 10)

| Elemento | Estado | Relevancia Sprint 17 |
|---|---|---|
| `client_portal_tokens` tabla | ✅ | Token único por cliente — base para links de referido |
| `portal_access_log` tabla | ✅ | Log de accesos — métricas de engagement |
| `get_portal_analytics()` RPC | ✅ | Métricas del portal para la empresa |
| Portal UI `/portal/:token` | ✅ | 5 tabs: dashboard/cotiz/pedidos/fotos/historial + Sprint 16: reseñas/encuesta/puntos |

**OPORTUNIDAD:** Los `client_portal_tokens` pueden ser la base del sistema de referidos (un cliente comparte su token → nuevo cliente llega → se registra el referido).

---

## 5. INTEGRACIONES (Canales de campaña)

### ✅ EXISTEN (completos — Sprints 11-14)

| Canal | Estado | Cobertura actual |
|---|---|---|
| WhatsApp (enriquecido) | ✅ Sprint 11 | `get_whatsapp_message()` para 6 tipos de evento |
| Gmail | ✅ Sprint 12 | `queue_email_send()` + `GmailAdapter` |
| Outlook Mail | ✅ Sprint 12 | `queue_email_send()` + `OutlookMailAdapter` |
| Google Calendar | ✅ Sprint 11 | `GoogleCalendarAdapter` |
| Teams | ✅ Sprint 14 | `TeamsAdapter` para notificaciones |
| `integration_events` cola | ✅ Sprint 11 | Queue universal para todos los canales |
| `communication_log` | ✅ Sprint 12 | Historial de envíos con status sent/delivered/failed |

**El sistema de canales de campaña ya existe.** Sprint 17 puede usar `queue_integration_event()` para cualquier canal.

---

## 6. IA COMERCIAL

### ✅ EXISTE (completo — Sprint 2 + 15)

| Función | Estado | Operación/Plan |
|---|---|---|
| `analyzeCloseProbability(quote)` | ✅ | close_probability — PRO |
| `getCommercialRecommendations(quotes, clients)` | ✅ | recommendations — PRO |
| `forecastSales(quotes, months)` | ✅ | forecast — PREMIUM |
| `analyzeClientsAtRisk(quotes, clients)` | ✅ | risk_analysis — PREMIUM |
| `nextBestAction(quote, client)` | ✅ | recommendations — PREMIUM |
| `prioritizeOpportunities(quotes)` | ✅ | recommendations — PREMIUM |
| `generateDescription(input)` | ✅ | generate_description — PRO |
| `improveProposal(text, client)` | ✅ | improve_proposal — PRO |
| Control de créditos (`check_ai_credits`) | ✅ | Sprint 2/13 |

**Todo el motor de IA comercial ya existe. No crear nada nuevo. Conectar al growth engine.**

---

## 7. SISTEMA DE PROMOCIONES

### ⚠️ PARCIAL (founder_promotions existe, promotions genéricas NO)

| Elemento | Estado | Detalle |
|---|---|---|
| `founder_promotions` tabla | ✅ Sprint 9 | Para descuentos de plan (PRO/PREMIUM Founder) |
| `activate_founder_subscription()` RPC | ✅ Sprint 9 | Aplica precio especial al plan |
| Promociones de cotización para clientes | ❌ NO EXISTE | Sprint 17 Fase 2 — genuinamente nuevo |
| Sistema de cupones con código | ❌ NO EXISTE | `BIENVENIDO2026`, `REFERIDO20` — genuinamente nuevo |
| Descuento en cotización vía cupón | ❌ NO EXISTE | Lógica de negocio nueva |

---

## 8. LO GENUINAMENTE NUEVO EN SPRINT 17

Después de la auditoría, lo que es **completamente nuevo**:

### 8.1 Sistema de Referidos — FALTA COMPLETO

| Elemento | Estado |
|---|---|
| `referral_programs` tabla | ❌ NO EXISTE |
| `referral_links` tabla | ❌ NO EXISTE |
| `referral_rewards` tabla | ❌ NO EXISTE (aunque loyalty_rewards de Sprint 16 podría reutilizarse) |
| `referral_conversions` tabla | ❌ NO EXISTE |
| RPCs de referidos | ❌ NO EXISTEN |
| UI de referidos en portal cliente | ❌ NO EXISTE |

**IMPORTANTE:** Puede reutilizar `loyalty_programs.points_on_review` como `points_on_referral` sin nueva tabla si se decide modelar así.

### 8.2 Cupones y Promociones para clientes — FALTA COMPLETO

| Elemento | Estado |
|---|---|
| `promotions` tabla (para quotes/clientes) | ❌ NO EXISTE |
| `promotion_redemptions` tabla | ❌ NO EXISTE |
| `validate_coupon()` RPC | ❌ NO EXISTE |
| `apply_promotion_to_quote()` RPC | ❌ NO EXISTE |

### 8.3 UTM Tracking — FALTA COMPLETO

| Elemento | Estado |
|---|---|
| `utm_tracking` tabla o campos en `leads`/`clients` | ❌ NO EXISTE (aunque `leads.source` existe) |
| Captura automática de UTM params | ❌ NO EXISTE |
| Dashboard de atribución | ❌ NO EXISTE |

### 8.4 Landing Pages — FALTA COMPLETO (y es complejo)

| Elemento | Estado |
|---|---|
| Sistema de landing pages por workspace | ❌ NO EXISTE |
| Subdominio `empresa.shelwi.com` | ❌ NO EXISTE (requiere infraestructura de DNS) |
| Formulario de captación de leads | ❌ NO EXISTE |

**RIESGO ALTO:** Las landing pages con subdominios requieren configuración de DNS wildcard y certificados SSL. Esto es infraestructura, no solo código. No puede hacerse en un sprint sin preparación de infraestructura.

### 8.5 Campañas formalizadas — PARCIAL

| Elemento | Estado | Nota |
|---|---|---|
| Motor de campañas | ✅ EXISTE como automation_rules | Funcional pero sin UI de "campaña" |
| `marketing_campaigns` tabla | ❌ NO EXISTE | Si se crea, debe orquestar sobre automation_rules |
| Dashboard de campañas con ROI | ❌ NO EXISTE | Métricas calculables desde communication_log |
| Segmentación de audiencias | ❌ NO EXISTE | `customer_health_scores` + `clients` son la base |

---

## 9. CONFLICTOS DETECTADOS (RESUMEN)

| # | Solicitud Sprint 17 | Situación real | Decisión recomendada |
|---|---|---|---|
| C1 | Lead Scoring (lead_scores tabla) | `customer_health_scores` Sprint 15 ya ES el scoring | Reutilizar. Extender con campos UTM si necesario |
| C2 | Recuperación de clientes (30/60/90d) | `get_clients_at_risk()` Sprint 15 ya hace esto | Reutilizar. Crear campañas automatizadas sobre el resultado |
| C3 | Campañas (marketing_campaigns) | `automation_rules` Sprint 13 ya es un motor de campañas | Crear capa de "Campaign" sobre automation_rules |
| C4 | IA Marketing (generar campañas/emails/WA) | `aiCommercial.ts` Sprint 2 ya tiene estas funciones | Reutilizar. Conectar al growth engine |
| C5 | Recuperación vía WhatsApp/Gmail/Outlook | `communication_log` + integrations Sprint 11-12 ya existen | Reutilizar. Campañas orquestan sobre estos canales |
| C6 | Dashboard Growth (VIP/riesgo/recompra) | `CustomerSuccessPage.tsx` Sprint 15 ya tiene Resumen/Riesgo/VIP/Recompra | Extender con métricas de growth (referidos, campañas, UTM) |

---

## 10. RIESGOS IDENTIFICADOS

| # | Riesgo | Severidad | Detalle |
|---|---|---|---|
| R1 | Landing pages con subdominio | 🔴 ALTO | Requiere DNS wildcard + SSL. No implementable sin infraestructura. Descope para Sprint 18 |
| R2 | Cupones que modifican precio de cotización | 🟡 MEDIO | Requiere integrar con el motor de cotización. El descuento debe calcularse y validarse ANTES de crear la cotización |
| R3 | UTM tracking en portal cliente | 🟡 MEDIO | Los tokens del portal son UUIDs, no llevan UTM. Necesita campo adicional en `client_portal_tokens` o tabla separada |
| R4 | ROI de campañas | 🟡 MEDIO | El ROI real requiere vincular ingresos de cotizaciones aprobadas con la campaña que los originó — trazabilidad compleja |
| R5 | Sistema de referidos con ciclos de validación | 🟡 MEDIO | Un cliente que refiere y también es referido puede crear ciclos. Necesita anti-abuse logic |
| R6 | `leads` tabla sin integración | 🟢 BAJO | La tabla existe desde Sprint 1 pero nunca fue integrada al flujo. Sprint 17 puede reutilizarla para lead tracking |

---

## 11. CHECKLIST DE LO QUE REALMENTE HAY QUE CONSTRUIR

### Genuinamente nuevo

- [ ] `referral_programs` tabla + RPCs + UI
- [ ] `referral_links` tabla
- [ ] `referral_conversions` tabla
- [ ] `promotions` tabla (para descuentos en cotizaciones de clientes)
- [ ] `promotion_redemptions` tabla
- [ ] Campos UTM en `leads` o nueva tabla `utm_events`
- [ ] Dashboard `/app/growth` (nueva vista que agrega datos existentes)
- [ ] Campaña sobre motor de automatizaciones existente (UI de orquestación)

### Extensión de existente (no nuevo)

- [ ] Extender `CustomerSuccessPage.tsx` con métricas de growth
- [ ] Agregar `points_on_referral` a `loyalty_programs` (columna nueva)
- [ ] Extender `automation_templates` con templates de campaña
- [ ] Conectar IA existente a campañas automáticas
- [ ] `communication_log` como base de métricas de campaña

### NO construir (ya existe o descope)

- ❌ Lead scoring — USA `customer_health_scores`
- ❌ Recuperación 30/60/90 días — USA `get_clients_at_risk()`
- ❌ IA de recomendaciones — USA `aiCommercial.ts`
- ❌ Motor de campañas desde cero — USA `automation_rules`
- ❌ Canales de envío — USA `integration_events` + adapters
- ❌ Landing pages con subdominios — DESCOPE Sprint 18 (requiere infraestructura)

---

## 12. ARQUITECTURA RECOMENDADA PARA SPRINT 17

### Referidos

```
Cliente conectado → /portal/:token → botón "Invitar"
  ↓ create_referral_link(token)
  ↓ genera URL: /ref/{code}
  ↓ nuevo visitante llega con /ref/{code}
  ↓ track_referral_visit() → guarda lead en tabla `leads` con source='referral'
  ↓ nuevo cliente se registra
  ↓ register_referral_conversion()
  ↓ assign_loyalty_points() al referidor (usa infraestructura Sprint 16)
```

### Cupones

```
Empresa crea cupón BIENVENIDO20 → promotions.code = 'BIENVENIDO20'
  ↓ Cliente aplica en cotización
  ↓ validate_coupon(code, workspace_id, quote_total) → BACKEND ONLY
  ↓ descuento calculado en backend (no en React)
  ↓ cotización guardada con discount aplicado
```

### UTM Tracking

```
Visitor llega a /ref/{code}?utm_source=instagram&utm_campaign=verano2026
  ↓ track_referral_visit() captura UTM params
  ↓ almacena en tabla utm_events (lead_id, source, medium, campaign, etc.)
  ↓ dashboard agrega por fuente
```

### Campañas

```
Empresa crea "Campaña Recuperación Julio"
  ↓ Segmento: clientes con status='riesgo' (usa customer_health_scores)
  ↓ Canal: WhatsApp + Gmail
  ↓ Acción: automation_rule con type=periodic, action=send_whatsapp + send_email
  ↓ Métricas: communication_log.status + quotes.status post-campaña
```

---

## 13. RECOMENDACIÓN ANTES DE IMPLEMENTAR

1. **Aprobar esta auditoría** y confirmar los descopes (landing pages, motor de campañas desde cero)
2. **Decidir modelo de referidos:** ¿usar `loyalty_points` para recompensar referidos o tabla separada `referral_rewards`?
3. **Decidir UTM:** ¿agregar campos a `leads` tabla existente o nueva tabla `utm_events`?
4. **Confirmar descope de landing pages** — requiere Sprint dedicado de infraestructura
5. **Confirmar que campañas usan `automation_rules`** — no crear motor paralelo
