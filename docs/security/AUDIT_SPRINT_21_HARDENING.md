# AUDIT_SPRINT_21_HARDENING.md
# Shelwi — Auditoría de Hardening para Producción
Fecha: 2026-06-23 | Sprints auditados: 1–19

---

## METODOLOGÍA

Revisados: 90 archivos de migración, 10 Edge Functions, 38 servicios frontend, 50+ tablas.
Sin ejecutar código. Sin modificar nada. Análisis estático de código y migraciones.

---

## HALLAZGOS CRÍTICOS 🔴

### C-001: `update_invoice_status()` sin validación de membresía al workspace

**Archivo:** `supabase/migrations/0086_finance_hotfix.sql`, línea 337
**Descripción:**
La función `update_invoice_status(p_workspace_id, ...)` es `SECURITY DEFINER` y tiene `GRANT EXECUTE TO authenticated`. Declara `v_user_id := auth.uid()` pero **nunca valida** que el usuario pertenezca al `p_workspace_id` que se pasa. Cualquier usuario autenticado de cualquier workspace puede llamarla con un workspace_id ajeno.

El UPDATE filtra `WHERE workspace_id = p_workspace_id AND external_invoice_id = p_external_invoice_id`, lo que limita el daño práctico (el atacante necesitaría conocer un `external_invoice_id` válido de otro workspace), pero la violación de Zero Trust es real.

**Impacto:** Un usuario autenticado puede intentar alterar el estado de facturas de otro workspace si adivina o extrae el `external_invoice_id`.
**Riesgo:** 🔴 CRÍTICO
**Fix requerido:** Añadir validación de pertenencia al workspace antes de ejecutar el UPDATE.
```sql
IF NOT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = v_user_id AND workspace_id = p_workspace_id
) THEN
  RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso al workspace');
END IF;
```

---

### C-002: Bucket `logos` sin `file_size_limit` ni `allowed_mime_types`

**Archivo:** `supabase/migrations/0004_storage.sql`, línea 6
**Descripción:**
El bucket `logos` se crea sin restricciones de tamaño ni tipo de archivo:
```sql
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
```
El bucket `evidences` tiene `file_size_limit = 52428800` (50MB) y `allowed_mime_types` restringidos. `logos` no tiene ninguno de los dos.

**Impacto:** Un usuario autenticado puede subir archivos de cualquier tamaño y tipo al bucket de logos de su workspace. Potencial de abuso de almacenamiento y carga de archivos ejecutables (aunque Supabase Storage los sirve con Content-Disposition: attachment, el riesgo persiste).
**Riesgo:** 🔴 CRÍTICO
**Fix requerido:** Actualizar el bucket `logos` para añadir límite de 5MB y restricción a imágenes.

---

### C-003: `WITH CHECK (true)` en tablas con datos sensibles

**Archivos y líneas:**
- `supabase/migrations/0034_quote_views.sql:27` → `quote_views` (anon puede insertar)
- `supabase/migrations/0074_loyalty_reviews_surveys_schema.sql:166` → `reviews` (cualquier auth puede insertar)
- `supabase/migrations/0078_growth_schema.sql:110` → `referral_conversions`
- `supabase/migrations/0078_growth_schema.sql:222` → `promotion_redemptions`

**Descripción:**
Estas políticas permiten insert sin validación de `workspace_id`. El diseño intencional es que los inserts solo lleguen via RPCs `SECURITY DEFINER`, pero si alguien usa la librería Supabase directamente con un token válido, puede insertar en estas tablas con cualquier `workspace_id`.

**Para `quote_views`:** Política anon sin restricción → cualquier request puede inflar contadores de vistas de cualquier cotización.
**Para `reviews`:** Política `WITH CHECK (true)` → cualquier usuario autenticado puede insertar una reseña con cualquier workspace_id.

**Riesgo:**
- `quote_views`: 🔴 CRÍTICO (anon spam)
- `reviews`, `referral_conversions`, `promotion_redemptions`: 🟠 ALTO (auth requerido, pero sin workspace isolation en insert)
**Fix:** Añadir `WITH CHECK (workspace_id = public.current_workspace_id())` a todas las políticas de insert de datos con workspace_id.

---

## HALLAZGOS ALTOS 🟠

### A-001: `automation_templates` sin RLS habilitado

**Archivo:** `supabase/migrations/0068_automations_schema.sql`
**Descripción:**
La tabla `automation_templates` tiene datos de templates globales pero no tiene `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Cualquier usuario autenticado puede hacer `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre ella directamente.

Los templates son datos "de sistema" (read-only para usuarios) pero sin RLS, un usuario podría modificarlos directamente y afectar a todos los workspaces.

**Riesgo:** 🟠 ALTO
**Fix:** Habilitar RLS con política SELECT abierta a todos los autenticados y write solo para super_admin.

---

### A-002: `alegra-webhook` acepta requests sin verificación si el secret no está configurado

**Archivo:** `supabase/functions/alegra-webhook/index.ts`
**Descripción:**
La función solo verifica la firma HMAC si `ALEGRA_WEBHOOK_SECRET` está configurado:
```typescript
if (WEBHOOK_SECRET) { /* verifica */ }
```
Si el secret NO está en los Supabase Secrets de producción (que es el caso actual), cualquier request HTTP a la URL del webhook actualiza estados de facturas sin autenticación. El único control es que la función consulta el workspace_id desde la DB basado en `external_invoice_id`, pero un atacante que conozca IDs puede alterar estados.

**Riesgo:** 🟠 ALTO
**Fix:** Configurar `ALEGRA_WEBHOOK_SECRET` antes de desplegar en producción. O añadir un check de IP de origen de Alegra como backup.

---

### A-003: CORS wildcard en todas las Edge Functions

**Archivos:** `supabase/functions/_shared/cors.ts` y todos los Edge Functions
**Descripción:**
```typescript
'Access-Control-Allow-Origin': '*'
```
Para funciones que requieren JWT (create-checkout, ai-proxy, etc.), el wildcard no es un riesgo directo de seguridad porque las solicitudes sin un token válido son rechazadas. Sin embargo, el wildcard permite que cualquier dominio haga preflight requests y reciba las respuestas de error, exponiendo información sobre la existencia de endpoints.

Para producción, debería restringirse al dominio de la app (`https://app.shelwi.com`).

**Riesgo:** 🟠 ALTO (información disclosure, best practice violation)
**Fix:** Cambiar `'Access-Control-Allow-Origin': '*'` → `'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? 'https://app.shelwi.com'`

---

### A-004: DW Views de Sprint 19 son públicamente consultables

**Archivo:** `supabase/migrations/0088_bi_views_analytics.sql`
**Descripción:**
Las vistas `dw_sales`, `dw_operations`, `dw_finance`, `dw_marketing` son vistas SQL regulares (no materializadas, no SECURITY DEFINER). Cualquier usuario autenticado puede hacer `SELECT * FROM dw_sales` directamente. La protección viene del RLS de las tablas subyacentes, lo que significa que cada usuario solo ve sus propios datos.

**Sin embargo:** Las vistas no tienen documentación de acceso ni restricción explícita. Un desarrollador que las descubra podría usarlas directamente en lugar de los RPCs del KPI Engine, obteniendo datos sin los controles adicionales (feature gating, rate limits).

**Riesgo:** 🟠 ALTO (by design pero sin restricción formal)
**Fix:** Documentar explícitamente que son internal. O añadir `REVOKE SELECT ON dw_* FROM authenticated` y usar solo desde RPCs.

---

### A-005: `saas_invoices` RLS con subquery en cada fila

**Archivo:** `supabase/migrations/0086_finance_hotfix.sql`
**Descripción:**
```sql
USING (
  workspace_id = (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
)
```
Esta subquery se ejecuta por cada fila evaluada. Debería usar `public.current_workspace_id()` (función cacheada/stable) en lugar de una subquery directa.

**Riesgo:** 🟠 ALTO (performance a escala)
**Fix:** `USING (workspace_id = public.current_workspace_id())`

---

## HALLAZGOS MEDIOS 🟡

### M-001: `get_ops_productivity` usa `ANY(ARRAY_AGG())` en subquery correlacionada

**Archivo:** `supabase/migrations/0088_bi_views_analytics.sql`
**Descripción:**
El conteo de evidencias usa:
```sql
'evidences_count', COALESCE((
  SELECT COUNT(*)::int
  FROM public.evidence_files ef
  WHERE ef.workspace_id = p_workspace_id
    AND ef.work_order_id = ANY(ARRAY_AGG(dwo.id))
), 0)
```
Esto ejecuta `ARRAY_AGG(dwo.id)` como subquery correlacionada por cada empleado. Con 50 empleados y 1000 OTs cada uno, puede ser lento.

**Riesgo:** 🟡 MEDIO (performance con equipos grandes)
**Fix:** Usar JOIN con subquery precalculada.

---

### M-002: `automation_logs` sin índice por `workspace_id + created_at`

**Archivo:** `supabase/migrations/0068_automations_schema.sql`
**Descripción:**
`automation_logs` tiene índice por `rule_id` pero no por `(workspace_id, created_at DESC)`. Al paginar los logs de un workspace en la UI de Automatizaciones, hace full scan filtrado por rule_id → workspace_id.

**Riesgo:** 🟡 MEDIO (performance con muchas automatizaciones)
**Fix:** `CREATE INDEX idx_automation_logs_workspace ON automation_logs(workspace_id, created_at DESC);`

---

### M-003: `get_full_funnel` no tiene feature gating para plan FREE

**Archivo:** `supabase/migrations/0090_bi_cohorts_funnel.sql`
**Descripción:**
`get_full_funnel()` no verifica plan ni features. Cualquier plan puede usarla. `get_client_cohorts()` sí verifica `advanced_reports_enabled`, pero el funnel completo no.

**Riesgo:** 🟡 MEDIO (feature leak en plan FREE)
**Fix:** Añadir check de `advanced_reports_enabled`.

---

### M-004: `token` de Portal del Cliente no expira proactivamente al revocar sesión

**Archivo:** `supabase/migrations/0059_portal_schema.sql`
**Descripción:**
Los `client_portal_tokens` tienen `expires_at` pero no hay ningún job que invalide tokens de sesiones que se queden activas más allá del período esperado si el token fue revocado manualmente.

**Riesgo:** 🟡 MEDIO
**Fix:** pg_cron job semanal para limpiar tokens vencidos.

---

### M-005: `gps_events` — sin rate limit por usuario

**Archivo:** `supabase/migrations/0057_gps_schema.sql`
**Descripción:**
No existe control de frecuencia en la función `record_gps_event()`. Un operario podría enviar miles de eventos GPS por minuto. Los events se registran directamente.

**Riesgo:** 🟡 MEDIO (abuso de storage, costo)
**Fix:** Añadir check de tiempo mínimo entre eventos del mismo usuario (ej: 30 segundos).

---

### M-006: `utm_events` sin deduplicación de visitas

**Archivo:** `supabase/migrations/0079_growth_rpc.sql` (`track_referral_visit`)
**Descripción:**
`track_referral_visit` incrementa `visits_count` y crea un `utm_event` por cada llamada. Sin control de bots o visitas duplicadas en ventana de tiempo corta, un bot puede inflar métricas de referidos.

**Riesgo:** 🟡 MEDIO
**Fix:** Añadir cooldown de IP o session_id en el tracking.

---

### M-007: `mp-webhook` no verifica firma de MercadoPago

**Archivo:** `supabase/functions/mp-webhook/index.ts`
**Descripción:**
El webhook valida el pago directamente llamando a la API de MP (`GET /v1/payments/:id`), lo cual es correcto. Sin embargo, no verifica la firma HMAC del header `x-signature` que MercadoPago envía. Si alguien conoce el endpoint, puede enviar notificaciones falsas con payment IDs reales de otros merchants.

La mitigación actual (verificar directamente en MP API) es suficiente, pero la verificación de firma añade una capa adicional de seguridad.

**Riesgo:** 🟡 MEDIO
**Fix:** Implementar verificación de `x-signature` header de MercadoPago.

---

### M-008: `dw_operations` vista usa `o.deleted_at IS NULL` pero no filtra OTs canceladas de pedidos eliminados

**Archivo:** `supabase/migrations/0088_bi_views_analytics.sql`
**Descripción:**
La vista `dw_operations` une `work_orders` con `orders WHERE o.deleted_at IS NULL`. Las OTs de pedidos eliminados (soft delete) no aparecen, pero las OTs propias no tienen `deleted_at`.

**Riesgo:** 🟡 BAJO-MEDIO (datos históricos inconsistentes)

---

## HALLAZGOS BAJOS 🔵

### B-001: `KtzIA.tsx` tiene nombre de marca anterior (Brivia/KTZ)

**Archivo:** `src/views/KtzIA.tsx`
**Descripción:** El archivo usa el nombre legacy `KtzIA` (Brivia → KTZ360 → Shelwi). Deuda técnica de rebranding.
**Riesgo:** 🔵 BAJO

---

### B-002: `WhatsApp` tiene 2 implementaciones paralelas

**Archivos:** `src/lib/calc.ts` (openWhats), `src/lib/shareUtils.ts` (openWhatsAppShare deprecated), `src/services/whatsapp.ts`
**Descripción:** Tres implementaciones distintas para abrir WhatsApp. Documentado como deuda técnica desde Sprint 12.
**Riesgo:** 🔵 BAJO

---

### B-003: Migraciones con números duplicados (0021, 0034, 0053)

**Descripción:** Existen migraciones con números duplicados que contienen seed data de test vs schema real.
**Riesgo:** 🔵 BAJO (en producción solo se aplica una versión)

---

### B-004: `automation_templates` (category check) requiere migración manual al agregar nuevas categorías

**Descripción:** Cada nueva categoría de template requiere `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT`. Proceso manual propenso a errores.
**Riesgo:** 🔵 BAJO

---

### B-005: `saas_invoices.status = 'pending_config'` podría acumular registros sin resolver

**Descripción:** Sin la cuenta Alegra de Shelwi configurada, cada pago genera un registro `pending_config`. Sin cleanup automático ni alerta cuando hay muchos pendientes.
**Riesgo:** 🔵 BAJO (deuda operacional)

---

## VERIFICACIONES QUE PASARON ✅

| Control | Resultado |
|---------|-----------|
| `SECURITY DEFINER` + `SET search_path = public` | ✅ Todas las funciones auditadas lo tienen |
| `auth.uid()` para derivar workspace_id | ✅ Correcto en todas las RPCs críticas |
| Zero Trust en create-checkout | ✅ workspace_id del JWT, nunca del body |
| Zero Trust en mp-webhook | ✅ Verifica directamente en MP API |
| Credenciales Alegra cifradas AES-256-GCM | ✅ Solo accesibles desde integration-worker |
| Anti-loop en automatizaciones (execution_depth ≤ 3) | ✅ Implementado en 0069 |
| Storage quota tracking O(1) | ✅ Trigger en workspaces.storage_used_bytes |
| AI credits control en backend | ✅ check_ai_credits() + consume_ai_credits() antes de llamar Gemini |
| max_tokens acotados en todas las funciones IA | ✅ Máximo 600 tokens por request |
| MAX_EVENTS_PER_RUN = 5 en integration-worker | ✅ Evita timeout de 30s |
| Execution budget (25s) en integration-worker | ✅ Safety guard activo |
| Soft delete en quotes/clients/orders/evidences | ✅ deleted_at present |
| RLS en tablas de datos sensibles | ✅ 72+ tablas con RLS habilitado |
| feature-gating por plan en RPCs críticas | ✅ 76+ verificaciones check_feature_access |
| Workspace isolation en Storage (logos, attachments) | ✅ foldername()[1] = workspace_id |
| `current_workspace_id()` como función helper RLS | ✅ SECURITY DEFINER, STABLE |
| Idempotencia en payment_events | ✅ UNIQUE(payment_id, status) |
| register_saas_invoice REVOKE PUBLIC | ✅ Solo service_role |
| gps_events / member_locations con RLS | ✅ Verificado |

---

## RESUMEN DE PRIORIDADES

| # | ID | Clasificación | Fix urgente antes de producción |
|---|----|--------------|--------------------------------|
| 1 | C-001 | 🔴 CRÍTICO | `update_invoice_status` sin auth check |
| 2 | C-002 | 🔴 CRÍTICO | Bucket `logos` sin límites |
| 3 | C-003 | 🔴 CRÍTICO | `WITH CHECK (true)` en tablas sensibles |
| 4 | A-001 | 🟠 ALTO | `automation_templates` sin RLS |
| 5 | A-002 | 🟠 ALTO | `alegra-webhook` sin verificación en producción |
| 6 | A-003 | 🟠 ALTO | CORS wildcard en Edge Functions |
| 7 | A-004 | 🟠 ALTO | DW Views públicamente consultables |
| 8 | A-005 | 🟠 ALTO | RLS subquery lenta en saas_invoices |
| 9 | M-001 | 🟡 MEDIO | get_ops_productivity subquery ineficiente |
| 10 | M-002 | 🟡 MEDIO | automation_logs sin índice workspace |
| 11 | M-003 | 🟡 MEDIO | get_full_funnel sin feature gate |
| 12 | M-007 | 🟡 MEDIO | mp-webhook sin verificación de firma MP |
