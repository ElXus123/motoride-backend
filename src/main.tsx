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

};

setupPWAAssets();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
