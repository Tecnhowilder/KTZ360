import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../../lib/brand';
import '../../styles/legal.css';

export function LegalPageLayout({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/" className="legal-logo">
          {APP_NAME}
        </Link>
        <Link to="/app/planes" className="legal-back-link">
          Volver a Planes
        </Link>
      </header>

      <main className="legal-content">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Última actualización: {updatedAt}</p>
        {children}
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
