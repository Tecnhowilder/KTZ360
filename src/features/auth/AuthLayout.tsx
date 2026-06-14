import type { ReactNode } from 'react';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#F8FAFC',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 20,
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 24px rgba(15,23,42,.06)',
          padding: '36px 32px',
          animation: 'pop .3s ease',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#2563EB',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 20,
              margin: '0 auto 16px',
            }}
          >
            B
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>{title}</h1>
          <p style={{ fontSize: 14, color: '#64748B' }}>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #E2E8F0',
  fontSize: 14,
  color: '#0F172A',
  outline: 'none',
  background: '#fff',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#334155',
  marginBottom: 6,
};

export const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px',
  borderRadius: 10,
  border: 'none',
  background: '#2563EB',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

export const errorStyle: React.CSSProperties = {
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  color: '#DC2626',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  marginBottom: 16,
};

export const linkStyle: React.CSSProperties = {
  color: '#2563EB',
  fontWeight: 600,
  textDecoration: 'none',
};
