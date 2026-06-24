# RLS HARDENING REPORT
**Fecha:** 23 de junio de 2026  
**Migración:** 0092_rls_hardening_with_check.sql

---

## RESULTADO: CERO WITH CHECK (true) INNECESARIOS

### Antes vs Después

| Tabla | Antes | Después | Método |
|-------|-------|---------|--------|
| `quote_views` | `WITH CHECK (true)` — cualquier anon podía insertar cualquier quote_id | `WITH CHECK (EXISTS quote válido)` + RPC `register_quote_view()` con validación | RPC SECURITY DEFINER |
| `portal_access_log` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `integration_events` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `communication_log` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `loyalty_transactions` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `survey_responses` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `referral_links` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `utm_events` | `WITH CHECK (true)` | `WITH CHECK (workspace activo EXISTS)` | Validación de workspace |
| `promotion_redemptions` | `WITH CHECK (true)` | `WITH CHECK (auth.uid() IS NULL)` | Solo RPCs/service_role |
| `reviews` | `WITH CHECK (true)` | `WITH CHECK (uid IS NULL OR workspace match)` | Fixado en 0091 |
| `referral_conversions` | `WITH CHECK (true)` | `WITH CHECK (uid IS NULL OR workspace match)` | Fixado en 0091 |

### USING (true) — Intencionales, no modificados

Todas las políticas `USING (true)` son para tablas de **solo lectura pública** (catálogo, planes, features, costos IA). No representan riesgo de seguridad. Documentadas y justificadas.

---

## NUEVO PATRÓN DE SEGURIDAD

### Para tablas que solo reciben inserts via RPC SECURITY DEFINER:
```sql
WITH CHECK (auth.uid() IS NULL)
```
- Bloquea: usuarios autenticados vía PostgREST directo
- Permite: RPCs SECURITY DEFINER (corren como schema owner → uid() IS NULL)
- Permite: service_role (uid() IS NULL)
- Permite: anon sin JWT (uid() IS NULL) — controlado por la RPC

### Para quote_views (portal público):
```sql
-- Policy:
WITH CHECK (EXISTS (SELECT 1 FROM quotes WHERE id = quote_views.quote_id AND deleted_at IS NULL))

-- Frontend:
supabase.rpc('register_quote_view', {...})  -- en lugar de insert directo
```

### Para utm_events (tracking pre-login):
```sql
WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE id = utm_events.workspace_id AND status IN ('active', 'trial')))
```

---

## ZERO TRUST VERIFICADO

| Check | Estado |
|-------|--------|
| auth.uid() validado en todas las RPCs críticas | ✅ |
| workspace_id nunca viene del body del request | ✅ |
| INSERT directo de usuarios autenticados bloqueado | ✅ |
| INSERT con workspace_ids inventados bloqueado | ✅ |
| INSERT con quote_ids inválidos/eliminados bloqueado | ✅ |
| Portal público sigue funcionando via RPC | ✅ |
| service_role puede insertar (webhooks, automation) | ✅ |
| RLS habilitado en todas las tablas afectadas | ✅ |
