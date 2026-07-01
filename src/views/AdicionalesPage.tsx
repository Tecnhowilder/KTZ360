/**
 * AdicionalesPage — Comprar usuarios adicionales para el plan PREMIUM
 *
 * Precio: $11.900/usuario/mes (cobrado mensualmente mientras la suscripción esté activa).
 * Pago: MercadoPago (same checkout que los planes).
 * Zero Trust: workspaceId se extrae del JWT en el backend.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, CheckCircle2, Plus, Minus, CreditCard } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { startAdditionalLicensesCheckout } from '../services/billing';

const UNIT_PRICE = 11900;

function fmtCOP(n: number) {
  return '$' + n.toLocaleString('es-CO');
}

export function AdicionalesPage() {
  const navigate      = useNavigate();
  const { showToast } = useToast();
  const [quantity,  setQuantity]  = useState(1);
  const [loading,   setLoading]   = useState(false);

  const total = quantity * UNIT_PRICE;

  function setQty(n: number) {
    if (n < 1 || n > 20) return;
    setQuantity(n);
  }

  async function handleCheckout() {
    setLoading(true);
    try {
      await startAdditionalLicensesCheckout(quantity);
      // navigateToUrl maneja la redirección a MercadoPago
    } catch (err: any) {
      showToast(err.message ?? 'Error al iniciar el pago. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={22} color="#374151" />
        </button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Usuarios adicionales</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Amplía la capacidad de tu equipo</div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Info card */}
        <div style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', borderRadius: 16, padding: '20px 18px', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Usuario adicional PREMIUM</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Se suma a los 12 incluidos en tu plan</div>
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 4 }}>
            {fmtCOP(UNIT_PRICE)}
            <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.8 }}>/usuario/mes</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Cobrado mensualmente · Cancela cuando quieras
          </div>
        </div>

        {/* Qué incluye */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Cada usuario adicional incluye</div>
          {[
            'Acceso completo a la plataforma',
            'Todos los roles disponibles (Operario, Supervisor, Comercial, Admin)',
            'GPS y check-in/check-out',
            'Asignación de pedidos y órdenes de trabajo',
            'Subida de evidencias y firma digital',
            'Control de asistencia',
          ].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <CheckCircle2 size={14} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: '#374151' }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Selector de cantidad */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>¿Cuántos usuarios adicionales necesitas?</div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <button
              onClick={() => setQty(quantity - 1)}
              disabled={quantity <= 1}
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #E2E8F0', background: quantity <= 1 ? '#F8FAFC' : '#fff', cursor: quantity <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Minus size={16} color={quantity <= 1 ? '#CBD5E1' : '#374151'} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>{quantity}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                {quantity === 1 ? 'usuario adicional' : 'usuarios adicionales'}
              </div>
            </div>

            <button
              onClick={() => setQty(quantity + 1)}
              disabled={quantity >= 20}
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #E2E8F0', background: quantity >= 20 ? '#F8FAFC' : '#fff', cursor: quantity >= 20 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={16} color={quantity >= 20 ? '#CBD5E1' : '#374151'} />
            </button>
          </div>
        </div>

        {/* Resumen de pago */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
            <span style={{ fontSize: 13, color: '#374151' }}>{quantity} usuario{quantity > 1 ? 's' : ''} × {fmtCOP(UNIT_PRICE)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{fmtCOP(total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 0' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Total mensual</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#7C3AED' }}>{fmtCOP(total)}<span style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8' }}>/mes</span></span>
          </div>
        </div>

        {/* Botón de pago */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
            background: loading ? '#E2E8F0' : '#009EE3',  // azul MercadoPago
            color: loading ? '#94A3B8' : '#fff',
            fontWeight: 800, fontSize: 15, cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 4px 16px rgba(0,158,227,.3)',
          }}
        >
          {loading ? (
            <>
              <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              Iniciando pago...
            </>
          ) : (
            <>
              <CreditCard size={18} />
              Pagar {fmtCOP(total)}/mes con MercadoPago
            </>
          )}
        </button>

        {/* Nota de seguridad */}
        <div style={{ textAlign: 'center', padding: '4px 0 8px' }}>
          <div style={{ fontSize: 11.5, color: '#94A3B8', lineHeight: 1.5 }}>
            🔒 Pago seguro vía MercadoPago. Puedes cancelar en cualquier momento desde Mi Plan.
          </div>
          <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 4 }}>
            Los usuarios adicionales se activan inmediatamente después del pago.
          </div>
        </div>
      </div>
    </div>
  );
}
