import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RequireOwner } from './features/auth/RequireOwner';
import { RequireSuperAdmin } from './features/auth/RequireSuperAdmin';
import { AppIndexRedirect } from './features/auth/AppIndexRedirect';
import { AppShell } from './components/layout/AppShell';

// ─── Fallback de carga ────────────────────────────────────────────────────────
// Minimal spinner sin dependencias externas para no bloquear el bundle inicial.
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function L(Component: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}
function LW(Component: React.ComponentType, Wrapper: React.ComponentType<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Wrapper><Component /></Wrapper>
    </Suspense>
  );
}

// ─── Auth (cargadas rápido, son ligeras) ─────────────────────────────────────
const LoginPage          = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage       = lazy(() => import('./features/auth/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const OnboardingPage     = lazy(() => import('./views/OnboardingPage').then(m => ({ default: m.OnboardingPage })));

// ─── Públicas ────────────────────────────────────────────────────────────────
const PublicQuotePortal = lazy(() => import('./views/public/PublicQuotePortal').then(m => ({ default: m.PublicQuotePortal })));
const PublicOrderPortal = lazy(() => import('./views/public/PublicOrderPortal').then(m => ({ default: m.PublicOrderPortal })));
const ClientPortalPage  = lazy(() => import('./views/portal/ClientPortalPage').then(m => ({ default: m.ClientPortalPage })));
const InviteWizard      = lazy(() => import('./views/invite/InviteWizard').then(m => ({ default: m.InviteWizard })));
const ReferralRedirect  = lazy(() => import('./views/public/ReferralRedirect').then(m => ({ default: m.ReferralRedirect })));
const Terms             = lazy(() => import('./views/public/Terms').then(m => ({ default: m.Terms })));
const PrivacyPolicy     = lazy(() => import('./views/public/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));

// ─── Core app (cargadas al entrar al /app) ───────────────────────────────────
const Dashboard      = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const ProfilePage    = lazy(() => import('./views/ProfilePage').then(m => ({ default: m.ProfilePage })));
// SimpleEmpty requiere variant — se instancian wrappers para cada caso de uso
const ProyectosEmpty = lazy(() => import('./views/SimpleEmpty').then(m => ({ default: () => <m.SimpleEmpty variant="proyectos" /> })));

// ─── Cotizaciones ────────────────────────────────────────────────────────────
const Cotizaciones    = lazy(() => import('./views/Cotizaciones').then(m => ({ default: m.Cotizaciones })));
const QuoteNewPage    = lazy(() => import('./views/QuoteNewPage').then(m => ({ default: m.QuoteNewPage })));
const QuoteDetailPage = lazy(() => import('./views/QuoteDetailPage').then(m => ({ default: m.QuoteDetailPage })));
const EditQuotePage   = lazy(() => import('./views/EditQuotePage').then(m => ({ default: m.EditQuotePage })));

// ─── Pedidos / Órdenes ───────────────────────────────────────────────────────
const Pedidos          = lazy(() => import('./views/Pedidos').then(m => ({ default: m.Pedidos })));
const PedidoNuevoPage  = lazy(() => import('./views/PedidoNuevoPage').then(m => ({ default: m.PedidoNuevoPage })));
const PedidoDetailPage = lazy(() => import('./views/PedidoDetailPage').then(m => ({ default: m.PedidoDetailPage })));
const OrdenesDeTrabajo = lazy(() => import('./views/OrdenesDeTrabajo').then(m => ({ default: m.OrdenesDeTrabajo })));
const OTDetailPage     = lazy(() => import('./views/OTDetailPage').then(m => ({ default: m.OTDetailPage })));

// ─── Clientes / CRM / Catálogo ───────────────────────────────────────────────
const Clientes   = lazy(() => import('./views/Clientes').then(m => ({ default: m.Clientes })));
const CatalogPage = lazy(() => import('./views/CatalogPage').then(m => ({ default: m.CatalogPage })));
const Materiales  = lazy(() => import('./views/Materiales').then(m => ({ default: m.Materiales })));
const Plantillas  = lazy(() => import('./views/Plantillas').then(m => ({ default: m.Plantillas })));
const Pipeline    = lazy(() => import('./views/Pipeline').then(m => ({ default: m.Pipeline })));

// ─── Empresa / Equipo / Config ───────────────────────────────────────────────
const Empresa            = lazy(() => import('./views/Empresa').then(m => ({ default: m.Empresa })));
const Team               = lazy(() => import('./views/Team').then(m => ({ default: m.Team })));
const AdicionalesPage    = lazy(() => import('./views/AdicionalesPage').then(m => ({ default: m.AdicionalesPage })));
const ConfiguracionPage  = lazy(() => import('./views/ConfiguracionPage').then(m => ({ default: m.ConfiguracionPage })));
const IntegracionesPage  = lazy(() => import('./views/config/IntegracionesPage').then(m => ({ default: m.IntegracionesPage })));
const AlmacenamientoPage = lazy(() => import('./views/config/AlmacenamientoPage').then(m => ({ default: m.AlmacenamientoPage })));
const WebhooksPage       = lazy(() => import('./views/config/WebhooksPage').then(m => ({ default: m.WebhooksPage })));
const AutomatizacionesPage = lazy(() => import('./views/AutomatizacionesPage').then(m => ({ default: m.AutomatizacionesPage })));

// ─── Planes / Billing ────────────────────────────────────────────────────────
const Planes         = lazy(() => import('./views/Planes').then(m => ({ default: m.Planes })));
const BillingSuccess = lazy(() => import('./views/billing/BillingSuccess').then(m => ({ default: m.BillingSuccess })));
const BillingPending = lazy(() => import('./views/billing/BillingPending').then(m => ({ default: m.BillingPending })));
const BillingFailure = lazy(() => import('./views/billing/BillingFailure').then(m => ({ default: m.BillingFailure })));

// ─── Analytics / Finanzas / BI ───────────────────────────────────────────────
const Reportes           = lazy(() => import('./views/Reportes').then(m => ({ default: m.Reportes })));
const FinancePage        = lazy(() => import('./views/FinancePage').then(m => ({ default: m.FinancePage })));
const BIPage             = lazy(() => import('./views/BIPage').then(m => ({ default: m.BIPage })));
const GrowthPage         = lazy(() => import('./views/GrowthPage').then(m => ({ default: m.GrowthPage })));
const CustomerSuccessPage = lazy(() => import('./views/CustomerSuccessPage').then(m => ({ default: m.CustomerSuccessPage })));

// ─── GPS / Operaciones (maplibre-gl — cargado solo al acceder al mapa) ───────
const MapaOperativoPage = lazy(() => import('./views/MapaOperativoPage').then(m => ({ default: m.MapaOperativoPage })));
const AsistenciaPage    = lazy(() => import('./views/AsistenciaPage').then(m => ({ default: m.AsistenciaPage })));

// ─── IA (cargada solo para usuarios Pro/Premium) ─────────────────────────────
const KtzIA             = lazy(() => import('./views/KtzIA').then(m => ({ default: m.KtzIA })));
const IAOperacionesPage = lazy(() => import('./views/IAOperacionesPage').then(m => ({ default: m.IAOperacionesPage })));
const IACrearPage       = lazy(() => import('./views/IACrearPage').then(m => ({ default: m.IACrearPage })));
const DesdeImagenPage   = lazy(() => import('./views/DesdeImagenPage').then(m => ({ default: m.DesdeImagenPage })));

// ─── Admin (cargado solo para super_admin) ────────────────────────────────────
const AdminPanel = lazy(() => import('./views/AdminPanel').then(m => ({ default: m.AdminPanel })));

// ─── AcceptInvite (ya no en router pero disponible) ──────────────────────────

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/app/dashboard" replace />,
  },
  { path: '/onboarding',               element: L(OnboardingPage) },
  { path: '/login',                    element: L(LoginPage) },
  { path: '/registro',                 element: L(RegisterPage) },
  { path: '/recuperar-contrasena',     element: L(ForgotPasswordPage) },
  { path: '/p/:token',                 element: L(PublicQuotePortal) },
  { path: '/o/:token',                 element: L(PublicOrderPortal) },
  { path: '/portal/:token',            element: L(ClientPortalPage) },
  { path: '/invite/:token',            element: L(InviteWizard) },
  { path: '/ref/:refCode',             element: L(ReferralRedirect) },
  { path: '/terminos',                 element: L(Terms) },
  { path: '/politica-privacidad',      element: L(PrivacyPolicy) },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true,                              element: <AppIndexRedirect /> },
      { path: 'dashboard',                        element: L(Dashboard) },
      { path: 'cotizaciones',                     element: L(Cotizaciones) },
      { path: 'cotizaciones/nueva',               element: L(QuoteNewPage) },
      { path: 'cotizaciones/:id',                 element: L(QuoteDetailPage) },
      { path: 'cotizaciones/:id/editar',          element: L(EditQuotePage) },
      { path: 'catalogo',                         element: L(CatalogPage) },
      { path: 'clientes',                         element: L(Clientes) },
      { path: 'plantillas',                       element: L(Plantillas) },
      { path: 'materiales',                       element: L(Materiales) },
      { path: 'reportes',                         element: L(Reportes) },
      { path: 'ia',                               element: L(KtzIA) },
      { path: 'pipeline',                         element: L(Pipeline) },
      { path: 'empresa',                          element: LW(Empresa, RequireOwner) },
      { path: 'planes',                           element: LW(Planes, RequireOwner) },
      { path: 'billing/success',                  element: LW(BillingSuccess, RequireOwner) },
      { path: 'billing/pending',                  element: LW(BillingPending, RequireOwner) },
      { path: 'billing/failure',                  element: LW(BillingFailure, RequireOwner) },
      { path: 'team',                             element: LW(Team, RequireOwner) },
      { path: 'admin',                            element: LW(AdminPanel, RequireSuperAdmin) },
      { path: 'pedidos',                          element: L(Pedidos) },
      { path: 'pedidos/nuevo',                    element: L(PedidoNuevoPage) },
      { path: 'pedidos/:id',                      element: L(PedidoDetailPage) },
      { path: 'ordenes-trabajo',                  element: L(OrdenesDeTrabajo) },
      { path: 'ordenes-trabajo/:id',              element: L(OTDetailPage) },
      { path: 'proyectos',                        element: L(ProyectosEmpty) },
      { path: 'perfil',                           element: L(ProfilePage) },
      { path: 'config',                           element: L(ConfiguracionPage) },
      { path: 'config/integraciones',             element: L(IntegracionesPage) },
      { path: 'config/almacenamiento',            element: L(AlmacenamientoPage) },
      { path: 'config/webhooks',                  element: L(WebhooksPage) },
      { path: 'automatizaciones',                 element: L(AutomatizacionesPage) },
      { path: 'customer-success',                 element: L(CustomerSuccessPage) },
      { path: 'mapa-operativo',                   element: L(MapaOperativoPage) },
      { path: 'asistencia',                       element: L(AsistenciaPage) },
      { path: 'team/adicionales',                 element: L(AdicionalesPage) },
      { path: 'operaciones/mapa',                 element: L(MapaOperativoPage) },
      { path: 'growth',                           element: L(GrowthPage) },
      { path: 'finanzas',                         element: L(FinancePage) },
      { path: 'bi',                               element: L(BIPage) },
      { path: 'ia/operaciones',                   element: L(IAOperacionesPage) },
      { path: 'ia/crear',                         element: L(IACrearPage) },
      { path: 'ia/desde-imagen',                  element: L(DesdeImagenPage) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
