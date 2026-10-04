import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPages } from './plugins/seo-pages';

export default defineConfig({
  plugins: [react(), seoPages()],
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          ocr: ['tesseract.js'],
          sheet: ['exceljs'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
