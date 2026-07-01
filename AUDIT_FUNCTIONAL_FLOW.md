# AUDIT_FUNCTIONAL_FLOW.md
# Shelwi — Auditoría de Flujos Funcionales End-to-End
Fecha: 2026-06-25

---

## FLUJO 1: Cliente → Cotización → Pedido → OT → Factura → Encuesta → Reseña → CS

| Paso | Estado | Observación |
|------|--------|-------------|
| Crear cliente | ✅ Funcional | Clientes → botón nuevo / FAB |
| Crear cotización manual | ✅ Funcional | /app/cotizaciones/nueva |
| Aprobar cotización | ✅ Funcional | QuoteDetailPage → acción "Aprobar" |
| Cotización → Pedido | ⚠️ BLOQUEANTE | `create_order` RPC **requiere quote aprobada**. El botón "Crear pedido" desde el detalle de cotización funciona solo si status='Aprobada'. Si el usuario intenta crear pedido de otra forma, falla. |
| Pedido → OT | ✅ Funcional | PedidoDetailPage → "Nueva OT" |
| OT → Finalizar | ✅ Funcional | OTDetailPage → cambiar estado |
| OT → Factura Alegra | ✅ Funcional | Si Alegra conectado, auto-factura al finalizar pedido |
| Pedido finalizado → Encuesta | ✅ Funcional | Trigger automático si encuesta activa (Sprint 16) |
| Encuesta → Reseña | ✅ Funcional | Portal cliente → tab Reseña |
| Reseña → Customer Success | ✅ Funcional | Score actualizado automáticamente |

**Fallo crítico**: NO existe flujo **Pedido Directo** sin cotización. La RPC `create_order` requiere `p_quote_id` de una cotización aprobada. El botón "Nuevo pedido" del FAB solo navega a `/app/pedidos` sin abrir ningún formulario de creación.

---

## FLUJO 2: Pedido Directo (sin cotización)

| Paso | Estado | Observación |
|------|--------|-------------|
| Botón "Nuevo pedido" (FAB/Dashboard) | ❌ DESCONECTADO | Navega a `/app/pedidos` — NO abre formulario de creación |
| Formulario "Nuevo pedido sin cotización" | ❌ NO EXISTE | No hay pantalla ni RPC que soporte pedido directo |
| `create_order` con `p_quote_id=null` | ❌ FALLA | RPC requiere cotización aprobada existente |

**Acción requerida**: Crear `create_direct_order` RPC + pantalla `PedidoNuevoPage`.

---

## FLUJO 3: IA → Crear cotización por voz

| Paso | Estado | Observación |
|------|--------|-------------|
| FAB → "Crear con IA" | ✅ Navega | Lleva a `/app/ia` |
| `/app/ia` → modo voz | ❌ INCOMPLETO | `KtzIA` muestra copiloto comercial pero **NO tiene interfaz de voz para crear cotizaciones**. Solo ofrece análisis de cotizaciones existentes. |
| Transcripción de voz | ❌ NO EXISTE | No hay Web Speech API ni STT integrado |
| IA genera cotización desde voz | ❌ NO EXISTE | No hay flujo completo IA → cotización nueva |
| Vista previa → confirmar | ❌ NO EXISTE | — |

**Fallo crítico**: El flujo "Hablar con IA para crear cotización" está **anunciado en el FAB y Dashboard pero no implementado**.

---

## FLUJO 4: Growth / Marketing

| Paso | Estado | Observación |
|------|--------|-------------|
| Referidos | ✅ Funcional | `/app/growth` — Sprint 17 |
| UTM tracking | ✅ Funcional | track_referral_visit funciona |
| Cupones | ✅ Funcional | promotions tabla activa |
| Portal cliente → tab Invitar | ✅ Funcional | Si programa activo |

---

## FLUJO 5: Portal Cliente

| Paso | Estado | Observación |
|------|--------|-------------|
| Enlace /p/:token | ✅ Funcional | Post-hotfix 0103 (90 días expiración) |
| Ver cotización | ✅ Funcional | PublicQuotePortal |
| Aprobar/Rechazar | ✅ Funcional | register_consent_and_event |
| Portal /portal/:token | ✅ Funcional | ClientPortalPage |
| Tab Cotizaciones | ✅ Funcional | |
| Tab Pedidos | ✅ Funcional | |
| Tab Fotos/Evidencias | ✅ Funcional | |
| Tab Historial | ✅ Funcional | |
| Tab Puntos (Loyalty) | ✅ Funcional | Si loyalty_enabled |
| Tab Encuesta | ✅ Funcional | Si survey activo |
| Tab Invitar (Referidos) | ✅ Funcional | Si programa referidos activo |
| Tab Reseña | ✅ Funcional | |

---

## FLUJO 6: Automatizaciones

| Paso | Estado | Observación |
|------|--------|-------------|
| Crear regla | ✅ Funcional | AutomatizacionesPage |
| Trigger por evento | ✅ Funcional | Triggers Sprint 13 funcionan |
| Enviar WhatsApp auto | ✅ Funcional | Si WA conectado |
| Enviar email | ✅ Funcional | Via Gmail/Outlook integración |
| Notificar usuario interno | ✅ Funcional | |
| Webhooks externos | ✅ Funcional | Sprint Webhooks |

---

## FLUJO 7: Facturación / Alegra

| Paso | Estado | Observación |
|------|--------|-------------|
| Conectar Alegra | ✅ Funcional | Config → Integraciones |
| Auto-factura al finalizar pedido | ✅ Funcional | Si auto_invoice=true |
| Factura manual desde pedido | ✅ Funcional | queue_invoice_generation |
| Ver estado facturas | ⚡ PARCIAL | Solo si Alegra conectado; sin sincronización bidireccional de pagos |
| Factura SaaS Shelwi | ❌ NO EXISTE | saas_invoices en status='pending_config' |
