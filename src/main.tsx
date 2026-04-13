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

const setupMobileViewportHeight = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const setVh = () => {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', `${vh * 0.01}px`);
  };

  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', setVh);
  window.visualViewport?.addEventListener('resize', setVh);
};

setupMobileViewportHeight();

/** Safari / iOS antiguos: sin esto `navigator.mediaDevices` es undefined y no sale el diálogo de permiso. */
function shimNavigatorMediaDevices() {
  if (typeof navigator === 'undefined') return;
  const n = navigator as any;
  if (n.mediaDevices?.getUserMedia) return;

  if (n.mediaDevices === undefined) {
    n.mediaDevices = {};
  }

  const legacy = n.getUserMedia || n.webkitGetUserMedia || n.mozGetUserMedia;
  if (legacy && !n.mediaDevices.getUserMedia) {
    n.mediaDevices.getUserMedia = function (constraints: MediaStreamConstraints) {
      return new Promise<MediaStream>((resolve, reject) => {
        legacy.call(n, constraints, resolve, reject);
      });
    };
  }
}

shimNavigatorMediaDevices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
