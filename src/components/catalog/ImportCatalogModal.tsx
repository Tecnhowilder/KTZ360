import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Upload, Check, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import { createCatalogItem, type CatalogItemType } from '../../services/catalogItems';
import { useToast } from '../ui/Toast';

interface ParsedRow {
  name: string;
  description: string;
  type: CatalogItemType;
  unit: string;
  price: number;
  valid: boolean;
  error?: string;
}

const TEMPLATE_HEADERS = ['Nombre', 'Descripción', 'Tipo (PRODUCT/SERVICE/BUNDLE)', 'Unidad', 'Precio'];
const VALID_TYPES: CatalogItemType[] = ['PRODUCT', 'SERVICE', 'BUNDLE'];

function parseRows(raw: unknown[][]): ParsedRow[] {
  return raw.map((row, idx) => {
    const name  = String(row[0] ?? '').trim();
    const desc  = String(row[1] ?? '').trim();
    const type  = String(row[2] ?? 'SERVICE').trim().toUpperCase() as CatalogItemType;
    const unit  = String(row[3] ?? 'und').trim() || 'und';
    const price = parseFloat(String(row[4] ?? '0').replace(/[^0-9.]/g, '')) || 0;

    if (!name) return { name, description: desc, type: 'SERVICE' as CatalogItemType, unit, price, valid: false, error: `Fila ${idx + 2}: nombre vacío` };
    if (!VALID_TYPES.includes(type)) return { name, description: desc, type: 'SERVICE' as CatalogItemType, unit, price, valid: false, error: `Fila ${idx + 2}: tipo inválido "${String(row[2])}"` };
    return { name, description: desc, type, unit, price, valid: true };
  }).filter(r => r.name); // excluir filas completamente vacías
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ['Diseño de logo', 'Incluye 3 propuestas', 'SERVICE', 'und', 250000],
    ['Silla ergonómica', 'Modelo A, color negro', 'PRODUCT', 'und', 450000],
    ['Pack marketing digital', 'Redes + email + web', 'BUNDLE', 'mes', 800000],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
  XLSX.writeFile(wb, 'plantilla_catalogo_shelwi.xlsx');
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function ImportCatalogModal({ onClose, onImported }: Props) {
  const { workspace } = useWorkspace();
  const { user }      = useAuth();
  const { showToast } = useToast();
  const fileRef       = useRef<HTMLInputElement>(null);

  const [rows,     setRows]     = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [done,     setDone]     = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
      // Saltar primera fila (headers)
      const parsed = parseRows(data.slice(1));
      setRows(parsed);
    };
    reader.readAsBinaryString(file);
  }

  async function importAll() {
    const valid = rows.filter(r => r.valid);
    if (!valid.length || !user) return;
    setImporting(true);
    let count = 0;
    for (const row of valid) {
      try {
        await createCatalogItem(workspace.id, user.id, {
          type: row.type, name: row.name,
          description: row.description || undefined,
          unit: row.unit, price: row.price,
        });
        count++;
      } catch { /* continuar con el siguiente */ }
      setProgress(Math.round((count / valid.length) * 100));
    }
    setImporting(false);
    setDone(true);
    showToast(`${count} ítems importados ✓`);
    onImported();
  }

  const validCount   = rows.filter(r => r.valid).length;
  const invalidCount = rows.filter(r => !r.valid).length;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(15,23,42,.15)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Importar catálogo</span>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
            <X size={15} />
          </button>
        </div>

        {/* Descargar plantilla */}
        <button onClick={downloadTemplate}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', border: '1.5px dashed #CBD5E1', borderRadius: 12, background: '#F8FAFC', cursor: 'pointer', marginBottom: 14, fontFamily: 'inherit' }}>
          <Download size={18} color="#2563EB" />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Descargar plantilla Excel</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Rellena y luego súbela aquí</div>
          </div>
        </button>

        {/* Upload */}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <button onClick={() => fileRef.current?.click()}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', border: '1.5px solid #2563EB', borderRadius: 12, background: '#EFF6FF', cursor: 'pointer', marginBottom: 14, color: '#2563EB', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit' }}>
          <Upload size={18} /> Subir archivo XLSX / CSV
        </button>

        {/* Preview */}
        {rows.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, background: '#DCFCE7', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#16A34A' }}>{validCount}</div>
                <div style={{ fontSize: 11, color: '#166534' }}>Válidos</div>
              </div>
              {invalidCount > 0 && (
                <div style={{ flex: 1, background: '#FEE2E2', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#DC2626' }}>{invalidCount}</div>
                  <div style={{ fontSize: 11, color: '#991B1B' }}>Con error</div>
                </div>
              )}
            </div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
              {rows.slice(0, 20).map((row, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F1F5F9' }}>
                  {row.valid ? <Check size={14} color="#22C55E" /> : <AlertCircle size={14} color="#EF4444" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || '—'}</div>
                    {!row.valid && <div style={{ fontSize: 11, color: '#EF4444' }}>{row.error}</div>}
                    {row.valid && <div style={{ fontSize: 11, color: '#64748B' }}>{row.type} · {row.unit} · ${row.price.toLocaleString('es-CO')}</div>}
                  </div>
                </div>
              ))}
              {rows.length > 20 && <div style={{ padding: '8px 12px', fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>+{rows.length - 20} filas más</div>}
            </div>
          </div>
        )}

        {/* Progreso */}
        {importing && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 6 }}>
              <span>Importando...</span><span>{progress}%</span>
            </div>
            <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#2563EB', borderRadius: 99, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 15, color: '#22C55E', fontWeight: 700 }}>
            ✓ {validCount} ítems importados correctamente
          </div>
        ) : (
          <button onClick={importAll} disabled={validCount === 0 || importing}
            style={{ width: '100%', height: 50, border: 'none', background: validCount > 0 ? '#2563EB' : '#E2E8F0', color: validCount > 0 ? '#fff' : '#94A3B8', fontWeight: 700, fontSize: 15, borderRadius: 12, cursor: validCount > 0 ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {importing ? 'Importando...' : `Importar ${validCount} ítem${validCount !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </>
  );
}
