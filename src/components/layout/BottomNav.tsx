import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { defaultQConfig } from '../../features/app/UIProvider';
import { getThemeByPlan } from '../../lib/planTheme';
import { Plus } from 'lucide-react';

export function BottomNav() {
  const { company, planName } = useWorkspace();
  const { openQuoteFlow } = useUI();
  const theme = getThemeByPlan(planName);

  return (
    <button
      onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
      aria-label="Nueva cotización"
      style={{
        position: 'fixed',
        bottom: 'calc(20px + env(safe-area-inset-bottom))',
        right: 20,
        zIndex: 35,
        width: 58,
        height: 58,
        borderRadius: '50%',
        background: theme.ctaBg,
        border: '3px solid #fff',
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: theme.ctaShadow + ', 0 4px 16px rgba(0,0,0,.18)',
        transition: 'background 0.5s ease, box-shadow 0.4s ease',
      }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  );
}
