/**
 * HealthChecksTab — Monitoreo de servicios críticos de Shelwi.
 * Muestra estado: Healthy / Warning / Down para cada servicio.
 * Visible desde el Backoffice de Super Admin (/app/admin → salud).
 *
 * Zero Trust: todas las consultas usan RPCs SECURITY DEFINER o tablas con RLS.
 * Los health checks se ejecutan en cliente, no en servidor, para no añadir carga.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { BRAND_COLORS } from '../../lib/brand';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type HealthStatus = 'healthy' | 'warning' | 'down' | 'loading';

interface ServiceHealth {
  name:     string;
  status:   HealthStatus;
  latencyMs?: number;
  detail?:  string;
}

// ─── Checks individuales ──────────────────────────────────────────────────────

async function checkDatabase(): Promise<ServiceHealth> {
  const t0 = Date.now();
  try {
    const { error } = await db.rpc('check_system_health');
    const ms = Date.now() - t0;
    if (error) return { name: 'PostgreSQL', status: 'down', detail: error.message };
    return {
      name: 'PostgreSQL',
      status: ms > 2000 ? 'warning' : 'healthy',
      latencyMs: ms,
      detail: ms > 2000 ? `Latencia alta: ${ms}ms` : undefined,
    };
  } catch (e) {
    return { name: 'PostgreSQL', status: 'down', detail: String(e) };
  }
}

async function checkRealtime(): Promise<ServiceHealth> {
  const t0 = Date.now();
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      channel.unsubscribe();
      resolve({ name: 'Realtime', status: 'down', detail: 'Timeout de conexión (5s)' });
    }, 5_000);

    const channel = supabase.channel('health-check-' + Date.now(), { config: { broadcast: { self: true } } });
    channel
      .on('broadcast', { event: 'ping' }, () => {
        const ms = Date.now() - t0;
        clearTimeout(timeout);
        channel.unsubscribe();
        resolve({
          name: 'Realtime',
          status: ms > 3000 ? 'warning' : 'healthy',
          latencyMs: ms,
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'ping', payload: {} });
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          resolve({ name: 'Realtime', status: 'down', detail: `Estado: ${status}` });
        }
      });
  });
}

async function checkStorage(): Promise<ServiceHealth> {
  const t0 = Date.now();
  try {
    const { error } = await supabase.storage.listBuckets();
    const ms = Date.now() - t0;
    if (error) return { name: 'Storage', status: 'down', detail: error.message };
    return { name: 'Storage', status: ms > 2000 ? 'warning' : 'healthy', latencyMs: ms };
  } catch (e) {
    return { name: 'Storage', status: 'down', detail: String(e) };
  }
}

async function checkEdgeFunctions(): Promise<ServiceHealth> {
  const t0 = Date.now();
  try {
    // Llamada GET intencionalmente — send-email devuelve 405 Method Not Allowed,
    // lo que prueba que la función está desplegada y respondiendo.
    const { error } = await supabase.functions.invoke('send-email', {
      method: 'GET',
      headers: {},
    });
    const ms = Date.now() - t0;

    if (error) {
      // El cliente Supabase envuelve cualquier HTTP no-2xx como FunctionsHttpError.
      // Un 4xx (400/401/405) significa que la EF está VIVA pero rechazó el request — correcto.
      // Solo DOWN si hay error de red (sin status) o respuesta 5xx (crash de la función).
      const httpStatus = (error as { context?: { status?: number } }).context?.status;
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        return { name: 'Edge Functions', status: ms > 3000 ? 'warning' : 'healthy', latencyMs: ms };
      }
      return {
        name: 'Edge Functions', status: 'down', latencyMs: ms,
        detail: String(error).slice(0, 120),
      };
    }

    return { name: 'Edge Functions', status: ms > 3000 ? 'warning' : 'healthy', latencyMs: ms };
  } catch (e) {
    return { name: 'Edge Functions', status: 'down', detail: String(e).slice(0, 120) };
  }
}

async function checkAI(): Promise<ServiceHealth> {
  try {
    // Verificar que ai_operation_costs tiene filas (proxy para "IA configurada")
    const { count, error } = await db
      .from('ai_operation_costs')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    if (error) return { name: 'IA (Gemini)', status: 'warning', detail: 'No se pudo verificar configuración' };
    return {
      name: 'IA (Gemini)',
      status: (count ?? 0) > 0 ? 'healthy' : 'warning',
      detail: (count ?? 0) > 0 ? `${count} operaciones configuradas` : 'Sin operaciones activas',
    };
  } catch (e) {
    return { name: 'IA (Gemini)', status: 'down', detail: String(e) };
  }
}

async function checkPush(): Promise<ServiceHealth> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from('notification_delivery_log')
      .select('status')
      .gte('created_at', since)
      .limit(20);
    if (error) return { name: 'Push (FCM)', status: 'warning', detail: error.message };

    const rows: { status: string }[] = data ?? [];
    if (rows.length === 0) return { name: 'Push (FCM)', status: 'healthy', detail: 'Sin envíos recientes' };

    const failed = rows.filter(r => r.status === 'failed').length;
    const rate   = Math.round((failed / rows.length) * 100);
    return {
      name: 'Push (FCM)',
      status: rate > 50 ? 'down' : rate > 20 ? 'warning' : 'healthy',
      detail: `Tasa de fallo última hora: ${rate}%`,
    };
  } catch (e) {
    return { name: 'Push (FCM)', status: 'down', detail: String(e) };
  }
}

async function checkCronJobs(): Promise<ServiceHealth> {
  try {
    const { data, error } = await db.rpc('get_cron_job_status');
    if (error) {
      // pg_cron puede no estar disponible en todos los proyectos
      return { name: 'Cron Jobs', status: 'warning', detail: 'pg_cron no disponible o sin permisos' };
    }
    return { name: 'Cron Jobs', status: 'healthy', detail: `${(data ?? []).length} jobs activos` };
  } catch {
    return { name: 'Cron Jobs', status: 'warning', detail: 'Estado no verificable' };
  }
}

async function runAllChecks(): Promise<ServiceHealth[]> {
  const results = await Promise.allSettled([
    checkDatabase(),
    checkRealtime(),
    checkStorage(),
    checkEdgeFunctions(),
    checkAI(),
    checkPush(),
    checkCronJobs(),
  ]);
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : {
      name: ['PostgreSQL', 'Realtime', 'Storage', 'Edge Functions', 'IA', 'Push', 'Cron'][i],
      status: 'down' as HealthStatus,
      detail: String((r as PromiseRejectedResult).reason),
    }
  );
}

// ─── UI ───────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  healthy: { color: '#10B981', bg: '#D1FAE5', label: 'HEALTHY', icon: '✓' },
  warning: { color: '#F59E0B', bg: '#FEF3C7', label: 'WARNING', icon: '⚠' },
  down:    { color: '#EF4444', bg: '#FEE2E2', label: 'DOWN',    icon: '✕' },
  loading: { color: '#94A3B8', bg: '#F1F5F9', label: 'CHECK…',  icon: '·' },
};

function ServiceCard({ svc }: { svc: ServiceHealth }) {
  const cfg = STATUS_CONFIG[svc.status];
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${cfg.color}22`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: cfg.color, flexShrink: 0 }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>{svc.name}</span>
          <span style={{ background: cfg.bg, color: cfg.color, fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, letterSpacing: '.5px' }}>{cfg.label}</span>
          {svc.latencyMs != null && (
            <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>{svc.latencyMs} ms</span>
          )}
        </div>
        {svc.detail && (
          <div style={{ fontSize: 11.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.detail}</div>
        )}
      </div>
    </div>
  );
}

export function HealthChecksTab() {
  const { data: services, isLoading, refetch, isFetching } = useQuery({
    queryKey:  ['health-checks'],
    queryFn:   runAllChecks,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const checks = services ?? [];
  const downCount    = checks.filter(s => s.status === 'down').length;
  const warningCount = checks.filter(s => s.status === 'warning').length;
  const globalStatus = downCount > 0 ? 'down' : warningCount > 0 ? 'warning' : 'healthy';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>Estado de Servicios</h2>
          <p style={{ fontSize: 12.5, color: '#64748B' }}>Health checks · se refresca cada 2 minutos</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: STATUS_CONFIG[globalStatus].bg,
            color: STATUS_CONFIG[globalStatus].color,
            borderRadius: 10, padding: '6px 14px', fontWeight: 800, fontSize: 12.5,
          }}>
            {globalStatus === 'healthy' ? '✓ Todo operativo' : globalStatus === 'warning' ? `⚠ ${warningCount} advertencia${warningCount > 1 ? 's' : ''}` : `✕ ${downCount} servicio${downCount > 1 ? 's' : ''} caído${downCount > 1 ? 's' : ''}`}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ background: BRAND_COLORS.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 12, cursor: isFetching ? 'wait' : 'pointer', opacity: isFetching ? .7 : 1 }}
          >
            {isFetching ? 'Verificando…' : 'Verificar ahora'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <ServiceCard key={i} svc={{ name: '…', status: 'loading' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
          {checks.map(svc => <ServiceCard key={svc.name} svc={svc} />)}
        </div>
      )}

      <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 16px', fontSize: 11.5, color: '#64748B' }}>
        <strong style={{ color: '#475569' }}>Umbrales:</strong> DB &lt;2s · Realtime &lt;3s · EF &lt;3s · Push error &lt;20% → HEALTHY.
        &nbsp;DB &gt;2s · Push error 20-50% → WARNING. &nbsp;Timeout / error → DOWN.
      </div>
    </div>
  );
}
