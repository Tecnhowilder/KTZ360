import { Icon, EMPTY_ICONS } from '../lib/icons';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { useWorkspace } from '../features/auth/WorkspaceProvider';

interface SimpleEmptyProps {
  variant: 'proyectos' | 'config';
}

const COPY: Record<SimpleEmptyProps['variant'], { title: string; headline: string; body: string; cta: string; icon: string }> = {
  proyectos: {
    title: 'Proyectos',
    headline: 'Organiza tus obras',
    body: 'Agrupa cotizaciones por obra y sigue el avance de cada proyecto en un solo lugar.',
    cta: 'Crear cotización',
    icon: EMPTY_ICONS.proyectos,
  },
  config: {
    title: 'Configuración',
    headline: 'Todo bajo control',
    body: 'Preferencias de cuenta, notificaciones y plan. Esta sección llega en la siguiente entrega.',
    cta: 'Crear cotización',
    icon: EMPTY_ICONS.config,
  },
};

export function SimpleEmpty({ variant }: SimpleEmptyProps) {
  const { openQuoteFlow } = useUI();
  const { company } = useWorkspace();
  const c = COPY[variant];

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 18 }}>{c.title}</h1>
      <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 20, padding: '48px 24px', textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: '#EEF2FF',
            color: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}
        >
          <span style={{ width: 28, height: 28, display: 'flex' }}>
            <Icon path={c.icon} />
          </span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{c.headline}</div>
        <p style={{ fontSize: 13.5, color: '#64748B', marginTop: 6, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>{c.body}</p>
        <button
          onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
          style={{ marginTop: 18, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12, cursor: 'pointer' }}
        >
          {c.cta}
        </button>
      </div>
    </div>
  );
}
