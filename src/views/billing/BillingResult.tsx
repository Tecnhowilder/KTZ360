import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';

interface BillingResultProps {
  status: 'success' | 'pending' | 'failure';
}

const CONTENT: Record<BillingResultProps['status'], { icon: LucideIcon; color: string; title: string; description: string }> = {
  success: {
    icon: CheckCircle2,
    color: '#16a34a',
    title: '¡Pago aprobado!',
    description: 'Tu plan se está activando. Puede tardar unos segundos en reflejarse en tu cuenta.',
  },
  pending: {
    icon: Clock,
    color: '#d97706',
    title: 'Pago en proceso',
    description: 'Estamos esperando la confirmación de Mercado Pago. Te notificaremos cuando se apruebe.',
  },
  failure: {
    icon: XCircle,
    color: '#dc2626',
    title: 'No pudimos procesar el pago',
    description: 'El pago fue rechazado o cancelado. Puedes intentarlo nuevamente cuando quieras.',
  },
};

export function BillingResult({ status }: BillingResultProps) {
  const { icon: Icon, color, title, description } = CONTENT[status];
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['subscriptionStatus', workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['planName', workspace.id] });
  }, [queryClient, workspace.id]);

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 76px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <Icon size={56} color={color} />
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{title}</h1>
      <p style={{ maxWidth: 420, color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{description}</p>
      <Link
        to="/app/planes"
        style={{
          marginTop: 8,
          padding: '12px 24px',
          borderRadius: 12,
          background: '#2563eb',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        Volver a Planes
      </Link>
    </div>
  );
}
