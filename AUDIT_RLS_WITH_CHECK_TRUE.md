# AUDITORÍA RLS — WITH CHECK (true)
**Fecha:** 23 de junio de 2026  
**Metodología:** Lectura exhaustiva de todas las migraciones. Sin modificaciones durante auditoría.

---

## INVENTARIO COMPLETO

### WITH CHECK (true) — 11 ocurrencias encontradas

| # | Tabla | Migración | Línea | Estado | Riesgo |
|---|-------|-----------|-------|--------|--------|
| 1 | `quote_views` | 0034 | 27 | ⚠️ ACTIVO | 🔴 CRÍTICO |
| 2 | `portal_access_log` | 0059 | 180 | ⚠️ ACTIVO | 🟠 ALTO |
| 3 | `integration_events` | 0062 | 176 | ⚠️ ACTIVO | 🟠 ALTO |
| 4 | `communication_log` | 0065 | 151 | ⚠️ ACTIVO | 🟠 ALTO |
| 5 | `loyalty_transactions` | 0074 | 97 | ⚠️ ACTIVO | 🟠 ALTO |
| 6 | `reviews` | 0074 | 166 | ✅ FIXADO en 0091 | — |
| 7 | `survey_responses` | 0074 | 261 | ⚠️ ACTIVO | 🟠 ALTO |
| 8 | `referral_links` | 0078 | 74 | ⚠️ ACTIVO | 🟡 MEDIO |
| 9 | `referral_conversions` | 0078 | 110 | ✅ FIXADO en 0091 | — |
| 10 | `utm_events` | 0078 | 150 | ⚠️ ACTIVO (público intencional) | 🟡 MEDIO |
| 11 | `promotion_redemptions` | 0078 | 222 | ⚠️ ACTIVO | 🟡 MEDIO |

### USING (true) — SELECT only — todos intencionales y seguros

| Tabla | Migración | Justificación | Riesgo |
|-------|-----------|--------------|--------|
| `plans` | 0003 | Catálogo público (precios en landing page) | 🟢 NINGUNO |
| Catalog tables (v2) | 0006 | Catálogo global del sistema (solo lectura) | 🟢 NINGUNO |
| `plan_features` | 0016 | Comparativa pública de features | 🟢 NINGUNO |
| `plan_limits` | 0016 | Comparativa pública de límites | 🟢 NINGUNO |
| `ai_operation_costs` | 0038 | Créditos por operación (informativo) | 🟢 NINGUNO |
| `automation_templates` | 0091 | Templates globales del sistema | 🟢 NINGUNO |

---

## ANÁLISIS INDIVIDUAL — WITH CHECK (true) activos

---

### #1 — `quote_views` INSERT
**Migración:** 0034_quote_views.sql:27  
**Por qué existe:** La tabla registra cuándo los clientes abren el portal público de cotizaciones. El portal es completamente anónimo (no requiere login). La inserción ocurre desde `src/services/quoteViews.ts:35` mediante `supabase.from('quote_views').insert(...)` directamente (sin RPC).  
**Fue creado por:** Necesidad técnica del portal público anónimo.  
**Riesgo real:**
- Cualquier persona (anon) puede insertar `quote_views` con CUALQUIER `quote_id` válido
- Un atacante podría spam-insertar miles de vistas falsas para cualquier cotización
- Infla métricas del dashboard CRM y puede disparar triggers falsos (trg_quote_views_crm)
- Puede manipular `commercial_status` de cotizaciones al cambiarlas a 'vista'

**¿Puede reemplazarse?** ✅ SÍ — Crear RPC `register_quote_view()` con SECURITY DEFINER que valide que el `quote_id` pertenece a una cotización válida (no eliminada) antes de insertar.  
**0091 ya identificó este problema:** "Fix real recomendado: crear RPC SECURITY DEFINER para registrar vistas en lugar de INSERT directo desde frontend."

---

### #2 — `portal_access_log` INSERT
**Migración:** 0059_portal_schema.sql:180  
**Por qué existe:** Log de acceso al portal del cliente. Comentario dice "validado en la RPC".  
**Riesgo real:** Un usuario autenticado en el workspace A podría insertar registros de acceso con `workspace_id` del workspace B. Esto contamina métricas de analítica.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL` (solo RPCs SECURITY DEFINER y service_role pueden insertar).

---

### #3 — `integration_events` INSERT
**Migración:** 0062_integrations_schema.sql:176  
**Por qué existe:** Cola de eventos de integración. Comentario dice "validado por RPCs".  
**Riesgo real:** Un usuario autenticado podría insertar eventos de integración con workspace_id ajeno, disparando automatizaciones o integraciones de otro workspace.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL`.

---

### #4 — `communication_log` INSERT
**Migración:** 0065_integrations_s12_schema.sql:151  
**Por qué existe:** Log de comunicaciones (WhatsApp, Gmail, Outlook). Comentario dice "validado por RPCs".  
**Riesgo real:** Similar al anterior. Contaminación de historial de comunicaciones de otro workspace.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL`.

---

### #5 — `loyalty_transactions` INSERT
**Migración:** 0074_loyalty_reviews_surveys_schema.sql:97  
**Por qué existe:** Historial de puntos de fidelización. Comentario dice "validado por RPCs security definer".  
**Riesgo real:** Un usuario autenticado podría otorgarse puntos a sí mismo en cualquier workspace, o manipular puntos de otro workspace.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL`.

---

### #6 — `reviews` INSERT
**Estado:** ✅ FIXADO en migración 0091_hardening.sql  
**Fix aplicado:** La política fue reemplazada con `auth.uid() IS NULL OR EXISTS(workspace membership)`.

---

### #7 — `survey_responses` INSERT
**Migración:** 0074_loyalty_reviews_surveys_schema.sql:261  
**Por qué existe:** Respuestas a encuestas, via RPC con token de portal.  
**Riesgo real:** Un usuario autenticado podría enviar respuestas falsas a encuestas de otro workspace.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL`.

---

### #8 — `referral_links` INSERT
**Migración:** 0078_growth_schema.sql:74  
**Por qué existe:** Links de referidos, via RPC.  
**Riesgo real:** Menor. Un usuario autenticado podría crear links de referidos para otro workspace.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL`.

---

### #9 — `referral_conversions` INSERT
**Estado:** ✅ FIXADO en migración 0091_hardening.sql  
**Fix aplicado:** La política fue reemplazada con `auth.uid() IS NULL OR EXISTS(workspace membership)`.

---

### #10 — `utm_events` INSERT
**Migración:** 0078_growth_schema.sql:150  
**Por qué existe:** Tracking de fuentes UTM para analítica de adquisición. El comentario dice "público (tracking sin auth)". Ocurre antes del login cuando alguien visita la landing page.  
**Riesgo real:** Cualquier entidad anónima puede insertar UTM data con cualquier `workspace_id`, corrompiendo métricas de adquisición.  
**Caso especial:** La naturaleza de UTM tracking requiere inserción anónima (pre-login). No es posible requerir auth.uid() IS NULL porque legítimamente viene de anon.  
**¿Puede reemplazarse?** ⚠️ PARCIALMENTE — Agregar validación de que `workspace_id` pertenece a un workspace activo existente. Elimina workspaces inventados pero mantiene la capacidad de tracking anónimo.

---

### #11 — `promotion_redemptions` INSERT
**Migración:** 0078_growth_schema.sql:222  
**Por qué existe:** Canjes de promociones/cupones, via RPC.  
**Riesgo real:** Un usuario autenticado podría registrar canjes en workspaces ajenos.  
**¿Puede reemplazarse?** ✅ SÍ — `auth.uid() IS NULL`.

---

## PATRÓN DE SOLUCIÓN

Para tablas cuyas inserciones ocurren SOLO mediante RPCs SECURITY DEFINER:

```sql
-- Antes (inseguro):
WITH CHECK (true)

-- Después (seguro):
WITH CHECK (auth.uid() IS NULL)
```

**Por qué funciona:**
- Las RPCs con `SECURITY DEFINER` se ejecutan como el schema owner (postgres)
- En ese contexto, `auth.uid()` retorna NULL
- Los usuarios autenticados que intentan insertar directamente tienen `auth.uid()` != NULL → BLOQUEADOS
- `service_role` también tiene `auth.uid()` = NULL → PERMITIDO
- Anon con token JWT también tiene `auth.uid()` = NULL → PERMITIDO (para portales públicos)

Para `quote_views` (inserción desde portal anon vía PostgREST):
- Anon también tiene `auth.uid()` = NULL — la política `auth.uid() IS NULL` no bloquea anon
- Solución correcta: RPC `register_quote_view()` con validación de `quote_id` existente

Para `utm_events` (tracking público pre-login):
- Mantener inserción anon pero validar que `workspace_id` existe en la tabla workspaces

---

## RESUMEN DE ACCIONES

| # | Tabla | Acción | Tipo |
|---|-------|--------|------|
| 1 | `quote_views` | Crear RPC + cambiar policy | 🔴 CRÍTICO — requiere cambio frontend |
| 2 | `portal_access_log` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 3 | `integration_events` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 4 | `communication_log` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 5 | `loyalty_transactions` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 7 | `survey_responses` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 8 | `referral_links` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 10 | `utm_events` | Agregar workspace EXISTS check | 🟡 SQL only |
| 11 | `promotion_redemptions` | Cambiar a `auth.uid() IS NULL` | 🟠 SQL only |
| 6 | `reviews` | YA FIXADO en 0091 | ✅ Done |
| 9 | `referral_conversions` | YA FIXADO en 0091 | ✅ Done |
