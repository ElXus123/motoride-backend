import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import appIcon from '../ICONO.png';

// Polyfill process.nextTick for browser environment
if (typeof window !== 'undefined' && !window.process) {
  (window as any).process = {
    nextTick: (fn: Function, ...args: any[]) => setTimeout(() => fn(...args), 0),
    env: {}
  };
} else if (typeof window !== 'undefined' && window.process && !window.process.nextTick) {
  window.process.nextTick = (fn: Function, ...args: any[]) => setTimeout(() => fn(...args), 0);
}

const setupPWAAssets = () => {
  if (typeof document === 'undefined') return;

  // Ensure favicon uses project icon.
  let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.type = 'image/png';
  favicon.href = appIcon;

  // Apple home screen icon.
  let appleIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
  if (!appleIcon) {
    appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleIcon);
  }
  appleIcon.href = appIcon;

  // Build manifest at runtime so icon URL always points to bundled asset.
  const manifest = {
    name: 'MotoBikeSocial',
    short_name: 'MotoBikeSocial',
    description: 'Navegador y telemetria para moteros con inclinometro y radares.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#f97316',
    orientation: 'any',
    icons: [
      { src: appIcon, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: appIcon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  };

  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  manifestLink.href = manifestUrl;
};

setupPWAAssets();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
