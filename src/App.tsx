import * as React from 'react';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppMessageProvider, useAppMessage } from './contexts/AppMessageContext';
import Login from './components/Login';
import MainApp from './components/MainApp';
import AppLogoSplash from './components/AppLogoSplash';
import { AlertTriangle, Download, RefreshCcw, ShieldAlert } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const RECOVERY_FLAG_KEY = 'motoride_recovery_attempted_once';

const runOneShotRecoveryReload = async () => {
  try {
    if (sessionStorage.getItem(RECOVERY_FLAG_KEY) === 'true') return false;
    sessionStorage.setItem(RECOVERY_FLAG_KEY, 'true');

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }

    const cacheBust = `recovery=${Date.now()}`;
    const nextUrl = window.location.href.includes('?')
      ? `${window.location.href}&${cacheBust}`
      : `${window.location.href}?${cacheBust}`;
    window.location.replace(nextUrl);
    return true;
  } catch (error) {
    console.error('Recovery reload failed:', error);
    window.location.reload();
    return true;
  }
};

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

const AppErrorBoundary: React.FC<AppErrorBoundaryProps> = ({ children }) => <>{children}</>;

const AppContent = () => {
  const { user, loading, error } = useAuth();
  const showMessage = useAppMessage();
  const [showInstallNotice, setShowInstallNotice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isChromeIOS, setIsChromeIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent;
    const iosDetected = /iPhone|iPad|iPod/i.test(ua);
    const chromeIosDetected = /CriOS/i.test(ua) && iosDetected;
    setIsIOS(iosDetected);
    setIsChromeIOS(chromeIosDetected);

    const alreadyDismissed = window.localStorage.getItem('motoride_install_notice_dismissed') === 'true';
    const alreadyInstalled = window.localStorage.getItem('motoride_app_installed') === 'true';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

    if (!alreadyDismissed && !alreadyInstalled && !isStandalone) {
      setShowInstallNotice(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      window.localStorage.setItem('motoride_app_installed', 'true');
      setShowInstallNotice(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const handleFatalError = () => {
      runOneShotRecoveryReload();
    };

    window.addEventListener('error', handleFatalError);
    window.addEventListener('unhandledrejection', handleFatalError);
    return () => {
      window.removeEventListener('error', handleFatalError);
      window.removeEventListener('unhandledrejection', handleFatalError);
    };
  }, []);

  const dismissInstallNotice = () => {
    window.localStorage.setItem('motoride_install_notice_dismissed', 'true');
    setShowInstallNotice(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      window.localStorage.setItem('motoride_app_installed', 'true');
      setShowInstallNotice(false);
    }
    setDeferredPrompt(null);
  };

  const requestFullscreen = async () => {
    try {
      const el = document.documentElement as any;
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else {
        showMessage({
          title: 'Pantalla completa',
          variant: 'info',
          message: 'Tu navegador no permite pantalla completa. Abre MotoRide desde su icono en la pantalla de inicio.',
        });
      }
    } catch (err) {
      console.error('Fullscreen not available:', err);
      showMessage({
        title: 'Pantalla completa',
        variant: 'info',
        message: 'No se pudo usar pantalla completa aquí. Abre MotoRide desde su icono en la pantalla de inicio.',
      });
    }
  };
  
  if (loading) {
    return <AppLogoSplash zClassName="z-[9999]" />;
  }

  if (error) {
    return (
      <div className="mr-page min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={40} className="text-orange-500" />
        </div>
        <h1 className="mr-title text-[2.5rem] mb-3">App en Mantenimiento</h1>
        <p className="text-mr-muted max-w-md mb-8">
          {error === 'quota' 
            ? "La cuota gratuita de la base de datos se ha agotado por hoy. El servicio se restablecerá automáticamente mañana."
            : "No se pudo conectar con el servidor. Por favor, comprueba tu conexión a internet o asegúrate de que no tienes un bloqueador de anuncios interfiriendo."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mr-btn-primary px-6"
        >
          <RefreshCcw size={18} />
          Reintentar
        </button>
      </div>
    );
  }
  
  return (
    <div className="mr-page h-full">
      {showInstallNotice && user && (
        <div className="fixed inset-0 z-[6000] bg-[#14110e73] flex items-center justify-center p-4">
          <div className="mr-card w-full max-w-md rounded-[22px] p-5 sm:p-6 text-mr-ink">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                <Download size={20} />
              </div>
              <div>
                <h2 className="font-black text-lg leading-tight">Instala MotoRide</h2>
                <p className="text-zinc-400 text-sm mt-1">Carga más rápido y el GPS funciona mejor.</p>
              </div>
            </div>

            {isIOS ? (
              <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3 mb-3 text-sm text-zinc-200">
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                  <li>Toca el botón <strong className="text-zinc-200">Compartir</strong> (cuadrado con flecha).</li>
                  <li>Elige <strong className="text-zinc-200">«Añadir a pantalla de inicio»</strong>.</li>
                  <li>Abre MotoRide desde ese icono.</li>
                </ol>
                {isChromeIOS && (
                  <p className="text-zinc-400 mt-2">En Chrome, la opción está en Compartir → Ver más.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-300 mb-3">
                {deferredPrompt ? 'Pulsa «Instalar app» abajo.' : 'Abre el menú ⋮ y elige «Instalar aplicación».'}
              </p>
            )}

            {/* Pantalla completa: en iPhone no existe desde una web; ahí basta con abrir el icono instalado. */}
            {!isIOS && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 mb-3 flex items-center justify-between gap-3 text-sm text-zinc-200">
                <span>Mapa a pantalla completa</span>
                <button
                  onClick={requestFullscreen}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-4 py-2 transition-colors"
                >
                  Pantalla completa
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 mb-5 text-sm text-zinc-200">
              <p className="font-semibold flex items-center gap-2 mb-1"><ShieldAlert size={16} /> Aviso legal y de seguridad</p>
              <p>
                Esta aplicacion no promueve ni se hace responsable de conductas ilegales. Conduce con prudencia,
                respeta las normas de trafico y prioriza siempre tu seguridad y la de los demas.
              </p>
            </div>

            <div className="flex gap-2">
              {deferredPrompt ? (
                <button
                  onClick={handleInstall}
                  className="mr-btn-primary flex-1"
                >
                  Instalar app
                </button>
              ) : null}
              <button
                onClick={dismissInstallNotice}
                className={`mr-btn-ghost ${deferredPrompt ? '' : 'w-full'}`}
              >
                Continuar web
              </button>
            </div>
          </div>
        </div>
      )}
      {user ? <MainApp /> : <Login />}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppMessageProvider>
        <AppErrorBoundary>
          <AppContent />
        </AppErrorBoundary>
      </AppMessageProvider>
    </AuthProvider>
  );
}
