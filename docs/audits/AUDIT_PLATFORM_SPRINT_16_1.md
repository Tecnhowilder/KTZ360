# AUDITORÍA GLOBAL DE CONSOLIDACIÓN — PLATAFORMA SHELWI
# Sprint 1 → Sprint 16

**Fecha:** 2026-06-22  
**Alcance:** 78 migraciones SQL · 10 Edge Functions · 37 servicios TypeScript · 18 hooks · 67 componentes · 25 vistas  
**Propósito:** Preparar para producción real, escalabilidad multi-tenant y Sprint 17 Growth.

---

## RESUMEN EJECUTIVO

| Categoría | Hallazgos totales | Críticos | Altos | Medios | Bajos |
|---|---|---|---|---|---|
| Base de datos | 12 | 3 | 4 | 3 | 2 |
| RPCs | 8 | 1 | 3 | 3 | 1 |
| RLS | 5 | 2 | 2 | 1 | 0 |
| Feature Flags | 4 | 0 | 1 | 2 | 1 |
| Automatizaciones | 3 | 1 | 1 | 1 | 0 |
| Integraciones | 6 | 0 | 2 | 3 | 1 |
| Frontend | 11 | 1 | 4 | 4 | 2 |
| IA | 3 | 0 | 1 | 1 | 1 |
| CMS | 4 | 0 | 2 | 2 | 0 |
| Portal Cliente | 3 | 1 | 1 | 1 | 0 |

---

## 1. BASE DE DATOS

### 🔴 RIESGO CRÍTICO

**C-DB-01: Numeración de migraciones duplicada y gap**
- Existen migraciones duplicadas: `0021_seed_test_users.sql` y `0021_seed_test_users_cleanup.sql`
- Migraciones duplicadas: `0034_quote_revisions.sql` y `0034_quote_views.sql`
- Migraciones duplicadas: `0053_admin_sprint9.sql` y `0053_evidences_schema.sql`
- Gap: no existe `0028_*.sql`
- **Impacto:** El CLI de Supabase puede aplicar migraciones en orden incorrecto o fallar.
- **Acción:** Renombrar para resolver colisiones. No crítico para BD ya aplicada, pero bloquea futuros `supabase db push`.

**C-DB-02: Archivos de seed y datos de prueba en migraciones de producción**
- `0021_seed_test_users.sql` → INSERT de usuarios de prueba
- `0021_seed_test_users_cleanup.sql` → DELETE de test users
- `0023_seed_clients_free_test.sql` → INSERT de clientes ficticios
- `0024_fix_subscription_status_seed.sql` → datos de prueba
- **Impacto:** Si se aplican en un workspace de producción, crean datos falsos que confunden al cliente.
- **Acción:** Mover a directorio `supabase/seeds/` separado. NO aplicar en producción.

**C-DB-03: Numeración de cotizaciones hardcodeada como 'BRI-'**
- En `0001_schema.sql` línea 267: `return 'BRI-' || v_year::text || ...`
- La función `next_quote_number()` usa el prefijo "BRI-" del nombre anterior "Brivia", no "Shelwi"
- **Impacto:** Cotizaciones generadas tienen número "BRI-2026-000001" — inconsistente con la marca Shelwi
- **Acción:** Migración de fix para cambiar a 'SHW-' o hacerlo configurable por workspace

### 🟠 RIESGO ALTO

**A-DB-01: Tablas `leads` y `projects` sin uso alguno**
- Tabla `leads` — definida en `0001_schema.sql`. No existe ningún service, hook, ni vista que la consuma.
- Tabla `projects` — definida en `0001_schema.sql`. No existe ningún service, hook, ni vista que la consuma.
- **Impacto:** Peso muerto. Confunde al equipo de desarrollo. Nadie sabe si están en uso.
- **Acción:** Documentar como "reservado para futuro" o eliminar en migración de limpieza.

**A-DB-02: Tabla `attachments` (legacy) sin integración con sistema de cuotas**
- Tabla `attachments` en `0001_schema.sql` — existe pero no está conectada al sistema de cuotas de `storage_used_bytes`.
- `evidence_files` reemplazó a `attachments` en Sprint 7, pero la tabla sigue presente.
- **Impacto:** Archivos subidos vía `attachments` no contarían contra la cuota. Potencial bypass.
- **Acción:** Deshabilitar el bucket `attachments` o agregar cuota a la tabla.

**A-DB-03: Tabla `service_materials` sin uso en frontend**
- Tabla `service_materials` en `0001_schema.sql` — no se usa en ningún servicio TypeScript.
- **Impacto:** Tabla muerta. Puede confundir a futuras consultas del catálogo.

**A-DB-04: Tabla `workspace_features` (legacy) reemplazada pero no eliminada**
- Tabla `workspace_features` en `0001_schema.sql` — tenía ai_enabled, photo_quote_enabled, multiuser_enabled, advanced_reports_enabled.
- Fue reemplazada por `plan_features` (por plan, no por workspace) desde Sprint 1.1
- `getWorkspaceFeatures()` en `workspaces.ts` aún la consulta pero nunca se llama desde ninguna vista.
- **Impacto:** Tabla zombie — existe, tiene datos, pero no se usa. Puede inducir a error si alguien la modifica pensando que afecta el comportamiento.

### 🟡 RIESGO MEDIO

**M-DB-01: Trigger redundante — `trg_quotes_timeline_on_status` y `trg_quotes_automation_dispatch`**
- Sprint 4 creó `trg_quotes_timeline_on_status` (registra en `client_timeline_events`)
- Sprint 13 creó `trg_quotes_automation_dispatch` (evalúa reglas de automatización)
- Ambos se ejecutan en `UPDATE OF status ON quotes`
- **Impacto:** Doble ejecución en cada cambio de estado. Ineficiente pero sin efecto duplicado visible (diferentes acciones).
- **Acción:** Consolidar en un solo trigger multi-propósito.

**M-DB-02: `trg_quote_views_crm` y `trg_quote_views_automation` en `quote_views`**
- Sprint 4 creó `trg_quote_views_crm` (actualiza commercial_status + notificación)
- Sprint 13 creó `trg_quote_views_automation` (dispara reglas de automatización)
- Ambos en AFTER INSERT on `quote_views`
- **Impacto:** Doble ejecución. El trigger CRM ya notifica; el automation también puede notificar. Posible doble notificación.

**M-DB-03: `expires_at` en `quote_access_tokens` no validado en RPC más reciente**
- `get_public_quote()` en `0019_feature_enforcement.sql` valida `expires_at > now()` ← corregido en Sprint 10
- Pero si alguien llama directamente a la tabla (no a la RPC), puede acceder con token vencido
- **Impacto:** RLS no valida expiración — la validación está solo en la RPC

### 🟢 RIESGO BAJO

**L-DB-01: Índice `idx_orders_number` con UNIQUE — duplicado con constraint UNIQUE existente**
- En `0050_orders_schema.sql`: `create unique index idx_orders_number on public.orders(workspace_id, order_number)` AND `unique (workspace_id)` en contadores. Revisar si hay duplicidad real.

**L-DB-02: `recalculate_workspace_storage()` sin cron configurado**
- Función existe (Sprint 7) para corregir drift de `storage_used_bytes`, pero no tiene cron. Solo el cleanup del automation-scheduler la llama.

---

## 2. RPCs

### 🔴 RIESGO CRÍTICO

**C-RPC-01: RPC `submit_survey_response` y `submit_review` con `with check (true)` en policies**
- Las policies de INSERT en `reviews` y `survey_responses` tienen `with check (true)` (cualquier insert pasa)
- La validación real está en la RPC (security definer), pero si alguien accede via service_role directamente, puede insertar datos sin validar token.
- **Impacto:** Aceptable si nunca se expone service_role al cliente. Riesgo si hay una brecha de credenciales.

### 🟠 RIESGO ALTO

**A-RPC-01: `getWorkspaceFeatures()` en `workspaces.ts` — función expuesta pero no usada**
- Exportada en `workspaces.ts` pero no se importa en ninguna vista ni hook.
- Consulta `workspace_features` (tabla legacy).

**A-RPC-02: `automation-scheduler` edge function llama `expire_overdue_quotes()` — función existe desde Sprint 4 sin prueba de producción**
- La función `expire_overdue_quotes()` puede cambiar estados de cotizaciones en masa.
- Sin límite de tasa ni protección contra ejecución múltiple concurrente.

**A-RPC-03: `assign_loyalty_points` puede llamarse sin verificación de `loyalty_enabled` desde integrations**
- La RPC verifica `loyalty_enabled`, pero `submit_review` también llama `assign_loyalty_points` internamente.
- Si `loyalty_enabled` se desactiva después de una reseña, los puntos igual se asignan si hay una race condition.

### 🟡 RIESGO MEDIO

**M-RPC-01: `get_whatsapp_message()` usa `encode(v_message::bytea, 'escape')` para URL — inseguro**
- El encoding de la URL del mensaje WhatsApp usa `'escape'` en lugar de `url_encode`. Puede generar caracteres incorrectos en mensajes con emojis o caracteres especiales.

**M-RPC-02: `get_pipeline()` devuelve `quotes.*` completo sin filtrar columnas sensibles**
- La RPC `get_pipeline` devuelve `to_jsonb(q)` con todas las columnas de quotes.
- Aunque la RLS valida workspace, expone `terms_conditions`, `service_lines`, `calc_snapshot` completo al frontend.

**M-RPC-03: `initiate_oauth()` permite provider `'alegra'` a pesar de que Alegra no usa OAuth**
- La whitelist de providers en `initiate_oauth()` incluye `'alegra'`, pero Alegra no tiene OAuth.
- Si se llama `initiate_oauth('alegra')`, falla silenciosamente o genera error confuso.

### 🟢 RIESGO BAJO

**L-RPC-01: `cleanup_expired_oauth_states()` no tiene GRANT a service_role**
- Función útil pero solo puede ser llamada por el scheduler. Sin GRANT explícito puede dar error de permisos en algunos contextos.

---

## 3. RLS

### 🔴 RIESGO CRÍTICO

**C-RLS-01: `portal_access_log` — policy de INSERT con `with check (true)`**
- Cualquier INSERT pasa sin validación. La seguridad depende de que solo las RPCs security definer escriban aquí.
- Si hay un bug en una RPC que llame insert con workspace_id incorrecto, se logea sin control.

**C-RLS-02: `integration_events` — policy UPDATE solo para `auth.role() = 'service_role'`**
- El worker de integrations usa service_role para actualizar estados, lo cual es correcto.
- Pero si un token service_role queda expuesto (p.ej. en logs), cualquiera puede modificar eventos.

### 🟠 RIESGO ALTO

**A-RLS-01: `automation_rules` — SELECT permite `support_admin` ver reglas de todos los workspaces**
- La policy de SELECT en `automation_rules` filtra por `workspace_id = automation_rules.workspace_id AND id = auth.uid()`. Esto está bien si `auth.uid()` siempre retorna el user_id correcto.
- Sin embargo, `support_admin` puede tener workspace_id de cualquier workspace si lo asignamos así.

**A-RLS-02: `loyalty_transactions` — INSERT `with check (true)` — mismo patrón que portal_access_log**
- Válido porque `assign_loyalty_points` es security definer, pero riesgo residual.

### 🟡 RIESGO MEDIO

**M-RLS-01: Tablas `catalog_*` — RLS con `select to anon, authenticated` — catálogo global expuesto**
- El catálogo de materiales/servicios es global y público. Esto es intencional (cualquier workspace puede verlo).
- Sin embargo, si se agregaran precios específicos de proveedor, esta apertura sería un problema.

---

## 4. FEATURE FLAGS

### 🟠 RIESGO ALTO

**A-FF-01: `automation_enabled` en `plan_features` NO está tipado en `PlanFeaturesRow`**
- Se creó en `0068_automations_schema.sql` y se usa en `evaluate_and_queue_automations()`.
- Pero `PlanFeaturesRow` en `database.types.ts` NO incluye `automation_enabled`.
- **Impacto:** TypeScript no conoce este campo. Si alguien lo lee desde el tipo, obtendrá `undefined`.

### 🟡 RIESGO MEDIO

**M-FF-01: `workspace_features` tiene 4 flags duplicadas de `plan_features`**
- `workspace_features`: ai_enabled, photo_quote_enabled, multiuser_enabled, advanced_reports_enabled
- Estas mismas existen en `plan_features` (la fuente de verdad real)
- El sistema usa `plan_features` + `get_effective_plan_code()` para las decisiones, no `workspace_features`.

**M-FF-02: `loyalty_enabled` en `company_settings` NO está en `CompanySettingsRow`**
- `loyalty_enabled` fue agregado en `0074_loyalty_reviews_surveys_schema.sql`
- No aparece en `CompanySettingsRow` en `database.types.ts`
- Tampoco `portal_show_reviews` ni `portal_show_loyalty` — estos están en `PortalConfig` pero no en el Row type.

### 🟢 RIESGO BAJO

**L-FF-01: `founder_eligible` en `plan_features` — funcionalidad de founder program sin UI activa**
- El campo existe, hay migración del programa founder (Sprint 9), pero no hay UI visible en producción.

---

## 5. AUTOMATIZACIONES

### 🔴 RIESGO CRÍTICO

**C-AUTO-01: Doble disparo potencial — `trg_quotes_automation_dispatch` + triggers hardcoded Sprint 11 ELIMINADOS pero `trg_quote_views_automation` coexiste con `trg_quote_views_crm`**
- `trg_quote_views_crm` (Sprint 4): actualiza commercial_status + genera notificación
- `trg_quote_views_automation` (Sprint 13): dispara evaluate_and_queue_automations
- Si hay una regla `quote_viewed_multiple` activa + el trigger CRM también genera notificación → posible doble notificación al owner.
- **Diferencia de Sprint 13:** se dijeron eliminados los triggers de integración, pero `trg_quote_views_crm` de Sprint 4 NO fue eliminado.

### 🟠 RIESGO ALTO

**A-AUTO-01: `automation-scheduler` llama `expire_overdue_quotes()` en cleanup diario sin límite**
- Si el scheduler falla 23 veces en un día y se ejecuta 24 veces, `expire_overdue_quotes()` también se ejecuta 24 veces.
- La función es idempotente (solo vence cotizaciones vencidas), pero el log de notificaciones puede crecer.

### 🟡 RIESGO MEDIO

**M-AUTO-01: Templates de automation instalados con `enabled=false` por defecto — nadie los activa**
- Los templates se instalan cuando se conecta una integración, pero empiezan desactivados.
- Si el usuario no sabe que debe activarlos, las automatizaciones nunca funcionan.
- No hay onboarding guide que muestre "activa tus automatizaciones".

---

## 6. INTEGRACIONES

### 🟠 RIESGO ALTO

**A-INT-01: Drive y OneDrive adapters descargan archivos completos en memoria RAM del worker**
- `DriveAdapter` y `OneDriveAdapter` hacen `await fileData.arrayBuffer()` — carga el archivo completo en RAM.
- Con evidencias de hasta 50 MB, y múltiples eventos simultáneos, el worker puede quedarse sin memoria.
- **Acción:** Implementar streaming o chunked upload en Sprint 17.

**A-INT-02: OAuth scopes de Drive (`drive.file`) y OneDrive (`Files.ReadWrite`) requieren verificación de app en Google/Azure**
- Sin verificación, las pantallas de OAuth muestran "App no verificada" al usuario.
- **Impacto:** Baja tasa de conversión en conexión Drive/OneDrive.

### 🟡 RIESGO MEDIO

**M-INT-01: `integration-worker` sin timeout por evento — un evento colgado bloquea la cola**
- El worker procesa eventos secuencialmente dentro de cada run.
- Si un adaptador (ej. DriveAdapter) demora 25s, los eventos siguientes esperan.
- La Edge Function tiene 60s de timeout global.

**M-INT-02: `oauth-callback` detecta provider via query param — manipulable por usuario**
- URL: `/functions/v1/oauth-callback?provider=google_calendar`
- El provider viene del query param, no del `state` validado.
- Un usuario malicioso podría cambiar `?provider=drive` y confundir el callback.
- **Mitigación actual:** El `state` en oauth_states tiene el provider correcto. El callback debería preferir el state sobre el query param.

**M-INT-03: Alegra adapter no maneja paginación en respuestas de la API**
- Si un workspace tiene muchos contactos en Alegra, `GET /contacts` puede paginar.
- El adapter actual no maneja paginación.

### 🟢 RIESGO BAJO

**L-INT-01: Teams adapter usa `ChannelMessage.Send` que requiere admin del tenant Microsoft**
- La mayoría de usuarios no tendrá este permiso. Puede aparecer como "error de permisos" al conectar.

---

## 7. FRONTEND

### 🔴 RIESGO CRÍTICO

**C-FE-01: Componentes GPS (`CheckInOutButton`, `OperationalMap`, `MemberDetailSheet`, `OperationalStatusSelector`) creados en Sprint 8 pero NO integrados en ninguna vista**
- Los 4 componentes GPS existen en `src/components/gps/` pero ninguna vista los importa.
- La vista `/app/team` (Team.tsx) no usa ninguno.
- El Dashboard no los incluye.
- **Impacto:** GPS Sprint 8 está completo en backend (RPCs, triggers, tablas) pero el frontend no lo expone al usuario. Feature pagada por PREMIUM que no se puede usar.

### 🟠 RIESGO ALTO

**A-FE-01: WhatsApp tiene 3 implementaciones coexistentes**
- `lib/calc.ts`: `openWhats()` + `followMessage()` — usados en Dashboard.tsx, MobileDashboard.tsx, ClientDetailOverlay.tsx
- `lib/shareUtils.ts`: `openWhatsAppShare()` — marcada como @deprecated, aún importada en DocumentOverlay.tsx, StepPreviewShare.tsx, QuoteDetailPage.tsx
- `services/whatsapp.ts`: `getWhatsAppMessage()` — nueva implementación Zero Trust Sprint 11. Solo usada en hooks de integraciones.
- **Impacto:** 3 caminitos distintos para enviar WhatsApp. Inconsistente. El nuevo backend-first no se usa en los flujos principales.

**A-FE-02: `KtzIA.tsx` — nombre de archivo legacy (KTZ360)**
- La vista se llama `KtzIA.tsx` y exporta `KtzIA()` — referencia a la marca anterior KTZ360.
- Debería llamarse `ShelwiIA.tsx` / `ShelwiIA()`.
- **Impacto:** Solo cosmético pero confunde a nuevos desarrolladores.

**A-FE-03: Desktop fallback con `SimpleEmpty` en Configuración**
- `ConfiguracionPage.tsx` muestra `<SimpleEmpty variant="config"/>` en desktop.
- `SimpleEmpty` tiene solo 2 variantes: `proyectos` y `config` — ambas son páginas stub.
- La ruta `/app/proyectos` también usa `SimpleEmpty` — prometida desde Sprint 1, nunca implementada.

**A-FE-04: `useReports` hook solo consumido por `ReportesMobile.tsx`**
- `Reportes.tsx` (la vista principal de reportes) renderiza `ReportesMobile` en móvil, pero en desktop usa la versión legacy del archivo `Reportes.tsx` que NO usa los hooks de reportes backend.
- El Sprint 5 migró `ReportesMobile` a Zero Trust pero la vista desktop sigue calculando en frontend.

### 🟡 RIESGO MEDIO

**M-FE-01: `useCustomerSuccess` no tiene hooks para Reviews/Surveys/Loyalty**
- Los servicios `reviews.ts`, `surveys.ts`, `loyalty.ts` existen.
- No hay hooks React Query correspondientes (`useReviews`, `useSurveys`, `useLoyalty`).
- Las vistas los llaman directamente (anti-patrón: mezcla hooks y servicios directos).

**M-FE-02: `loyalty_enabled` y `portal_show_reviews` ausentes en `CompanySettingsRow`**
- El type `CompanySettingsRow` en `database.types.ts` no incluye los nuevos campos de Sprint 16.
- Las llamadas a `company_settings` desde workspaces.ts no verán estos campos.

**M-FE-03: `useAutomations` hook con 4 funciones — ninguna con error retry configurado**
- `useInstallTemplates`, `useToggleRule`, `useCreateRule` usan `useMutation` sin `retry`.
- Si una automatización falla por timeout (frecuente en cold starts), no se reintenta.

**M-FE-04: `PlanFeaturesRow` no incluye `automation_enabled`**
- Campo creado en Sprint 13 (`0068_automations_schema.sql`) pero no tipado.
- `useFeatureAccess('automation_enabled')` puede retornar `undefined` en lugar de `boolean`.

### 🟢 RIESGO BAJO

**L-FE-01: `src/hooks/useAI.ts` vs `src/hooks/useAICredits.ts` — funcionalidad solapada**
- `useAI.ts` tiene hooks de generación.
- `useAICredits.ts` tiene hooks de créditos.
- Podrían consolidarse en `useAI.ts` para simplicidad.

**L-FE-02: `useOnboardingProgress.ts` sin consumidor activo visible**
- El hook existe pero el componente `OnboardingCard.tsx` puede no estar integrado en todas las rutas.

---

## 8. IA

### 🟠 RIESGO ALTO

**A-AI-01: `aiCommercial.ts` funciones pasan datos de frontend — no Zero Trust completo**
- `analyzeClientsAtRisk(quotes, clients)` recibe arrays de datos desde React.
- Si un atacante manipula el estado de React antes de llamar esta función, la IA analiza datos falsos.
- **Mitigación:** La IA es consultiva (no toma acciones críticas), pero los insights generados pueden ser incorrectos.
- **Acción:** Mover el contexto de datos a un RPC backend que pase los datos al ai-proxy.

### 🟡 RIESGO MEDIO

**M-AI-01: `automation_ai_credits_pct` no está en `PlanLimitsRow`**
- Campo creado en Sprint 13 pero no tipado en `PlanLimitsRow`.
- El check de presupuesto IA en automatizaciones funciona en SQL, pero TypeScript no puede verificar el valor.

### 🟢 RIESGO BAJO

**L-AI-01: `ai_operation_costs` tabla configurable pero sin UI de admin**
- La tabla permite cambiar costos de operaciones IA (1-5 créditos).
- No hay UI en el CMS para que un super_admin cambie estos valores sin SQL.

---

## 9. CMS

### 🟠 RIESGO ALTO

**A-CMS-01: Módulos de Sprint 16 (Loyalty, Reviews, Surveys) sin CMS**
- Las tablas y RPCs existen, pero no hay UI en `/app/admin` para:
  - Crear/editar loyalty_programs
  - Moderar reviews
  - Crear/activar surveys
- Un owner no puede configurar su programa de fidelización sin acceso directo a SQL.

**A-CMS-02: CMS de Integraciones — solo lectura, sin acciones**
- La sección de integraciones en el CMS muestra estado pero no permite forzar re-sync ni limpiar errores.

### 🟡 RIESGO MEDIO

**M-CMS-01: AdminPanel.tsx tiene tabs que pueden mostrar datos parciales sin validación de carga**
- Si el RPC de CMS tarda en responder, el tab puede mostrarse vacío sin indicador de carga.

**M-CMS-02: Permisos CMS solo verificados en `RequireSuperAdmin` — sin verificación granular por tab**
- Una vez dentro del CMS, todos los tabs asumen que el super_admin tiene acceso total.
- No hay RLS ni verificación por acción específica del CMS.

---

## 10. PORTAL CLIENTE

### 🔴 RIESGO CRÍTICO

**C-PORTAL-01: `get_client_portal()` fue reescrita en `0076` pero la versión anterior en `0060` también existe**
- La migración `0076` recrea `get_client_portal()` con los nuevos campos Sprint 16.
- Supabase usa `CREATE OR REPLACE` — solo la última versión aplica.
- Pero si la migración `0076` no fue aplicada y la `0060` sí, el portal no devolverá `show_reviews` ni `show_loyalty`.
- **Impacto:** Error silencioso — portal funciona pero sin las tabs de Sprint 16.

### 🟠 RIESGO ALTO

**A-PORTAL-01: Tokens del portal no tienen `revoked_at` indexado**
- La query `WHERE revoked_at IS NULL` en `_validate_portal_token` no tiene índice parcial.
- Con miles de tokens revocados, la query escanea tabla completa.

### 🟡 RIESGO MEDIO

**M-PORTAL-01: `portal_access_log` sin política de retención**
- Cada acceso al portal inserta un registro. Con miles de visitas, la tabla crece indefinidamente.
- No hay función de limpieza configurada (similar a automation_logs pero sin el cleanup).

---

## TABLAS SIN USO DETECTADAS

| Tabla | Sprint origen | Uso actual | Recomendación |
|---|---|---|---|
| `leads` | Sprint 1 | ❌ Ninguno | Marcar como reservado o eliminar |
| `projects` | Sprint 1 | ❌ Ninguno | Marcar como reservado o eliminar |
| `attachments` | Sprint 1 | ⚠️ Bucket existe, tabla no usada | Deprecar bucket o unificar con evidences |
| `service_materials` | Sprint 1 | ❌ Ninguno | Reservado para futuro motor de cotización |
| `workspace_features` | Sprint 1 | ⚠️ Solo types/workspaces.ts legacy | Candidata a eliminación |

---

## DEUDA TÉCNICA ACUMULADA (SIN RIESGO INMEDIATO)

| Deuda | Sprint origen | Descripción |
|---|---|---|
| `openWhats()` + `followMessage()` en calc.ts | Sprint 1 | Funciones deprecated — no se migran a whatsapp.ts |
| `KtzIA.tsx` — nombre legacy | Sprint 2 | Debería llamarse ShelwiIA.tsx |
| `SimpleEmpty` para proyectos y config desktop | Sprint 1 | Pantallas stub pendientes de implementar |
| Desktop de Reportes sin Zero Trust | Sprint 5 | Desktop calcula en frontend, no usa RPCs |
| GPS components sin integración en vistas | Sprint 8 | Feature completa en backend, inexistente en UI |
| `automation_enabled` no tipado en PlanFeaturesRow | Sprint 13 | TypeScript no conoce el flag |
| `loyalty_enabled`, `portal_show_reviews` no tipados | Sprint 16 | TypeScript no conoce campos nuevos de company_settings |
| Hooks faltantes: useReviews, useSurveys, useLoyalty | Sprint 16 | Servicios sin wrappers React Query |
| `BRI-` en numeración de cotizaciones | Sprint 1 | Prefijo de marca anterior |

---

## ESTADO GENERAL DE LA PLATAFORMA

### Fortalezas

- Arquitectura Zero Trust sólida en backend (RPCs security definer, RLS, tokens)
- Sistema de automatizaciones extensible y bien desacoplado
- Portal del cliente funcional con branding y configuración granular
- Customer Success completo (Sprint 15) con scoring backend
- Loyalty/Reviews/Surveys listos en backend (Sprint 16)
- Multi-tenant correctamente aislado via workspace_id en todos los niveles

### Debilidades para producción

1. **3 bugs críticos** que deben corregirse antes de producción: numeración BRI-, datos de seed en migraciones, GPS no expuesto en UI
2. **Inconsistencia de WhatsApp** — 3 implementaciones paralelas
3. **Types desincronizados** — 4+ campos en DB que TypeScript no conoce
4. **Feature de $** sin UI — loyalty/reviews/surveys tienen backend completo pero sin admin UI

---
