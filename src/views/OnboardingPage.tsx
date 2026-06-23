/**
 * OnboardingPage.tsx — Onboarding diferenciado por rol (Sprint 16.3 fix)
 *
 * Carga el rol del usuario desde Supabase y muestra slides específicos.
 * Fuente única de verdad de slides: src/lib/roleOnboarding.ts
 * Si el rol no necesita onboarding (super_admin, support_admin), auto-completa.
 * Si no hay sesión, muestra el onboarding de owner por defecto.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding } from '../lib/onboarding';
import { getSlidesForRole, shouldSkipOnboarding, type OnboardingSlide } from '../lib/roleOnboarding';
import { supabase } from '../lib/supabaseClient';

// ─── Botón circular con progreso SVG ─────────────────────────────────────────

const R    = 34;
const SIZE = 76;
const CIRC = 2 * Math.PI * R;

function ProgressButton({ step, total, onClick }: { step: number; total: number; onClick: () => void }) {
  const pct    = ((step + 1) / total) * 100;
  const offset = CIRC * (1 - pct / 100);
  const isLast = step === total - 1;
  const cx     = SIZE / 2;

  return (
    <button
      onClick={onClick}
      aria-label={isLast ? 'Comenzar' : 'Siguiente'}
      style={{ position: 'relative', width: SIZE, height: SIZE, border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block' }}>
        <circle cx={cx} cy={cx} r={R} fill="none" stroke="#E5E7EB" strokeWidth={3.5} />
        <circle cx={cx} cy={cx} r={R} fill="none" stroke="#2563EB" strokeWidth={3.5}
          strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
        <circle cx={cx} cy={cx} r={26} fill="#0F172A" />
        {!isLast ? (
          <path d="M30 38 L38 38 L34 33 M38 38 L34 43" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M29 38 L33 42 L47 30" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

// ─── Dots indicadores ─────────────────────────────────────────────────────────

function Dots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 7, height: 7, borderRadius: 99,
          background: i === current ? '#2563EB' : '#D1D5DB',
          transition: 'all 0.3s ease',
        }} />
      ))}
    </div>
  );
}

// ─── Spinner de carga ─────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ─── OnboardingPage ───────────────────────────────────────────────────────────

export function OnboardingPage() {
  const navigate = useNavigate();
  const [slides, setSlides] = useState<OnboardingSlide[] | null>(null);
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Carga el rol del usuario y selecciona los slides correspondientes
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          // Sin sesión: usar slides de owner por defecto
          setSlides(getSlidesForRole('owner'));
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const role = profile?.role ?? 'owner';

        // Roles sin onboarding: completar automáticamente y redirigir
        if (shouldSkipOnboarding(role)) {
          completeOnboarding();
          navigate('/app/dashboard', { replace: true });
          return;
        }

        setSlides(getSlidesForRole(role));
      } catch {
        // Error al obtener rol: fallback a owner
        setSlides(getSlidesForRole('owner'));
      }
    })();
  }, [navigate]);

  const goNext = useCallback(() => {
    if (!slides) return;
    if (current < slides.length - 1) {
      setCurrent(c => c + 1);
    } else {
      completeOnboarding();
      navigate('/app/dashboard', { replace: true });
    }
  }, [current, navigate, slides]);

  const goPrev = useCallback(() => {
    if (current > 0) setCurrent(c => c - 1);
  }, [current]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  }

  // Cargando rol del usuario
  if (!slides) return <LoadingSpinner />;

  // Fallback por si el array es vacío (no debería pasar por shouldSkipOnboarding)
  if (slides.length === 0) {
    completeOnboarding();
    navigate('/app/dashboard', { replace: true });
    return null;
  }

  const TOTAL = slides.length;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px 0', flexShrink: 0 }}>
        {current < TOTAL - 1 && (
          <button
            onClick={() => { completeOnboarding(); navigate('/app/dashboard', { replace: true }); }}
            style={{ border: 'none', background: 'none', color: '#94A3B8', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
          >
            Omitir
          </button>
        )}
      </div>

      {/* Slides */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          display: 'flex', width: `${TOTAL * 100}%`, height: '100%',
          transform: `translateX(calc(-${(100 / TOTAL) * current}%))`,
          transition: 'transform 0.4s ease',
        }}>
          {slides.map((slide, i) => (
            <div key={i} style={{ width: `${100 / TOTAL}%`, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
              <img src={slide.image} alt={slide.title} loading={i === 0 ? 'eager' : 'lazy'}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div style={{ flexShrink: 0, padding: '24px 28px 32px', display: 'flex', flexDirection: 'column', gap: 20, background: '#fff' }}>
        <div style={{ textAlign: 'center', minHeight: 88 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px', lineHeight: 1.25, marginBottom: 10, margin: '0 0 10px', transition: 'opacity 0.3s ease' }}>
            {slides[current].title}
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, margin: 0 }}>
            {slides[current].description}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Dots current={current} total={TOTAL} />
          <ProgressButton step={current} total={TOTAL} onClick={goNext} />
        </div>
      </div>
    </div>
  );
}
