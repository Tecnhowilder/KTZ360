# docs/api/ — Documentación de APIs y Edge Functions

Documentación de la superficie de API del proyecto Shelwi.

## Arquitectura de API

Shelwi no tiene una capa REST propia en el frontend. El acceso a datos se realiza exclusivamente via:

1. **Supabase PostgREST** — queries directas a tablas con RLS aplicado.
2. **Supabase RPC** — funciones PL/pgSQL con SECURITY DEFINER para lógica de negocio.
3. **Supabase Edge Functions** — funciones Deno para operaciones que requieren secrets o procesos externos.

## Edge Functions activas

| Función | JWT | Propósito |
|---|---|---|
| `ai-proxy` | ✅ requerido | Proxy para llamadas a APIs de IA (gemini, etc.) |
| `send-email` | ✅ requerido | Envío de correos transaccionales |
| `create-checkout` | ✅ requerido | Creación de sesión de pago MercadoPago |
| `mp-webhook` | ❌ público | Webhook de MercadoPago (pagos confirmados) |
| `oauth-callback` | ❌ público | Callback OAuth para integraciones externas |
| `integration-worker` | ✅ requerido | Worker de integraciones (Alegra, Drive, etc.) |
| `generate-report` | ✅ requerido | Generación asíncrona de reportes |
| `automation-scheduler` | ❌ cron | Scheduler de automatizaciones |
| `connect-integration` | ✅ requerido | Conexión OAuth de integraciones |
| `alegra-webhook` | ❌ público | Webhook de Alegra (facturación) |

## RPCs principales

Los RPCs están documentados en los archivos de migración bajo `supabase/migrations/`. Patrones clave:

- `get_*` — Consultas con workspace isolation
- `list_*` — Listados paginados con tenant isolation
- `create_*` / `update_*` — Mutaciones con Zero Trust (workspace_id del JWT)
- `admin_*` — Operaciones de backoffice (requieren is_super_admin())
- `check_*` — Validaciones de permisos o créditos

## Documentación por dominio

A medida que se documente cada dominio, se añaden archivos aquí:
```
api/
  auth.md          ← Flujo de autenticación y sesiones
  workspaces.md    ← Multi-tenancy y workspace isolation
  quotes.md        ← Cotizaciones y portal público
  orders.md        ← Pedidos y órdenes de trabajo
  integrations.md  ← Integraciones externas (Alegra, Drive, MP)
  ai.md            ← Créditos IA y operaciones del agente
```
