# OBSERVABILITY GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Logging, métricas, alertas y trazabilidad de la plataforma
> Stack: Sentry 10 + Supabase Dashboard + audit_log + ai_usage

---

## 1. LOS TRES PILARES

```
LOGS          — ¿Qué pasó?        → audit_log (DB) + Sentry (errores)
MÉTRICAS      — ¿Qué tan bien?    → ai_usage + Supabase Analytics + KPIs
TRAZAS        — ¿Por qué pasó?    → Sentry traces + agent_executions
```

---

## 2. LOGGING

### 2.1 audit_log — fuente de verdad inmutable

Tabla `audit_log` en Supabase. Solo INSERT, nunca UPDATE ni DELETE.

```typescript
// Registro automático de acciones críticas
await supabase.from('audit_log').insert({
  company_id:  workspaceId,
  user_id:     userId,        // null para acciones de agente
  agent_id:    agentId,       // null para acciones humanas
  action:      'CLIENT_CREATED',
  entity_type: 'client',
  entity_id:   newClientId,
  diff:        { before: null, after: clientData },
  ip_address:  request.headers.get('x-real-ip'),
  user_agent:  request.headers.get('user-agent'),
});
```

**Acciones que SIEMPRE deben loggearse:**
- Cualquier creación/modificación/eliminación de datos de negocio
- Conexión/desconexión de integraciones
- Cambios de plan o suscripción
- Invitaciones a nuevos miembros
- Acciones de agentes IA (especialmente WRITE-High del Tool Catalog)
- Cambios de configuración del workspace

### 2.2 Logging en Edge Functions

Las Edge Functions usan `console.log/error` → van a los logs de Supabase:

```typescript
// Estructura recomendada para Edge Functions
console.log('[función]', { action: 'iniciando', workspaceId, provider });
console.error('[función]', { error: err.message, context: { workspaceId } });
```

**Ver logs:** Supabase Dashboard → Edge Functions → Logs (últimas 24h disponibles)

### 2.3 Logging en frontend

```typescript
// Sentry para errores no capturados
import * as Sentry from '@sentry/react';

// Captura automática de errores React (ErrorBoundary ya implementado)
// Captura manual para errores esperados:
Sentry.captureException(error, {
  tags: { module: 'crm', action: 'quote_creation' },
  extra: { quoteId, clientId },
});
```

---

## 3. MÉTRICAS

### 3.1 Métricas de uso IA (ai_usage)

```sql
-- Costo IA por empresa por mes
SELECT
  company_id,
  SUM(estimated_cost_usd) as total_cost,
  SUM(total_tokens) as total_tokens,
  COUNT(*) as total_calls,
  AVG(latency_ms) as avg_latency_ms
FROM ai_usage
WHERE created_at >= date_trunc('month', NOW())
GROUP BY company_id
ORDER BY total_cost DESC;
```

### 3.2 Métricas de integraciones

```sql
-- Eventos de integración por estado
SELECT provider, status, COUNT(*) as count
FROM integration_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY provider, status;
```

### 3.3 Métricas de plataforma disponibles en Supabase Dashboard

| Métrica | Ubicación | Frecuencia |
|---|---|---|
| DB connections activas | Dashboard > Database > Connections | Tiempo real |
| API requests/min | Dashboard > API | Tiempo real |
| Storage usado | Dashboard > Storage | Diario |
| Edge Function invocations | Dashboard > Edge Functions | Tiempo real |
| Auth signups/day | Dashboard > Authentication | Diario |

---

## 4. ALERTAS

### 4.1 Alertas críticas (P0 — respuesta inmediata)

| Condición | Cómo detectar | Acción |
|---|---|---|
| Edge Function con error rate > 5% | Supabase → Edge Function logs | Ver logs, rollback si necesario |
| ai_usage.cost > $20 empresa/mes | Query periódica en ai_usage | Revisar límites de créditos |
| Webhook HMAC failures repetidas | alegra-webhook / mp-webhook logs | Investigar posible ataque |
| RLS bypass sospechoso | Patrones en audit_log | Suspender workspace, investigar |
| integration_credentials expuesta | Escaneo de logs | Rotar claves INMEDIATAMENTE |

### 4.2 Alertas de negocio (P1 — responder en 1h)

| Condición | Tabla/Fuente |
|---|---|
| Múltiples facturas `overdue` > 30 días | invoices |
| Agent en `dead_letter` > 3 veces seguidas | agent_executions |
| Integration status `error` > 24h | integrations |
| Automation con error_count > 10 | automations |

### 4.3 Configuración de alertas (pendiente implementación)

Actualmente no hay alerting automático configurado. **Deuda técnica TD-OBS-01.**

Implementación planificada:
- Supabase pg_cron que evalúa condiciones cada hora
- Email/push al owner si se dispara alerta
- Integration con canal Slack/Teams (futuro)

---

## 5. TRAZABILIDAD DE AGENTES IA

### 5.1 Ciclo de vida en base de datos

```sql
-- Ver ejecuciones de agente recientes
SELECT
  ae.id,
  ae.agent_id,
  ae.status,
  ae.started_at,
  ae.completed_at,
  ae.error,
  ae.actions_taken
FROM agent_executions ae
WHERE ae.company_id = $1
ORDER BY ae.started_at DESC
LIMIT 50;
```

### 5.2 Trazas en Sentry

El módulo AI Studio (`src/features/aiStudio/`) integra Sentry para:
- Medir latencia de llamadas a `ai-proxy`
- Capturar errores de parsing de respuestas IA
- Medir tiempo hasta first token (streaming)

```typescript
const transaction = Sentry.startTransaction({ name: 'ai-proxy-call', op: 'ai' });
// ...invocación...
transaction.finish();
```

---

## 6. HEALTH CHECKS

### 6.1 Edge Function: ai-health-check

```
GET /functions/v1/ai-health-check
Authorization: Bearer <service_role_key>
```

Verifica:
- Conectividad con Gemini API (gemini-2.5-flash)
- Conectividad con NVIDIA NIM (llama-3.3-70b)
- Latencia de ambos proveedores
- Disponibilidad de fallback

### 6.2 Edge Function: ai-benchmark

```
POST /functions/v1/ai-benchmark
Authorization: Bearer <superadmin_jwt>
```

Ejecuta prompts estándar contra todos los modelos configurados y compara:
- Latencia (P50, P95)
- Tokens generados
- Costo estimado
- Calidad de respuesta (manual)

---

## 7. RUNBOOK — INCIDENTES COMUNES

### 7.1 Edge Function con error 500 constante

```
1. Abrir Supabase Dashboard > Edge Functions > [función] > Logs
2. Buscar el error específico en los últimos 100 logs
3. Si es por secret no configurado: supabase secrets set NAME=VALUE
4. Si es por bug de código: rollback al deploy anterior
5. Si es por dependencia externa caída: implementar fallback o circuit breaker
```

### 7.2 ai_usage creció demasiado (>$X/mes)

```
1. Identificar empresa con mayor consumo: SELECT company_id, SUM(estimated_cost_usd) GROUP BY...
2. Verificar si hay loop de agente (agent_executions con muchas filas en poco tiempo)
3. Verificar si el modelo configurado es el correcto para el use case
4. Ajustar rate limits en la función: src/services/aiStudio.ts:115
```

---

*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para procedimientos de recuperación*
*Ver: `docs/14_KPI_CATALOG.md` sección 2.4 para KPIs técnicos target*
*Ver: `docs/18_AI_GOVERNANCE.md` para trazabilidad específica de agentes*
