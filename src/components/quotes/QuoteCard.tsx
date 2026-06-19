import { MoreVertical, Copy, Trash2, Eye } from 'lucide-react';
import { useState } from 'react';
import { QuoteStatusBadge } from './QuoteStatusBadge';
import { fmtM } from '../../lib/calc';
import type { DerivedQuote } from '../../lib/types';

const AVATAR_COLORS = [
  { bg: '#DBEAFE', fg: '#1D4ED8' },
  { bg: '#D1FAE5', fg: '#065F46' },
  { bg: '#EDE9FE', fg: '#6D28D9' },
  { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#FCE7F3', fg: '#9D174D' },
  { bg: '#E0F2FE', fg: '#0369A1' },
];
function avatarColor(id: string) {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

interface Props {
  quote: DerivedQuote;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}

export function QuoteCard({ quote: q, onOpen, onDuplicate, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const av = avatarColor(q.id);

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: '#fff',
        cursor: 'pointer',
        borderBottom: '1px solid #F1F5F9',
        position: 'relative',
        transition: 'background .1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFC')}
      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
    >
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: 14,
        background: av.bg, color: av.fg,
        fontWeight: 800, fontSize: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {q.initial}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 700, color: '#0F172A',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {q.title}
        </div>
        <div style={{ fontSize: 12.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
            {q.clientName}
          </span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span style={{ flexShrink: 0 }}>{q.dateLabel}</span>
        </div>
      </div>

      {/* Right: valor + estado */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
          {fmtM(q.calc.total)}
        </div>
        <QuoteStatusBadge status={q.status} />
      </div>

      {/* Menú 3 puntos */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: 'none', background: '#F8FAFC',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#64748B',
          }}
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <>
            <div onClick={e => { e.stopPropagation(); setMenuOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
            <div style={{
              position: 'absolute', right: 0, top: 36, zIndex: 50,
              background: '#fff', border: '1px solid #E2E8F0',
              borderRadius: 14, boxShadow: '0 8px 32px rgba(15,23,42,.12)',
              minWidth: 168, overflow: 'hidden',
            }}>
              <button onClick={e => { e.stopPropagation(); onOpen(); setMenuOpen(false); }}
                style={menuItemStyle}>
                <Eye size={14} /> Ver detalle
              </button>
              <button onClick={e => { e.stopPropagation(); onDuplicate(); setMenuOpen(false); }}
                style={menuItemStyle}>
                <Copy size={14} /> Duplicar
              </button>
              {onDelete && (
                <button onClick={e => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                  style={{ ...menuItemStyle, color: '#EF4444', borderTop: '1px solid #FEE2E2' }}>
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9,
  width: '100%', padding: '11px 14px',
  border: 'none', background: 'none',
  fontSize: 13.5, fontWeight: 500, color: '#0F172A',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
};
