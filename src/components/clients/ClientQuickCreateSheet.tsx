/**
 * ClientQuickCreateSheet — Creación de cliente en contexto (bottom sheet).
 *
 * Úsalo en cualquier flujo donde el usuario necesite un cliente que no existe.
 * Al crearlo: invalida React Query, llama onCreated(client) y cierra el sheet.
 * El llamador puede auto-seleccionar el cliente y continuar sin perder el flujo.
 *
 * Reutiliza exactamente: createClient() + useInvalidateClients() + validaciones.
 * Zero Trust: workspace_id del JWT, nunca del frontend.
 */
import { useState, useEffect, type FormEvent } from 'react';
import { X } from 'lucide-react';
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

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (client: Client) => void;
  /** Texto personalizable en el header del sheet */
  title?: string;
  /** Valores iniciales para prellenar el formulario (ej: desde IA Vision) */
  initialValues?: { name?: string; phone?: string; email?: string; meta?: string };
}

export function ClientQuickCreateSheet({ open, onClose, onCreated, title = 'Nuevo cliente', initialValues }: Props) {
  const { workspace } = useWorkspace();
  const { user }      = useAuth();
  const invalidate    = useInvalidateClients();
  const queryClient   = useQueryClient();
  const { showToast } = useToast();
  const { openUpgradeModal } = useUI();

  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [meta,  setMeta]  = useState('');

  // Prellenar formulario cuando se abre con valores iniciales (ej: desde IA Vision)
  useEffect(() => {
    if (open && initialValues) {
      if (initialValues.name)  setName(initialValues.name);
      if (initialValues.phone) setPhone(initialValues.phone);
      if (initialValues.email) setEmail(initialValues.email);
      if (initialValues.meta)  setMeta(initialValues.meta);
    }
    if (!open) resetForm();
  }, [open]); // eslint-disable-line

  function resetForm() {
    setName(''); setPhone(''); setEmail(''); setMeta('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const createMut = useMutation({
    mutationFn: () => createClient(workspace.id, user!.id, {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      meta:  meta.trim()  || null,
    }),
    onSuccess: (client) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['planLimit', workspace.id, 'clients'] });
      showToast('Cliente creado ✓');
      resetForm();
      onCreated?.(client);
      onClose();
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err);
      if (message.includes('plan_limit_exceeded')) {
        onClose();
        logEvent(workspace.id, user?.id ?? null, 'plan_limit_reached', 'client', null, { limit: 'clients' });
        openUpgradeModal({
          title: 'Has alcanzado el límite de tu plan',
          message: 'Tu plan FREE permite hasta 20 clientes. Actualiza a PRO para clientes ilimitados.',
          targetPlan: 'pro',
          ctaLabel: 'Actualizar a PRO',
          secondaryLabel: 'Seguir con FREE',
          bullets: ['FREE: 20 clientes', 'PRO: Ilimitados', 'PREMIUM: Ilimitados + IA'],
        });
      } else {
        showToast('No se pudo crear el cliente');
      }
    },
  });

  const phoneError = phone.trim() && !isValidPhone(phone) ? 'Teléfono inválido' : null;
  const emailError = email.trim() && !isValidEmail(email)  ? 'Correo inválido'   : null;
  const isValid    = !!name.trim() && !phoneError && !emailError;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || createMut.isPending) return;
    createMut.mutate();
  }

  const IS: React.CSSProperties = {
    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 11,
    padding: '11px 13px', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', color: '#0F172A',
    background: '#fff',
  };
  const LS: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 58,
          background: 'rgba(0,0,0,.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .25s',
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 59,
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,.18)',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px 16px' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{title}</span>
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color="#374151" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LS}>Nombre completo *</label>
            <input
              style={IS}
              required
              autoFocus={open}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del cliente o empresa"
            />
          </div>

          <div>
            <label style={LS}>Teléfono</label>
            <input
              style={{ ...IS, borderColor: phoneError ? '#FCA5A5' : '#E2E8F0' }}
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+57 300 000 0000"
            />
            {phoneError && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{phoneError}</div>}
          </div>

          <div>
            <label style={LS}>Correo electrónico</label>
            <input
              style={{ ...IS, borderColor: emailError ? '#FCA5A5' : '#E2E8F0' }}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
            />
            {emailError && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{emailError}</div>}
          </div>

          <div>
            <label style={LS}>Ciudad / referencia</label>
            <input
              style={IS}
              value={meta}
              onChange={e => setMeta(e.target.value)}
              placeholder="Bogotá, Chapinero"
            />
          </div>

          <button
            type="submit"
            disabled={createMut.isPending || !isValid}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
              background: isValid ? '#7C3AED' : '#E2E8F0',
              color: isValid ? '#fff' : '#94A3B8',
              fontWeight: 800, fontSize: 15,
              cursor: isValid ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              transition: 'background .15s, color .15s',
              marginTop: 4,
            }}
          >
            {createMut.isPending ? 'Guardando...' : 'Guardar cliente'}
          </button>
        </form>
      </div>
    </>
  );
}
