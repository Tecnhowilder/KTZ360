/**
 * PedidoNuevoPage — /app/pedidos/nuevo
 * Crea un pedido directo sin necesidad de cotización previa.
 * Reutiliza: create_direct_order RPC, clientes existentes, catálogo.
 * Zero Trust: workspace_id del JWT, feature gated PREMIUM.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ChevronRight, UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { createDirectOrder } from '../services/iaCrear';
import { useToast } from '../components/ui/Toast';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useUI } from '../features/app/UIProvider';
import { ClientQuickCreateSheet } from '../components/clients/ClientQuickCreateSheet';
import type { Client } from '../lib/types';

export function PedidoNuevoPage() {
  const navigate   = useNavigate();
  const { showToast } = useToast();
  const { openUpgradeModal } = useUI();

  const featureQ = useFeatureAccess('orders_enabled');

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [notes,       setNotes]       = useState('');
  const [step,        setStep]        = useState<'client' | 'details'>('client');
  const [loading,     setLoading]     = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);

  function handleClientCreated(client: Client) {
    setSelectedClient({ id: client.id, name: client.name });
    setStep('details');
  }

  // FASE 2 fix: solo cargar clientes cuando el usuario haya escrito algo
  const searchTrimmed = clientSearch.trim();
  const clientsQ = useQuery({
    queryKey: ['clients-for-order', searchTrimmed],
    queryFn:  async () => {
      const { data } = await (supabase as any)
        .from('clients')
        .select('id, name, phone, email')
        .is('deleted_at', null)
        .ilike('name', `%${searchTrimmed}%`)
        .limit(20)
        .order('name');
      return (data ?? []) as { id: string; name: string; phone?: string; email?: string }[];
    },
    enabled:   searchTrimmed.length >= 1,  // sin búsqueda = sin carga
    staleTime: 30_000,
  });

  // Feature gate
  if (featureQ.data === false) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Pedidos — Plan PREMIUM</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 20 }}>
          Los pedidos directos están disponibles en el plan PREMIUM.
        </p>
        <button onClick={() => openUpgradeModal({ title: 'Pedidos en PREMIUM', message: 'Crea y gestiona pedidos sin necesidad de cotización previa.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' })}
          style={{ border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 12, cursor: 'pointer' }}>
          Actualizar a PREMIUM
        </button>
      </div>
    );
  }

  async function handleCreate() {
    if (!selectedClient || !title.trim()) return;
    setLoading(true);
    try {
      const { orderId } = await createDirectOrder({
        clientId:    selectedClient.id,
        title:       title.trim(),
        description: description.trim() || undefined,
        notes:       notes.trim()       || undefined,
      });
      showToast('Pedido creado correctamente');
      navigate(`/app/pedidos/${orderId}`);
    } catch (err) {
      showToast((err as Error).message ?? 'Error al crear pedido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => step === 'details' ? setStep('client') : navigate(-1)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={22} color="#374151" />
        </button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Nuevo pedido</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            {step === 'client' ? 'Paso 1: Seleccionar cliente' : 'Paso 2: Detalles del pedido'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* PASO 1: Seleccionar cliente */}
        {step === 'client' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #E2E8F0' }}>
              <Search size={16} color="#94A3B8" />
              <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar cliente..."
                style={{ border: 'none', background: 'none', flex: 1, fontSize: 14, outline: 'none', color: '#0F172A' }} />
            </div>

            {/* Lista de resultados: solo aparece cuando hay búsqueda activa */}
            {searchTrimmed.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: '28px 20px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Busca un cliente</div>
                <div style={{ fontSize: 13, color: '#64748B' }}>
                  Escribe el nombre, teléfono o empresa para encontrarlo.
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                {clientsQ.isLoading && <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8' }}>Buscando...</div>}

                {clientsQ.data?.map((c, i) => (
                  <button key={c.id}
                    onClick={() => { setSelectedClient({ id: c.id, name: c.name }); setStep('details'); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                      borderBottom: i < (clientsQ.data?.length ?? 0) - 1 ? '1px solid #F8FAFC' : 'none',
                    }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#7C3AED' }}>{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                      {c.phone && <div style={{ fontSize: 12, color: '#94A3B8' }}>{c.phone}</div>}
                    </div>
                    <ChevronRight size={16} color="#CBD5E1" />
                  </button>
                ))}

                {!clientsQ.isLoading && clientsQ.data?.length === 0 && (
                  <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                      No encontramos "{searchTrimmed}"
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 14 }}>
                      ¿Quieres crearlo como cliente nuevo?
                    </div>
                    <button
                      onClick={() => setCreateClientOpen(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '9px 18px', border: 'none', borderRadius: 10,
                        background: '#7C3AED', color: '#fff',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <UserPlus size={15} /> Crear "{searchTrimmed}"
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Botón crear cliente siempre visible al pie */}
            <button
              onClick={() => setCreateClientOpen(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '11px 0', border: '1.5px dashed #DDD6FE', borderRadius: 12,
                background: 'transparent', color: '#7C3AED',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <UserPlus size={15} /> Crear nuevo cliente
            </button>
          </div>
        )}

        {/* PASO 2: Detalles */}
        {step === 'details' && selectedClient && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Cliente seleccionado */}
            <div style={{ background: '#F5F3FF', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>
                {selectedClient.name.charAt(0)}
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#7C3AED' }}>{selectedClient.name}</span>
            </div>

            {/* Campos */}
            {[
              { label: 'Título del pedido *', value: title, set: setTitle, placeholder: 'Ej: Mantenimiento preventivo aire acondicionado', required: true },
              { label: 'Descripción', value: description, set: setDescription, placeholder: 'Detalles del trabajo a realizar...' },
              { label: 'Notas internas', value: notes, set: setNotes, placeholder: 'Instrucciones para el técnico...' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <textarea value={f.value} onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder} rows={f.required ? 2 : 3}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 12, fontSize: 14, outline: 'none', resize: 'vertical', color: '#0F172A', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            ))}

            <button onClick={handleCreate} disabled={!title.trim() || loading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                background: title.trim() ? '#7C3AED' : '#E2E8F0',
                color: title.trim() ? '#fff' : '#94A3B8',
                fontWeight: 800, fontSize: 15, cursor: title.trim() ? 'pointer' : 'not-allowed',
              }}>
              {loading ? 'Creando pedido...' : '✅ Crear Pedido'}
            </button>
          </div>
        )}
      </div>

      <ClientQuickCreateSheet
        open={createClientOpen}
        onClose={() => setCreateClientOpen(false)}
        onCreated={handleClientCreated}
        title={clientSearch ? `Crear "${clientSearch}"` : 'Nuevo cliente'}
      />
    </div>
  );
}
