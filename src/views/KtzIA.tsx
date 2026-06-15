import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useAI } from '../hooks/useAI';
import { fmt } from '../lib/calc';
import { NumberField } from '../components/ui/NumberField';
import { listCategories, listServicesByCategory, getServiceWithRules } from '../services/catalogV2';
import { computeServiceLine, computeQuote } from '../lib/engine';
import type { IaEstimate } from '../lib/types';

const CHIPS = [
  { label: 'Pintura 90 m²', txt: 'Pintura interior de apartamento de 90 m²' },
  { label: 'Drywall 60 m²', txt: 'Muros en drywall de 60 m²' },
  { label: 'Pisos 120 m²', txt: 'Instalación de pisos en porcelanato 120 m²' },
];

const PHOTO_CATEGORY_KEYS = ['pintura', 'pisos_enchapes', 'drywall', 'remodelacion_banos', 'electricidad', 'plomeria'];
const KEYWORD_CATEGORY_MAP: { keyword: string; categoryKey: string }[] = [
  { keyword: 'drywa', categoryKey: 'drywall' },
  { keyword: 'elect', categoryKey: 'electricidad' },
  { keyword: 'plome', categoryKey: 'plomeria' },
  { keyword: 'pisos', categoryKey: 'pisos_enchapes' },
  { keyword: 'encha', categoryKey: 'pisos_enchapes' },
  { keyword: 'remod', categoryKey: 'remodelacion_banos' },
  { keyword: 'techo', categoryKey: 'cubiertas' },
  { keyword: 'mampo', categoryKey: 'mamposteria' },
];

async function estimate(categoryKey: string, area: number): Promise<IaEstimate | null> {
  const categories = await listCategories();
  const category = categories.find((c) => c.key === categoryKey) ?? categories[0];
  if (!category) return null;

  const services = await listServicesByCategory(category.id);
  const service = services[0];
  if (!service) return null;

  const full = await getServiceWithRules(service.id);
  const variantId = full.variants[0]?.id ?? null;
  const answers: Record<string, unknown> = {};
  full.questions.forEach((q) => { answers[q.key] = q.default_value; });

  const serviceLine = computeServiceLine(full, variantId, area, answers, undefined, 19);
  const total = computeQuote([serviceLine], { adminPct: 0, imprevistosPct: 0, util: 25, taxMode: 'none', taxRate: 0, discount: 0, discountOn: false, transportCost: 0, transportEnabled: false }).total;

  return { area, categoryKey: category.key, serviceLine, total };
}

export function KtzIA() {
  const { openQuoteFlow, openUpgradeModal } = useUI();
  const aiAccess = useFeatureAccess('ai_enabled');
  const photoAccess = useFeatureAccess('photo_quote_enabled');
  const { generate, loading: aiLoading } = useAI();
  const categoriesQuery = useQuery({ queryKey: ['catalog-categories'], queryFn: listCategories });
  const [mode, setMode] = useState<'text' | 'photo'>('text');
  const [iaText, setIaText] = useState('');
  const [iaLoading, setIaLoading] = useState(false);
  const [iaResult, setIaResult] = useState<IaEstimate | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoCategory, setPhotoCategory] = useState(PHOTO_CATEGORY_KEYS[0]);
  const [photoArea, setPhotoArea] = useState(80);

  async function iaGenerate() {
    if (iaLoading || aiLoading) return;
    if (aiAccess.data === false) {
      openUpgradeModal({
        title: 'KTZ360 IA está disponible en PREMIUM',
        message: 'Genera cotizaciones desde una descripción. Calcula materiales automáticamente. Obtén reportes avanzados.',
        targetPlan: 'premium',
        ctaLabel: 'Pasar a PREMIUM',
      });
      return;
    }
    setIaLoading(true);
    setIaResult(null);

    const txt = iaText || 'Pintura de una casa de 120 metros cuadrados';
    let prompt = `Extrae el área en metros cuadrados y el tipo de servicio de esta descripción para generar una cotización: "${txt}". Responde solo con texto plano.`;

    try {
      const resp = await generate(prompt, { model: 'gemini-1.5', max_tokens: 200, temperature: 0.2 });
      const content = typeof resp === 'string'
        ? resp
        : resp.output_text || resp?.candidates?.[0]?.content?.[0]?.text || resp?.choices?.[0]?.message?.content || JSON.stringify(resp);

      const num = content.match(/(\d{2,4})/);
      const area = num ? parseInt(num[1], 10) : 120;
      const low = content.toLowerCase();
      let categoryKey = 'pintura';
      KEYWORD_CATEGORY_MAP.forEach(({ keyword, categoryKey: ck }) => {
        if (low.includes(keyword)) categoryKey = ck;
      });
      const result = await estimate(categoryKey, area || 120);
      setIaResult(result);
    } catch (error) {
      console.error('AI generation error', error);
      setIaResult(null);
    } finally {
      setIaLoading(false);
    }
  }

  async function photoGenerate() {
    if (iaLoading) return;
    if (photoAccess.data === false) {
      openUpgradeModal({
        title: 'Cotización desde foto disponible en PREMIUM',
        message: 'Genera cotizaciones desde fotografías. Calcula materiales automáticamente. Obtén reportes avanzados.',
        targetPlan: 'premium',
        ctaLabel: 'Pasar a PREMIUM',
      });
      return;
    }
    setIaLoading(true);
    setIaResult(null);
    const result = await estimate(photoCategory, photoArea || 80);
    setIaLoading(false);
    setIaResult(result);
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoUrl(URL.createObjectURL(f));
    setIaResult(null);
  }

  function iaToQuote() {
    if (!iaResult) return;
    openQuoteFlow({
      step: 4,
      cfg: { ...defaultQConfig(), serviceLines: [iaResult.serviceLine], proj: `${iaResult.serviceLine.service_name} ${iaResult.area}m²` },
    });
  }

  const iaMessage = iaResult
    ? `Hola, te comparto una propuesta de ${iaResult.serviceLine.service_name.toLowerCase()} para ${iaResult.area} m² por ${fmt(iaResult.total)}. Incluye materiales y mano de obra. ¿La revisamos?`
    : '';

  const spinner = (
    <span style={{ width: 17, height: 17, border: '2.5px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .9s linear infinite' }} />
  );

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#0F172A', color: '#7CFFB0', padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: '.5px' }}>
          ✦ KTZ360 IA
        </div>
        <h1 style={{ fontSize: 'clamp(24px,4vw,32px)', fontWeight: 800, letterSpacing: '-1px', marginTop: 14 }}>Cotiza en segundos</h1>
        <p style={{ fontSize: 13.5, color: '#64748B', marginTop: 6, lineHeight: 1.5 }}>
          KTZ360 detecta el trabajo y el área, y usa <strong>el catálogo de reglas</strong> para calcular materiales y mano de obra. La IA solo pule la redacción.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, background: '#EEF2F7', padding: 5, borderRadius: 14, marginBottom: 16 }}>
        <button
          onClick={() => { setMode('text'); setIaResult(null); }}
          style={{ flex: 1, border: 'none', background: mode === 'text' ? '#fff' : 'transparent', color: mode === 'text' ? '#0F172A' : '#64748B', fontWeight: 700, fontSize: 13.5, padding: 11, borderRadius: 10, cursor: 'pointer', boxShadow: mode === 'text' ? '0 2px 6px rgba(15,23,42,.1)' : 'none' }}
        >
          ✍️ Describir
        </button>
        <button
          onClick={() => { setMode('photo'); setIaResult(null); }}
          style={{ flex: 1, border: 'none', background: mode === 'photo' ? '#fff' : 'transparent', color: mode === 'photo' ? '#0F172A' : '#64748B', fontWeight: 700, fontSize: 13.5, padding: 11, borderRadius: 10, cursor: 'pointer', boxShadow: mode === 'photo' ? '0 2px 6px rgba(15,23,42,.1)' : 'none' }}
        >
          📷 Desde foto
        </button>
      </div>

      {mode === 'text' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 18 }}>
          <textarea
            value={iaText}
            onChange={(e) => setIaText(e.target.value)}
            placeholder="Ej: Pintura interior de un apartamento de 90 m² en Bogotá"
            style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 13, padding: 14, fontSize: 14, minHeight: 80, resize: 'vertical', lineHeight: 1.5, outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {CHIPS.map((ch) => (
              <button
                key={ch.label}
                onClick={() => setIaText(ch.txt)}
                style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 99, cursor: 'pointer' }}
              >
                {ch.label}
              </button>
            ))}
          </div>
          <button
            onClick={iaGenerate}
            style={{ width: '100%', marginTop: 14, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: '0 8px 18px -8px rgba(37,99,235,.6)' }}
          >
            {iaLoading && spinner}
            {iaLoading ? 'Calculando…' : '✦ Generar cotización'}
            {aiAccess.data === false && (
              <span style={{ fontSize: 9, fontWeight: 800, color: '#0F172A', background: '#7CFFB0', padding: '2px 7px', borderRadius: 6, letterSpacing: '.5px' }}>PREMIUM</span>
            )}
          </button>
        </div>
      )}

      {mode === 'photo' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 18 }}>
          <label style={{ display: 'block', border: '2px dashed #BFD3FF', borderRadius: 14, padding: 22, textAlign: 'center', cursor: 'pointer', background: '#F8FAFF', position: 'relative', overflow: 'hidden' }}>
            {photoUrl && <div style={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: `url("${photoUrl}")` }} />}
            {!photoUrl && (
              <div>
                <div style={{ fontSize: 30 }}>📷</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 6 }}>Sube una foto del espacio</div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Toca para elegir una imagen</div>
              </div>
            )}
            <input type="file" accept="image/*" onChange={onPhoto} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>

          {photoUrl && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', margin: '16px 0 9px' }}>¿Qué deseas cotizar?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PHOTO_CATEGORY_KEYS.map((key) => {
                  const c = categoriesQuery.data?.find((cat) => cat.key === key);
                  if (!c) return null;
                  const active = photoCategory === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setPhotoCategory(key)}
                      style={{ border: `1.5px solid ${active ? '#2563EB' : '#E2E8F0'}`, background: active ? '#2563EB' : '#fff', color: active ? '#fff' : '#475569', fontWeight: 600, fontSize: 13, padding: '9px 14px', borderRadius: 99, cursor: 'pointer' }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Área aproximada</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: '0 15px' }}>
                  <NumberField
                    min={1}
                    value={photoArea}
                    onChange={setPhotoArea}
                    style={{ flex: 1, border: 'none', padding: '12px 0', fontSize: 16, fontWeight: 700, outline: 'none' }}
                  />
                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, color: '#94A3B8' }}>m²</span>
                </div>
              </div>
              <button
                onClick={photoGenerate}
                style={{ width: '100%', marginTop: 14, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: '0 8px 18px -8px rgba(37,99,235,.6)' }}
              >
                {iaLoading && spinner}
                ✦ Generar propuesta
                {photoAccess.data === false && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#0F172A', background: '#7CFFB0', padding: '2px 7px', borderRadius: 6, letterSpacing: '.5px' }}>PREMIUM</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {iaResult && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 20, marginTop: 14, animation: 'slideUp .3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{iaResult.serviceLine.service_name} · {iaResult.area} m²</div>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#7CFFB0', background: '#0F172A', padding: '4px 9px', borderRadius: 7 }}>✦ Calculado</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {iaResult.serviceLine.materials.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '9px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span>{m.name} <span style={{ color: '#94A3B8' }}>· {Math.round(m.qty * 100) / 100} {m.unit}</span></span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(m.subtotal)}</span>
              </div>
            ))}
            {iaResult.serviceLine.labor.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '9px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span>{l.name}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.subtotal)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, background: '#0F172A', borderRadius: 14, padding: 16, color: '#fff' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total estimado</span>
            <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(iaResult.total)}</span>
          </div>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 13, padding: 13, marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#15803D', letterSpacing: '.5px', marginBottom: 5 }}>✦ MENSAJE SUGERIDO PARA EL CLIENTE</div>
            <p style={{ fontSize: 12.5, color: '#166534', lineHeight: 1.5 }}>{iaMessage}</p>
          </div>
          <button
            onClick={iaToQuote}
            style={{ width: '100%', marginTop: 12, border: '1.5px solid #E2E8F0', background: '#fff', color: '#0F172A', fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 12, cursor: 'pointer' }}
          >
            Editar como cotización →
          </button>
        </div>
      )}
    </div>
  );
}
