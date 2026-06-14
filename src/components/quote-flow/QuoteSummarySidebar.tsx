import { BarChart3, User, Folder, Clock3, CalendarDays, Info } from 'lucide-react';
import { fmtDateY } from '../../lib/calc';

interface QuoteSummarySidebarProps {
  clientName?: string;
  proj: string;
  loc: string;
  validDays: number;
  due: Date;
  advancePct: number;
  infoText?: string;
  extraRows?: React.ReactNode;
  footerExtra?: React.ReactNode;
}

export function SidebarRow({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ width: 32, height: 32, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{value}</div>
        {sub && <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function QuoteSummarySidebar({ clientName, proj, loc, validDays, due, advancePct, infoText, extraRows, footerExtra }: QuoteSummarySidebarProps) {
  return (
    <div className="qf-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BarChart3 size={18} />
        </span>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Resumen de la cotización</div>
      </div>

      <div className="qf-sidebar-rows">
        <SidebarRow icon={<User size={16} />} label="Cliente" value={clientName || 'Sin seleccionar'} />
        <SidebarRow icon={<Folder size={16} />} label="Proyecto" value={proj || 'Sin nombre'} sub={loc || undefined} />
        {extraRows}
        <SidebarRow icon={<Clock3 size={16} />} label="Validez" value={`${validDays} días`} sub={`Vence: ${fmtDateY(due)}`} />
        <SidebarRow icon={<CalendarDays size={16} />} label="Anticipo requerido" value={`${advancePct}%`} />
      </div>

      {footerExtra}

      {infoText && (
        <div style={{ display: 'flex', gap: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 14, padding: 12 }}>
          <Info size={16} style={{ color: '#2563EB', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.5 }}>{infoText}</div>
        </div>
      )}
    </div>
  );
}
