import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
