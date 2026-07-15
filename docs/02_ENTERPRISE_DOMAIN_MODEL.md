# ENTERPRISE DOMAIN MODEL — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14 | Basado en: migraciones 0001-0149
> Todas las entidades están confirmadas en el schema de la BD de producción

---

## 1. MAPA DE DOMINIOS

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SHELWI PLATFORM                             │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│  IDENTIDAD   │   NEGOCIO    │  OPERACIONES │       INTELIGENCIA     │
│              │              │              │                        │
│  Company     │  Client      │  Task        │  AI Orchestrator       │
│  Workspace   │  Contact     │  Project     │  AI Capability         │
│  User        │  Lead        │  Employee    │  AI Prompt             │
│  TeamMember  │  Quote       │  GPS Event   │  AI Credit / Usage     │
│  Invitation  │  Order       │  Evidence    │  Automation            │
│  Plan        │  Invoice     │  Ticket      │  Webhook               │
│  Subscription│  Payment     │  Catalog     │  Integration           │
│              │  Portal      │  Loyalty     │  Memory Engine         │
│              │              │  Review      │  Policy Engine         │
└──────────────┴──────────────┴──────────────┴────────────────────────┘
```

---

## 2. ENTIDADES POR DOMINIO

### 2.1 DOMINIO: IDENTIDAD

**Company** — La empresa registrada en Shelwi
```
id UUID PK
name TEXT
slug TEXT UNIQUE
created_at TIMESTAMPTZ
```
*Relaciones: 1:N Workspace, 1:N User*

**Workspace** — Instancia operativa de una empresa (multi-workspace por company en Enterprise)
```
id UUID PK
company_id UUID FK → Company
name TEXT
plan_code TEXT → Plan
status TEXT (active|suspended|churned)
settings JSONB
```
*Relaciones: N:1 Company, N:M User via TeamMember, 1:N todas las entidades de negocio*

**User / Profile** — Usuario individual de la plataforma
```
id UUID PK (Supabase Auth)
email TEXT UNIQUE
full_name TEXT
avatar_url TEXT
```
*Relaciones: N:M Workspace via TeamMember*

**TeamMember** — Relación User↔Workspace con rol
```
id UUID PK
workspace_id UUID FK → Workspace
user_id UUID FK → User
role TEXT (owner|admin|manager|member|viewer|guest)
department TEXT
joined_at TIMESTAMPTZ
```

**Invitation** — Invitación pendiente a un workspace
```
id UUID PK
workspace_id UUID FK
invitee_email TEXT
role TEXT
token UUID UNIQUE
expires_at TIMESTAMPTZ
status TEXT (pending|accepted|expired|revoked)
```

**Plan** — Plan de suscripción disponible
```
id UUID PK
code TEXT UNIQUE (free|pro|premium|enterprise — legacy; Start|Growth|BusinessOS|EnterpriseOS — target)
name TEXT
monthly_price DECIMAL
annual_price DECIMAL
is_active BOOLEAN
```

**PlanFeature** — Features habilitadas por plan
```
id UUID PK
plan_code TEXT FK → Plan
feature_key TEXT
enabled BOOLEAN
metadata JSONB
```

**PlanLimit** — Límites numéricos por plan
```
id UUID PK
plan_code TEXT FK → Plan
resource TEXT (users|storage_gb|ai_credits_monthly|...)
max_value INTEGER
```

**Subscription** — Suscripción activa de un workspace
```
id UUID PK
workspace_id UUID FK → Workspace
plan_code TEXT FK → Plan
status TEXT (active|past_due|canceled|trialing)
current_period_start TIMESTAMPTZ
current_period_end TIMESTAMPTZ
payment_provider TEXT (mercadopago|stripe)
external_subscription_id TEXT
```

**AdditionalLicense** — Licencias adicionales de usuario
```
id UUID PK
workspace_id UUID FK
quantity INT
price_per_unit DECIMAL
```

---

### 2.2 DOMINIO: NEGOCIO

**Client** — Cliente de la empresa (comprador)
```
id UUID PK
company_id UUID FK → Workspace
name TEXT
email TEXT
phone TEXT
tax_id TEXT (RUT, CUIT, etc.)
address JSONB
status TEXT (active|inactive|prospect)
source TEXT
deleted_at TIMESTAMPTZ (soft delete)
```

**Contact** — Persona de contacto dentro de un cliente
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client
name TEXT
email TEXT
phone TEXT
role TEXT
is_primary BOOLEAN
```

**Lead** — Lead comercial no convertido aún
```
id UUID PK
company_id UUID FK → Workspace
name TEXT
email TEXT
source TEXT
status TEXT (new|contacted|qualified|lost)
assigned_to UUID FK → User
```

**Quote / Cotización**
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client
quote_number TEXT UNIQUE
status TEXT (draft|sent|accepted|rejected|expired)
total DECIMAL
currency TEXT
valid_until DATE
```

**QuoteItem**
```
id UUID PK
quote_id UUID FK → Quote
catalog_item_id UUID FK → CatalogItem (opt)
description TEXT
quantity DECIMAL
unit_price DECIMAL
tax_percent DECIMAL
subtotal DECIMAL
```

**QuoteRevision** — Historial de revisiones de una cotización
```
id UUID PK
quote_id UUID FK → Quote
revision_number INT
snapshot JSONB
created_by UUID FK → User
```

**Order / Pedido**
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client
order_number TEXT
status TEXT (pending|in_progress|delivered|canceled)
total DECIMAL
```

**Invoice / Factura**
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client
invoice_number TEXT UNIQUE
status TEXT (draft|sent|paid|overdue|void)
issue_date DATE
due_date DATE
total DECIMAL
currency TEXT
alegra_id TEXT (si está sincronizada con Alegra)
```

**Payment / Pago**
```
id UUID PK
company_id UUID FK → Workspace
invoice_id UUID FK → Invoice
amount DECIMAL
payment_date DATE
method TEXT (cash|transfer|card|check|other)
reference TEXT
```

**CatalogItem / Producto**
```
id UUID PK
company_id UUID FK → Workspace
name TEXT
description TEXT
price DECIMAL
unit TEXT
tax_percent DECIMAL
stock INT
track_stock BOOLEAN
sku TEXT
```

**PortalSession** — Sesión del cliente en el portal público
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client
token UUID UNIQUE
expires_at TIMESTAMPTZ
last_viewed_at TIMESTAMPTZ
```

---

### 2.3 DOMINIO: OPERACIONES

**Task / Tarea**
```
id UUID PK
company_id UUID FK → Workspace
title TEXT
description TEXT
status TEXT (pending|in_progress|completed|canceled)
priority TEXT (low|medium|high|urgent)
assignee_id UUID FK → User
project_id UUID FK → Project (opt)
due_date DATE
completed_at TIMESTAMPTZ
deleted_at TIMESTAMPTZ
```

**Project / Proyecto**
```
id UUID PK
company_id UUID FK → Workspace
name TEXT
description TEXT
status TEXT (planning|active|on_hold|completed|canceled)
start_date DATE
end_date DATE
progress INT (0-100)
manager_id UUID FK → User
```

**Employee / Empleado**
```
id UUID PK
company_id UUID FK → Workspace
user_id UUID FK → User (opt)
name TEXT
email TEXT
role TEXT
department TEXT
hire_date DATE
salary DECIMAL
status TEXT (active|inactive|on_leave)
```

**GPSEvent**
```
id UUID PK
company_id UUID FK → Workspace
user_id UUID FK → User
latitude DECIMAL
longitude DECIMAL
accuracy DECIMAL
event_type TEXT (check_in|check_out|waypoint|emergency)
timestamp TIMESTAMPTZ
synced_at TIMESTAMPTZ (null si offline)
```

**Evidence / Evidencia**
```
id UUID PK
company_id UUID FK → Workspace
user_id UUID FK → User
task_id UUID FK → Task (opt)
type TEXT (photo|document|audio|video)
storage_path TEXT
metadata JSONB
synced_at TIMESTAMPTZ
```

**CustomerTicket**
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client (opt)
subject TEXT
status TEXT (open|in_progress|resolved|closed)
priority TEXT
channel TEXT (email|whatsapp|portal|phone)
assigned_to UUID FK → User
```

**LoyaltyProgram**
```
id UUID PK
company_id UUID FK → Workspace
name TEXT
type TEXT (points|cashback|stamps)
rules JSONB
is_active BOOLEAN
```

**Review**
```
id UUID PK
company_id UUID FK → Workspace
client_id UUID FK → Client
rating INT (1-5)
comment TEXT
source TEXT
reply TEXT
```

---

### 2.4 DOMINIO: INTELIGENCIA

**Automation / Automatización**
```
id UUID PK
company_id UUID FK → Workspace
name TEXT
trigger_type TEXT (event|schedule|webhook|manual)
trigger_config JSONB
is_active BOOLEAN
last_run_at TIMESTAMPTZ
```

**AutomationAction**
```
id UUID PK
automation_id UUID FK → Automation
action_type TEXT (send_email|send_push|create_task|webhook|update_field)
action_config JSONB
order INT
```

**Integration**
```
id UUID PK
company_id UUID FK → Workspace
provider TEXT (alegra|whatsapp|stripe|mercadopago|zapier|...)
status TEXT (active|inactive|error)
connected_at TIMESTAMPTZ
last_sync_at TIMESTAMPTZ
```

**IntegrationCredential**
```
id UUID PK
integration_id UUID FK → Integration
credential_type TEXT
encrypted_value TEXT (stored in Supabase Vault)
expires_at TIMESTAMPTZ
```

**Webhook**
```
id UUID PK
company_id UUID FK → Workspace
url TEXT
events TEXT[]
secret TEXT (hashed)
is_active BOOLEAN
```

**AICapabilityRegistry** — Migration 0148
```
id UUID PK
company_id UUID FK (opt — global si null)
capability_id TEXT UNIQUE
name TEXT
domain TEXT
action TEXT
input_schema JSONB
output_schema JSONB
permissions JSONB
events JSONB[]
tools JSONB[]
status TEXT (defined|in_dev|implemented|deprecated)
```

**AIPromptVersion** — Migration 0149
```
id UUID PK
agent_id TEXT
version TEXT (semver)
system_prompt TEXT
slots TEXT[]
restrictions TEXT[]
scope TEXT[]
is_active BOOLEAN
created_by UUID FK → User
```

**AICredit** — Créditos IA por workspace
```
id UUID PK
workspace_id UUID FK → Workspace
credits_total INT
credits_used INT
credits_remaining INT
reset_date DATE
```

**AIUsage** — Registro de uso IA
```
id UUID PK
company_id UUID FK → Workspace
user_id UUID FK → User
agent_id TEXT
model TEXT
prompt_tokens INT
completion_tokens INT
total_tokens INT
estimated_cost_usd DECIMAL
prompt_version_id UUID FK → AIPromptVersion
created_at TIMESTAMPTZ
```

**AuditLog** — Inmutable, INSERT solo
```
id UUID PK
company_id UUID FK → Workspace
user_id UUID FK → User (null para sistema)
agent_id TEXT (null para humanos)
action TEXT
entity_type TEXT
entity_id UUID
diff JSONB
ip_address TEXT
created_at TIMESTAMPTZ
```

**ActiveSession** — Sesiones de usuario activas
```
id UUID PK
user_id UUID FK → User
workspace_id UUID FK → Workspace
device_type TEXT (web|ios|android)
created_at TIMESTAMPTZ
last_active_at TIMESTAMPTZ
```

---

## 3. DIAGRAMA DE RELACIONES CLAVE

```
Company ──1:N──> Workspace ──1:N──> [Todas las entidades de negocio]
                     │
                     ├──N:M──> User (via TeamMember)
                     ├──1:N──> Subscription ──> Plan
                     ├──1:N──> Client ──1:N──> Quote, Invoice, Order
                     ├──1:N──> Task, Project
                     ├──1:N──> Employee
                     ├──1:N──> Integration ──> Webhook
                     ├──1:N──> Automation
                     ├──1:N──> AICapabilityRegistry
                     └──1:N──> AIUsage, AICredit, AuditLog
```

---

## 4. REGLAS DE DOMINIO

1. **Toda entidad de negocio tiene `company_id`** — apunta a `workspaces.id`
2. **Soft delete obligatorio** — `deleted_at TIMESTAMPTZ DEFAULT NULL` en entidades de negocio
3. **AuditLog es inmutable** — solo INSERT, nunca UPDATE/DELETE
4. **GPSEvent y Evidence** tienen `synced_at` nullable para soporte offline
5. **AIPromptVersion** es inmutable — nunca actualizar; crear nueva versión
6. **AICredential** cifrada — valor real en Supabase Vault, no en la tabla directamente
7. **Subscription** es la fuente de verdad de acceso al plan — no el campo `plan_code` del workspace

---

*Fuente: migraciones 0001-0149 en `supabase/migrations/`*
*Actualizar este documento al crear nuevas migraciones con nuevas entidades*
