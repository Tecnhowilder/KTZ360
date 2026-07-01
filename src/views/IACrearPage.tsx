/**
 * IACrearPage — Agente IA Operativo
 * /app/ia/crear
 *
 * Crea cotizaciones y pedidos mediante lenguaje natural (voz o texto).
 * Zero Trust: catálogo y clientes se cargan via RLS (solo del workspace).
 * Créditos: check_ai_credits + consume via ai-proxy → nunca ejecuta IA sin créditos.
 * Reutiliza: openQuoteFlow(), create_direct_order(), catálogo/clientes existentes.
 * NUNCA inventa productos ni clientes.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, AlertTriangle, CheckCircle2, Package, Users, Loader2 } from 'lucide-react';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useAICredits } from '../hooks/useAICredits';
import { isAICreditsExhausted, isAIPlanNotIncluded } from '../services/aiStudio';
import {
  fetchCatalogContext, fetchClientsContext, interpretCreationRequest, createDirectOrder,
  type IAInterpretResult, type CatalogContextItem, type ClientContextItem,
} from '../services/iaCrear';
import { formatCurrencyCOP } from '../lib/currency';

// ─── Tipos de fase ────────────────────────────────────────────────────────────

type Phase =
  | 'idle'           // pantalla inicial
  | 'listening'      // grabando voz
  | 'typing'         // entrada de texto manual
  | 'processing'     // IA interpretando
  | 'preview'        // mostrando resultado para confirmar
  | 'creating'       // creando cotización/pedido
  | 'error';         // error (credits, plan, red)

// ─── Ejemplos de solicitudes ─────────────────────────────────────────────────

const EXAMPLES = [
  'Crea una cotización para Carlos Pérez con dos cámaras Hikvision y 50 metros de cable UTP.',
  'Pedido de mantenimiento preventivo para el Hotel Sol, anticipo del 50%.',
  'Propuesta para pintura de oficina, 80 m², con transporte de $20.000.',
  'Instalación de red para Constructora ABC, incluye mano de obra.',
];

// ─── Componente principal ─────────────────────────────────────────────────────

export function IACrearPage() {
  const navigate    = useNavigate();
  const { openQuoteFlow } = useUI();
  const { company } = useWorkspace();
  const creditsQ    = useAICredits();

  const [phase,     setPhase]     = useState<Phase>('idle');
  const [userText,  setUserText]  = useState('');
  const [result,    setResult]    = useState<IAInterpretResult | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [catalog,   setCatalog]   = useState<CatalogContextItem[]>([]);
  const [clients,   setClients]   = useState<ClientContextItem[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [exampleIdx, setExampleIdx] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── Verificar soporte de voz y cargar contexto ────────────────────────────
  useEffect(() => {
    const SpeechAPI = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SpeechAPI);

    // Cargar catálogo y clientes al montar (RLS garantiza workspace isolation)
    Promise.all([fetchCatalogContext(), fetchClientsContext()]).then(([cat, cli]) => {
      setCatalog(cat);
      setClients(cli);
    });

    // Rotar ejemplos cada 3s
    const interval = setInterval(() => setExampleIdx(i => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(interval);
  }, []);

  // ── Grabación de voz ──────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SpeechAPI = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) return;

    const recognition = new SpeechAPI() as SpeechRecognitionEvent & {
      lang: string; continuous: boolean; interimResults: boolean;
      onstart: (() => void) | null; onresult: ((e: SpeechRecognitionEvent) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
      start(): void; stop(): void;
    };
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart  = () => setPhase('listening');
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ');
      setTranscript(t);
    };
    recognition.onend = () => {
      if (transcript.trim()) {
        setUserText(transcript);
        runInterpretation(transcript);
      } else {
        setPhase('idle');
      }
    };
    recognition.onerror = () => setPhase('idle');

    recognitionRef.current = recognition;
    setTranscript('');
    recognition.start();
  }, [transcript]); // eslint-disable-line

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Interpretar con IA ────────────────────────────────────────────────────
  const runInterpretation = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Verificar créditos antes de llamar a la IA
    const credits = creditsQ.data;
    if (credits && !credits.ai_enabled) {
      setErrorMsg('La IA no está disponible en tu plan actual. Puedes crear la cotización manualmente.');
      setPhase('error');
      return;
    }
    if (credits && credits.credits_remaining !== null && credits.credits_remaining < 2) {
      setErrorMsg('No tienes créditos IA disponibles.\n\nPuedes continuar creando esta cotización manualmente.');
      setPhase('error');
      return;
    }

    setPhase('processing');
    setErrorMsg('');

    try {
      const workspaceConfig = {
        taxRate:    company?.tax_rate    ?? 19,
        advancePct: company?.advance_pct ?? 30,
      };

      const { result: interpreted } = await interpretCreationRequest(
        text, catalog, clients, workspaceConfig
      );
      setResult(interpreted);
      setPhase('preview');
    } catch (err: unknown) {
      if (isAICreditsExhausted(err)) {
        setErrorMsg('No tienes créditos IA disponibles.\n\nPuedes continuar creando esta cotización manualmente.');
      } else if (isAIPlanNotIncluded(err)) {
        setErrorMsg('La IA no está disponible en tu plan actual.\n\nActualiza a PRO o PREMIUM para usarla.');
      } else {
        setErrorMsg('Ocurrió un error al interpretar la solicitud. Inténtalo de nuevo o crea manualmente.');
      }
      setPhase('error');
    }
  }, [catalog, clients, company, creditsQ.data]); // eslint-disable-line

  // ── Confirmar → abrir flujo existente ────────────────────────────────────
  async function handleConfirm() {
    if (!result) return;
    setLoading(true);

    if (result.type === 'cotizacion' || result.type === 'ambiguo') {
      // Reutilizar openQuoteFlow() con datos pre-cargados
      openQuoteFlow({
        cfg: {
          ...defaultQConfig(company),
          clientId:         result.client_id    ?? undefined,
          proj:             result.title,
          transportCost:    result.transport_cost ?? 0,
          transportEnabled: (result.transport_cost ?? 0) > 0,
          advancePct:       result.advance_pct   ?? company?.advance_pct ?? 30,
          serviceLines:     [],  // El usuario confirma los items en el paso de catálogo
        },
      });
      // Guardar contexto de items en sessionStorage para el flujo
      if (result.service_lines.length > 0) {
        sessionStorage.setItem('ia_crear_hints', JSON.stringify({
          items:  result.service_lines,
          notes:  result.notes,
          source: 'ia_crear',
        }));
      }
      setLoading(false);
      setResult(null);
      setUserText('');

    } else {
      // Pedido directo — usar create_direct_order RPC
      if (!result.client_id) {
        setLoading(false);
        setErrorMsg('Para crear un pedido, necesito el cliente. Selecciónalo manualmente.');
        setPhase('error');
        return;
      }
      try {
        const { orderId } = await createDirectOrder({
          clientId:       result.client_id,
          title:          result.title,
          description:    result.notes || undefined,
          itemsSnapshot:  result.service_lines,
          notes:          result.notes || undefined,
          scheduledAt:    result.scheduled_date || undefined,
        });
        navigate(`/app/pedidos/${orderId}`);
      } catch (err) {
        setLoading(false);
        setErrorMsg((err as Error).message ?? 'Error al crear el pedido');
        setPhase('error');
      }
    }
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────
  const credits = creditsQ.data;
  const hasCredits = !credits || credits.ai_enabled === false
    ? false
    : credits.credits_remaining === null || credits.credits_remaining >= 2;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 88 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={22} color="#374151" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Crear con IA</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Describe el trabajo con tus palabras</div>
        </div>
        {/* Créditos disponibles */}
        {credits && (
          <div style={{ background: hasCredits ? '#F5F3FF' : '#FEF2F2', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: hasCredits ? '#7C3AED' : '#DC2626' }}>
            {credits.credits_remaining ?? 0} créditos
          </div>
        )}
      </div>

      {/* ════ FASE: IDLE / TYPING ════════════════════════════════════════════ */}
      {(phase === 'idle' || phase === 'typing') && (
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Sin créditos → aviso */}
          {!hasCredits && (
            <div style={{ background: '#FEF2F2', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10 }}>
              <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>Sin créditos IA</div>
                <div style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2 }}>
                  No tienes créditos IA disponibles. Puedes crear cotizaciones o pedidos manualmente.
                </div>
                <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
                  style={{ marginTop: 8, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}>
                  Crear cotización manual
                </button>
              </div>
            </div>
          )}

          {/* Contexto cargado */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #F1F5F9' }}>
              <Package size={16} color="#7C3AED" />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{catalog.length} productos</span>
            </div>
            <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #F1F5F9' }}>
              <Users size={16} color="#2563EB" />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{clients.length} clientes</span>
            </div>
          </div>

          {/* Micrófono */}
          {voiceSupported && hasCredits && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <button
                onPointerDown={startListening}
                onPointerUp={stopListening}
                onPointerLeave={stopListening}
                aria-label="Mantén pulsado para hablar"
                style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 32px rgba(124,58,237,.4)',
                  margin: '0 auto',
                }}>
                <Mic size={40} color="#fff" />
              </button>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 12 }}>
                Mantén pulsado para hablar
              </p>
            </div>
          )}

          {/* Separador */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
            <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>o escribe</span>
            <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
          </div>

          {/* Área de texto */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E2E8F0', overflow: 'hidden' }}>
            <textarea
              value={userText}
              onChange={e => { setUserText(e.target.value); setPhase('typing'); }}
              placeholder={`Ejemplo: "${EXAMPLES[exampleIdx]}"`}
              rows={4}
              style={{
                width: '100%', padding: '14px 16px', border: 'none', outline: 'none',
                fontSize: 14, color: '#0F172A', resize: 'none', lineHeight: 1.6,
                background: 'transparent', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
            <div style={{ padding: '8px 12px', borderTop: '1px solid #F8FAFC', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => userText.trim() && runInterpretation(userText)}
                disabled={!userText.trim() || !hasCredits}
                style={{
                  background: userText.trim() && hasCredits ? '#7C3AED' : '#E2E8F0',
                  color: userText.trim() && hasCredits ? '#fff' : '#94A3B8',
                  border: 'none', borderRadius: 10, padding: '8px 18px',
                  fontWeight: 700, fontSize: 13, cursor: userText.trim() && hasCredits ? 'pointer' : 'not-allowed',
                }}>
                Interpretar ✨ (2 créditos)
              </button>
            </div>
          </div>

          {/* Opciones manuales */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', marginBottom: 10 }}>O crear directamente:</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
                📄 Cotización manual
              </button>
              <button onClick={() => navigate('/app/pedidos')}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
                📦 Nuevo pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ FASE: LISTENING ════════════════════════════════════════════════ */}
      {phase === 'listening' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: 24, gap: 24 }}>
          <button onPointerUp={stopListening}
            style={{ width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 20px rgba(124,58,237,.12), 0 8px 32px rgba(124,58,237,.4)', animation: 'pulse-ring 1.2s ease infinite' }}>
            <Mic size={52} color="#fff" />
          </button>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED' }}>Escuchando...</p>
          {transcript && (
            <div style={{ background: '#F5F3FF', borderRadius: 14, padding: '12px 16px', maxWidth: 300, fontSize: 14, color: '#374151', textAlign: 'center', fontStyle: 'italic' }}>
              "{transcript}"
            </div>
          )}
          <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Suelta para procesar</p>
          <button onClick={stopListening}
            style={{ border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 600, fontSize: 13, padding: '10px 24px', borderRadius: 99, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MicOff size={16} /> Cancelar
          </button>
          <style>{`@keyframes pulse-ring { 0%,100%{box-shadow:0 0 0 20px rgba(124,58,237,.12),0 8px 32px rgba(124,58,237,.4)} 50%{box-shadow:0 0 0 32px rgba(124,58,237,.06),0 8px 32px rgba(124,58,237,.4)} }`}</style>
        </div>
      )}

      {/* ════ FASE: PROCESSING ════════════════════════════════════════════════ */}
      {phase === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 16 }}>
          <Loader2 size={48} color="#7C3AED" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Procesando con IA...</p>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>Buscando en tu catálogo y clientes</p>
          {userText && (
            <div style={{ background: '#F5F3FF', borderRadius: 14, padding: '12px 16px', maxWidth: 300, fontSize: 13, color: '#374151', textAlign: 'center', fontStyle: 'italic' }}>
              "{userText.slice(0, 120)}{userText.length > 120 ? '...' : ''}"
            </div>
          )}
        </div>
      )}

      {/* ════ FASE: PREVIEW ════════════════════════════════════════════════════ */}
      {phase === 'preview' && result && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tipo detectado */}
          <div style={{
            background: result.type === 'pedido' ? '#FFF7ED' : '#F5F3FF',
            borderRadius: 14, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 24 }}>{result.type === 'pedido' ? '📦' : '📄'}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
                {result.type === 'pedido' ? 'Nuevo Pedido' : result.type === 'cotizacion' ? 'Nueva Cotización' : '¿Cotización o Pedido?'}
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Confianza: {result.confidence} · {result.service_lines.length} items
              </div>
            </div>
            {result.type === 'ambiguo' && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setResult({ ...result, type: 'cotizacion' })}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #7C3AED', background: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                  Cotiz.
                </button>
                <button onClick={() => setResult({ ...result, type: 'pedido' })}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #F97316', background: 'none', color: '#F97316', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                  Pedido
                </button>
              </div>
            )}
          </div>

          {/* Título */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>TÍTULO</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{result.title}</div>
          </div>

          {/* Cliente */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>CLIENTE</div>
            {result.client_found ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#16A34A" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{result.client_name}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color="#D97706" />
                <span style={{ fontSize: 13, color: '#D97706', fontWeight: 600 }}>
                  "{result.client_name}" — no encontrado en tus clientes
                </span>
              </div>
            )}
          </div>

          {/* Productos / Servicios */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 10 }}>PRODUCTOS / SERVICIOS</div>
            {result.service_lines.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94A3B8' }}>No se detectaron productos específicos. Los agregarás en el formulario.</div>
            ) : result.service_lines.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < result.service_lines.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                {item.found_in_catalog
                  ? <CheckCircle2 size={15} color="#16A34A" />
                  : <AlertTriangle size={15} color="#D97706" />
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{item.service_name}</div>
                  {!item.found_in_catalog && (
                    <div style={{ fontSize: 11, color: '#D97706' }}>No encontrado en tu catálogo</div>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>×{item.quantity}</span>
              </div>
            ))}
          </div>

          {/* Extras */}
          {(result.advance_pct || result.transport_cost || result.notes) && (
            <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8 }}>EXTRAS</div>
              {result.advance_pct && (
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>💰 Anticipo: {result.advance_pct}%</div>
              )}
              {result.transport_cost && result.transport_cost > 0 && (
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>🚚 Transporte: {formatCurrencyCOP(result.transport_cost)}</div>
              )}
              {result.notes && (
                <div style={{ fontSize: 13, color: '#374151', fontStyle: 'italic' }}>📝 {result.notes}</div>
              )}
            </div>
          )}

          {/* Advertencias */}
          {result.warnings.length > 0 && (
            <div style={{ background: '#FFF7ED', borderRadius: 14, padding: '12px 16px', border: '1px solid #FED7AA' }}>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: '#92400E', display: 'flex', gap: 6, marginBottom: i < result.warnings.length - 1 ? 4 : 0 }}>
                  <span>⚠️</span> {w}
                </div>
              ))}
            </div>
          )}

          {/* Nota de productos no encontrados */}
          {result.service_lines.some(s => !s.found_in_catalog) && (
            <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#1E40AF' }}>
              Los productos marcados con ⚠️ no están en tu catálogo. Los podrás agregar manualmente en el formulario.
            </div>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setPhase('idle'); setResult(null); setUserText(''); }}
              style={{ flex: 1, padding: '13px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', fontWeight: 700, fontSize: 14, color: '#374151', cursor: 'pointer' }}>
              Cambiar
            </button>
            <button onClick={handleConfirm} disabled={loading}
              style={{ flex: 2, padding: '13px 0', borderRadius: 12, border: 'none', background: '#7C3AED', fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creando...</>
                : result.type === 'pedido' ? '✅ Crear Pedido' : '✅ Abrir en Cotización'
              }
            </button>
          </div>

          <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
            {result.type === 'pedido'
              ? 'El pedido se creará directamente y podrás agregar OTs.'
              : 'Se abrirá el formulario de cotización con los datos pre-cargados para que los confirmes.'}
          </p>
        </div>
      )}

      {/* ════ FASE: ERROR ════════════════════════════════════════════════════ */}
      {phase === 'error' && (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={32} color="#DC2626" />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Atención</p>
            <p style={{ fontSize: 14, color: '#64748B', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{errorMsg}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
            <button onClick={() => { setPhase('idle'); setErrorMsg(''); }}
              style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', fontWeight: 700, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
              Intentar de nuevo
            </button>
            <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
              style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: '#7C3AED', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
              Crear manual
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
