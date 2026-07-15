# DATA DICTIONARY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Glosario de tablas, enums, RPCs y Edge Functions del sistema
> Fuente: `supabase/migrations/0001-0149`, `src/lib/database.types.ts`

---

## 1. TABLAS CORE

### 1.1 companies
Empresa registrada en Shelwi. Es la entidad raíz del sistema multi-tenant.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `name` | TEXT | Nombre legal de la empresa |
| `slug` | TEXT UNIQUE | Identificador URL-friendly |
| `created_at` | TIMESTAMPTZ | Fecha de registro |

### 1.2 workspaces
Instancia operativa de una empresa. Una company puede tener múltiples workspaces (plan Enterprise).
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | Identificador único — es el `company_id` que usan todas las demás tablas |
| `company_id` | UUID FK | FK → companies |
| `name` | TEXT | Nombre del workspace |
| `plan_code` | TEXT | Plan activo (legacy: free/pro/premium) |
| `status` | TEXT | active / suspended / churned |
| `settings` | JSONB | Configuración: timezone, currency, logo_url, etc. |
| `created_at` | TIMESTAMPTZ | — |

### 1.3 team_members
Relación usuario-workspace con rol. Es la tabla de autorización.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `workspace_id` | UUID FK | → workspaces |
| `user_id` | UUID FK | → auth.users |
| `role` | TEXT | owner/admin/manager/member/viewer/guest |
| `department` | TEXT | Departamento asignado (opcional) |
| `joined_at` | TIMESTAMPTZ | — |

### 1.4 invitations
Invitaciones pendientes de aceptar.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `workspace_id` | UUID FK | — |
| `invitee_email` | TEXT | Email al que se invita |
| `role` | TEXT | Rol que tendrá al aceptar |
| `token` | UUID UNIQUE | Token para el link de invitación |
| `expires_at` | TIMESTAMPTZ | Vence en 7 días |
| `status` | TEXT | pending/accepted/expired/revoked |
| `invited_by` | UUID FK | → auth.users |

### 1.5 plans
Planes de suscripción disponibles. Tabla pública (sin RLS).
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `code` | TEXT UNIQUE | free/pro/premium/enterprise (legacy) |
| `name` | TEXT | Nombre visible |
| `monthly_price` | DECIMAL | Precio mensual en USD |
| `annual_price` | DECIMAL | Precio anual en USD |
| `is_active` | BOOLEAN | Si está disponible para nuevos clientes |

### 1.6 plan_features
Features habilitadas por plan. Tabla pública.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `plan_code` | TEXT FK | → plans |
| `feature_key` | TEXT | Identificador de la feature (ej: 'crm_access') |
| `enabled` | BOOLEAN | Si la feature está habilitada |
| `metadata` | JSONB | Config adicional de la feature (ej: límites específicos) |

---

## 2. TABLAS DE NEGOCIO

### 2.1 clients
Clientes de la empresa. Soft delete.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | → workspaces (RLS) |
| `name` | TEXT | Nombre del cliente |
| `email` | TEXT | Email principal |
| `phone` | TEXT | Teléfono |
| `tax_id` | TEXT | RUT/CUIT/NIT/RFC según país |
| `address` | JSONB | Dirección estructurada |
| `status` | TEXT | active/inactive/prospect |
| `source` | TEXT | Cómo llegó (web/referido/directo/whatsapp) |
| `assigned_to` | UUID FK | → auth.users |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

### 2.2 quotes (cotizaciones)
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `client_id` | UUID FK | → clients |
| `quote_number` | TEXT | Número secuencial (QT-0001) |
| `status` | TEXT | draft/sent/accepted/rejected/expired |
| `total` | DECIMAL | Total sin impuestos |
| `tax_total` | DECIMAL | Total de impuestos |
| `grand_total` | DECIMAL | Total final |
| `currency` | TEXT | USD/COP/MXN/etc. |
| `valid_until` | DATE | Fecha de vencimiento |
| `notes` | TEXT | Notas internas |
| `terms` | TEXT | Términos y condiciones |

### 2.3 quote_items
Items de una cotización.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `quote_id` | UUID FK | → quotes |
| `company_id` | UUID FK | — (desnormalizado para RLS) |
| `catalog_item_id` | UUID FK | → catalog_items (opcional) |
| `description` | TEXT | Descripción del ítem |
| `quantity` | DECIMAL | Cantidad |
| `unit_price` | DECIMAL | Precio unitario |
| `tax_percent` | DECIMAL | % de impuesto |
| `subtotal` | DECIMAL | quantity × unit_price |
| `tax_amount` | DECIMAL | — |
| `total` | DECIMAL | subtotal + tax |

### 2.4 invoices (facturas)
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `client_id` | UUID FK | → clients |
| `invoice_number` | TEXT UNIQUE | Número de factura (FV-0001) |
| `status` | TEXT | draft/sent/paid/overdue/void/partial |
| `issue_date` | DATE | Fecha de emisión |
| `due_date` | DATE | Fecha de vencimiento |
| `subtotal` | DECIMAL | — |
| `tax_total` | DECIMAL | — |
| `grand_total` | DECIMAL | — |
| `currency` | TEXT | — |
| `alegra_id` | TEXT | ID en Alegra si sincronizada |
| `paid_at` | TIMESTAMPTZ | Cuándo se pagó completamente |

### 2.5 payments
Pagos registrados contra facturas.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `invoice_id` | UUID FK | → invoices |
| `amount` | DECIMAL | Monto pagado |
| `payment_date` | DATE | Fecha del pago |
| `method` | TEXT | cash/transfer/card/check/other |
| `reference` | TEXT | Número de referencia o transacción |

### 2.6 tasks
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `title` | TEXT | Título de la tarea |
| `description` | TEXT | Descripción |
| `status` | TEXT | pending/in_progress/completed/canceled |
| `priority` | TEXT | low/medium/high/urgent |
| `assignee_id` | UUID FK | → auth.users |
| `project_id` | UUID FK | → projects (opcional) |
| `due_date` | DATE | — |
| `completed_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

### 2.7 projects
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `name` | TEXT | — |
| `status` | TEXT | planning/active/on_hold/completed/canceled |
| `start_date` | DATE | — |
| `end_date` | DATE | — |
| `progress` | INT | 0-100 |
| `manager_id` | UUID FK | → auth.users |
| `client_id` | UUID FK | → clients (opcional) |

---

## 3. TABLAS DE IA

### 3.1 ai_usage
Registro de toda invocación IA. Particionada por `created_at`.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `user_id` | UUID FK | → auth.users |
| `agent_id` | TEXT | AGT-001, etc. |
| `model` | TEXT | gemini-2.5-pro, llama-3.3-70b, etc. |
| `provider` | TEXT | gemini/nvidia |
| `prompt_tokens` | INT | — |
| `completion_tokens` | INT | — |
| `total_tokens` | INT | — |
| `estimated_cost_usd` | DECIMAL | — |
| `latency_ms` | INT | — |
| `prompt_version_id` | UUID FK | → ai_prompt_versions |
| `model_fallback` | BOOLEAN | Si se usó fallback |
| `error` | TEXT | Si hubo error |
| `created_at` | TIMESTAMPTZ | — |

### 3.2 audit_log
Inmutable — solo INSERT. Particionada por `created_at`.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `company_id` | UUID FK | — |
| `user_id` | UUID FK | Null para acciones de sistema |
| `agent_id` | TEXT | Null para acciones humanas |
| `action` | TEXT | CLIENT_CREATED, INVOICE_PAID, etc. |
| `entity_type` | TEXT | client, invoice, task, etc. |
| `entity_id` | UUID | ID del registro afectado |
| `diff` | JSONB | { before: {...}, after: {...} } |
| `ip_address` | TEXT | — |
| `user_agent` | TEXT | — |
| `metadata` | JSONB | Contexto adicional |
| `created_at` | TIMESTAMPTZ | — |

---

## 4. ENUMS PRINCIPALES

```sql
-- Estados de cotización
quote_status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

-- Estados de factura
invoice_status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'partial'

-- Roles de usuario
team_role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'

-- Prioridades de tarea
task_priority: 'low' | 'medium' | 'high' | 'urgent'

-- Estados de tarea
task_status: 'pending' | 'in_progress' | 'completed' | 'canceled'

-- Métodos de pago
payment_method: 'cash' | 'transfer' | 'card' | 'check' | 'other'

-- Tipos de evento GPS
gps_event_type: 'check_in' | 'check_out' | 'waypoint' | 'emergency'

-- Estados de integración
integration_status: 'active' | 'inactive' | 'error' | 'pending'

-- Policy de agente IA
agent_policy: 'observer' | 'assistant' | 'semi_autonomous' | 'autonomous'

-- Estado del ciclo de vida de agente
agent_execution_status: 'idle' | 'triggered' | 'planning' | 'awaiting_approval' | 'executing' | 'completed' | 'error' | 'dead_letter' | 'paused'
```

---

## 5. RPCs PRINCIPALES

| RPC | Descripción | Seguridad |
|---|---|---|
| `current_workspace_id()` | Devuelve el workspace_id del JWT actual | SECURITY DEFINER |
| `invite_team_member(email, role, workspace_id)` | Invita un miembro | SECURITY DEFINER |
| `accept_invitation(token)` | Acepta una invitación | SECURITY DEFINER |
| `get_dashboard_metrics(workspace_id, period)` | Métricas del dashboard | SECURITY DEFINER |
| `queue_email_send(to, template_id, variables)` | Encola un email | SECURITY DEFINER |
| `queue_integration_event(integration_id, event)` | Encola evento de integración | SECURITY DEFINER |
| `evaluate_and_queue_automations(event_type, payload)` | Evalúa y encola automatizaciones | SECURITY DEFINER |
| `queue_invoice_generation(order_id)` | Encola generación de factura | SECURITY DEFINER |
| `check_rate_limit(workspace_id, action, limit, window)` | Verifica rate limit | SECURITY DEFINER |
| `get_ai_credits_remaining(workspace_id)` | Créditos IA disponibles | SECURITY DEFINER |

---

## 6. EDGE FUNCTIONS

| Función | Método | Auth | Descripción |
|---|---|---|---|
| `ai-proxy` | POST | Bearer JWT | AI Orchestrator — punto de entrada único IA |
| `create-checkout` | POST | Bearer JWT | Crea sesión de checkout MP/Stripe |
| `mp-webhook` | POST | HMAC signature | Webhook de MercadoPago |
| `send-email` | POST | Service role | Envía emails via proveedor |
| `send-push` | POST | Service role | Envía push notifications via FCM |
| `generate-report` | POST | Bearer JWT | Genera reportes PDF/Excel |
| `oauth-callback` | GET | — | Callback OAuth para integraciones |
| `connect-integration` | POST | Bearer JWT | Conecta integración externa |
| `alegra-webhook` | POST | HMAC signature | Webhook de Alegra |
| `integration-worker` | POST | Service role | Worker de integraciones |
| `automation-scheduler` | POST | Service role (cron) | Ejecuta automatizaciones agendadas |
| `admin-support` | POST | Bearer JWT (superadmin) | Operaciones de soporte admin |
| `ai-health-check` | GET | Service role | Health check de proveedores IA |
| `ai-benchmark` | POST | Bearer JWT (superadmin) | Benchmark de modelos IA |

---

## 7. STORAGE BUCKETS

| Bucket | Acceso | Contenido |
|---|---|---|
| `evidences` | Private (RLS) | Fotos y documentos de evidencias de campo |
| `avatars` | Public | Fotos de perfil de usuarios |
| `company-logos` | Public | Logos de empresas/workspaces |
| `reports` | Private (RLS) | Reportes PDF generados |
| `documents` | Private (RLS) | Documentos de clientes/contratos |
| `catalog-images` | Public | Imágenes de productos del catálogo |

---

*Actualizar al crear nuevas migraciones*
*Fuente: `supabase/migrations/0001-0149` y `src/lib/database.types.ts`*
