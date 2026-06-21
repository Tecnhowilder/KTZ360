import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Pedidos } from './views/Pedidos';
import { PedidoDetailPage } from './views/PedidoDetailPage';
import { OrdenesDeTrabajo } from './views/OrdenesDeTrabajo';
import { OTDetailPage } from './views/OTDetailPage';
import { OnboardingPage } from './views/OnboardingPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RequireOwner } from './features/auth/RequireOwner';
import { RequireSuperAdmin } from './features/auth/RequireSuperAdmin';
import { AppIndexRedirect } from './features/auth/AppIndexRedirect';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './views/Dashboard';
import { Cotizaciones } from './views/Cotizaciones';
import { QuoteNewPage } from './views/QuoteNewPage';
import { QuoteDetailPage } from './views/QuoteDetailPage';
import { EditQuotePage } from './views/EditQuotePage';
import { CatalogPage } from './views/CatalogPage';
import { Clientes } from './views/Clientes';
import { Materiales } from './views/Materiales';
import { Plantillas } from './views/Plantillas';
import { Reportes } from './views/Reportes';
import { KtzIA } from './views/KtzIA';
import { Empresa } from './views/Empresa';
import { Planes } from './views/Planes';
import { AdminPanel } from './views/AdminPanel';
import { SimpleEmpty } from './views/SimpleEmpty';
import { ConfiguracionPage } from './views/ConfiguracionPage';
import { PublicQuotePortal } from './views/public/PublicQuotePortal';
import { ClientPortalPage } from './views/portal/ClientPortalPage';
import { AcceptInvite } from './views/public/AcceptInvite';
import { Terms } from './views/public/Terms';
import { PrivacyPolicy } from './views/public/PrivacyPolicy';
import { BillingSuccess } from './views/billing/BillingSuccess';
import { BillingPending } from './views/billing/BillingPending';
import { BillingFailure } from './views/billing/BillingFailure';
import { Team } from './views/Team';
import { Pipeline } from './views/Pipeline';
import { IntegracionesPage } from './views/config/IntegracionesPage';
import { AutomatizacionesPage } from './views/AutomatizacionesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/app/dashboard" replace />,
  },
  { path: '/onboarding', element: <OnboardingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  { path: '/recuperar-contrasena', element: <ForgotPasswordPage /> },
  { path: '/p/:token', element: <PublicQuotePortal /> },
  { path: '/portal/:token', element: <ClientPortalPage /> },
  { path: '/invite/:token', element: <AcceptInvite /> },
  { path: '/terminos', element: <Terms /> },
  { path: '/politica-privacidad', element: <PrivacyPolicy /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AppIndexRedirect /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'cotizaciones', element: <Cotizaciones /> },
      { path: 'cotizaciones/nueva', element: <QuoteNewPage /> },
      { path: 'cotizaciones/:id', element: <QuoteDetailPage /> },
      { path: 'cotizaciones/:id/editar', element: <EditQuotePage /> },
      { path: 'catalogo', element: <CatalogPage /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'plantillas', element: <Plantillas /> },
      { path: 'materiales', element: <Materiales /> },
      { path: 'reportes', element: <Reportes /> },
      { path: 'ia', element: <KtzIA /> },
      { path: 'pipeline', element: <Pipeline /> },
      { path: 'empresa', element: <RequireOwner><Empresa /></RequireOwner> },
      { path: 'planes', element: <RequireOwner><Planes /></RequireOwner> },
      { path: 'billing/success', element: <RequireOwner><BillingSuccess /></RequireOwner> },
      { path: 'billing/pending', element: <RequireOwner><BillingPending /></RequireOwner> },
      { path: 'billing/failure', element: <RequireOwner><BillingFailure /></RequireOwner> },
      { path: 'team', element: <RequireOwner><Team /></RequireOwner> },
      { path: 'admin', element: <RequireSuperAdmin><AdminPanel /></RequireSuperAdmin> },
      { path: 'pedidos',                   element: <Pedidos /> },
      { path: 'pedidos/:id',               element: <PedidoDetailPage /> },
      { path: 'ordenes-trabajo',            element: <OrdenesDeTrabajo /> },
      { path: 'ordenes-trabajo/:id',        element: <OTDetailPage /> },
      { path: 'proyectos', element: <SimpleEmpty variant="proyectos" /> },
      { path: 'config', element: <ConfiguracionPage /> },
      { path: 'config/integraciones', element: <IntegracionesPage /> },
      { path: 'automatizaciones', element: <AutomatizacionesPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
