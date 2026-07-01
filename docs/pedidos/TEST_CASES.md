# PEDIDOS — TEST CASES

**Fecha:** 2026-06-26  
**Método:** Code trace estático + verificación de build  
**Migraciones requeridas:** 0105, 0106, 0107 aplicadas en Supabase SQL Editor

---

## REQUISITOS PREVIOS PARA TODOS LOS CASOS

| Requisito | Tipo | Crítico |
|-----------|------|---------|
| Migration 0105 aplicada | Infraestructura | SÍ — sin esto, `create_direct_order` no existe |
| Migration 0106 aplicada | Infraestructura | SÍ — sin esto, `assign_order`, `update_order_status` extendido, `get_order` no existen |
| Migration 0107 aplicada | Infraestructura | SÍ — sin esto, constraint bulletproof, `source` column, OT inheritance, notificaciones |
| Usuario con plan PREMIUM en workspace | Plan | SÍ para pedidos, OTs, evidencias, GPS |
| `orders_enabled = true` en feature flags | Feature flag | SÍ |
| `work_orders_enabled = true` | Feature flag | SÍ para OTs |
| `storage_enabled = true` | Feature flag | SÍ para evidencias |
| `gps_enabled = true` | Feature flag | SÍ para GPS |
| `multiuser_enabled = true` | Feature flag | SÍ para invitar miembros |
| Resend API key en system_configuration | Infraestructura | NO crítico (invite funciona sin email, token disponible) |

---

## CASO 1 — Crear Pedido Directo

**Actor:** Owner  
**Ruta:** `/app/pedidos` → "Nuevo pedido" → `/app/pedidos/nuevo`

**Pasos:**
1. Owner va a `/app/pedidos`
2. Pulsa "Nuevo pedido" (botón morado)
3. Busca cliente por nombre
4. Selecciona cliente
5. Ingresa título del pedido
6. Pulsa "Crear Pedido"
7. Redirige a `/app/pedidos/{orderId}`

**Verificaciones:**
- [ ] Ruta `/app/pedidos/nuevo` existe → `PedidoNuevoPage`
- [ ] Búsqueda de cliente: mínimo 1 caracter activa query
- [ ] Si no existe cliente: botón "+ Crear cliente" abre `ClientQuickCreateSheet`
- [ ] `createDirectOrder()` llama RPC `create_direct_order` con parámetros correctos
- [ ] Pedido creado con `quote_id=NULL`, `source='direct'`
- [ ] Redirige a detalle del pedido
- [ ] Detalle muestra badge "Directo" en header

---

## CASO 2 — Asignar Operario Existente

**Actor:** Owner  
**Ruta:** `/app/pedidos/{id}`

**Pasos:**
1. Owner entra al detalle del pedido (status: pendiente)
2. Ve sección "TÉCNICO ASIGNADO" — muestra "Sin técnico asignado"
3. Pulsa "Asignar"
4. Sheet se abre con lista de miembros activos del workspace
5. Selecciona operario
6. Cierra sheet

**Verificaciones:**
- [ ] `AssignTechSheet` abre correctamente
- [ ] Lista muestra solo miembros con `status IN (active, invited)` y `role IN (admin, supervisor, comercial, operario)`
- [ ] RPC `assign_order(p_order_id, p_assigned_to)` ejecutado
- [ ] Si pedido en 'pendiente': auto-avanza a 'asignado'
- [ ] Técnico asignado aparece en el card con su nombre
- [ ] Línea de tiempo avanza al step 'asignado'
- [ ] Bitácora muestra entrada `order_assigned`
- [ ] Notificación generada para el técnico en tabla `notifications`
- [ ] React Query invalida cache sin recargar la página

---

## CASO 3 — Operario Ve y Ejecuta OT

**Actor:** Operario  
**Ruta:** `/app/ordenes-trabajo` → `/app/ordenes-trabajo/{id}`

**Pasos:**
1. Operario hace login
2. Ve notificación de asignación en `NotificationBell` (header)
3. Navega a `/app/ordenes-trabajo`
4. Ve su OT asignada
5. Entra al detalle
6. Pulsa "Check In" (GPS)
7. Cambia estado: En ruta → En sitio → En ejecución

**Verificaciones:**
- [ ] NotificationBell muestra badge con notificaciones no leídas
- [ ] OT aparece en lista del operario (RLS filtra por workspace)
- [ ] OTDetailPage muestra `CheckInOutButton` cuando role='operario' y gps_enabled=true
- [ ] Check In solicita permiso de geolocalización del dispositivo
- [ ] Cambios de estado disponibles: asignada → en_progreso, pausada, cancelada
- [ ] Cada cambio genera log en `work_logs` vía RPC `update_work_order_status`

---

## CASO 4 — Operario Registra Evidencias

**Actor:** Operario  
**Ruta:** `/app/ordenes-trabajo/{id}` → Tab Evidencias

**Pasos:**
1. Operario en detalle de OT
2. Va a tab "Evidencias"
3. Pulsa `EvidenceUploader`
4. Sube: foto, video, firma, observación (comentario en bitácora)

**Verificaciones:**
- [ ] `EvidenceUploader` acepta: image/jpeg, image/png, video/mp4, audio/*, PDF, firma
- [ ] Foto: subida a Supabase Storage, record en `evidence_files`
- [ ] Video: ídem
- [ ] Firma: modal de captura de firma digital
- [ ] Comentario/observación: RPC `add_work_log_comment` crea entrada en `work_logs`
- [ ] Evidencias asociadas a `work_order_id` correcto
- [ ] Trigger `trg_evidence_phase` clasifica: durante (status=en_progreso)

---

## CASO 5 — Operario Finaliza, Owner Verifica

**Actor:** Operario finaliza → Owner verifica  
**Ruta:** OTDetailPage → PedidoDetailPage

**Pasos (Operario):**
1. Cambia estado OT a "Finalizada"
2. Hace Check Out (GPS)

**Pasos (Owner):**
1. Entra a `/app/pedidos/{id}`
2. Revisa: Bitácora, Evidencias, Estado, Timeline

**Verificaciones:**
- [ ] OT finalizada aparece como completada (verde) en pestaña OTs del pedido
- [ ] Bitácora muestra todos los eventos cronológicamente
- [ ] Evidencias aparecen en la galería del pedido
- [ ] Estado del pedido refleja progreso (OTs finalizadas / total)
- [ ] Línea de tiempo visual actualizada

---

## CASO 6 — Crear Miembro Nuevo e Invitar

**Actor:** Owner  
**Ruta:** Desde `AssignTechSheet` en detalle pedido

**Pasos:**
1. Sin miembros disponibles: sheet muestra estado vacío
2. Pulsa "Crear miembro del equipo"
3. Llena: nombre, email, rol (operario)
4. Envía invitación
5. Miembro recibe email (si Resend configurado) o accede por token `/invite/{token}`
6. Acepta invitación, crea contraseña
7. Primer login → onboarding del rol

**Verificaciones:**
- [ ] `InviteMemberMiniSheet` abre sobre el `AssignTechSheet`
- [ ] RPC `invite_team_member` acepta rol='operario' (migration 0056)
- [ ] Invitación creada en `workspace_invitations` con status='pending'
- [ ] Email: si Resend configurado → enviado; si no → `{ok:false}` sin romper el flujo
- [ ] Toast "Invitación enviada a X ✓" aparece en ambos casos
- [ ] Miembro aparece en lista con badge "Invitación pendiente"
- [ ] Miembro acepta → onboarding muestra slides del rol 'operario'
- [ ] Cuenta queda activa con rol correcto

---

## CASO 7 — Pedido desde Cotización con Snapshot

**Actor:** Owner  
**Ruta:** Cotizaciones → Aprobar → Crear Pedido

**Pasos:**
1. Cotización en estado "Aprobada"
2. Crear pedido desde ella
3. Verificar que snapshot R4 aparece en detalle

**Verificaciones:**
- [ ] Tab "Cotización" visible en detalle (pedido no directo)
- [ ] Snapshot muestra: número de cotización, fecha, cliente, total, subtotal, IVA
- [ ] Snapshot inmutable: modificar cotización original NO afecta el snapshot
- [ ] `quote_id` NOT NULL, `source='from_quote'`

---

## CASO 8 — Pedido Directo Sin Snapshot

**Actor:** Owner

**Verificaciones:**
- [ ] Tab "Cotización" NO aparece en tabs del detalle
- [ ] `order.source === 'direct'` en la respuesta del RPC
- [ ] Mensaje: "Pedido creado directamente" visible si el tab es accesible
- [ ] Ninguna mención de "cotización" en los textos del flujo directo
- [ ] Badge "Directo" en el header del detalle

---

## CASO 9 — GPS Check In/Out

**Actor:** Operario  
**Ruta:** `/app/ordenes-trabajo/{id}`

**Pasos:**
1. Operario en detalle de OT
2. Pulsa "Check In"
3. Consiente uso de GPS (si primera vez)
4. GPS registra posición
5. Estado operativo → en_sitio
6. Owner y Supervisor ven posición en `/app/mapa-operativo`

**Verificaciones:**
- [ ] `CheckInOutButton` visible para role='operario' cuando gps_enabled=true
- [ ] Modal de consentimiento GPS si `profile.gps_consent_at` es NULL
- [ ] `getCurrentPosition()` del browser solicitado
- [ ] RPC `record_check_in` llamado con lat/lon/accuracy/work_order_id
- [ ] `operational_status` del perfil actualizado
- [ ] Mapa en `/app/mapa-operativo` actualiza posición

---

## CASO 10 — Facturar Pedido Finalizado

**Actor:** Owner  
**Ruta:** `/app/pedidos/{id}` — status: finalizado

**Pasos:**
1. Pedido en status 'finalizado'
2. Pulsa "Cambiar estado" → "Facturado"
3. Confirma

**Verificaciones:**
- [ ] Transición `finalizado → facturado` disponible en UI
- [ ] RPC `update_order_status` acepta 'facturado' como estado válido (migration 0107)
- [ ] Status badge cambia a "Facturado" (verde oscuro)
- [ ] Línea de tiempo muestra todos los pasos completos
- [ ] Log en bitácora: `order_status_changed` (finalizado → facturado)
- [ ] `orders.finished_at` ya tiene timestamp del momento de finalización
