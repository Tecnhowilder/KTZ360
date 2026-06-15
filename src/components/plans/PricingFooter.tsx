import { Zap, ShieldCheck, RotateCcw, Headphones, Lock } from 'lucide-react';

const ITEMS = [
  { title: 'Activa al instante', description: 'Comienza a usar tu plan de inmediato.', icon: Zap },
  { title: 'Seguro y confiable', description: 'Tu información y pagos están protegidos.', icon: ShieldCheck },
  { title: 'Cancela cuando quieras', description: 'Sin contratos ni permanencias.', icon: RotateCcw },
  { title: 'Soporte humano', description: 'Estamos contigo cuando lo necesites.', icon: Headphones },
  { title: 'Sin costos ocultos', description: 'Pagas solo lo que ves.', icon: Lock },
];

export function PricingFooter() {
  return (
    <section className="pricing-footer">
      <div className="pricing-footer-grid">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div className="pricing-footer-item" key={item.title}>
              <Icon className="pricing-footer-icon" size={20} strokeWidth={1.75} />
              <div className="pricing-footer-text">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
