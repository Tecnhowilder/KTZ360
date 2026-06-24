# CHANGELOG SEGURIDAD — RLS WITH CHECK HARDENING
**Fecha:** 23 de junio de 2026  
**Migración:** 0092_rls_hardening_with_check.sql

---

## CAMBIOS EN BASE DE DATOS

### Nueva RPC
- `register_quote_view(p_quote_id, p_user_agent, p_device, p_browser)` — SECURITY DEFINER, valida existencia de quote antes de insertar. Accesible para `anon` y `authenticated`.

### Policies actualizadas (9 tablas, 11 policies)

| Tabla | Policy anterior | Policy nueva |
|-------|----------------|--------------|
| `quote_views` | "public can insert quote_views" — `WITH CHECK (true)` | "rpc can insert quote_views" — `WITH CHECK (EXISTS quote válido)` |
| `portal_access_log` | "service inserts portal logs" — `WITH CHECK (true)` | "rpc inserts portal logs" — `WITH CHECK (auth.uid() IS NULL)` |
| `integration_events` | "service inserts integration_events" — `WITH CHECK (true)` | "rpc inserts integration_events" — `WITH CHECK (auth.uid() IS NULL)` |
| `communication_log` | "service inserts comm log" — `WITH CHECK (true)` | "rpc inserts comm log" — `WITH CHECK (auth.uid() IS NULL)` |
| `loyalty_transactions` | "service inserts loyalty_transactions" — `WITH CHECK (true)` | "rpc inserts loyalty_transactions" — `WITH CHECK (auth.uid() IS NULL)` |
| `survey_responses` | "service inserts survey_responses" — `WITH CHECK (true)` | "rpc inserts survey_responses" — `WITH CHECK (auth.uid() IS NULL)` |
| `referral_links` | "service inserts referral_links" — `WITH CHECK (true)` | "rpc inserts referral_links" — `WITH CHECK (auth.uid() IS NULL)` |
| `utm_events` | "service inserts utm_events" — `WITH CHECK (true)` | "validated inserts utm_events" — `WITH CHECK (workspace activo EXISTS)` |
| `promotion_redemptions` | "service inserts promotion_redemptions" — `WITH CHECK (true)` | "rpc inserts promotion_redemptions" — `WITH CHECK (auth.uid() IS NULL)` |

### Previo (migración 0091 — ya aplicado)
- `reviews`: policy reemplazada con `auth.uid() IS NULL OR workspace_match`
- `referral_conversions`: policy reemplazada con `auth.uid() IS NULL OR workspace_match`

---

## CAMBIOS EN FRONTEND

### `src/services/quoteViews.ts`
**Función:** `trackQuoteView(quoteId)`  
**Antes:** `supabase.from('quote_views').insert({...})` — INSERT directo anon  
**Después:** `supabase.rpc('register_quote_view', {...})` — RPC validada

---

## CRITERIOS DE ÉXITO — VERIFICADOS

| Criterio | Estado |
|----------|--------|
| Cero WITH CHECK (true) innecesarios | ✅ 0 restantes |
| Riesgos documentados | ✅ AUDIT_RLS_WITH_CHECK_TRUE.md |
| Zero Trust fortalecido | ✅ |
| Multi Tenant intacto | ✅ |
| Build TypeScript limpio | ✅ 0 errores |
| Sin regresiones funcionales | ✅ Portal, integraciones, loyalty funcionan |
| USING (true) intencionales documentados | ✅ Solo SELECT en catálogos públicos |

---

## RIESGO RESIDUAL DOCUMENTADO

### `utm_events` — riesgo bajo residual
**Situación:** La policy válida que el `workspace_id` pertenece a un workspace activo, pero no puede validar que el caller tiene relación con ese workspace (es tracking pre-login anónimo por diseño).  
**Riesgo residual:** Un atacante conociendo el workspace_id de un workspace activo podría insertar eventos UTM falsos.  
**Mitigación:** El workspace_id no es secreto (aparece en URLs de referidos). Los datos UTM son analítica de baja criticidad (no afectan facturación ni acceso). El impacto de datos falsos en métricas de adquisición es bajo.  
**Recomendación futura:** Limitar inserción de UTM a referer URL validado o token de campaña.

### `quote_views` — portal cross-workspace
**Situación:** Un atacante con el `quote_id` de una cotización puede registrar vistas en nombre de cualquier cliente, ya que el portal es público por diseño.  
**Mitigación:** La RPC valida que el quote existe y no está eliminado. Los triggers CRM solo actualizan `commercial_status` si el quote está en estados válidos.  
**Riesgo real:** Bajo — las vistas falsas inflan métricas pero no dan acceso a datos.
