# AUDITORÍA APP STORE READINESS — SHELWI
**Fecha:** 23 de junio de 2026  
**Objetivo:** Android + iOS + Play Store + App Store  
**Basado en:** MOBILE_READINESS_REPORT.md + auditoría directa del código

---

## RESUMEN EJECUTIVO

| Categoría | Estado | Bloqueante App Store |
|-----------|--------|---------------------|
| Capacitor | ❌ NOT READY | SÍ — no instalado |
| Navegación Mobile | ✅ READY | NO |
| GPS | ✅ READY | NO (necesita plugin nativo) |
| Cámara / Evidencias | ✅ READY | PARCIAL (file input funciona, camera plugin mejora UX) |
| Deep Links | ❌ NOT READY | SÍ — no configurado |
| Push Notifications | ❌ NOT READY | SÍ — arquitectura faltante |
| Offline First | ❌ NOT READY | SÍ para Operaciones |
| window.* Blockers | ❌ NOT READY | SÍ — billing, tel, links |
| Accesibilidad | ⚠️ PARTIAL | SÍ (Apple/Google requieren WCAG) |
| Performance Listas | ⚠️ PARTIAL | NO (App Store no lo requiere, sí afecta UX) |

---

## INVENTARIO DE BLOQUEANTES

### window.location.href — CRÍTICO
| Archivo | Línea | Uso | Fix |
|---------|-------|-----|-----|
| `src/services/billing.ts` | 58 | Redirect a MercadoPago `initPoint` | `Browser.open()` de Capacitor |
| `src/hooks/useIntegrations.ts` | 29 | Redirect a OAuth Google/Outlook | `Browser.open()` de Capacitor |

### window.open() — CRÍTICO
| Archivo | Uso | Fix |
|---------|-----|-----|
| `src/services/whatsapp.ts` (3x) | WhatsApp web + wa.me | `Browser.open()` |
| `src/lib/calc.ts:141` | WhatsApp share | `Browser.open()` |
| `src/lib/shareUtils.ts` (2x) | WhatsApp + Email share | `Browser.open()` |
| `src/components/clientes/ClientesMobile.tsx` (4x) | WhatsApp + tel: | `Browser.open()` + `App.openUrl()` |
| `src/components/cotizaciones/CotizacionesMobile.tsx` (2x) | WhatsApp + tel: | `Browser.open()` + `App.openUrl()` |
| `src/views/Clientes.tsx:264` | tel: | `App.openUrl()` |
| `src/views/portal/ClientPortalPage.tsx:412` | URL externa | `Browser.open()` |
| `src/components/materiales/MaterialesMobile.tsx:131` | WhatsApp | `Browser.open()` |

### window.location.origin — BAJO RIESGO (solo para construir URLs)
| Archivos | Uso | Fix |
|----------|-----|-----|
| 10+ archivos | Construir URLs del portal/portal/invitaciones | Abstracción `getAppBaseUrl()` |

---

## INVENTARIO DE CAPACITOR

### Instalado actualmente
```
Nada — Capacitor no está en package.json
```

### Plugins necesarios
| Plugin | Para qué | Prioridad |
|--------|---------|-----------|
| `@capacitor/core` | Base | 🔴 Crítico |
| `@capacitor/cli` | CLI para builds | 🔴 Crítico |
| `@capacitor/ios` | Plataforma iOS | 🔴 Crítico |
| `@capacitor/android` | Plataforma Android | 🔴 Crítico |
| `@capacitor/browser` | Abrir URLs externas (billing, OAuth, WhatsApp) | 🔴 Crítico |
| `@capacitor/app` | Deep links + tel: + Estado de app | 🔴 Crítico |
| `@capacitor/camera` | Cámara nativa (mejor UX que file input) | 🟠 Alto |
| `@capacitor/geolocation` | GPS nativo (mejor precisión) | 🟠 Alto |
| `@capacitor/preferences` | Reemplaza localStorage | 🟠 Alto |
| `@capacitor/network` | Detectar online/offline | 🟠 Alto |
| `@capacitor/push-notifications` | Push future | 🟡 Medio |
| `@capacitor/filesystem` | Evidencias offline | 🟡 Medio |

### Dependencias adicionales
| Paquete | Para qué | Prioridad |
|---------|---------|-----------|
| `dexie` | IndexedDB para offline first | 🔴 Crítico |
| `dexie-react-hooks` | React integration | 🟠 Alto |

---

## DEEP LINKS

### Estado actual: ❌ NOT READY
El router tiene rutas correctas pero no hay configuración de URL scheme.

### URLs que necesitan deeplink
| URL Web | Deeplink App | Uso |
|---------|-------------|-----|
| `https://app.shelwi.com/p/:token` | `shelwi://p/:token` | Portal de cotización |
| `https://app.shelwi.com/invite/:token` | `shelwi://invite/:token` | Invitaciones de equipo |
| `https://app.shelwi.com/recuperar-contrasena` | `shelwi://recuperar-contrasena` | Reset password |
| `https://app.shelwi.com/portal/:token` | `shelwi://portal/:token` | Portal cliente |
| `https://app.shelwi.com/app/dashboard` | `shelwi://app/dashboard` | Push notifications |

### Archivos que necesitan actualización
- `src/services/auth.ts:31` — `redirectTo` para recovery
- `src/features/auth/LoginPage.tsx:72` — `redirectTo` OAuth Google
- `src/services/team.ts:142` — URL de invitación

---

## PUSH NOTIFICATIONS

### Estado actual: ❌ NOT READY
No existe ninguna arquitectura de push.

### Qué necesita el sistema
1. Tipos TypeScript para payloads de push
2. Servicio de registro de dispositivos (device_tokens table)
3. Abstracción para envío (backend)
4. Handler en el frontend para navegar al deeplink correcto

---

## OFFLINE FIRST

### Estado actual: ❌ NOT READY
Solo drafts de cotizaciones en localStorage.

### Qué necesita ser offline (Operaciones)
| Operación | Prioridad |
|-----------|-----------|
| Check In / Check Out | 🔴 CRÍTICO |
| Cambio estado OT | 🔴 CRÍTICO |
| Subir evidencias (foto/video/firma) | 🔴 CRÍTICO |
| Agregar comentario en bitácora | 🟠 ALTO |
| Actualizar estado GPS | 🟠 ALTO |

### Lo que NO debe ser offline
- Facturación / Pagos
- CRM / Pipeline
- BI / Reportes
- Admin panel
- Integraciones

---

## ACCESIBILIDAD

### Estado actual: ⚠️ PARTIAL (4/10)
| Req. WCAG | Estado |
|-----------|--------|
| `prefers-reduced-motion` | ❌ FALTA |
| `aria-label` en acciones | ⚠️ PARCIAL |
| Canvas (SignatureCapture) sin aria | ❌ FALTA |
| `tabIndex` en componentes críticos | ⚠️ PARCIAL |
| Contraste de color | ✅ BIEN |
| Focus visible | ⚠️ PARCIAL |

---

## PERFORMANCE

### Estado: ⚠️ PARTIAL
| Lista | Items esperados | Virtualización |
|-------|----------------|---------------|
| Cotizaciones | 100-500+ | ❌ NO |
| Clientes | 100-2000+ | ❌ NO |
| Materiales | 50-500+ | ❌ NO |
| Pedidos/OTs | <100 | ❌ NO (OK) |
