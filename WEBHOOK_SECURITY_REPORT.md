# WEBHOOK_SECURITY_REPORT.md
# Shelwi — Seguridad de Webhooks Salientes
Fecha: 2026-06-23

---

## 1. MODELO DE SEGURIDAD

### Firma HMAC-SHA256

Cada entrega de webhook incluye headers de seguridad:

```
POST https://hooks.zapier.com/hooks/catch/xxx/yyy HTTP/1.1
Content-Type: application/json
X-Shelwi-Signature: sha256=a1b2c3d4e5...
X-Shelwi-Event: quote_approved
X-Shelwi-Delivery: 550e8400-e29b-41d4-a716-446655440000
X-Shelwi-Timestamp: 1719100000
```

**Cálculo de firma:**
```
signature = HMAC-SHA256(secret, timestamp + "." + body)
```

Incluir el timestamp en el mensaje firmado previene ataques de repetición (replay attacks).

### Almacenamiento del Secret

El `secret` del webhook **nunca se almacena en texto plano**.

**Flujo de registro:**
1. Usuario configura secret en frontend
2. Se envía al backend via RPC SECURITY DEFINER
3. El backend almacena: `secret_encrypted` (AES-256-GCM, mismo esquema que `integration_credentials`)
4. Solo `integration-worker` con service_role puede descifrar para firmar

**El secret NUNCA se retorna al frontend tras la creación.**
Al editar, el usuario ingresa un nuevo secret completo (nunca se muestra el anterior).

---

## 2. VALIDACIÓN EN EL RECEPTOR

### Para Zapier / Make / n8n

El receptor valida la firma antes de procesar:

```javascript
// Ejemplo en Node.js (para receptor custom)
const crypto = require('crypto');

function verifyWebhook(req, secret) {
  const signature = req.headers['x-shelwi-signature'];
  const timestamp = req.headers['x-shelwi-timestamp'];
  const body = JSON.stringify(req.body);
  
  // Prevenir replay attacks: rechazar si >5 minutos
  if (Date.now() / 1000 - parseInt(timestamp) > 300) {
    return false;
  }
  
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

**Nota para Zapier/Make:** Usan su propio mecanismo de verificación de origen. La firma HMAC se valida en el zap/scenario receptor.

---

## 3. CONTROLES DE SEGURIDAD

| Control | Implementación | Por qué |
|---------|---------------|---------|
| HMAC-SHA256 con timestamp | Firma = HMAC(secret, ts + "." + body) | Previene replay attacks y manipulación del payload |
| HTTPS obligatorio | Validar URL en RPC — rechazar http:// | Previene man-in-the-middle |
| No localhost en producción | `SITE_URL != localhost` → rechazar 127.0.0.1, localhost | Previene SSRF en producción |
| Timeout 10 segundos | Configurable en Edge Function | Previene que un endpoint lento bloquee el worker |
| Max 3 reintentos | Exponential backoff: 1min, 5min, 30min | Previene spam a endpoints caídos |
| Rate limit por workspace | Max 100 entregas por hora | Previene abuso del sistema |
| IP blocking automático | Si endpoint retorna 3xx sucesivos → desactivar | Previene seguir enviando a redirecciones |
| Plan gating | `webhook_enabled` en `plan_features` (PRO+) | FREE no tiene acceso |
| RLS completo | `webhook_endpoints` y `webhook_deliveries` por `workspace_id` | Workspace A no ve endpoints de Workspace B |
| Zero Trust en RPCs | workspace_id del JWT, nunca del body | Protege contra inyección de workspace_id |
| Secret AES-256-GCM | Mismo esquema que `integration_credentials` | Secretos no legibles sin service_role key |
| Payload mínimo | Solo datos del evento, nunca credenciales internas | Previene fuga de datos sensibles |

---

## 4. PAYLOAD DE EVENTOS

### Estructura base (todos los eventos)

```json
{
  "event": "quote_approved",
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "workspace_id": "a1b2c3d4-...",
  "timestamp": "2026-06-23T10:00:00Z",
  "shelwi_version": "1.0",
  "data": { ... }
}
```

**El `workspace_id` se incluye en el payload** para que el receptor pueda filtrar si tiene múltiples workspaces conectados. Es información no sensible.

### Eventos y sus payloads

#### `quote_created`
```json
{
  "data": {
    "quote_id": "uuid",
    "quote_number": "SHW-2026-000123",
    "title": "Remodelación cocina",
    "client_id": "uuid",
    "client_name": "Juan Pérez",
    "total": 5000000,
    "status": "borrador",
    "created_at": "2026-06-23T10:00:00Z"
  }
}
```

#### `quote_approved`
```json
{
  "data": {
    "quote_id": "uuid",
    "quote_number": "SHW-2026-000123",
    "title": "Remodelación cocina",
    "client_id": "uuid",
    "client_name": "Juan Pérez",
    "total": 5000000,
    "approved_at": "2026-06-23T10:00:00Z"
  }
}
```

#### `order_created`
```json
{
  "data": {
    "order_id": "uuid",
    "order_number": "PED-2026-000045",
    "title": "Remodelación cocina",
    "client_id": "uuid",
    "client_name": "Juan Pérez",
    "total_amount": 5000000,
    "quote_id": "uuid",
    "created_at": "2026-06-23T10:00:00Z"
  }
}
```

#### `work_order_created`
```json
{
  "data": {
    "work_order_id": "uuid",
    "work_order_number": "OT-2026-000089",
    "title": "Instalación cerámica",
    "order_id": "uuid",
    "order_number": "PED-2026-000045",
    "assigned_to_name": "Pedro García",
    "priority": "alta",
    "scheduled_at": "2026-06-24T08:00:00Z"
  }
}
```

#### `work_order_completed`
```json
{
  "data": {
    "work_order_id": "uuid",
    "work_order_number": "OT-2026-000089",
    "title": "Instalación cerámica",
    "order_id": "uuid",
    "order_number": "PED-2026-000045",
    "assigned_to_name": "Pedro García",
    "started_at": "2026-06-24T08:15:00Z",
    "finished_at": "2026-06-24T16:30:00Z",
    "duration_hours": 8.25
  }
}
```

---

## 5. LO QUE NO SE ENVÍA EN EL PAYLOAD

Por seguridad, el payload de webhook **NUNCA incluye**:
- Credenciales de integraciones
- Tokens de autenticación
- Datos de pago (payment_events)
- Claves de cifrado
- Información de otros workspaces
- Datos de admin/super_admin
- Contenido de cotización detallado (calc_snapshot completo)

Solo se envían campos mínimos necesarios para que el receptor identifique el evento y tome acción.

---

## 6. CONFIGURACIÓN POR PROVEEDOR

### Zapier
- URL: `https://hooks.zapier.com/hooks/catch/{account}/{hook_id}/`
- Verificación: El Zap tiene un "Catch Hook" que recibe el POST
- Header de firma: `X-Shelwi-Signature` (configurable en el Zap)

### Make (Integromat)
- URL: `https://hook.eu1.make.com/...` o `https://hook.us1.make.com/...`
- Verificación: Módulo "Custom Webhook" en Make
- Header de firma: configurable en el módulo de filtro

### n8n
- URL: `https://tu-instancia.n8n.cloud/webhook/...`
- Verificación: Nodo "Webhook" con validación HMAC nativa
- Header de firma: `X-Shelwi-Signature`

### URL personalizada (cualquier sistema)
- Cualquier URL HTTPS válida
- Receptor debe verificar `X-Shelwi-Signature` como se describe en sección 2
