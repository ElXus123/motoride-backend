import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Trozos de librerías para que el arranque (React + Firebase + UI) no cargue Leaflet, motion,
 * three ni GSAP: esas librerías solo se descargan al entrar en el mapa, la novedad o el login animado.
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
  if (/node_modules\/(leaflet|react-leaflet|@react-leaflet|leaflet\.heat)\//.test(id)) return 'vendor-leaflet';
  if (/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(id)) return 'vendor-motion';
  if (/node_modules\/three\//.test(id)) return 'vendor-three';
  if (/node_modules\/gsap\//.test(id)) return 'vendor-gsap';
  return undefined;
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      global: 'window',
      'process.env': '{}',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: { manualChunks },
      },
    },
  };
});
