import { Fragment } from 'react';
import { Zap, ShieldCheck, RotateCcw, Headphones, Lock } from 'lucide-react';

const ITEMS = [
  { title: 'Activa al instante', description: 'Comienza a usar tu plan de inmediato.', icon: Zap, color: '#22c55e' },
  { title: 'Seguro y confiable', description: 'Tu información y pagos están 100% protegidos.', icon: ShieldCheck, color: '#2563eb' },
  { title: 'Cancela cuando quieras', description: 'Sin contratos forzados, ni permanencias.', icon: RotateCcw, color: '#8b5cf6' },
  { title: 'Soporte humano', description: 'Estamos contigo en cada paso del camino.', icon: Headphones, color: '#f97316' },
  { title: 'Sin costos ocultos', description: 'Paga solo lo que ves, sin sorpresas.', icon: Lock, color: '#16a34a' },
];

export function PricingFooter() {
  return (
    <section className="pricing-footer">
      <h2 className="pricing-footer-title">
        Diseñado para ayudarte a <span className="pricing-footer-highlight">crecer</span>
      </h2>
      <div className="pricing-footer-grid">
        {ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <Fragment key={item.title}>
              {index > 0 && <div className="pricing-footer-divider" />}
              <div className="pricing-footer-item">
                <div className="pricing-footer-icon" style={{ background: item.color }}>
                  <Icon size={24} />
                </div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
