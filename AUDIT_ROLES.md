# AUDIT_ROLES.md
# Shelwi — Pantallas y Permisos por Rol
Fecha: 2026-06-25

---

## ROLES DEL SISTEMA

`super_admin` | `support_admin` | `owner` | `admin` | `supervisor` | `comercial` | `operario`

---

## SUPER_ADMIN / SUPPORT_ADMIN

Acceso a TODO + panel exclusivo `/app/admin`.

| Ruta | Acceso | Acciones |
|------|--------|---------|
| `/app/admin` | ✅ RequireSuperAdmin | Dashboard, Suscripciones, Planes, Founder, IA Admin, Storage, Usuarios, Workspaces, Auditoría, Config, Soporte, Finanzas Shelwi, Customer Experience |
| Todas las rutas protegidas | ✅ | Sin restricción de feature flags |
| bypass de check_feature_access | ✅ | is_support_admin() → always true |

---

## OWNER

| Ruta | Acceso | Condición |
|------|--------|-----------|
| `/app/dashboard` | ✅ | — |
| `/app/cotizaciones` + flows | ✅ | — |
| `/app/clientes` | ✅ | — |
| `/app/pedidos` | ✅ | PREMIUM (orders_enabled) |
| `/app/ordenes-trabajo` | ✅ | PREMIUM (work_orders_enabled) |
| `/app/mapa-operativo` | ✅ | PREMIUM (gps_enabled) |
| `/app/pipeline` | ✅ | PRO+ (pipeline_enabled) |
| `/app/reportes` | ✅ | PRO+ (advanced_reports_enabled) |
| `/app/ia` | ✅ | PRO+ (ai_enabled) |
| `/app/catalogo` | ✅ | — |
| `/app/plantillas` | ✅ | — |
| `/app/materiales` | ✅ | — |
| `/app/empresa` | ✅ | RequireOwner |
| `/app/planes` | ✅ | RequireOwner |
| `/app/team` | ✅ | RequireOwner |
| `/app/automatizaciones` | ✅ | PRO+ (automation_enabled) |
| `/app/config` + sub | ✅ | — |
| `/app/growth` | ✅ | PRO+ |
| `/app/finanzas` | ✅ | PRO+ |
| `/app/bi` | ✅ | PRO+ |
| `/app/customer-success` | ✅ | — |
| CMS Admin | ❌ | RequireSuperAdmin |

**Acciones en cotizaciones**: crear, editar, aprobar, rechazar, duplicar, eliminar
**Acciones en pedidos**: crear, asignar, actualizar estado, finalizar
**Acciones en OTs**: crear, asignar, finalizar, subir evidencias
**Acciones en equipo**: invitar, cambiar rol, activar/desactivar

---

## ADMIN

Idéntico a OWNER excepto:

| Restricción | Detalle |
|-------------|---------|
| `/app/empresa` | ❌ RequireOwner bloquea |
| `/app/planes` | ❌ RequireOwner bloquea |
| `/app/team` | ❌ RequireOwner bloquea |
| Cambiar planes/facturación | ❌ |
| Transferir ownership | ❌ |

**Nota**: El RequireOwner actual **no distingue admin de owner** en el backend (las RPCs de escritura sensibles sí). El frontend bloquea las páginas de empresa/planes/equipo para no-owner.

---

## SUPERVISOR

| Ruta | Acceso | Condición |
|------|--------|-----------|
| `/app/dashboard` | ✅ | — |
| `/app/cotizaciones` | ✅ (lectura) | Puede ver cotizaciones del workspace |
| `/app/clientes` | ✅ | — |
| `/app/pedidos` | ✅ | PREMIUM |
| `/app/ordenes-trabajo` | ✅ | PREMIUM — puede asignar y ver su equipo |
| `/app/mapa-operativo` | ✅ | PREMIUM — can_view_full_team() |
| `/app/reportes` | ✅ | PRO+ |
| `/app/ia` | ✅ | PRO+ |
| `/app/empresa` | ❌ | RequireOwner |
| `/app/team` | ❌ | RequireOwner |
| `/app/planes` | ❌ | RequireOwner |

**Acciones en OTs**: puede asignar y cambiar estado de su equipo
**Acciones en cotizaciones**: puede crear cotizaciones (si el backend lo permite)
**NO puede**: invitar usuarios, cambiar configuración empresa, eliminar cotizaciones

---

## COMERCIAL

| Ruta | Acceso | Condición |
|------|--------|-----------|
| `/app/dashboard` | ✅ | — |
| `/app/cotizaciones` | ✅ | Crea, edita, envía sus cotizaciones |
| `/app/clientes` | ✅ | — |
| `/app/pipeline` | ✅ | PRO+ |
| `/app/ia` | ✅ | PRO+ |
| `/app/catalogo` | ✅ | — |
| `/app/plantillas` | ✅ | — |
| `/app/pedidos` | ✅ (lectura) | PREMIUM |
| `/app/ordenes-trabajo` | ✅ (lectura) | PREMIUM |
| `/app/empresa` | ❌ | — |
| `/app/team` | ❌ | — |
| `/app/reportes` | ✅ | PRO+ pero solo sus métricas |
| `/app/mapa-operativo` | ❌ | Requiere can_view_full_team() |

**Acciones**: crear/editar/enviar cotizaciones propias, crear seguimientos, crear recordatorios

---

## OPERARIO

| Ruta | Acceso | Condición |
|------|--------|-----------|
| `/app/dashboard` | ✅ (limitado) | — |
| `/app/pedidos` | ✅ (lectura) | PREMIUM — ve sus pedidos asignados |
| `/app/ordenes-trabajo` | ✅ | PREMIUM — ve sus OTs asignadas |
| `/app/ordenes-trabajo/:id` | ✅ | Puede actualizar estado, subir evidencias, check-in/out |
| `/app/mapa-operativo` | ❌ | No puede ver equipo completo |
| `/app/cotizaciones` | ✅ (lectura) | Solo visualización |
| `/app/ia` | ❌ | Generalmente sin plan PRO |
| `/app/empresa` | ❌ | — |
| `/app/team` | ❌ | — |

**Acciones en OTs**: actualizar estado, subir evidencias, check-in/out GPS, firmar
**NO puede**: crear cotizaciones (frontend no restringe, backend sí para algunas ops), cambiar config

---

## CLIENTE (Portal /portal/:token)

| Tab | Acceso | Condición |
|-----|--------|-----------|
| Dashboard (resumen) | ✅ | — |
| Cotizaciones | ✅ | Ver sus cotizaciones, aprobar/rechazar |
| Pedidos | ✅ | Ver estado de sus pedidos |
| Evidencias/Fotos | ✅ | Si show_evidences=true |
| Historial | ✅ | Si show_timeline=true |
| Reseña | ✅ | Si show_reviews=true |
| Encuesta | ✅ | Si hay encuesta activa |
| Puntos | ✅ | Si loyalty_enabled=true |
| Invitar (Referidos) | ✅ | Si referral program activo |

**NO puede**: crear cotizaciones, ver datos de otros clientes, acceder al CRM interno

---

## GAPS DE PERMISOS IDENTIFICADOS

| Problema | Severidad | Descripción |
|----------|-----------|-------------|
| Growth/BI/Finanzas sin nav | 🟡 MEDIO | Páginas accesibles solo por URL directa, sin acceso desde nav para ningún rol |
| Automatizaciones sin nav mobile | 🟡 MEDIO | Solo accesible desde URL directa en mobile |
| `/app/config` Desktop = SimpleEmpty | 🟡 MEDIO | Owner en desktop ve página vacía al ir a Configuración |
| Materiales sin acceso mobile | 🟡 BAJO | Useful page but not in mobile nav |
| IA Operaciones sin acceso | 🟡 BAJO | Página Premium oculta completamente |
| Webhooks sin acceso en nav | 🟡 BAJO | Solo URL directa |
