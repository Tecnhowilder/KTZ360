interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  'Borrador':           { label: 'Borrador',    color: '#475569', bg: '#F1F5F9' },
  'Enviada':            { label: 'Enviada',     color: '#92400E', bg: '#FEF3C7' },
  'Aprobada':           { label: 'Aprobada',    color: '#166534', bg: '#DCFCE7' },
  'Rechazada':          { label: 'Rechazada',   color: '#991B1B', bg: '#FEE2E2' },
  'Vencida':            { label: 'Vencida',     color: '#64748B', bg: '#E2E8F0' },
  'converted_to_order': { label: 'En pedido',   color: '#5B21B6', bg: '#EDE9FE' },
};

export function QuoteStatusBadge({ status, size = 'sm' }: Props) {
  const s = STATUS_MAP[status] ?? { label: status, color: '#475569', bg: '#F1F5F9' };
  const fontSize = size === 'sm' ? 10.5 : 12;
  const padding = size === 'sm' ? '3px 8px' : '4px 10px';
  return (
    <span style={{
      fontSize,
      fontWeight: 700,
      color: s.color,
      background: s.bg,
      padding,
      borderRadius: 99,
      letterSpacing: '.2px',
      whiteSpace: 'nowrap',
      display: 'inline-block',
      lineHeight: 1.4,
    }}>
      {s.label}
    </span>
  );
}
