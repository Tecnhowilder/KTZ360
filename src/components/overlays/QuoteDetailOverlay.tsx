import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUI } from '../../features/app/UIProvider';
import { logEvent } from '../../services/audit';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useClients, useQuotesRaw, useInvalidateQuotes } from '../../hooks/useQuotes';
import { updateQuoteStatus, duplicateQuote, deleteQuote } from '../../services/quotes';
import { createTemplate } from '../../services/templates';
import { getOrCreateQuoteToken, registerQuoteEvent } from '../../services/publicPortal';
import { listQuoteEventsForQuote } from '../../services/events';
import { useAuth } from '../../features/auth/AuthProvider';
import { deriveQuote, fmt, fmtDate, daysAgo, statusStyle, followMessage, openWhats, serviceLabel } from '../../lib/calc';
import { getErrorMessage } from '../../lib/validation';
import { useToast } from '../../components/ui/Toast';
import { useFeatureAccess } from '../../hooks/usePermissions';
import type { QuoteStatus, QConfig } from '../../lib/types';
import type { QuoteEventType } from '../../lib/database.types';

const STATUS_OPTIONS: QuoteStatus[] = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada'];

const EVENT_LABELS: Record<QuoteEventType, string> = {
  proposal_sent: '📤 Enviada',
  proposal_opened: '👁️ Abierta',
  proposal_downloaded: '⬇️ Descargada',
  proposal_accepted: '✅ Aceptada',
  proposal_rejected: '❌ Rechazada',
  proposal_changes_requested: '✏️ Cambios solicitados',
};

export function QuoteDetailOverlay() {
  const { detailQuoteId, closeQuoteDetail, openDocument, openUpgradeModal, openQuoteFlow } = useUI();
  const { workspace, company } = useWorkspace();
  const templatesAccess = useFeatureAccess('templates_enabled');
  const editAccess = useFeatureAccess('quote_editing_enabled');
  const { user } = useAuth();
  const clientsQuery = useClients();
  const rawQuery = useQuotesRaw();
  const invalidateQuotes = useInvalidateQuotes();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const quote = rawQuery.data?.find((q) => q.id === detailQuoteId);
  const client = clientsQuery.data?.find((c) => c.id === quote?.client_id);

  const statusMutation = useMutation({
    mutationFn: (status: QuoteStatus) => updateQuoteStatus(quote!.id, status),
    onSuccess: () => invalidateQuotes(),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateQuote(quote!.id),
    onSuccess: () => {
      invalidateQuotes();
      showToast('Cotización duplicada');
      closeQuoteDetail();
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      if (message.includes('plan_limit_exceeded')) {
        closeQuoteDetail();
        logEvent(workspace.id, user?.id ?? null, 'plan_limit_reached', 'quote', null, { limit: 'quotes_month' });
        logEvent(workspace.id, user?.id ?? null, 'quotes_limit_reached', 'quote');
        logEvent(workspace.id, user?.id ?? null, 'upgrade_modal_shown', 'quote');
        openUpgradeModal({
          title: 'Has alcanzado el límite de tu plan',
          message: 'Tu plan FREE permite hasta 10 cotizaciones por mes. Actualiza a PRO por $39.900/mes para crear cotizaciones ilimitadas.',
          targetPlan: 'pro',
          ctaLabel: 'Actualizar a PRO',
          secondaryLabel: 'Seguir con FREE',
          bullets: [
            'Cotizaciones ilimitadas',
            'Clientes ilimitados',
            'Plantillas',
            'Branding profesional',
            'Edición de cotizaciones',
            'PDF profesional',
          ],
        });
      } else {
        console.error('duplicateQuote error', err);
        showToast('No se pudo duplicar la cotización');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuote(quote!.id),
    onSuccess: () => {
      invalidateQuotes();
      showToast('Cotización eliminada');
      closeQuoteDetail();
    },
  });

  const templateMutation = useMutation({
    mutationFn: () => {
      const d = deriveQuote(quote!, client);
      return createTemplate(workspace.id, user!.id, {
        name: `${serviceLabel(d.cfg.serviceLines)} · ${quote!.title}`,
        service_lines: d.cfg.serviceLines,
        admin_pct: d.cfg.adminPct,
        imprevistos_pct: d.cfg.imprevistosPct,
        util: d.cfg.util,
        valid_days: d.cfg.validDays,
        discount: d.cfg.discount,
        discount_on: d.cfg.discountOn,
        tax_mode: d.cfg.taxMode,
        tax_rate: d.cfg.taxRate,
        transport_cost: d.cfg.transportCost,
        transport_enabled: d.cfg.transportEnabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', workspace.id] });
      showToast('⭐ Guardada como plantilla');
    },
    onError: (err: Error) => {
      if (err.message.includes('feature_not_available')) {
        openUpgradeModal({
          title: 'Plantillas disponibles en PRO',
          message: 'Guardar cotizaciones como plantilla está disponible desde el plan PRO por $39.900/mes.',
          targetPlan: 'pro',
          ctaLabel: 'Actualizar a PRO',
        });
      } else {
        showToast('No se pudo guardar la plantilla');
      }
    },
  });

  const [sharing, setSharing] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ['quoteEvents', detailQuoteId],
    queryFn: () => listQuoteEventsForQuote(detailQuoteId!),
    enabled: !!detailQuoteId,
  });

  if (!detailQuoteId || !quote) return null;

  const d = deriveQuote(quote, client);
  const ss = statusStyle(d.status);

  const quoteTitle = quote.title;

  async function getPortalUrl() {
    const token = await getOrCreateQuoteToken(quote!.id);
    registerQuoteEvent(token, 'proposal_sent').catch(() => {});
    return `${window.location.origin}/p/${token}`;
  }

  async function follow() {
    setSharing(true);
    try {
      const portalUrl = await getPortalUrl();
      openWhats(followMessage(d.clientName, quoteTitle, d.calc.total, company.name, portalUrl));
    } finally {
      setSharing(false);
    }
  }

  async function sendEmail() {
    setSharing(true);
    try {
      const portalUrl = await getPortalUrl();
      const msg = followMessage(d.clientName, quoteTitle, d.calc.total, company.name, portalUrl);
      const subject = encodeURIComponent(`Propuesta: ${quoteTitle}`);
      const body = encodeURIComponent(msg);
      window.location.href = `mailto:${client?.email || ''}?subject=${subject}&body=${body}`;
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 81, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadein .2s ease' }}
      onClick={closeQuoteDetail}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#F8FAFC', width: '100%', maxWidth: 560, height: '92vh', borderRadius: '26px 26px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp .3s ease', boxShadow: '0 -10px 50px rgba(0,0,0,.3)' }}
      >
        <div style={{ background: '#fff', padding: '16px 20px 14px', borderBottom: '1px solid #EEF2F7', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, fontFamily: "'Space Mono',monospace" }}>{quote.quote_number}</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.4px', marginTop: 2 }}>{quote.title}</div>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>{d.clientName}{quote.location ? ` · ${quote.location}` : ''}</div>
          </div>
          <button onClick={closeQuoteDetail} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: ss.c, background: ss.b, padding: '6px 13px', borderRadius: 99 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: ss.dot }} />
              {d.status}
            </span>
            <span style={{ fontSize: 12, color: '#64748B' }}>Creada el {d.dateLabel} · válida hasta {d.dueLabelY}</span>
          </div>

          {d.status === 'Enviada' && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⏳</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Enviada hace {daysAgo(quote.sent_at || quote.created_at)} día(s)</div>
                <div style={{ fontSize: 11.5, color: '#B45309' }}>Un seguimiento a tiempo aumenta tu tasa de cierre.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={follow} disabled={sharing} style={{ border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '9px 13px', borderRadius: 10, cursor: 'pointer' }}>
                  Seguimiento
                </button>
                <button onClick={sendEmail} disabled={sharing} style={{ border: '1.5px solid #FDE68A', background: '#fff', color: '#92400E', fontWeight: 700, fontSize: 12.5, padding: '9px 13px', borderRadius: 10, cursor: 'pointer' }}>
                  Correo
                </button>
              </div>
            </div>
          )}

          {d.status === 'Vencida' && (
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6D28D9' }}>Esta cotización venció el {d.dueLabelY}</div>
                <div style={{ fontSize: 11.5, color: '#7C3AED' }}>Duplícala para reenviarla con fechas actualizadas.</div>
              </div>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Materiales</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.materials)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Mano de obra</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.labor)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Equipos y herramientas</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.equipment)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Administración ({quote.admin_pct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.adminAmt)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Imprevistos ({quote.imprevistos_pct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.imprevistosAmt)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Utilidad ({quote.util}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.utilAmt)}</span></div>
            {quote.iva && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>IVA (19%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.ivaAmt)}</span></div>}
            {d.calc.transportAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#64748B' }}>Transporte</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.transportAmt)}</span></div>}
            <div style={{ borderTop: '2px solid #0F172A', paddingTop: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>TOTAL</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.calc.total)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 9 }}>Cambiar estado</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((s) => {
                const sStyle = statusStyle(s);
                const active = d.baseStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => !active && statusMutation.mutate(s)}
                    disabled={statusMutation.isPending}
                    style={{ border: `1.5px solid ${active ? sStyle.dot : '#E2E8F0'}`, background: active ? sStyle.b : '#fff', color: active ? sStyle.c : '#475569', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 99, cursor: 'pointer' }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {!!eventsQuery.data?.length && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 9 }}>Actividad de la propuesta</div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {eventsQuery.data.map((e) => {
                  const date = new Date(e.created_at);
                  return (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: '#0F172A', fontWeight: 600 }}>{EVENT_LABELS[e.event_type]}</span>
                      <span style={{ color: '#94A3B8' }}>{fmtDate(date)}, {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid #EEF2F7', padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              if (editAccess.data === false) {
                logEvent(workspace.id, user?.id ?? null, 'quote_edit_blocked', 'quote', quote!.id);
                openUpgradeModal({
                  title: 'La edición de cotizaciones está incluida en PRO y PREMIUM',
                  message: 'Actualiza tu plan para poder editar cotizaciones ya creadas.',
                  targetPlan: 'pro',
                  ctaLabel: 'Actualizar a PRO',
                  secondaryLabel: 'Seguir con FREE',
                  bullets: [
                    'Cotizaciones ilimitadas',
                    'Clientes ilimitados',
                    'Plantillas',
                    'Branding profesional',
                    'Edición de cotizaciones',
                    'PDF profesional',
                  ],
                });
                return;
              }
              const label = serviceLabel(d.cfg.serviceLines);
              const proj = quote.title.startsWith(label + ' · ') ? quote.title.slice(label.length + 3) : quote.title;
              const editCfg: Partial<QConfig> = {
                clientId: quote.client_id,
                proj,
                loc: quote.location ?? '',
                projectType: quote.project_type ?? '',
                notes: quote.notes ?? '',
                serviceLines: d.cfg.serviceLines,
                adminPct: d.cfg.adminPct,
                imprevistosPct: d.cfg.imprevistosPct,
                util: d.cfg.util,
                taxMode: d.cfg.taxMode,
                taxRate: d.cfg.taxRate,
                advancePct: d.cfg.advancePct,
                docDetailLevel: d.cfg.docDetailLevel,
                includeTechnicalAnnex: d.cfg.includeTechnicalAnnex,
                validDays: d.cfg.validDays,
                discount: d.cfg.discount,
                discountOn: d.cfg.discountOn,
                transportCost: d.cfg.transportCost,
                transportEnabled: d.cfg.transportEnabled,
              };
              closeQuoteDetail();
              openQuoteFlow({ mode: 'edit', quoteId: quote.id, step: 4, cfg: editCfg });
            }}
            style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, padding: 13, borderRadius: 13, cursor: 'pointer' }}
          >
            Editar{editAccess.data === false ? ' (PRO)' : ''}
          </button>
          <button onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending} style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, padding: 13, borderRadius: 13, cursor: 'pointer' }}>
            Duplicar
          </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              if (templatesAccess.data === false) {
                openUpgradeModal({
                  title: 'Plantillas disponibles en PRO',
                  message: 'Guardar cotizaciones como plantilla está disponible desde el plan PRO por $39.900/mes.',
                  targetPlan: 'pro',
                  ctaLabel: 'Actualizar a PRO',
                });
                return;
              }
              templateMutation.mutate();
            }}
            disabled={templateMutation.isPending}
            style={{ flex: 1, border: 'none', background: '#FFFBEB', color: '#92400E', fontWeight: 700, fontSize: 13, padding: 13, borderRadius: 13, cursor: 'pointer' }}
          >
            ⭐ Plantilla{templatesAccess.data === false ? ' (PRO)' : ''}
          </button>
          <button onClick={() => openDocument(quote.id)} style={{ flex: 1.4, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, padding: 13, borderRadius: 13, cursor: 'pointer' }}>
            Ver propuesta · PDF
          </button>
          </div>
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid #EEF2F7', padding: '0 20px calc(14px + env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => {
              if (window.confirm('¿Eliminar esta cotización? Esta acción no se puede deshacer.')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            style={{ width: '100%', border: 'none', background: 'transparent', color: '#DC2626', fontWeight: 700, fontSize: 12.5, padding: 10, borderRadius: 13, cursor: 'pointer' }}
          >
            Eliminar cotización
          </button>
        </div>
      </div>
    </div>
  );
}
