# PEDIDOS — DIAGRAMA COMPLETO DE FLUJO

**Fecha:** 2026-06-26

---

## FLUJO COMPLETO: Crear → Asignar → Ejecutar → Facturar

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MÓDULO PEDIDOS                               │
└─────────────────────────────────────────────────────────────────────┘

ORIGEN A: DESDE COTIZACIÓN              ORIGEN B: PEDIDO DIRECTO
─────────────────────────              ─────────────────────────
Cotizaciones → Aprobada                /app/pedidos/nuevo
       ↓                                       ↓
[Crear pedido]                        [Seleccionar cliente]
RPC: create_order                            ↓
  - Congela snapshot R4                [¿Cliente existe?]
  - quote_id = UUID                   NO → ClientQuickCreateSheet
  - source = 'from_quote'                   (createClient RPC)
       ↓                                   Sí → continuar
[orders.source = 'from_quote']        [Detalles del pedido]
                                      RPC: create_direct_order
                                        - quote_id = NULL
                                        - source = 'direct'
                    ↓                        ↓
             ┌──────────────────────────────┐
             │     order.status = 'pendiente'│
             └──────────────────────────────┘
                          ↓
              [AssignTechSheet — Asignar técnico]
               RPC: assign_order
                 → Verifica workspace_id del JWT
                 → Verifica status='active' del técnico
                 → INSERT work_logs (order_assigned)
                 → INSERT notifications (al técnico)
                 → Si status='pendiente' → SET status='asignado'
                          ↓
             ┌──────────────────────────────┐
             │     order.status = 'asignado'│
             └──────────────────────────────┘
                          ↓
              [Cambiar estado → Programado]
               RPC: update_order_status
                 → Valida transición permitida
                 → INSERT work_logs (order_status_changed)
                          ↓
             ┌──────────────────────────────┐
             │    order.status = 'programado'│
             └──────────────────────────────┘
                          ↓
              [Técnico en camino → En ruta]
               RPC: update_order_status
                 → INSERT notifications (técnico)
                          ↓
             ┌──────────────────────────────┐
             │     order.status = 'en_ruta' │
             └──────────────────────────────┘
                          ↓
              [Técnico llega → En sitio]
               CheckIn GPS (record_check_in)
                          ↓
             ┌──────────────────────────────┐
             │     order.status = 'en_sitio'│
             └──────────────────────────────┘
                          ↓
              [Inicia trabajo → En ejecución]
               RPC: update_order_status
                 → SET orders.started_at = now()
                          ↓
             ┌──────────────────────────────┐
             │  order.status = 'en_ejecucion'│
             └──────────────────────────────┘
                    ↓           ↓
          [Pausa opcional]    [Continúa]
          status='pausado'        ↓
                    ↓       [Finalizar trabajo]
          [Reanudar]        RPC: update_order_status
          en_ejecucion        → SET finished_at = now()
                                      ↓
                          ┌──────────────────────────┐
                          │  order.status = 'finalizado'│
                          └──────────────────────────┘
                                      ↓
                            [Emitir factura]
                            RPC: update_order_status
                                      ↓
                          ┌──────────────────────────┐
                          │  order.status = 'facturado'│
                          └──────────────────────────┘
                                   [FIN]
```

---

## FLUJO PARALELO: ÓRDENES DE TRABAJO

```
Durante cualquier estado activo del pedido:

[Crear OT]
RPC: create_work_order
  → workspace_id del JWT
  → assigned_to = COALESCE(param, order.assigned_to)  ← herencia automática
  → status inicial: 'asignada' | 'pendiente'
  → INSERT work_logs (work_order_created)
       ↓
[OT: pendiente → asignada → en_progreso → finalizada]
   ↑ Flujo independiente por OT
   ↑ CheckIn/Out GPS por OT
   ↑ Evidencias por OT
```

---

## FLUJO: BITÁCORA AUTOMÁTICA

```
Cada acción genera entrada automática en work_logs:

ACCIÓN                  → event_type              → Quién lo genera
──────────────────────────────────────────────────────────────────────
Pedido creado           → order_created           → RPC create_order / create_direct_order
Estado cambiado         → order_status_changed    → RPC update_order_status
Técnico asignado        → order_assigned          → RPC assign_order
OT creada               → work_order_created      → RPC create_work_order
OT estado cambiado      → work_order_status_changed → RPC update_work_order_status
OT asignada             → work_order_assigned     → RPC assign_work_order
Comentario manual       → comment                 → Frontend
Novedad manual          → comment (prefijo [NOVEDAD]) → Frontend
Evidencia subida        → evidence_uploaded       → Evidence RPC

UI distingue novedades por prefijo [NOVEDAD] en el note del log.
```

---

## FLUJO: INVITAR MIEMBRO SIN SALIR DEL PEDIDO

```
[AssignTechSheet — sin miembros disponibles]
         ↓
[InviteMemberMiniSheet]
         ↓
[Llenar: nombre, email, rol]
         ↓
RPC: invite_team_member (0056)
  → Valida rol en (admin, supervisor, comercial, operario)
  → Verifica seats disponibles en el plan
  → INSERT workspace_invitations (status='pending')
  → Retorna invitation con token
         ↓
Edge Function: send-email (template=team_invite)
  → Lee api_key de system_configuration.resend
  → Envía email via Resend API
  → Si falla: invitación creada, email pendiente (no bloquea)
         ↓
[Miembro recibe email → /invite/{token}]
         ↓
[Acepta → crea contraseña → primer login]
         ↓
[Onboarding por rol → Cuenta activa]
         ↓
[Asignar al pedido]
```

---

## FLUJO: EVIDENCIAS Y FASES

```
Técnico sube foto durante el trabajo:
         ↓
EvidenceUploader → Supabase Storage
         ↓
INSERT evidence_files
         ↓
trigger trg_evidence_phase (0106):
  → Consulta orders.status del pedido
  → pendiente/asignado/programado → phase='antes'
  → en_ejecucion/en_ruta/en_sitio → phase='durante'
  → finalizado/facturado → phase='despues'
  → file_type=signature → phase irrelevante
         ↓
UI: tabs Todas | Antes | Durante | Después | Fotos | Firmas
```

---

## MAPA DE PERMISOS POR ROL

| Acción | owner | admin | supervisor | comercial | operario |
|--------|-------|-------|-----------|-----------|---------|
| Crear pedido desde cotización | ✅ | ✅ | ❌ | ✅ | ❌ |
| Crear pedido directo | ✅ | ✅ | ❌ | ✅ | ❌ |
| Ver pedidos | ✅ | ✅ | ✅ | ✅ | ✅* |
| Asignar técnico | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cambiar estado | ✅ | ✅ | ✅ | ❌ | ❌ |
| Crear OTs | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ejecutar OTs (CheckIn/Out) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Subir evidencias | ✅ | ✅ | ✅ | ❌ | ✅ |
| Registrar novedades | ✅ | ✅ | ✅ | ❌ | ✅ |

*operario: solo sus pedidos/OTs asignadas
