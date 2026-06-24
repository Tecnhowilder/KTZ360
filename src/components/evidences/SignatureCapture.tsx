/**
 * SignatureCapture — Canvas para captura de firma digital.
 * Exporta la firma como PNG blob para subirla como evidencia de tipo 'signature'.
 */
import { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check } from 'lucide-react';

interface Props {
  onCapture: (file: File) => void;
  onCancel:  () => void;
}

export function SignatureCapture({ onCapture, onCancel }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig,  setHasSig]  = useState(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(true);
    setHasSig(true);
    const pos = getPos(e);
    lastPt.current = pos;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    if (lastPt.current) {
      const midX = (lastPt.current.x + pos.x) / 2;
      const midY = (lastPt.current.y + pos.y) / 2;
      ctx.quadraticCurveTo(lastPt.current.x, lastPt.current.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
    }
    lastPt.current = pos;
  }

  function endDraw() {
    setDrawing(false);
    lastPt.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    setHasSig(false);
  }

  async function saveSignature() {
    const canvas = canvasRef.current!;
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `firma-${Date.now()}.png`, { type: 'image/png' });
      onCapture(file);
    }, 'image/png', 0.92);
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.5)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
        background: '#fff', borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Firma digital</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Dibuja tu firma en el área</div>
        </div>

        {/* Canvas — Sprint 22: aria-label para accesibilidad (App Store req.) */}
        <div style={{ margin: '0 16px', borderRadius: 14, border: '2px dashed #E2E8F0', overflow: 'hidden', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Área de firma digital. Dibuja tu firma con el dedo o el ratón."
            tabIndex={0}
            style={{ display: 'block', width: '100%', height: 180, touchAction: 'none', cursor: 'crosshair' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!hasSig && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 14, color: '#CBD5E1', fontWeight: 500 }}>Dibuja aquí tu firma</span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 16px 0' }}>
          <button
            onClick={clearCanvas}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#64748B' }}
          >
            <RotateCcw size={15} /> Borrar
          </button>
          <button onClick={onCancel} style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151' }}>
            Cancelar
          </button>
          <button
            onClick={saveSignature}
            disabled={!hasSig}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: 12, borderRadius: 12, border: 'none',
              background: hasSig ? '#16A34A' : '#E2E8F0',
              cursor: hasSig ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 700,
              color: hasSig ? '#fff' : '#94A3B8',
            }}
          >
            <Check size={15} /> Guardar firma
          </button>
        </div>
      </div>
    </>
  );
}
