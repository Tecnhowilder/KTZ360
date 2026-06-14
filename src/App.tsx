import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { UIProvider } from './features/app/UIProvider';
import { ToastProvider } from './components/ui/Toast';
import { router } from './router';

const queryClient = new QueryClient();

function App() {
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
