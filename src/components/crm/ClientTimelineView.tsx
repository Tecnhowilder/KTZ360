/**
 * ClientTimelineView — Timeline comercial de un cliente.
 * Mobile-first. Usado dentro del detalle de cliente.
 */
import {
  FileText, Send, Eye, CheckCircle, XCircle, Clock,
  Phone, MessageCircle, Mail, MapPin, Users, AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useClientTimeline } from '../../hooks/useCRM';
import type { ClientTimelineEventType } from '../../lib/database.types';

// ─── Configuración de eventos ────────────────────────────────────────────────

interface EventDef {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  bg: string;
}

const EVENT_CONFIG: Partial<Record<ClientTimelineEventType | string, EventDef>> = {
  quote_created:       { icon: FileText,       color: '#64748B', bg: '#F1F5F9' },
  quote_sent:          { icon: Send,           color: '#2563EB', bg: '#EFF6FF' },
  quote_viewed:        { icon: Eye,            color: '#0891B2', bg: '#ECFEFF' },
  quote_approved:      { icon: CheckCircle,    color: '#16A34A', bg: '#F0FDF4' },
  quote_rejected:      { icon: XCircle,        color: '#DC2626', bg: '#FEF2F2' },
  quote_expired:       { icon: AlertTriangle,  color: '#D97706', bg: '#FFFBEB' },
  status_changed:      { icon: TrendingUp,     color: '#7C3AED', bg: '#F5F3FF' },
  seguimiento:         { icon: Phone,          color: '#64748B', bg: '#F8FAFC' },
  nota:                { icon: FileText,       color: '#64748B', bg: '#F8FAFC' },
  recordatorio_created:{ icon: Clock,          color: '#D97706', bg: '#FFFBEB' },
  recordatorio_done:   { icon: CheckCircle,    color: '#16A34A', bg: '#F0FDF4' },
};

const SEGUIMIENTO_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  llamada:  Phone,
  whatsapp: MessageCircle,
  correo:   Mail,
  visita:   MapPin,
  reunion:  Users,
  nota:     FileText,
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60)  return `Hace ${diffMin} min`;
  if (diffMin < 1440) return `Hace ${Math.floor(diffMin / 60)} h`;
  if (diffMin < 2880) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  clientId: string;
  workspaceId: string;
}

export function ClientTimelineView({ clientId }: Props) {
  const timelineQ = useClientTimeline(clientId);

  if (timelineQ.isLoading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
        Cargando timeline...
      </div>
    );
  }

  if (timelineQ.isError) {
    return (
      <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: 12, marginTop: 12 }}>
        <div style={{ fontSize: 13, color: '#DC2626' }}>
          No disponible — requiere plan PRO o PREMIUM
        </div>
      </div>
    );
  }

  const events = timelineQ.data?.events ?? [];

  if (!events.length) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 14, color: '#64748B' }}>Sin actividad registrada</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {events.map((evt, i) => {
        const def = EVENT_CONFIG[evt.type] ?? EVENT_CONFIG['seguimiento']!;

        // Para seguimientos, usar ícono específico del tipo si está en metadata
        let IconComp = def.icon;
        if (evt.type === 'seguimiento' && evt.metadata) {
          const segType = (evt.metadata as Record<string, string>)['seg_type'];
          if (segType && SEGUIMIENTO_ICONS[segType]) {
            IconComp = SEGUIMIENTO_ICONS[segType];
          }
        }

        return (
          <div key={evt.id} style={{ display: 'flex', gap: 12, marginBottom: i < events.length - 1 ? 0 : 0 }}>
            {/* Línea vertical + ícono */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: def.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${def.color}22`,
              }}>
                <IconComp size={15} color={def.color} />
              </div>
              {i < events.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 12, background: '#F1F5F9', margin: '4px 0' }} />
              )}
            </div>

            {/* Contenido */}
            <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? 12 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', flex: 1 }}>
                  {evt.title}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, marginLeft: 8 }}>
                  {formatDate(evt.created_at)}
                </div>
              </div>
              {evt.description && (
                <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>
                  {evt.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
