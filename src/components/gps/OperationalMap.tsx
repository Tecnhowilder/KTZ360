/**
 * OperationalMap — Mapa operativo con MapLibre GL + OpenStreetMap.
 * Solo visible para owner/admin/supervisor.
 * Sin tracking continuo — muestra última ubicación conocida.
 */
import { useEffect, useRef, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { useTeamMap } from '../../hooks/useGPS';
import { useUI } from '../../features/app/UIProvider';
import { OPERATIONAL_STATUS_META } from '../../services/gps';
import type { TeamMapMember } from '../../lib/database.types';
import 'maplibre-gl/dist/maplibre-gl.css';

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

const DEFAULT_CENTER: [number, number] = [-74.0721, 4.7109]; // Bogotá
const DEFAULT_ZOOM = 11;


interface Props {
  onMemberClick?: (member: TeamMapMember) => void;
}

export function OperationalMap({ onMemberClick }: Props) {
  const mapRef    = useRef<HTMLDivElement>(null);
  const mapObj    = useRef<import('maplibre-gl').Map | null>(null);
  const markersRef = useRef<import('maplibre-gl').Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const teamQ     = useTeamMap();
  const { openUpgradeModal } = useUI();

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    import('maplibre-gl').then(({ Map }) => {
      try {
        const map = new Map({
          container: mapRef.current!,
          style: OSM_STYLE as never,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
        });
        map.on('load', () => setMapReady(true));
        mapObj.current = map;
      } catch (e) {
        setError('No se pudo cargar el mapa. Verifica tu conexión.');
      }
    }).catch(() => setError('Error al cargar MapLibre'));

    return () => {
      mapObj.current?.remove();
      mapObj.current = null;
    };
  }, []);

  // Actualizar marcadores cuando cambian los datos
  useEffect(() => {
    if (!mapReady || !mapObj.current || !teamQ.data) return;

    import('maplibre-gl').then(({ Marker }) => {
      // Limpiar marcadores anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const membersWithLocation = (teamQ.data.members ?? []).filter(
        m => m.latitude !== null && m.longitude !== null
      );

      if (!membersWithLocation.length) return;

      // Bounds para centrar el mapa
      const bounds: [[number, number], [number, number]] = [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ];

      membersWithLocation.forEach(member => {
        const lat = member.latitude!;
        const lng = member.longitude!;

        // Crear elemento DOM para el marcador
        const el = document.createElement('div');
        el.style.cssText = 'width:36px;height:36px;cursor:pointer';

        const inner = document.createElement('div');
        const meta = OPERATIONAL_STATUS_META[member.operational_status];
        const initials = (member.full_name ?? member.email ?? '?').charAt(0).toUpperCase();
        inner.style.cssText = `
          width:36px;height:36px;border-radius:50%;background:${meta.color};color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:15px;border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,.3);position:relative;
        `;
        inner.textContent = initials;
        el.appendChild(inner);
        el.addEventListener('click', () => onMemberClick?.(member));

        const marker = new Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(mapObj.current!);

        markersRef.current.push(marker);

        // Actualizar bounds
        bounds[0][0] = Math.min(bounds[0][0], lng);
        bounds[0][1] = Math.min(bounds[0][1], lat);
        bounds[1][0] = Math.max(bounds[1][0], lng);
        bounds[1][1] = Math.max(bounds[1][1], lat);
      });

      // Centrar mapa en los marcadores
      if (membersWithLocation.length === 1) {
        mapObj.current!.flyTo({ center: [membersWithLocation[0].longitude!, membersWithLocation[0].latitude!], zoom: 14 });
      } else if (membersWithLocation.length > 1) {
        mapObj.current!.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }
    });
  }, [mapReady, teamQ.data, onMemberClick]);

  if (teamQ.isError) {
    return (
      <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#F8FAFC', borderRadius: 16 }}>
        <Lock size={24} color="#94A3B8" />
        <div style={{ fontSize: 14, color: '#64748B', textAlign: 'center' }}>
          El mapa operativo requiere plan PREMIUM y rol Supervisor o superior.
        </div>
        <button
          onClick={() => openUpgradeModal({ title: 'Mapa Operativo', message: 'Visualiza la ubicación de tu equipo en tiempo real.', targetPlan: 'premium', ctaLabel: 'Activar PREMIUM' })}
          style={{ border: 'none', background: '#2563EB', color: '#fff', padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Ver planes
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', borderRadius: 16, color: '#DC2626', fontSize: 13 }}>
        {error}
      </div>
    );
  }

  const membersNoLocation = (teamQ.data?.members ?? []).filter(m => !m.latitude);

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#E2E8F0' }}>
      {/* Mapa */}
      <div ref={mapRef} style={{ height: 340, width: '100%' }} />

      {/* Loader */}
      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Cargando mapa...</div>
        </div>
      )}

      {/* Botón actualizar */}
      <button
        onClick={() => teamQ.refetch()}
        disabled={teamQ.isFetching}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          background: '#fff', border: 'none', borderRadius: 10,
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.15)',
        }}
      >
        <RefreshCw size={15} color="#374151" style={{ animation: teamQ.isFetching ? 'spin .8s linear infinite' : 'none' }} />
      </button>

      {/* Aviso: miembros sin GPS */}
      {membersNoLocation.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 10,
          background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '8px 12px',
          fontSize: 12, color: '#64748B',
        }}>
          {membersNoLocation.length} miembro(s) sin ubicación registrada
        </div>
      )}
    </div>
  );
}
