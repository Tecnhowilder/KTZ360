import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding } from '../lib/onboarding';

// ─── Contenido de slides ──────────────────────────────────────────────────────

const SLIDES = [
  {
    image:       '/images/onboarding/img1.png',
    title:       'Crea cotizaciones profesionales',
    description: 'Diseña cotizaciones claras, personalizadas y listas para impresionar a tus clientes.',
  },
  {
    image:       '/images/onboarding/img2.png',
    title:       'Organiza y gestiona todo en un solo lugar',
    description: 'Administra clientes, productos y servicios de forma simple y eficiente.',
  },
  {
    image:       '/images/onboarding/img3.png',
    title:       'Recibe notificaciones y nunca pierdas el control',
    description: 'Mantente al tanto de cada actualización de tus cotizaciones en tiempo real.',
  },
] as const;

const TOTAL = SLIDES.length;

// ─── Botón circular con progreso SVG ─────────────────────────────────────────

const R        = 34;            // radio del arco exterior
const SIZE     = 76;            // tamaño total del SVG
const CIRC     = 2 * Math.PI * R;  // ≈ 213.6

function ProgressButton({ step, onClick }: { step: number; onClick: () => void }) {
  const pct    = ((step + 1) / TOTAL) * 100;
  const offset = CIRC * (1 - pct / 100);
  const isLast = step === TOTAL - 1;
  const cx     = SIZE / 2;

  return (
    <button
      onClick={onClick}
      aria-label={isLast ? 'Comenzar' : 'Siguiente'}
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block' }}>
        {/* Pista gris */}
        <circle
          cx={cx} cy={cx} r={R}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={3.5}
        />
        {/* Arco de progreso */}
        <circle
          cx={cx} cy={cx} r={R}
          fill="none"
          stroke="#2563EB"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
        {/* Círculo negro interior */}
        <circle cx={cx} cy={cx} r={26} fill="#0F172A" />
        {/* Flecha blanca → */}
        {!isLast ? (
          <path
            d="M30 38 L38 38 L34 33 M38 38 L34 43"
            fill="none"
            stroke="#fff"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          /* Check en última slide */
          <path
            d="M29 38 L33 42 L47 30"
            fill="none"
            stroke="#fff"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

// ─── Dots indicadores ─────────────────────────────────────────────────────────

function Dots({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}>
      {SLIDES.map((_, i) => (
        <div
          key={i}
          style={{
            width:  i === current ? 20 : 7,
            height: 7,
            borderRadius: 99,
            background: i === current ? '#2563EB' : '#D1D5DB',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ─── Onboarding principal ─────────────────────────────────────────────────────

export function OnboardingPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);

  const goNext = useCallback(() => {
    if (current < TOTAL - 1) {
      setCurrent(c => c + 1);
    } else {
      completeOnboarding();
      navigate('/login', { replace: true });
    }
  }, [current, navigate]);

  const goPrev = useCallback(() => {
    if (current > 0) setCurrent(c => c - 1);
  }, [current]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev();
    }
    touchStartX.current = null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Safe areas
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px 0', flexShrink: 0 }}>
        {current < TOTAL - 1 && (
          <button
            onClick={() => { completeOnboarding(); navigate('/login', { replace: true }); }}
            style={{ border: 'none', background: 'none', color: '#94A3B8', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
          >
            Omitir
          </button>
        )}
      </div>

      {/* Slides container */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            width: `${TOTAL * 100}%`,
            height: '100%',
            transform: `translateX(calc(-${(100 / TOTAL) * current}%))`,
            transition: 'transform 0.4s ease',
          }}
        >
          {SLIDES.map((slide, i) => (
            <div
              key={i}
              style={{
                width: `${100 / TOTAL}%`,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
              }}
            >
              <img
                src={slide.image}
                alt={slide.title}
                loading={i === 0 ? 'eager' : 'lazy'}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div
        style={{
          flexShrink: 0,
          padding: '24px 28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          background: '#fff',
        }}
      >
        {/* Texto */}
        <div style={{ textAlign: 'center', minHeight: 88 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-.5px',
              lineHeight: 1.25,
              marginBottom: 10,
              margin: '0 0 10px',
              transition: 'opacity 0.3s ease',
            }}
          >
            {SLIDES[current].title}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#64748B',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {SLIDES[current].description}
          </p>
        </div>

        {/* Dots + botón */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Dots current={current} />
          <ProgressButton step={current} onClick={goNext} />
        </div>
      </div>
    </div>
  );
}
