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
  const [isSafari, setIsSafari] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isChromeIOS, setIsChromeIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent;
    const safariDetected = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|SamsungBrowser/i.test(ua);
    const iosDetected = /iPhone|iPad|iPod/i.test(ua);
    const chromeIosDetected = /CriOS/i.test(ua) && iosDetected;
    setIsSafari(safariDetected);
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
          message:
            'En iPhone no suele funcionar la pantalla completa en el navegador. Instala MotoRide en la pantalla de inicio: en Safari, Compartir → Añadir a pantalla de inicio; en Chrome, Compartir → Ver más → Añadir a pantalla de inicio. Luego ábrela desde el icono.',
        });
      }
    } catch (err) {
      console.error('Fullscreen not available:', err);
      showMessage({
        title: 'Pantalla completa',
        variant: 'info',
        message:
          'No se pudo usar pantalla completa aquí. En iPhone: añade MotoRide a la pantalla de inicio (Safari: Compartir → Añadir a pantalla de inicio; Chrome: Compartir → Ver más → Añadir a pantalla de inicio) y ábrela desde el icono.',
      });
    }
  };
  
  if (loading) {
    return <AppLogoSplash zClassName="z-[9999]" />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={40} className="text-orange-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">App en Mantenimiento</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          {error === 'quota' 
            ? "La cuota gratuita de la base de datos se ha agotado por hoy. El servicio se restablecerá automáticamente mañana."
            : "No se pudo conectar con el servidor. Por favor, comprueba tu conexión a internet o asegúrate de que no tienes un bloqueador de anuncios interfiriendo."}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl transition-colors font-semibold"
        >
          <RefreshCcw size={18} />
          Reintentar
        </button>
      </div>
    );
  }
  
  return (
    <>
      {showInstallNotice && (
        <div className="fixed inset-0 z-[6000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-white">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                <Download size={20} />
              </div>
              <div>
                <h2 className="font-black text-lg leading-tight">Instala MotoRide para mejor rendimiento</h2>
                <p className="text-zinc-400 text-sm mt-1">
                  Te recomendamos instalarla para que cargue mas rapido, use mejor el GPS y funcione como una app real.
                </p>
              </div>
            </div>

            {(deferredPrompt || isSafari || isChromeIOS || isIOS) && (
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3 mb-3 text-sm text-zinc-200">
              <p className="font-semibold mb-2">Cómo ponerla en tu móvil</p>
              {deferredPrompt && !isIOS ? (
                <>
                  <p className="text-zinc-300 mb-2">En <strong className="text-zinc-200">Android</strong> u ordenador con Chrome/Edge:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                    <li>Pulsa <strong className="text-zinc-200">Instalar app</strong> si aparece (abajo o en la barra).</li>
                    <li>Si no, abre el menú <strong className="text-zinc-200">⋮</strong> o <strong className="text-zinc-200">Instalar aplicación</strong>.</li>
                  </ol>
                </>
              ) : isChromeIOS ? (
                <>
                  <p className="text-zinc-300 mb-2">
                    En <strong className="text-zinc-200">Chrome para iPhone</strong> la opción va en <strong className="text-zinc-200">Compartir</strong> y luego en <strong className="text-zinc-200">Ver más</strong>:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                    <li>Abre esta página en Chrome.</li>
                    <li>Abajo, toca <strong className="text-zinc-200">Compartir</strong> (cuadrado con flecha hacia arriba).</li>
                    <li>
                      Desplázate y toca <strong className="text-zinc-200">Ver más</strong> (o despliega la lista de acciones) hasta ver{' '}
                      <strong className="text-zinc-200">Añadir a pantalla de inicio</strong>.
                    </li>
                    <li>Toca <strong className="text-zinc-200">Añadir</strong>. Abre MotoRide desde el icono en tu pantalla de inicio.</li>
                  </ol>
                </>
              ) : isSafari && isIOS ? (
                <>
                  <p className="text-zinc-300 mb-2">En <strong className="text-zinc-200">Safari</strong> (iPhone o iPad):</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                    <li>Abre esta página en Safari.</li>
                    <li>Abajo, toca <strong className="text-zinc-200">Compartir</strong> (cuadrado con flecha hacia arriba).</li>
                    <li>
                      Toca <strong className="text-zinc-200">Añadir a pantalla de inicio</strong> y luego <strong className="text-zinc-200">Añadir</strong>.
                    </li>
                  </ol>
                </>
              ) : isIOS ? (
                <p className="text-zinc-300">
                  Abre el menú <strong className="text-zinc-200">Compartir</strong> del navegador y busca <strong className="text-zinc-200">Añadir a pantalla de inicio</strong>. Si no aparece, abre la página en <strong className="text-zinc-200">Safari</strong> o en <strong className="text-zinc-200">Chrome</strong> y sigue los pasos de arriba.
                </p>
              ) : (
                <p className="text-zinc-300">
                  Si tu navegador muestra <strong className="text-zinc-200">Instalar</strong> o un icono de instalación en la barra de direcciones, úsalo. Si no, revisa el menú del navegador (Archivo, Aplicación o ⋮).
                </p>
              )}
            </div>
            )}

            {(isSafari || isChromeIOS || isIOS) && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 mb-3 text-sm text-zinc-200">
                <p className="font-semibold mb-2">En iPhone: mapa a pantalla llena</p>
                <p className="text-zinc-300 mb-3">
                  Lo más cómodo es abrir MotoRide desde el <strong className="text-zinc-200">icono que añadiste</strong> (no desde el navegador). Si aún no la has añadido, sigue los pasos de arriba (Safari o Chrome con Compartir → Ver más). Puedes probar este botón; si no hace nada, instálala primero.
                </p>
                <button
                  onClick={requestFullscreen}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-2.5 transition-colors"
                >
                  Intentar pantalla completa
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
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl py-3 transition-colors"
                >
                  Instalar app
                </button>
              ) : null}
              <button
                onClick={dismissInstallNotice}
                className={`rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold transition-colors py-3 px-4 ${deferredPrompt ? '' : 'w-full'}`}
              >
                Continuar web
              </button>
            </div>
          </div>
        </div>
      )}
      {user ? <MainApp /> : <Login />}
    </>
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
