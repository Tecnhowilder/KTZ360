import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Aumentar threshold de warning — maplibre-gl y xlsx son lazy-loaded, no bloquean TTI
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor: maplibre-gl (1 MB) — solo cargado al navegar al mapa ───────
          if (id.includes('maplibre-gl')) return 'vendor-maplibre';

          // ── Vendor: xlsx (424 kB) — solo cargado en páginas de exportación ─────
          if (id.includes('xlsx')) return 'vendor-xlsx';

          // ── Vendor: Sentry (~300 kB) ──────────────────────────────────────────
          if (id.includes('@sentry')) return 'vendor-sentry';

          // ── Vendor: Supabase JS ───────────────────────────────────────────────
          if (id.includes('@supabase')) return 'vendor-supabase';

          // ── Vendor: React Query ───────────────────────────────────────────────
          if (id.includes('@tanstack')) return 'vendor-query';

          // ── Vendor: React + DOM + Router (core inicial) ───────────────────────
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) return 'vendor-react';

          // ── Vendor: UI icons ──────────────────────────────────────────────────
          if (id.includes('lucide-react')) return 'vendor-ui';

          // ── Vendor: PDF / rendering ───────────────────────────────────────────
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('pdfjs')) {
            return 'vendor-pdf';
          }

          // Resto de node_modules → vendor-misc para aislarlos del código de app
          if (id.includes('node_modules')) return 'vendor-misc';
        },
      },
    },
  },
});
