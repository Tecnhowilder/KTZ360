# AUDIT_NAVIGATION.md
# Shelwi — Mapa Completo de Navegación
Fecha: 2026-06-25

---

## RUTAS PÚBLICAS

| Ruta | Componente | Estado |
|------|-----------|--------|
| `/` | → redirect `/app/dashboard` | ✅ |
| `/login` | LoginPage | ✅ |
| `/registro` | RegisterPage | ✅ |
| `/recuperar-contrasena` | ForgotPasswordPage | ✅ |
| `/onboarding` | OnboardingPage | ✅ |
| `/p/:token` | PublicQuotePortal | ✅ (post-hotfix 0103) |
| `/portal/:token` | ClientPortalPage | ✅ |
| `/invite/:token` | AcceptInvite | ✅ |
| `/ref/:refCode` | ReferralRedirect | ✅ |
| `/terminos` | Terms | ✅ |
| `/politica-privacidad` | PrivacyPolicy | ✅ |
| `/*` | → redirect `/` | ✅ |

---

## RUTAS PROTEGIDAS — App Shell

### CORE (todas las suscripciones)

| Ruta | Componente | Navegación Desktop | Navegación Mobile | Estado |
|------|-----------|-------------------|------------------|--------|
| `/app/dashboard` | Dashboard/MobileDashboard | Sidebar | BottomNav (Inicio) | ✅ |
| `/app/cotizaciones` | Cotizaciones/CotizacionesMobile | Sidebar | BottomNav (Cotizar) | ✅ |
| `/app/cotizaciones/nueva` | QuoteNewPage | — | FAB / tab Crear | ✅ |
| `/app/cotizaciones/:id` | QuoteDetailPage | — | — | ✅ |
| `/app/cotizaciones/:id/editar` | EditQuotePage | — | — | ✅ |
| `/app/clientes` | Clientes | Sidebar | BottomNav (Clientes) | ✅ |
| `/app/plantillas` | Plantillas | Sidebar | More > Plantillas | ✅ |
| `/app/materiales` | Materiales | Sidebar | — | ⚠️ NO en nav mobile |
| `/app/pipeline` | Pipeline | Sidebar | — | ⚠️ NO en nav mobile |
| `/app/reportes` | Reportes | Sidebar | More > Reportes | ✅ |
| `/app/ia` | KtzIA/ShelwiIAMobile | Sidebar | More > Shelwi IA | ✅ |
| `/app/ia/operaciones` | IAOperacionesPage | — | — | ❌ SIN ACCESO en nav |
| `/app/catalogo` | CatalogPage | — | More > Catálogo | ✅ |

### OPERACIONES (PREMIUM)

| Ruta | Componente | Navegación Desktop | Navegación Mobile | Estado |
|------|-----------|-------------------|------------------|--------|
| `/app/pedidos` | Pedidos | Sidebar | BottomNav (Pedidos) | ✅ (feature gated) |
| `/app/pedidos/:id` | PedidoDetailPage | — | — | ✅ |
| `/app/ordenes-trabajo` | OrdenesDeTrabajo | Sidebar | More > Órdenes | ✅ (feature gated) |
| `/app/ordenes-trabajo/:id` | OTDetailPage | — | — | ✅ |
| `/app/mapa-operativo` | MapaOperativoPage | — | More > Mapa GPS | ✅ (PREMIUM) |
| `/app/operaciones/mapa` | MapaOperativoPage (alias) | — | — | ✅ |

### NEGOCIO / ANALYTICS

| Ruta | Componente | Navegación Desktop | Navegación Mobile | Estado |
|------|-----------|-------------------|------------------|--------|
| `/app/customer-success` | CustomerSuccessPage | — | — | ❌ SIN ACCESO en nav |
| `/app/growth` | GrowthPage | — | — | ❌ SIN ACCESO en nav |
| `/app/finanzas` | FinancePage | — | — | ❌ SIN ACCESO en nav |
| `/app/bi` | BIPage | — | — | ❌ SIN ACCESO en nav |
| `/app/automatizaciones` | AutomatizacionesPage | — | — | ❌ SIN ACCESO en nav |

### CONFIGURACIÓN / ADMIN

| Ruta | Componente | Navegación Desktop | Navegación Mobile | Estado |
|------|-----------|-------------------|------------------|--------|
| `/app/config` | ConfiguracionPage | Sidebar | More > Config | ⚠️ Desktop muestra SimpleEmpty |
| `/app/config/integraciones` | IntegracionesPage | — | — | ✅ pero con "Próximamente" |
| `/app/config/almacenamiento` | AlmacenamientoPage | — | — | ✅ |
| `/app/config/webhooks` | WebhooksPage | — | — | ❌ SIN ACCESO en nav |
| `/app/empresa` | Empresa (RequireOwner) | Sidebar | More > Mi Empresa | ✅ |
| `/app/planes` | Planes (RequireOwner) | — | — | ✅ |
| `/app/team` | Team (RequireOwner) | Sidebar | More > Equipo | ✅ |
| `/app/admin` | AdminPanel (RequireSuperAdmin) | — | — | ✅ |
| `/app/proyectos` | SimpleEmpty(proyectos) | — | — | ❌ PLACEHOLDER |
| `/app/billing/success` | BillingSuccess | — | — | ✅ |
| `/app/billing/pending` | BillingPending | — | — | ✅ |
| `/app/billing/failure` | BillingFailure | — | — | ✅ |

---

## BOTONES Y ACCIONES POR PANTALLA

### Dashboard Mobile

| Botón/Acción | Destino | Estado |
|-------------|---------|--------|
| Hablar con IA | `/app/ia` | ✅ navega pero sin flujo voz |
| Nueva cotización | openQuoteFlow() | ✅ |
| Nuevo pedido | `/app/pedidos` | ❌ NO abre formulario nuevo |
| Desde foto | `/app/ia` | ✅ navega pero sin foto |
| Trabajo pendiente items | rutas correctas | ✅ |
| Pipeline → Ver todo | `/app/pipeline` | ✅ |
| Actividad reciente items | `/app/cotizaciones/:id` | ✅ |
| FAB + Nuevo | expande menú | ✅ |
| FAB items → Crear con IA | `/app/ia` | ⚠️ sin flujo voz |
| FAB items → Nueva cotización | openQuoteFlow() | ✅ |
| FAB items → Nuevo pedido | `/app/pedidos` | ❌ no abre formulario |
| FAB items → Desde imagen | `/app/ia` | ⚠️ sin foto |
| FAB items → Desde plantilla | `/app/plantillas` | ✅ |

### Cotizaciones Mobile (tab Crear)

| Botón/Acción | Destino | Estado |
|-------------|---------|--------|
| Hablar con IA | `/app/ia` | ⚠️ sin flujo voz |
| Desde foto | `/app/ia` | ⚠️ sin flujo foto |
| Nueva cotización | openQuoteFlow() | ✅ |
| Desde plantilla | `/app/plantillas` | ✅ |
| Ver todas | tab Mis cotizaciones | ✅ |
| Item reciente | `/app/cotizaciones/:id` | ✅ |

### Cotización Detail

| Botón/Acción | Destino | Estado |
|-------------|---------|--------|
| Aprobar cotización | update status | ✅ |
| Rechazar cotización | update status | ✅ |
| Crear pedido (si Aprobada) | create_order RPC | ✅ |
| Enviar WhatsApp | wa.me URL | ✅ (con country_code hotfix) |
| Compartir enlace | copy URL | ✅ |
| Editar | `/app/cotizaciones/:id/editar` | ✅ |
| Descargar PDF | generate-report EF | ✅ |
| Ver portal cliente | `/portal/:token` | ✅ |

### Pedidos

| Botón/Acción | Destino | Estado |
|-------------|---------|--------|
| Ver pedido existente | `/app/pedidos/:id` | ✅ |
| Nuevo pedido (botón) | ❌ SIN DESTINO | ❌ No existe pantalla |

### Bottom Nav Mobile

| Tab | Destino | Estado |
|-----|---------|--------|
| Inicio | `/app/dashboard` | ✅ |
| Cotizar | `/app/cotizaciones` | ✅ |
| Pedidos | `/app/pedidos` | ✅ |
| Clientes | `/app/clientes` | ✅ |
| Más → sheet | grupos de acciones | ✅ |

### Drawer Mobile (sidebar)

| Item | Destino | Estado |
|------|---------|--------|
| Inicio | `/app/dashboard` | ✅ |
| Cotizaciones | `/app/cotizaciones` | ✅ |
| Pedidos | `/app/pedidos` | ✅ |
| Clientes | `/app/clientes` | ✅ |
| Shelwi IA | `/app/ia` | ✅ |
| Catálogo | `/app/catalogo` | ✅ |
| Reportes | `/app/reportes` | ✅ |
| Mi Empresa | `/app/empresa` | ✅ |
| Equipo | `/app/team` | ✅ |
| Configuración | `/app/config` | ⚠️ Desktop → SimpleEmpty |

---

## PÁGINAS HUÉRFANAS (existen pero inaccesibles desde nav)

| Página | Ruta | Acceso |
|--------|------|--------|
| Growth | `/app/growth` | Solo URL directa |
| Finanzas | `/app/finanzas` | Solo URL directa |
| BI | `/app/bi` | Solo URL directa |
| Customer Success | `/app/customer-success` | Solo URL directa |
| Automatizaciones | `/app/automatizaciones` | Solo URL directa |
| IA Operaciones | `/app/ia/operaciones` | Solo URL directa |
| Webhooks | `/app/config/webhooks` | Solo URL directa |
| Materiales | `/app/materiales` | Solo en Sidebar desktop |
| Pipeline | `/app/pipeline` | Solo en Sidebar desktop |
