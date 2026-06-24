import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './styles/mobile.css'
import App from './App.tsx'

// Inicializar Sentry solo si el DSN está configurado (VITE_SENTRY_DSN en .env)
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,            // 'production' | 'development'
    release: import.meta.env.VITE_APP_VERSION,    // opcional, para release tracking
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 0,
    replaysSessionSampleRate: 0,                  // desactivar session replay
    replaysOnErrorSampleRate: 0,
    // No capturar datos de usuario por defecto (GDPR)
    beforeSend(event) {
      // Eliminar datos de usuario del request si existen
      if (event.request?.cookies) delete event.request.cookies;
      return event;
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 480, margin: '80px auto' }}>
          <h2 style={{ color: '#DC2626' }}>Ocurrió un error inesperado</h2>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>
            El equipo de Shelwi fue notificado. Puedes intentar recargar la página.
          </p>
          <pre style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16, whiteSpace: 'pre-wrap' }}>
            {String(error)}
          </pre>
          <button
            onClick={resetError}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
