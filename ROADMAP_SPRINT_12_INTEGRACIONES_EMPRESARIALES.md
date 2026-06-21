# ROADMAP SPRINT 12 — INTEGRACIONES EMPRESARIALES

**Fecha inicio:** 2026-06-21  
**Objetivo:** Conectar Shelwi con Alegra (facturación), Gmail y Outlook Mail (correo corporativo).

---

## INTEGRACIONES IMPLEMENTADAS

| Integración | Estado | Método | Sprint |
|---|---|---|---|
| **Alegra** | ✅ Funcional | API Key (email + token) | 12 |
| **Gmail** | ✅ Infraestructura completa | OAuth 2.0 PKCE (scope gmail.send) | 12 |
| **Outlook Mail** | ✅ Infraestructura completa | OAuth 2.0 PKCE (scope Mail.Send) | 12 |

---

## FLUJO DE FACTURACIÓN ALEGRA

```
Pedido finalizado
↓
Trigger trg_order_auto_invoice (si auto_invoice=true)
  ó
Usuario → "Generar factura" → queue_invoice_generation(order_id)
↓
integration_events (status='pending', provider='alegra', event_type='invoice_create')
↓
integration-worker → AlegraAdapter
  ├── Buscar contacto en integration_entity_refs (si ya sincronizado)
  ├── Si no → crear contacto en Alegra → guardar en integration_entity_refs
  ├── Crear factura en Alegra API
  └── Guardar en integration_invoices (trazabilidad Shelwi)
↓
Shelwi tiene su copia: invoice_number, invoice_status, total, issued_at
```

---

## FLUJO DE CORREO CORPORATIVO

```
Usuario → "Enviar por Gmail/Outlook" → queue_email_send(quote_id, provider)
↓
integration_events (provider='gmail'|'outlook_mail', event_type='email_send')
↓
integration-worker → GmailAdapter / OutlookMailAdapter
  ├── Obtener access_token (con refresh automático si vencido)
  ├── Obtener URL del portal del cliente (Sprint 10)
  ├── Construir email con HTML template
  ├── Enviar via Gmail API / Microsoft Graph API
  └── Registrar en communication_log (status='sent')
```

---

## TABLAS CREADAS (3)

| Tabla | Descripción |
|---|---|
| `integration_invoices` | Trazabilidad de facturas en Shelwi (independiente de Alegra) |
| `integration_entity_refs` | IDs externos genéricos: calendar_event_id, alegra_invoice_id, drive_file_id, etc. |
| `communication_log` | Historial unificado: WhatsApp + Gmail + Outlook Mail |

---

## CAMBIO DE DISEÑO: event_type sin constraint

El `CHECK constraint` en `integration_events.event_type` fue eliminado (migración 0065). La validación ocurre en RPC y worker. Esto permite agregar tipos nuevos en Sprint 13+ sin migraciones destructivas.

---

## RPCs CREADAS (8)

| RPC | Descripción |
|---|---|
| `store_alegra_credentials` | Guarda API Key cifrada. Solo service_role. |
| `upsert_entity_ref` | Guardar/actualizar ID externo (calendar, invoice, etc.) |
| `get_entity_refs` | Obtener todos los IDs externos de una entidad |
| `log_communication` | Registrar comunicación en communication_log |
| `get_communication_history` | Historial filtrable de comunicaciones |
| `queue_invoice_generation` | Encolar generación de factura Alegra |
| `queue_email_send` | Encolar envío de email via Gmail o Outlook Mail |
| `get_invoice_history` | Historial de facturas con resumen |

---

## EDGE FUNCTIONS

### Nueva: `connect-integration`
- Valida API Key de Alegra llamando a Alegra API (`GET /company`)
- Cifra credenciales con AES-256-GCM
- Almacena via `store_alegra_credentials` RPC (service_role)
- Botón "Probar conexión" incluido en el formulario UI

### Actualizada: `integration-worker`
Nuevos adapters:
- `AlegraAdapter`: crea facturas, sincroniza contactos
- `GmailAdapter`: envía emails via Gmail API
- `OutlookMailAdapter`: envía emails via Microsoft Graph
- Fix Sprint 12: `storeCalendarRef()` — guarda calendar_event_id en `integration_entity_refs`

---

## DEUDA TÉCNICA RESUELTA

| Deuda | Resolución |
|---|---|
| `buildWhatsAppMessage()` duplicado en `shareUtils.ts` | Eliminado. Solo existe en `services/whatsapp.ts` |
| `openWhatsAppShare()` en shareUtils.ts | Marcado como `@deprecated`. Se mantiene como fallback hasta Sprint 13 |
| `calendar_event_id` sin persistencia | Ahora guardado en `integration_entity_refs` (storeCalendarRef en worker) |

---

## pg_cron — Worker Automático

La migración 0067 intenta configurar pg_cron automáticamente si las extensiones están disponibles. Si no, configurar manualmente:

**Opción 1: Supabase Dashboard**
- Edge Functions → integration-worker → Schedule
- Frecuencia: `*/1 * * * *` (cada minuto)

**Opción 2: pg_cron manual**
```sql
SELECT cron.schedule(
  'integration-worker-auto',
  '* * * * *',
  $$ SELECT net.http_post(url := '...', ...) $$
);
```

---

## INSTRUCCIONES DE DEPLOYMENT

```sql
-- Supabase SQL Editor, en orden:
0065_integrations_s12_schema.sql
0066_integrations_s12_rpc.sql
0067_integrations_s12_triggers_cron.sql
```

```bash
# Edge Functions:
npx supabase functions deploy connect-integration
npx supabase functions deploy integration-worker
```

**Secrets adicionales requeridos** (ya tenías los de Sprint 11):
- `INTEGRATION_ENCRYPTION_KEY` — ya configurado

---

## CHECKLIST SPRINT 12

| # | Ítem | Estado |
|---|---|---|
| 1 | Alegra: API Key con validación antes de guardar | ✅ |
| 2 | Alegra: facturación manual desde pedido | ✅ |
| 3 | Alegra: facturación automática (trigger on finalizado) | ✅ |
| 4 | Alegra: trazabilidad en integration_invoices | ✅ |
| 5 | Gmail: OAuth + envío via API | ✅ |
| 6 | Outlook Mail: OAuth + envío via Microsoft Graph | ✅ |
| 7 | integration_entity_refs: IDs externos genéricos | ✅ |
| 8 | communication_log: historial unificado | ✅ |
| 9 | event_type constraint eliminado (flexibilidad Sprint 13+) | ✅ |
| 10 | buildWhatsAppMessage eliminado de shareUtils.ts | ✅ |
| 11 | calendar_event_id ahora guardado en entity_refs | ✅ |
| 12 | pg_cron setup en migración | ✅ |
| 13 | connect-integration Edge Function | ✅ |
| 14 | integration-worker: 3 adapters nuevos | ✅ |
| 15 | PROVIDER_META: alegra/gmail/outlook_mail → available: true | ✅ |
| 16 | IntegracionesPage: providers nuevos en "Disponibles" | ✅ |
| 17 | Formulario Alegra con API Key + botón conectar | ✅ |
| 18 | Build TypeScript: 0 errores | ✅ |

---

## ARQUITECTURA PREPARADA PARA SPRINT 13+

| Provider | Qué se necesita agregar |
|---|---|
| Drive | GoogleDriveAdapter en integration-worker + OAuth scope drive.file |
| OneDrive | OneDriveAdapter + OAuth scope Files.ReadWrite |
| Teams | TeamsAdapter + OAuth scope ChannelMessage.Send |
| SMS | SMSAdapter + provider Twilio/AWS SNS |

Gracias a `integration_entity_refs` (genérico), `communication_log` (genérico), y `integration_events` sin constraint, no se requieren migraciones de schema.

---

## RIESGOS RESIDUALES

| Riesgo | Severidad | Plan |
|---|---|---|
| Alegra API puede cambiar endpoints | Bajo | Centralizado en AlegraAdapter — cambio en un solo lugar |
| `openWhatsAppShare()` en shareUtils.ts aún existe | Bajo | Sprint 13: eliminar completamente |
| pg_cron puede no estar disponible en plan free | Bajo | Usar Supabase Dashboard → Edge Functions → Schedule como alternativa |
| Gmail OAuth puede requerir verificación de Google | Bajo | Pantalla de advertencia en UI; acceso completo requiere verificación de app |
