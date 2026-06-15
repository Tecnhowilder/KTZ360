export interface PricingBenefitItem {
  label: string;
  included: boolean;
}

export function PricingBenefits({ items, twoCol }: { items: PricingBenefitItem[]; twoCol?: boolean }) {
  const listClass = twoCol ? 'pricing-benefits-list pricing-benefits-list--two-col' : 'pricing-benefits-list';

  return (
    <div className="pricing-benefits">
      <ul className={listClass}>
        {items.map((item) => (
          <li key={item.label} className={item.included ? 'pricing-benefit-item' : 'pricing-benefit-item pricing-benefit-item--missing'}>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
