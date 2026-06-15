import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './views/Dashboard';
import { Cotizaciones } from './views/Cotizaciones';
import { Clientes } from './views/Clientes';
import { Materiales } from './views/Materiales';
import { Plantillas } from './views/Plantillas';
import { Reportes } from './views/Reportes';
import { KtzIA } from './views/KtzIA';
import { Empresa } from './views/Empresa';
import { Planes } from './views/Planes';
import { AdminPanel } from './views/AdminPanel';
import { SimpleEmpty } from './views/SimpleEmpty';
import { PublicQuotePortal } from './views/public/PublicQuotePortal';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  { path: '/recuperar-contrasena', element: <ForgotPasswordPage /> },
  { path: '/p/:token', element: <PublicQuotePortal /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'cotizaciones', element: <Cotizaciones /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'plantillas', element: <Plantillas /> },
      { path: 'materiales', element: <Materiales /> },
      { path: 'reportes', element: <Reportes /> },
      { path: 'ia', element: <KtzIA /> },
      { path: 'empresa', element: <Empresa /> },
      { path: 'planes', element: <Planes /> },
      { path: 'admin', element: <AdminPanel /> },
      { path: 'proyectos', element: <SimpleEmpty variant="proyectos" /> },
      { path: 'config', element: <SimpleEmpty variant="config" /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
