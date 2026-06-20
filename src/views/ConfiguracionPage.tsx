import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { ConfiguracionMobile } from '../components/config/ConfiguracionMobile';
import { SimpleEmpty } from './SimpleEmpty';

export function ConfiguracionPage() {
  const width   = useWindowWidth();
  const navMode = navModeFor(width);
  if (navMode === 'bottom') return <ConfiguracionMobile />;
  // Desktop: pantalla de configuración desktop (Empresa, etc. ya existen en /app/empresa)
  return <SimpleEmpty variant="config" />;
}
