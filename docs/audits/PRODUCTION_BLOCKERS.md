# PRODUCTION_BLOCKERS — Shelwi
> Fecha: 2026-06-23 | Alcance: Sprint 1 → Sprint 24

**REGLA:** Este documento solo lista hallazgos. NO propone implementación. Esperar aprobación antes de cualquier cambio.

---

## 🔴 CRÍTICO — Impide producción o genera pérdida inmediata

---

### BLOQ-001: `useSessionGuard` no integrado en el router

**Módulo:** Session Security (Sprint 24)
**Archivo:** `src/router.tsx`, `src/hooks/useSessionGuard.ts`

**Descripción:**
El hook `useSessionGuard` que implementa el heartbeat de sesión (detección de revocación) fue creado en Sprint 24 pero **no está importado ni montado en ningún layout autenticado**. Esto significa que:
- La tabla `active_sessions` se popula al login ✅
- La revocación de sesiones al hacer login en otro dispositivo ocurre en DB ✅
- **Pero el usuario desconectado NO es notificado y sigue usando la app** ❌
- La protección contra sesiones concurrentes abusivas es invisible para el frontend

**Impacto:** El modelo "1 licencia = 1 sesión activa" está en DB pero no protege en UI. La inversión del Sprint 24 en session security no está activa.

**Archivos afectados:** `src/router.tsx` (necesita `useSessionGuard()` en el layout autenticado)

---

### BLOQ-002: Plan ENTERPRISE sin flujo de checkout completo

**Módulo:** Billing / create-checkout
**Archivo:** `supabase/functions/create-checkout/index.ts`

**Descripción:**
`_shared/plans.ts` fue actualizado para incluir `'enterprise'` en el tipo `PlanCode`. Sin embargo, el archivo `create-checkout/index.ts` no ha sido revisado ni verificado para soportar el nuevo plan. Si contiene validaciones hardcodeadas del tipo:
```typescript
if (planCode !== 'pro' && planCode !== 'premium') { reject }
```
...entonces cualquier intento de comprar ENTERPRISE fallará silenciosamente.

**Impacto:** Plan ENTERPRISE existe en DB pero es imposible activarlo via Mercado Pago.

**Acción requerida:** Leer y verificar `create-checkout/index.ts` antes de lanzar ENTERPRISE.

---

### BLOQ-003: Precio delta $5.000 en mp-webhook permite underpayment

**Módulo:** Billing / mp-webhook
**Archivo:** `supabase/functions/mp-webhook/index.ts` línea ~164

**Descripción:**
```typescript
if (amountCheck.delta > 5000) {
  // Block
}
```
Esta tolerancia de $5.000 COP significa que alguien puede pagar:
- PRO: $54.901 en lugar de $59.900 → se activa el plan PRO
- PREMIUM: $174.901 en lugar de $179.900 → se activa el plan PREMIUM

Un actor malintencionado que conozca los precios puede explotar esto sistemáticamente.

**Impacto:** Pérdida directa de ingresos hasta $4.999 por cada activación de plan.

**Nota:** El delta de $5.000 probablemente fue elegido para compensar comisiones de MP (~3-4%). La solución correcta es calcular el `net_amount` (después de comisión) y validar contra ese valor, no contra el `transaction_amount` bruto.

---

### BLOQ-004: WhatsApp Business API no implementada

**Módulo:** Integraciones
**Archivo:** `supabase/functions/integration-worker/index.ts`

**Descripción:**
La función `processWhatsAppEvent()` solo genera URLs `wa.me` (WhatsApp manual). No existe integración real con la WhatsApp Business API (Meta/WABA). Sin embargo, según la nueva matriz de planes, WhatsApp Business API está incluida en PREMIUM.

Si los usuarios PREMIUM esperan mensajes automatizados de WhatsApp, la feature no existe.

**Impacto:** Promesa de feature no cumplida en PREMIUM. Riesgo de churn.

---

## 🟠 ALTO — Debe corregirse antes de escalar

---

### BLOQ-005: Pool de conexiones Supabase Pro insuficiente para 3K+ ws

**Módulo:** Infraestructura
**Estado:** Architectural limit

**Descripción:**
Supabase Pro ofrece 100 conexiones directas a PostgreSQL. A 3.000 workspaces activos con ~15 requests concurrentes en hora pico, el pool queda saturado.

**Impacto:** Errores `too many connections` afectan a todos los usuarios simultáneamente.

**Umbral:** Crítico al superar 1.000 workspaces activos simultáneos.

**Opción:** Upgrade a Supabase Team ($599 USD/mes) → 500+ conexiones.

---

### BLOQ-006: RPCs BI sin materialización causan timeouts a escala

**Módulo:** BI / Finanzas
**Archivos:** `get_bi_executive_kpis`, `get_bi_operations_kpis`, etc.

**Descripción:**
Las RPCs de BI calculan en tiempo real haciendo JOINs sobre 7+ tablas. A 3.000 workspaces en hora pico, múltiples usuarios consultando BI simultáneamente saturan la DB con queries costosas.

**Impacto:** Latencia 2-5s en dashboards BI a 3K ws, timeouts frecuentes a 5K ws.

---

### BLOQ-007: `integration-worker` es single-threaded para todo el tenant

**Módulo:** Automatizaciones / Integraciones
**Archivo:** `supabase/functions/integration-worker/index.ts`

**Descripción:**
Un único worker procesa 5 eventos por minuto para TODOS los workspaces. A 500 workspaces activos con integraciones, la cola empieza a acumularse.

**Impacto:** Delays en automatizaciones (Gmail, Calendar, Alegra, Webhooks) que se vuelven inaceptables.

---

### BLOQ-008: Bucket `attachments` sin `file_size_limit`

**Módulo:** Storage / Operativo
**Archivo:** `supabase/migrations/0004_storage.sql`

**Descripción:**
El bucket `attachments` no tiene `file_size_limit` configurado, a diferencia de `logos` (5MB) y `evidences` (50MB). Un usuario puede subir archivos de cualquier tamaño al bucket `attachments`.

**Impacto:** Consumo descontrolado de storage. Un usuario malicioso puede subir archivos de varios GB.

---

### BLOQ-009: GPS accuracy solo validada en frontend

**Módulo:** GPS
**Archivo:** `src/services/gps.ts`

**Descripción:**
La validación `accuracy_meters ≤ 500m` antes de guardar una posición GPS está implementada en el frontend. Sin embargo, la RPC `record_gps_event()` en el backend no valida este constraint.

**Impacto:** Un request directo a la RPC (bypasando el frontend) puede guardar posiciones GPS con accuracy de 10km o más, contaminando el mapa operativo con datos inválidos.

---

### BLOQ-010: Sin rate limit en portales públicos

**Módulo:** Portal Público / Portal Cliente
**Rutas:** `/p/:token`, `/portal/:token`

**Descripción:**
No existe rate limiting por IP en las rutas del portal público. Un bot puede:
1. Enumerar tokens válidos (aunque son UUIDs, reduciendo el riesgo)
2. Hacer scraping masivo de cotizaciones si conoce un token válido
3. Generar carga innecesaria en la DB

**Impacto:** Exposición de datos de cotizaciones, carga en DB, posible DoS.

---

### BLOQ-011: Cron jobs Sprint 24 no configurados

**Módulo:** IA Addons / Session Security
**Archivos:** Migraciones 0100, 0101

**Descripción:**
Las RPCs `expire_ai_addons()` y `cleanup_old_sessions()` existen pero no tienen un cron configurado. Sin el cron:
- Los addons de créditos IA no expiran al cambiar de mes → usuarios siguen usando créditos del mes pasado
- Las sesiones revocadas se acumulan indefinidamente en la tabla → crecimiento descontrolado

**Impacto:**
- Addons: pérdida de ingresos por créditos no expirados
- Sessions: tabla crece sin cleanup → degradación de rendimiento

---

## 🟡 MEDIO — Planificar en próximo sprint

---

### BLOQ-012: Heartbeat de sesión polling (30s) en lugar de Realtime

**Módulo:** Session Security
**Archivo:** `src/hooks/useSessionGuard.ts`

**Descripción:**
El heartbeat actual hace polling cada 30 segundos. Si la sesión es revocada, hay una ventana de hasta 30 segundos donde el usuario ve la app sin saber que fue desconectado.

**Impacto:** Bajo en la mayoría de casos (30s es aceptable), pero para ENTERPRISE con auditoría empresarial puede ser inaceptable.

---

### BLOQ-013: Update no atómico de model/execution_time_ms en ai-proxy

**Módulo:** IA / ai-proxy
**Archivo:** `supabase/functions/ai-proxy/index.ts`

**Descripción:**
Sprint 24 agregó un UPDATE posterior al consume_ai_credits para guardar model y execution_time_ms. Este UPDATE usa `ORDER BY created_at DESC LIMIT 1` para encontrar el registro reciente, lo cual es no-determinístico si hay llamadas concurrentes del mismo workspace en el mismo milisegundo.

**Impacto:** En alta concurrencia, execution_time_ms podría registrarse en el registro equivocado. Bajo impacto en datos analíticos, pero incorrecto.

---

### BLOQ-014: `notifications` INSERT no fuerza `user_id = auth.uid()`

**Módulo:** Notificaciones
**Archivo:** `supabase/migrations/0003_rls.sql`

**Descripción:**
La policy INSERT de `notifications` valida solo `workspace_id = current_workspace_id()` pero no que `user_id = auth.uid()`. Un usuario del workspace podría crear notificaciones con el user_id de otro miembro del mismo workspace.

**Impacto:** Bajo (solo afecta dentro del mismo workspace), pero técnicamente incorrecto.

---

### BLOQ-015: `automation-scheduler` sin autenticación de caller

**Módulo:** Automatizaciones
**Archivo:** `supabase/functions/automation-scheduler/index.ts`

**Descripción:**
El automation-scheduler no verifica que el caller sea el cron de Supabase o un cliente autorizado. Cualquier persona que conozca la URL del function puede disparar manualmente el scheduler.

**Impacto:** Podría generar carga extra en DB al ser disparado repetidamente, pero no tiene acceso a datos del usuario.

---

### BLOQ-016: Drive/OneDrive comparten scope OAuth con Calendar

**Módulo:** Integraciones
**Archivo:** `supabase/functions/integration-worker/index.ts`

**Descripción:**
El adapter de Google Drive usa el access_token de `google_calendar`. El adapter de OneDrive usa el token de `outlook_calendar`. Si los scopes OAuth no incluyen `drive.file` o `Files.ReadWrite`, las subidas fallarán silenciosamente.

**Impacto:** Posibles fallos en sync de Drive/OneDrive que no se detectan hasta que el usuario lo reporta.

---

## 🟢 BAJO — Mejora futura

---

### BLOQ-017: Sin error tracking (Sentry/Bugsnag)

No existe integración de error tracking en el frontend. Los errores JavaScript en producción son invisibles salvo que el usuario los reporte.

### BLOQ-018: Sin uptime monitoring

No hay configurado un servicio de uptime monitoring (UptimeRobot, Better Uptime, etc.) para alertar cuando la app o las Edge Functions están caídas.

### BLOQ-019: PITR (Point-in-Time Recovery) no disponible en Pro

Supabase Pro solo ofrece daily backups con 7 días de retención. PITR solo está en Team+. Si ocurre una corrupción de datos, el recovery máximo es a un checkpoint del día anterior.

### BLOQ-020: Quote access token no regenerable por el vendedor

Si un token de portal de cotización expira, no hay UX para regenerarlo sin reenviar la cotización.

### BLOQ-021: Price tampering alert sin notificación activa

`audit_log` registra el evento `price_tampering_detected`, pero nadie recibe una alerta en tiempo real. Un admin podría no enterarse de un intento de fraude por días.

---

## RESUMEN EJECUTIVO

| Categoría | Cantidad | Prioridad |
|-----------|---------|-----------|
| 🔴 CRÍTICO | 4 | Resolver ANTES de producción |
| 🟠 ALTO | 7 | Resolver ANTES de 1K usuarios |
| 🟡 MEDIO | 5 | Planificar en próximo sprint |
| 🟢 BAJO | 5 | Backlog |
| **TOTAL** | **21** | |

### Los 4 críticos que bloquean producción:

1. **BLOQ-001:** `useSessionGuard` no integrado → session security sin efecto
2. **BLOQ-002:** ENTERPRISE checkout sin verificar → plan ENTERPRISE no vendible
3. **BLOQ-003:** Price delta $5K → underpayment posible
4. **BLOQ-004:** WhatsApp Business API no existe → feature prometida ausente
