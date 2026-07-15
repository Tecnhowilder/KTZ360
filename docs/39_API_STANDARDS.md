# API STANDARDS — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Estándares para el diseño y consumo de APIs en Shelwi
> APIs: Supabase REST/RPC + Edge Functions (14) + Webhooks entrantes

---

## 1. CAPAS DE API EN SHELWI

```
Frontend
  │
  ├── Supabase Client (@supabase/supabase-js)
  │     ├── supabase.from('tabla').select/insert/update
  │     └── supabase.rpc('funcion', params)
  │
  └── Edge Functions (fetch directo con Bearer JWT)
        ├── /functions/v1/ai-proxy
        ├── /functions/v1/create-checkout
        └── ... (14 funciones total)
```

---

## 2. SUPABASE API — ESTÁNDARES

### 2.1 SELECT — siempre especificar columnas

```typescript
// ✅ Columns específicas
const { data } = await supabase
  .from('clients')
  .select('id, name, email, status, created_at')
  .eq('company_id', workspaceId)
  .order('created_at', { ascending: false })
  .limit(50);

// ❌ SELECT * — evitar en listas (performance)
const { data } = await supabase.from('clients').select('*');
```

### 2.2 Paginación obligatoria

```typescript
// Toda query de lista DEBE tener paginación
const PAGE_SIZE = 25;

const { data, count } = await supabase
  .from('clients')
  .select('*', { count: 'exact' })
  .eq('company_id', workspaceId)
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

### 2.3 Manejo de errores

```typescript
const { data, error } = await supabase.from('clients').insert(newClient).select().single();

if (error) {
  // Errores comunes de Supabase
  if (error.code === '23505') throw new Error('duplicate_entry');
  if (error.code === '42501') throw new Error('insufficient_permissions');
  throw new Error(`Database error: ${error.message}`);
}
```

### 2.4 RPCs — siempre para operaciones con lógica de negocio

```typescript
// Usar RPC cuando la operación involucra múltiples tablas o lógica compleja
const { data, error } = await supabase.rpc('invite_team_member', {
  p_email: email,
  p_role: role,
  p_workspace_id: workspaceId,
});
```

---

## 3. EDGE FUNCTIONS — ESTÁNDARES

### 3.1 Request format

```typescript
// Todas las Edge Functions que requieren auth:
fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ agent: 'AGT-001', prompt: '...' }),
});
```

### 3.2 Response format estándar

```typescript
// Success
{ ok: true, data: { ... } }

// Error
{ error: 'error_code', message: 'human readable message' }
```

### 3.3 HTTP Status Codes

| Código | Cuándo usar |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validación de input) |
| 401 | No autenticado (JWT inválido o ausente) |
| 403 | Sin permisos (JWT válido pero rol insuficiente) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (duplicado) |
| 422 | Entidad no procesable (datos válidos pero no aceptables) |
| 429 | Rate limit excedido |
| 500 | Error interno (no revelar detalles) |

### 3.4 CORS

```typescript
const CORS = {
  'Access-Control-Allow-Origin': '*',  // En producción: restringir a orígenes conocidos
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Responder OPTIONS siempre
if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
```

---

## 4. CATÁLOGO DE EDGE FUNCTIONS

| Función | Método | Auth | Descripción |
|---|---|---|---|
| `ai-proxy` | POST | Bearer JWT | AI Orchestrator central |
| `create-checkout` | POST | Bearer JWT | Crear sesión de pago |
| `mp-webhook` | POST | HMAC signature | Webhook MercadoPago |
| `send-email` | POST | Service role | Enviar emails |
| `send-push` | POST | Service role | Push notifications |
| `generate-report` | POST | Bearer JWT | Generar reportes PDF/Excel |
| `oauth-callback` | GET | — (redirect) | OAuth callback |
| `connect-integration` | POST | Bearer JWT | Conectar integración (API Key) |
| `alegra-webhook` | POST | HMAC signature | Webhook Alegra |
| `integration-worker` | POST | Service role (cron) | Procesar eventos integración |
| `automation-scheduler` | POST | Service role (cron) | Ejecutar automatizaciones |
| `admin-support` | POST | Bearer JWT (superadmin) | Operaciones de soporte |
| `ai-health-check` | GET | Service role | Health check proveedores IA |
| `ai-benchmark` | POST | Bearer JWT (superadmin) | Benchmark de modelos IA |

---

## 5. WEBHOOKS ENTRANTES — VALIDACIÓN

### 5.1 MercadoPago (`mp-webhook`)

```typescript
// Validar firma HMAC-SHA256
const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!;
const signature = req.headers.get('x-signature');
const payload = await req.text();

const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
if (hmac !== signature) {
  return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 401 });
}
```

### 5.2 Alegra (`alegra-webhook`)

```typescript
// Similar a MP pero con header diferente
const signature = req.headers.get('x-alegra-signature');
// ... validación HMAC
```

---

## 6. RATE LIMITING

### 6.1 Implementado en

- `src/services/aiStudio.ts:115` — AI Studio: límite de llamadas por usuario
- `supabase/functions/ai-proxy/` — Rate limit de tokens por empresa

### 6.2 Patrón de rate limit via RPC

```typescript
// Verificar rate limit antes de operaciones costosas
const { data: allowed } = await admin.rpc('check_rate_limit', {
  p_workspace_id: workspaceId,
  p_action: 'ai_call',
  p_limit: 100,          // 100 calls
  p_window: '1 hour',    // por hora
});

if (!allowed) {
  return new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { status: 429 });
}
```

---

*Ver: `docs/13_DATA_DICTIONARY.md` sección Edge Functions para detalles de cada función*
*Ver: `docs/19_SECURITY_GOVERNANCE.md` para seguridad de APIs*
*Ver: `supabase/functions/*/index.ts` para implementación*
