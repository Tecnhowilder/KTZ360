/**
 * ConfiguracionMobile — Pantalla de configuración rediseñada mobile-first.
 * Referencia: Stripe Settings / Linear / Notion.
 * Desktop muestra SimpleEmpty hasta implementación futura.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Building2, Receipt, FileText,
  Package, Users, Plug, Palette, Bell, Workflow, LayoutGrid,
  ShieldCheck, Percent, CreditCard, Tag, FileOutput, Coins,
  Upload, Download, Trash2, RefreshCw, CheckCircle,
  Edit, HelpCircle, MessageSquare, Bug, Info,
} from 'lucide-react';
import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { NotificationBell } from '../ui/NotificationBell';
import { signOut } from '../../services/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../ui/Toast';

// ─── Sección con lista de ítems navegables ────────────────────────────────────

function SettingsSection({ title, items }: {
  title: string;
  items: Array<{
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    sub: string;
    onClick: () => void;
    danger?: boolean;
  }>;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', padding: '14px 16px 8px', textTransform: 'none' }}>
          {title}
        </div>
      )}
      <div style={{ background: '#fff' }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '13px 16px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: i < items.length - 1 ? '1px solid #F8FAFC' : 'none',
              textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 11, background: item.iconBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {item.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: item.danger ? '#EF4444' : '#0F172A', marginBottom: 2 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.3 }}>{item.sub}</div>
            </div>
            <ChevronRight size={16} color="#CBD5E1" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Grid 2 columnas para sección general ─────────────────────────────────────

function SettingsGrid({ title, items }: {
  title: string;
  items: Array<{ icon: React.ReactNode; iconBg: string; label: string; sub: string; onClick: () => void }>;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', padding: '14px 16px 10px' }}>{title}</div>
      <div style={{ background: '#fff', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        {items.reduce((rows: typeof items[], item, i) => {
          if (i % 2 === 0) rows.push([item]);
          else rows[rows.length - 1].push(item);
          return rows;
        }, []).map((row, ri) => (
          <div key={ri} style={{ display: 'flex', borderBottom: ri < Math.ceil(items.length / 2) - 1 ? '1px solid #F8FAFC' : 'none' }}>
            {row.map((item, ci) => (
              <button key={ci} onClick={item.onClick}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px',
                  border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                  borderRight: ci === 0 && row.length > 1 ? '1px solid #F8FAFC' : 'none',
                  fontFamily: 'inherit',
                }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.4, marginTop: 2 }}>{item.sub}</div>
                </div>
                <ChevronRight size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />
              </button>
            ))}
            {row.length === 1 && <div style={{ flex: 1 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function ConfiguracionMobile() {
  const navigate    = useNavigate();
  const { company, planName } = useWorkspace();
  useUI();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  async function handleSignOut() {
    await signOut();
    qc.clear();
    navigate('/login', { replace: true });
  }

  const GENERAL_ITEMS = [
    { icon: <Building2 size={18} color="#2563EB" />, iconBg: '#EFF6FF', label: 'Empresa',           sub: 'Información y contacto',       onClick: () => navigate('/app/empresa') },
    { icon: <Receipt size={18} color="#D97706" />,    iconBg: '#FFFBEB', label: 'Facturación',       sub: 'Impuestos y numeración',        onClick: () => {} },
    { icon: <FileText size={18} color="#7C3AED" />,   iconBg: '#F5F3FF', label: 'Propuestas',        sub: 'Términos y validez',            onClick: () => navigate('/app/empresa') },
    { icon: <Package size={18} color="#16A34A" />,    iconBg: '#F0FDF4', label: 'Materiales',        sub: 'Catálogo y márgenes',           onClick: () => navigate('/app/materiales') },
    { icon: <Users size={18} color="#0891B2" />,      iconBg: '#ECFEFF', label: 'Usuarios',          sub: 'Accesos y roles',               onClick: () => navigate('/app/team') },
    { icon: <Plug size={18} color="#EF4444" />,       iconBg: '#FEF2F2', label: 'Integraciones',     sub: 'WhatsApp, Calendar y más',     onClick: () => navigate('/app/config/integraciones') },
  ];

  const PREF_ITEMS = [
    { icon: <Palette size={16} color="#7C3AED" />,    iconBg: '#F5F3FF', label: 'Apariencia',        sub: 'Personaliza la app',            onClick: () => {} },
    { icon: <Bell size={16} color="#D97706" />,        iconBg: '#FFFBEB', label: 'Notificaciones',   sub: 'Configura alertas',             onClick: () => {} },
    { icon: <Workflow size={16} color="#16A34A" />,    iconBg: '#F0FDF4', label: 'Flujos de trabajo', sub: 'Automatiza procesos',          onClick: () => {} },
    { icon: <LayoutGrid size={16} color="#0891B2" />, iconBg: '#ECFEFF', label: 'Campos person.',    sub: 'Crea y gestiona campos',        onClick: () => {} },
    { icon: <ShieldCheck size={16} color="#475569" />, iconBg: '#F1F5F9', label: 'Seguridad',        sub: 'Copia y protección',            onClick: () => {} },
  ];

  const COT_ITEMS = [
    { icon: <Percent size={16} color="#EF4444" />,    iconBg: '#FEF2F2', label: 'Reglas de cálculo', sub: 'Márgenes y fórmulas',          onClick: () => {} },
    { icon: <CreditCard size={16} color="#2563EB" />, iconBg: '#EFF6FF', label: 'Impuestos',         sub: 'IVA y retenciones',             onClick: () => {} },
    { icon: <Tag size={16} color="#D97706" />,         iconBg: '#FFFBEB', label: 'Descuentos',        sub: 'Reglas y niveles',              onClick: () => {} },
    { icon: <FileOutput size={16} color="#7C3AED" />, iconBg: '#F5F3FF', label: 'Formatos y docs',   sub: 'Personaliza PDFs',              onClick: () => {} },
    { icon: <Coins size={16} color="#16A34A" />,       iconBg: '#F0FDF4', label: 'Moneda y unidades', sub: 'Configura moneda',             onClick: () => {} },
  ];

  const ACTIVITY = [
    { icon: <Edit size={12} color="#2563EB" />,       bg: '#EFF6FF', text: 'Términos y condiciones actualizados', time: 'Hoy, 9:15 AM' },
    { icon: <FileText size={12} color="#7C3AED" />,   bg: '#F5F3FF', text: 'Cotización generada #BRV-0142',       time: 'Hoy, 8:42 AM' },
    { icon: <Package size={12} color="#D97706" />,    bg: '#FFFBEB', text: 'Nuevo material: Cemento gris',        time: 'Ayer, 4:30 PM' },
    { icon: <Users size={12} color="#16A34A" />,      bg: '#F0FDF4', text: 'Usuario invitado: Juan Perez',        time: 'Ayer, 11:20 AM' },
    { icon: <Percent size={12} color="#EF4444" />,    bg: '#FEF2F2', text: 'IVA actualizado al 19%',              time: 'Hace 3 días' },
  ];

  const TOOLS = [
    { icon: <Upload size={18} color="#2563EB" />,     bg: '#EFF6FF', label: 'Importar datos',    sub: 'Clientes, materiales', onClick: () => showToast('Próximamente') },
    { icon: <Download size={18} color="#16A34A" />,   bg: '#F0FDF4', label: 'Exportar datos',    sub: 'Descarga tu info',     onClick: () => showToast('Próximamente') },
    { icon: <Trash2 size={18} color="#475569" />,     bg: '#F1F5F9', label: 'Limpiar caché',     sub: 'Mejora rendimiento',   onClick: () => { qc.clear(); showToast('Caché limpiado ✓'); } },
    { icon: <RefreshCw size={18} color="#EF4444" />,  bg: '#FEF2F2', label: 'Restablecer',       sub: 'Acción irreversible',  onClick: () => showToast('Acción deshabilitada') },
  ];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 80 }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 12px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <button onClick={() => navigate(-1)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A', padding: '2px 0', display: 'flex', alignItems: 'center', marginTop: 4 }}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px' }}>Configuración</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2, lineHeight: 1.4 }}>
                Personaliza Shelwi según las necesidades<br />de tu empresa.
              </div>
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* ── PLAN ACTUAL ── */}
      <div style={{ margin: '12px 16px 0', background: 'linear-gradient(135deg, #1E1B4B 0%, #2D1B8C 100%)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)', letterSpacing: '.5px', marginBottom: 4 }}>PLAN ACTUAL</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{planName}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{company?.name ?? 'Mi empresa'}</div>
        </div>
        {planName !== 'Premium' && (
          <button onClick={() => navigate('/app/planes')}
            style={{ border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Mejorar plan ✨
          </button>
        )}
      </div>

      {/* ── CONFIGURACIÓN GENERAL ── */}
      <div style={{ marginTop: 12 }}>
        <SettingsGrid title="Configuración general" items={GENERAL_ITEMS} />
      </div>

      {/* ── 2 COLUMNAS: Preferencias + Cotización ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 6, background: '#fff', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        {/* Preferencias */}
        <div style={{ borderRight: '1px solid #F8FAFC' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', padding: '12px 14px 8px' }}>Preferencias del sistema</div>
          {PREF_ITEMS.map((item, i) => (
            <button key={i} onClick={item.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', borderTop: '1px solid #F8FAFC', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>{item.sub}</div>
              </div>
              <ChevronRight size={12} color="#CBD5E1" />
            </button>
          ))}
        </div>

        {/* Cotización */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', padding: '12px 14px 8px' }}>Config. de cotización</div>
          {COT_ITEMS.map((item, i) => (
            <button key={i} onClick={item.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', borderTop: '1px solid #F8FAFC', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>{item.sub}</div>
              </div>
              <ChevronRight size={12} color="#CBD5E1" />
            </button>
          ))}
        </div>
      </div>

      {/* ── 2 COLUMNAS: Actividad + Estado ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px' }}>

        {/* Actividad del sistema */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px', border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>Actividad</span>
            <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Ver todo</span>
          </div>
          {ACTIVITY.map((act, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: act.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{act.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#0F172A', lineHeight: 1.4, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.text}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{act.time}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Estado del sistema */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px', border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Estado del sistema</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
            <CheckCircle size={20} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>Todos los sistemas operativos</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 3, lineHeight: 1.4 }}>Shelwi está funcionando correctamente</div>
            </div>
          </div>
          <div style={{ paddingTop: 10, borderTop: '1px solid #F8FAFC' }}>
            <div style={{ fontSize: 10.5, color: '#94A3B8' }}>Última actualización:</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginTop: 2 }}>
              {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div style={{ marginTop: 12, padding: '8px 10px', background: '#F0FDF4', borderRadius: 9, border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#16A34A' }}>v2.0.0 · Actualizada</div>
          </div>
        </div>
      </div>

      {/* ── HERRAMIENTAS Y DATOS ── */}
      <div style={{ margin: '0 16px 12px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Herramientas y datos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {TOOLS.map(({ icon, bg, label, sub, onClick }) => (
            <button key={label} onClick={onClick}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', border: '1px solid #F1F5F9', borderRadius: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#0F172A', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
              <span style={{ fontSize: 9.5, color: '#94A3B8', textAlign: 'center', lineHeight: 1.2 }}>{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── SOPORTE ── */}
      <SettingsSection title="Soporte" items={[
        { icon: <HelpCircle size={18} color="#2563EB" />,     iconBg: '#EFF6FF', label: 'Centro de ayuda',     sub: 'Guías y tutoriales',       onClick: () => {} },
        { icon: <MessageSquare size={18} color="#16A34A" />,  iconBg: '#F0FDF4', label: 'Contactar soporte',  sub: 'Hablar con el equipo',     onClick: () => {} },
        { icon: <Bug size={18} color="#D97706" />,             iconBg: '#FFFBEB', label: 'Reportar error',     sub: 'Ayúdanos a mejorar',       onClick: () => {} },
      ]} />

      {/* ── INFORMACIÓN ── */}
      <div style={{ background: '#fff', margin: '6px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Info size={14} color="#94A3B8" />
          <span style={{ fontSize: 12, color: '#94A3B8' }}>Shelwi · Versión 2.0.0</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#CBD5E1' }}>© 2025 Shelwi. Todos los derechos reservados.</div>
      </div>

      {/* ── CERRAR SESIÓN ── */}
      <div style={{ padding: '12px 16px 16px' }}>
        <button
          onClick={() => setShowSignOutConfirm(true)}
          style={{ width: '100%', height: 48, border: '1.5px solid #FEE2E2', background: '#FEF2F2', color: '#EF4444', fontWeight: 700, fontSize: 15, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cerrar sesión
        </button>
      </div>

      {/* Confirm cerrar sesión */}
      {showSignOutConfirm && (
        <>
          <div onClick={() => setShowSignOutConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
          <div style={{ position: 'fixed', bottom: 88, left: 16, right: 16, zIndex: 60, background: '#fff', borderRadius: 20, padding: '22px 18px', boxShadow: '0 8px 40px rgba(15,23,42,.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>¿Cerrar sesión?</div>
            <div style={{ fontSize: 13.5, color: '#64748B', marginBottom: 20 }}>Se cerrará tu sesión en este dispositivo.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSignOutConfirm(false)}
                style={{ flex: 1, height: 46, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={handleSignOut}
                style={{ flex: 1, height: 46, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
