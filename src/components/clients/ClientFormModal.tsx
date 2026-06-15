import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import { useInvalidateClients } from '../../hooks/useQuotes';
import { createClient } from '../../services/clients';
import { useToast } from '../ui/Toast';
import { useUI } from '../../features/app/UIProvider';
import { logEvent } from '../../services/audit';
import { isValidEmail, isValidPhone, getErrorMessage } from '../../lib/validation';
import type { Client } from '../../lib/types';

export function ClientFormModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (client: Client) => void }) {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const invalidate = useInvalidateClients();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { openUpgradeModal } = useUI();
  const [name, setName] = useState('');
  const [meta, setMeta] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const mutation = useMutation({
    mutationFn: () => createClient(workspace.id, user!.id, { name, meta: meta || null, phone: phone || null, email: email || null }),
    onSuccess: (client) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['planLimit', workspace.id, 'clients'] });
      showToast('Cliente creado');
      onCreated?.(client);
      onClose();
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      if (message.includes('plan_limit_exceeded')) {
        onClose();
        logEvent(workspace.id, user?.id ?? null, 'plan_limit_reached', 'client', null, { limit: 'clients' });
        logEvent(workspace.id, user?.id ?? null, 'clients_limit_reached', 'client');
        logEvent(workspace.id, user?.id ?? null, 'upgrade_modal_shown', 'client');
        openUpgradeModal({
          title: 'Has alcanzado el límite de tu plan',
          message: 'Tu plan FREE permite hasta 20 clientes. Actualiza a PRO por $39.900/mes para registrar clientes ilimitados.',
          targetPlan: 'pro',
          ctaLabel: 'Actualizar a PRO',
          secondaryLabel: 'Seguir con FREE',
          bullets: [
            'FREE: 20 clientes',
            'PRO: Clientes ilimitados',
            'PREMIUM: Clientes ilimitados + IA',
          ],
        });
      } else {
        console.error('createClient error', err);
        showToast('No se pudo crear el cliente');
      }
    },
  });

  const phoneError = phone.trim() && !isValidPhone(phone) ? 'Teléfono inválido' : null;
  const emailError = email.trim() && !isValidEmail(email) ? 'Correo inválido' : null;
  const isValid = !!name.trim() && !phoneError && !emailError;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    mutation.mutate();
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 13px', fontSize: 14, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400, animation: 'pop .25s ease' }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Nuevo cliente</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del cliente" />
          </div>
          <div>
            <label style={labelStyle}>Ubicación / referencia</label>
            <input style={inputStyle} value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Bogotá, Chapinero" />
          </div>
          <div>
            <label style={labelStyle}>Teléfono</label>
            <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
            {phoneError && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{phoneError}</div>}
          </div>
          <div>
            <label style={labelStyle}>Correo</label>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            {emailError && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{emailError}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 11, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending || !isValid} style={{ flex: 1, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 11, cursor: 'pointer', opacity: mutation.isPending || !isValid ? 0.7 : 1 }}>
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
