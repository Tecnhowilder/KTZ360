interface Props {
  onNew: () => void;
  hasFilters?: boolean;
}

export function EmptyQuotes({ onNew, hasFilters }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '56px 24px', textAlign: 'center',
    }}>
      {/* Ilustración simple */}
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: '#EFF6FF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, fontSize: 36,
      }}>
        📄
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
        {hasFilters ? 'Sin resultados' : 'No hay cotizaciones aún'}
      </div>
      <div style={{ fontSize: 14, color: '#64748B', maxWidth: 280, lineHeight: 1.6, marginBottom: 28 }}>
        {hasFilters
          ? 'No se encontraron cotizaciones con ese filtro. Intenta con otro estado.'
          : 'Crea tu primera cotización para empezar a gestionar tus propuestas comerciales.'}
      </div>

      {!hasFilters && (
        <button
          onClick={onNew}
          style={{
            border: 'none', background: '#2563EB', color: '#fff',
            fontWeight: 700, fontSize: 15, padding: '13px 28px',
            borderRadius: 14, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37,99,235,.35)',
          }}
        >
          + Crear cotización
        </button>
      )}
    </div>
  );
}
