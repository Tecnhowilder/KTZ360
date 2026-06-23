/**
 * ReferralRedirect — /ref/:refCode
 * Ruta pública: registra visita (track_referral_visit) y redirige al home.
 * No requiere auth. Anon OK.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export function ReferralRedirect() {
  const { refCode } = useParams<{ refCode: string }>();
  const navigate    = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!refCode) { navigate('/'); return; }

    const sp = new URLSearchParams(window.location.search);

    supabase.rpc('track_referral_visit', {
      p_ref_code:     refCode,
      p_utm_source:   sp.get('utm_source')   ?? 'referral',
      p_utm_medium:   sp.get('utm_medium')   ?? 'referral',
      p_utm_campaign: sp.get('utm_campaign') ?? null,
      p_utm_content:  sp.get('utm_content')  ?? null,
      p_utm_term:     sp.get('utm_term')     ?? null,
      p_landing_url:  window.location.href,
      p_referrer_url: document.referrer || null,
    }).then(({ error }) => {
      setStatus(error ? 'error' : 'ok');
      // Siempre redirige — incluso si hay error no crítico
      setTimeout(() => navigate('/'), 1500);
    });
  }, [refCode, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#F8FAFC', gap: 16 }}>
      <div style={{ fontSize: 40 }}>{status === 'error' ? '⚠️' : '🎉'}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
        {status === 'loading' ? 'Procesando referido...' : status === 'ok' ? '¡Bienvenido!' : 'Continuando...'}
      </div>
      <div style={{ fontSize: 13, color: '#64748B' }}>Serás redirigido en un momento</div>
    </div>
  );
}
