// vitest 4 no longer augments vite's UserConfig with `test` — the typed
// defineConfig now comes from vitest/config.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** A test matching modules of these packages (each a regex source) in node_modules. */
const pkgs = (...names: string[]) => new RegExp(`node_modules[\\\\/](?:${names.join('|')})[\\\\/]`);
const REACT = pkgs('react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', 'react-is');

export default defineConfig({
  server: {
    port: 5173,
    // Only this machine. The dev server is not hardened for the network (Vite's
    // own advisories, e.g. GHSA-p4f5-76q4-ffq7, only bite when it is exposed).
    // To try the app on a phone, run `npm run dev -- --host` on a trusted network.
  },
  plugins: [react()],
  build: {
    // Heavy libraries get their own chunks, so the first load stays small and
    // they cache independently; charts, PDF and OCR load only on the screens
    // that use them. Everything else from node_modules is split automatically,
    // next to the code that imports it (a markdown renderer used only by the
    // AI screens stays with them).
    //
    // Groups claim modules from the highest priority down, and a group also
    // takes the dependencies of what it claims. So React (and Vite's chunk
    // loader) are claimed first: when "charts" claimed them through Recharts,
    // and "pdf" the loader through jsPDF, every page, the landing page
    // included, downloaded both libraries before it could start (U7).
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: (id) => REACT.test(id) || /vite[\\/]preload-helper/.test(id), priority: 50 },
            { name: 'query', test: pkgs('@tanstack/[^\\/]+'), priority: 40 },
            {
              name: 'charts',
              test: pkgs('recharts', 'd3-[^\\/]+', 'victory-vendor', 'internmap', '@reduxjs/[^\\/]+', 'redux', 'react-redux', 'reselect', 'immer',
                'decimal\\.js-light', 'eventemitter3', 'es-toolkit', 'use-sync-external-store', 'clsx', 'tiny-invariant'),
              priority: 30,
            },
            { name: 'pdf', test: pkgs('jspdf', 'jspdf-autotable', 'pako', 'fast-png', 'fflate', 'iobuffer', '@babel/runtime'), priority: 30 },
            { name: 'ocr', test: pkgs('tesseract\\.js', 'regenerator-runtime'), priority: 30 },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
  },
});
