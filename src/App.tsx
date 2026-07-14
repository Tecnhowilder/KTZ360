import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { UIProvider } from './features/app/UIProvider';
import { ToastProvider } from './components/ui/Toast';
import { router } from './router';
import { STALE, GC } from './lib/queryConfig';
import { restoreAuthCache, subscribeAuthPersister } from './lib/queryPersister';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            STALE.BUSINESS,
      gcTime:               GC.NORMAL,
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
});

// Restaurar cache de auth antes del primer render
restoreAuthCache(queryClient);

function App() {
  useEffect(() => {
    // Suscribir persister: guarda queries de auth cuando cambian
    const unsub = subscribeAuthPersister(queryClient);
    return unsub;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UIProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </UIProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
