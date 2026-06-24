# WEBHOOK_LOAD_TEST_REPORT.md
# Shelwi — Análisis de Carga: Webhooks
Fecha: 2026-06-23

---

## ANÁLISIS TEÓRICO DE CARGA

### Escenario: 3.000 workspaces, peak de actividad

| Escenario | Eventos/min | Endpoints promedio | Entregas/min | Carga en integration_events |
|-----------|------------|-------------------|--------------|----------------------------|
| Normal 8am-6pm | 300 eventos/min | 2 endpoints/ws activo | 600 inserts/min | Aceptable |
| Peak (9am, cierre mes) | 1.200 eventos/min | 2 endpoints | 2.400 inserts/min | Manejable con batch de 5 |
| Stress (todos activos) | 3.000 workspaces × 10 eventos | 5 endpoints | 150.000 entregas | Requiere rate limit adicional |

### Controles implementados para escala

| Control | Valor | Impacto |
|---------|-------|---------|
| `MAX_EVENTS_PER_RUN = 5` en integration-worker | 5 eventos por ejecución | Limita explosiones de carga |
| Timeout por entrega | 10 segundos | Previene bloqueos por endpoints lentos |
| Backoff exponencial | 1min → 5min → 30min | Reduce carga en casos de fallos masivos |
| `dispatch_webhook_event` solo encola si hay endpoints activos | O(endpoints activos) | No afecta workspaces sin webhooks |
| Auto-disable después de 5 fallos consecutivos | Reduce load en endpoints muertos | Crítico para healthcheck |
| Plan gating PRO+ | FREE no tiene webhooks | Limita el universo de workspaces |

### Índices para performance

```sql
-- Índice GIN en events[] — búsqueda eficiente en dispatch_webhook_event
CREATE INDEX idx_webhook_endpoints_events ON webhook_endpoints USING GIN(events);

-- Índice para integration-worker polling de eventos webhook pendientes
-- Reutiliza: idx_integration_events_pending (ya existe en 0062)

-- Índice para deliveries por endpoint
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);
```

### Punto de quiebre estimado

Con el diseño actual:
- **Hasta 500 workspaces con webhooks activos**: Sin problemas, integration-worker maneja carga
- **500-2.000 workspaces**: Posible backlog en integration_events si hay muchos endpoints por workspace
- **2.000+ workspaces**: Considerar sharding del integration-worker por workspace range o aumentar MAX_EVENTS_PER_RUN con safety guard de tiempo

### Recomendación para Sprint futuro

Cuando se superen 500 workspaces con webhooks:
1. Crear worker dedicado `webhook-worker` separado del `integration-worker` general
2. Aumentar frecuencia de cron a cada 30 segundos para webhooks (actualmente 1 minuto)
3. Añadir `rate_limit_per_hour` en `webhook_endpoints` (max 100 entregas/hora por default)

---

## VALIDACIÓN DE IDEMPOTENCIA

| Escenario | Protección |
|-----------|-----------|
| Trigger dispara dos veces (bug) | `event_id` único por entrega. Deliveries son append-only. No hay ON CONFLICT que deduplication, pero la lógica de negocio en el receptor debe manejarlo. |
| Reintento de integration-worker en el mismo evento | El status 'retrying' crea un NUEVO integration_events con el attempt++. El original queda como procesado. |
| Redeliver manual de una entrega | Crea NUEVO delivery_id y nuevo integration_events. No modifica la entrega original. |

---

## CONCLUSIÓN

El sistema de webhooks está diseñado para soportar la carga actual de producción (hasta ~500 workspaces con webhooks activos) sin cambios adicionales. Los controles de auto-disable, backoff y plan gating son los principales mecanismos de protección contra abusos y sobrecarga.
