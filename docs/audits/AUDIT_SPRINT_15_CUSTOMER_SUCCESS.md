# AUDIT — SPRINT 15: CUSTOMER SUCCESS + FIDELIZACIÓN + RETENCIÓN

**Fecha:** 2026-06-21  
**Regla:** No programar hasta terminar auditoría.  
**Zero Trust obligatorio** — toda validación en backend.

---

## 1. CRM — ESTADO

| Elemento | Estado | Ubicación | Reutilizable Sprint 15 |
|---|---|---|---|
| `clients` tabla | ✅ EXISTE | `0001_schema.sql` | Base para health score |
| `clients.total_quotes` | ✅ EXISTE | `0032_clients_v2.sql` | Variable de scoring |
| `clients.total_approved` | ✅ EXISTE | `0032_clients_v2.sql` | Variable de scoring (conversión) |
| `clients.total_value` | ✅ EXISTE | `0032_clients_v2.sql` | Variable de scoring (valor histórico) |
| `clients.last_activity_at` | ✅ EXISTE | `0032_clients_v2.sql` | Variable crítica (días inactivo) |
| `refresh_client_metrics()` | ✅ EXISTE | `0032_clients_v2.sql` | Trigger en quotes — métricas siempre actualizadas |
| `seguimientos` tabla | ✅ EXISTE | `0046_crm_tables.sql` | Variable de scoring |
| `recordatorios` tabla | ✅ EXISTE | `0046_crm_tables.sql` | Para automatizaciones retención |
| `client_timeline_events` tabla | ✅ EXISTE | `0046_crm_tables.sql` | Historia del cliente |
| `commercial_status` en quotes | ✅ EXISTE | `0045_crm_commercial_status.sql` | Estado pipeline |
| `get_crm_dashboard` RPC | ✅ EXISTE | `0047_crm_rpc.sql` | Conversión, sin seguimiento, vencimientos |
| `get_clients_report` RPC | ✅ EXISTE | `0049_reports_rpc.sql` | Nuevos, activos, inactivos, recurrentes, top clientes |
| `get_smart_alerts` RPC | ✅ EXISTE | `0049_reports_rpc.sql` | Caída conversión, clientes perdidos, rechazos altos |
| Clasificación VIP/Recurrente/Sin actividad | ⚠️ PARCIAL | `ClientesMobile.tsx` línea 55 | **Frontend calcula** — viola Zero Trust. Sprint 15 debe moverlo al backend. |

**RIESGO CRÍTICO:** La clasificación VIP, Recurrente, Sin actividad existe en `ClientesMobile.tsx` como cálculo frontend (conteo local de cotizaciones aprobadas). Este dato no está persistido en DB ni validado desde backend — viola Zero Trust del Sprint 15.

---

## 2. REPORTES — ESTADO

| Elemento | Estado | Reutilizable |
|---|---|---|
| `get_reports_summary(workspace_id, period_start, period_end)` | ✅ EXISTE | KPIs por período |
| `get_clients_report(workspace_id, period_start, period_end)` | ✅ EXISTE | Nuevos/activos/inactivos/recurrentes — base para Sprint 15 |
| `get_executive_dashboard(workspace_id)` | ✅ EXISTE | Dashboard consolidado |
| `get_smart_alerts(workspace_id)` | ✅ EXISTE | Detecta: sin seguimiento, vencimientos, caída conversión, clientes perdidos |
| `get_funnel_report(workspace_id, period)` | ✅ EXISTE | Embudo comercial |

**Reutilizable directamente:** `get_smart_alerts` ya detecta `lost_clients` (sin actividad 60d). Sprint 15 puede extenderlo para incluir `health_score`.

---

## 3. IA COMERCIAL — ESTADO

| Función | Operación | Plan | Estado |
|---|---|---|---|
| `analyzeClientsAtRisk(quotes, clients)` | `risk_analysis` | PREMIUM — 3 créditos | ✅ EXISTE `aiCommercial.ts` |
| `getCommercialRecommendations(quotes, clients)` | `recommendations` | PRO — 3 créditos | ✅ EXISTE |
| `forecastSales(quotes, months)` | `forecast` | PREMIUM — 3 créditos | ✅ EXISTE |
| `nextBestAction(quote, client)` | `recommendations` | PREMIUM — 3 créditos | ✅ EXISTE |
| `analyzeCloseProbability(quote)` | `close_probability` | PRO — 3 créditos | ✅ EXISTE |
| `prioritizeOpportunities(quotes)` | `recommendations` | PREMIUM — 3 créditos | ✅ EXISTE |
| Motor autónomo (IA ejecuta sin solicitud usuario) | — | — | ❌ FALTA |
| `automation_ai_credits_pct` presupuesto | ✅ EXISTE | Sprint 13 | 20% PRO / 30% PREMIUM |

**Conclusión IA:** Todas las funciones existen en `aiCommercial.ts` y `ai-proxy`. Lo que falta es un motor que las ejecute automáticamente en background (sin que el usuario lo solicite). El `automation-scheduler` de Sprint 13 puede reutilizarse.

---

## 4. AUTOMATIZACIONES — ESTADO

| Elemento | Estado | Relevancia Sprint 15 |
|---|---|---|
| `automation_rules` tabla | ✅ EXISTE | Base para reglas de retención |
| `automation_templates` tabla | ✅ EXISTE | Templates predefinidos: `client_recovery_60d`, `review_request` |
| `evaluate_and_queue_automations()` RPC | ✅ EXISTE | Motore principal con anti-loop |
| `evaluate_periodic_automations()` RPC | ✅ EXISTE | Evalúa `client_inactive` — base para Sprint 15 |
| `automation-scheduler` Edge Function | ✅ EXISTE | Ejecuta cada minuto |
| Templates específicos de retención avanzada | ⚠️ PARCIAL | `client_recovery_60d` existe; faltan "VIP especial", "recompra detectada", "riesgo alto IA" |

---

## 5. COMUNICACIONES — ESTADO

| Elemento | Estado | Notas |
|---|---|---|
| `communication_log` tabla | ✅ EXISTE | Sprint 12 |
| `get_communication_history` RPC | ✅ EXISTE | Filtrable por entidad |
| `whatsapp.ts` unificado | ✅ EXISTE | Sprint 11 |
| `queue_email_send` RPC | ✅ EXISTE | Sprint 12 |
| Plantilla WhatsApp `review_request` | ✅ EXISTE | `get_whatsapp_message()` soporta este tipo |
| Plantilla WhatsApp "VIP especial" | ❌ FALTA | No existe en `get_whatsapp_message()` |
| Plantilla WhatsApp "recompra detectada" | ❌ FALTA | No existe |

---

## 6. LO QUE FALTA PARA SPRINT 15

### BACKEND (Nuevo)

| Elemento | Justificación |
|---|---|
| `customer_health_scores` tabla | Persistir score 0-100, status (vip/saludable/riesgo/critico/perdido), risk_level |
| `calculate_customer_health(workspace_id, client_id?)` RPC | Motor de scoring — variables: última compra, cotizaciones, aprobadas, valor, días inactivo, seguimientos, aperturas |
| `get_clients_at_risk(workspace_id)` RPC | Detecta 30/60/90 días inactivos — clasifica amarillo/naranja/rojo |
| `get_vip_clients(workspace_id)` RPC | Criterios: mayor facturación, frecuencia, conversión |
| `get_repurchase_opportunities(workspace_id)` RPC | Detecta clientes con patrón de recompra |
| `recalculate_all_health_scores(workspace_id)` RPC | Para llamar desde scheduler |
| Nuevos templates de automatización (VIP, recompra, riesgo IA) | Extender `automation_templates` |
| Trigger: recalcular health score al cambiar actividad del cliente | En `quotes` UPDATE + `seguimientos` INSERT |

### FRONTEND (Nuevo)

| Elemento | Justificación |
|---|---|
| `/app/customer-success` vista | Dashboard Customer Success — mobile first |
| Widgets: Salud clientes, VIP, En riesgo, Oportunidades | Datos desde RPCs backend |
| Widgets adicionales en Dashboard principal | Clientes en riesgo, VIP, recompras probables |
| Integración portal cliente (Sprint 10) | Mostrar historial y beneficios |
| CMS módulo Customer Success | Churn global, retención, salud promedio |

### DEUDA TÉCNICA A CORREGIR

| Deuda | Archivo | Impacto |
|---|---|---|
| Clasificación VIP calculada en frontend | `ClientesMobile.tsx` L54-59 | Viola Zero Trust — debe moverse al backend (health_score) |

---

## 7. RIESGOS IDENTIFICADOS

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | VIP/Recurrente calculado en frontend | 🔴 ALTO | Sprint 15 persiste en `customer_health_scores` y el frontend consume desde backend |
| R2 | IA proactiva consume créditos sin control por cliente | 🟡 MEDIO | Reutilizar `automation_ai_credits_pct` de Sprint 13 + verificar por workspace antes de ejecutar |
| R3 | Health score puede quedar stale entre recálculos | 🟡 MEDIO | Trigger en `quotes` y `seguimientos` recalcula automáticamente |
| R4 | `get_repurchase_opportunities` requiere historial mínimo (≥2 compras) | 🟢 BAJO | Manejar caso sin historial suficiente |
| R5 | `get_clients_report` ya devuelve inactivos — duplicar lógica | 🟢 BAJO | Reutilizar en lugar de crear nueva RPC idéntica |

---

## 8. REUTILIZABLE DIRECTAMENTE EN SPRINT 15

| Componente | Qué reutilizar |
|---|---|
| `clients.total_quotes/approved/value/last_activity_at` | Variables de scoring sin migración nueva |
| `refresh_client_metrics()` trigger | Se ejecuta en cada cambio de quote — health se recalcula automáticamente |
| `get_smart_alerts()` | Detecta lost_clients — extender con health_score |
| `get_clients_report()` | Inactivos/recurrentes/top ya calculados desde backend |
| `evaluate_periodic_automations()` | Agregar `client_health_refresh` como regla periódica |
| `automation-scheduler` | Recalcular health scores cada hora |
| `automation_templates` | Agregar templates VIP/recompra/riesgo sin migración destructiva |
| `aiCommercial.ts` funciones | risk_analysis, recommendations, nextBestAction — no duplicar |
| `communication_log` | Registrar acciones de retención |
| `client_timeline_events` | Mostrar en portal cliente |

---

## 9. FEATURE GATING SPRINT 15

| Feature | FREE | PRO | PREMIUM |
|---|---|---|---|
| Customer Health Score | ❌ | ✅ | ✅ |
| VIP / En riesgo | ❌ | ✅ | ✅ |
| Oportunidades de recompra | ❌ | ✅ | ✅ |
| IA proactiva en retención | ❌ | ✅ (3cr/op, 20%) | ✅ (3cr/op, 30%) |
| Dashboard Customer Success | ❌ | ✅ | ✅ |

**Reutilizar:** `advanced_reports_enabled` (PRO/PREMIUM=true) o crear `customer_success_enabled`. Recomendación: reutilizar `advanced_reports_enabled` — ya es PRO/PREMIUM, no duplicar flag.

---

## 10. CONCLUSIÓN

**Lo que hay:** Métricas de clientes en DB (`total_approved`, `last_activity_at`, `total_value`), IA comercial completa (8 funciones), motor de automatizaciones con scheduler, comunicaciones unificadas, reportes de clientes desde backend.

**Los 2 puntos clave antes de programar:**
1. **Decidir el modelo de score:** ¿Calculado on-demand o persistido en `customer_health_scores`? → Recomiendo persistido + trigger de actualización.
2. **Corregir deuda técnica:** La clasificación VIP/Recurrente en `ClientesMobile.tsx` debe migrar al backend en Sprint 15 (violación Zero Trust existente).

**Autorización para implementar:** Pendiente de aprobación.
