/**
 * useReports.ts — Hooks de React Query para reportes Sprint 5
 * Todos los datos vienen del backend. Cero cálculos en frontend.
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getReportsSummary, getFunnelReport, getServicesReport,
  getClientsReport, getExecutiveDashboard, getSmartAlerts,
  exportReport, downloadBlob,
  type ReportPeriodPreset, periodPresetToDates,
  type ExportFormat, type ExportReportType,
} from '../services/reports';
import { useToast } from '../components/ui/Toast';

// Stale times por tipo de dato
const STALE_1MIN  = 60_000;
const STALE_5MIN  = 300_000;

// ─── Hook genérico de período ─────────────────────────────────────────────────

export function periodDates(preset: ReportPeriodPreset, custom?: { start: string; end: string }) {
  if (preset === 'personalizado' && custom) return custom;
  return periodPresetToDates(preset);
}

// ─── Hooks individuales ───────────────────────────────────────────────────────

export function useReportsSummary(
  preset: ReportPeriodPreset = 'mes_actual',
  custom?: { start: string; end: string }
) {
  const { workspace } = useWorkspace();
  const { start, end } = periodDates(preset, custom);
  return useQuery({
    queryKey: ['reportsSummary', workspace.id, start, end],
    queryFn:  () => getReportsSummary(workspace.id, start, end),
    staleTime: STALE_1MIN,
  });
}

export function useFunnelReport(
  preset: ReportPeriodPreset = 'ultimos_90',
  custom?: { start: string; end: string }
) {
  const { workspace } = useWorkspace();
  const { start, end } = periodDates(preset, custom);
  return useQuery({
    queryKey: ['funnelReport', workspace.id, start, end],
    queryFn:  () => getFunnelReport(workspace.id, start, end),
    staleTime: STALE_5MIN,
  });
}

export function useServicesReport(
  preset: ReportPeriodPreset = 'mes_actual',
  custom?: { start: string; end: string }
) {
  const { workspace } = useWorkspace();
  const { start, end } = periodDates(preset, custom);
  return useQuery({
    queryKey: ['servicesReport', workspace.id, start, end],
    queryFn:  () => getServicesReport(workspace.id, start, end),
    staleTime: STALE_5MIN,
  });
}

export function useClientsReport(
  preset: ReportPeriodPreset = 'ultimos_90',
  custom?: { start: string; end: string }
) {
  const { workspace } = useWorkspace();
  const { start, end } = periodDates(preset, custom);
  return useQuery({
    queryKey: ['clientsReport', workspace.id, start, end],
    queryFn:  () => getClientsReport(workspace.id, start, end),
    staleTime: STALE_5MIN,
  });
}

export function useExecutiveDashboard() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['executiveDashboard', workspace.id],
    queryFn:  () => getExecutiveDashboard(workspace.id),
    staleTime: STALE_1MIN,
  });
}

export function useSmartAlerts() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['smartAlerts', workspace.id],
    queryFn:  () => getSmartAlerts(workspace.id),
    staleTime: STALE_1MIN,
    retry: false,
  });
}

// ─── Hook de exportación ──────────────────────────────────────────────────────

export function useExportReport() {
  const { showToast } = useToast();
  return useMutation({
    mutationFn: async (opts: {
      reportType:  ExportReportType;
      format:      ExportFormat;
      periodStart?: string;
      periodEnd?:   string;
      filename?:    string;
    }) => {
      const blob = await exportReport(opts);
      const ext  = opts.format === 'pdf' ? 'html' : opts.format;
      const name = opts.filename ?? `shelwi-${opts.reportType}-${new Date().toISOString().slice(0,10)}.${ext}`;
      downloadBlob(blob, name);
      return name;
    },
    onSuccess: (name) => showToast(`Reporte descargado: ${name}`),
    onError: (err: Error) => showToast(err.message ?? 'Error al exportar'),
  });
}
