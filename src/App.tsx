import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import MainApp from './components/MainApp';
import { AlertTriangle, Download, RefreshCcw, ShieldAlert } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const AppContent = () => {
  const { user, loading, error } = useAuth();
  const [showInstallNotice, setShowInstallNotice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isSafari, setIsSafari] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent;
    const safariDetected = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|SamsungBrowser/i.test(ua);
    const iosDetected = /iPhone|iPad|iPod/i.test(ua);
    setIsSafari(safariDetected);
    setIsIOS(iosDetected);

    const alreadyDismissed = window.localStorage.getItem('motoride_install_notice_dismissed') === 'true';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

    if (!alreadyDismissed && !isStandalone) {
      setShowInstallNotice(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
        alert('Tu navegador no permite pantalla completa directa. En Safari: Compartir -> Añadir a pantalla de inicio para abrirla a pantalla completa.');
      }
    } catch (err) {
      console.error('Fullscreen not available:', err);
      alert('No se pudo activar pantalla completa automáticamente. En Safari usa: Compartir -> Añadir a pantalla de inicio.');
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
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

            {(deferredPrompt || isSafari) && (
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3 mb-3 text-sm text-zinc-200">
              <p className="font-semibold mb-1">Como instalarla en 20 segundos:</p>
              {isSafari ? (
                <>
                  <p className="text-zinc-300">1) Abrela en Safari.</p>
                  <p className="text-zinc-300">2) Pulsa Compartir (icono cuadrado con flecha).</p>
                  <p className="text-zinc-300">3) Toca Anadir a pantalla de inicio para usarla en modo app.</p>
                </>
              ) : (
                <>
                  <p className="text-zinc-300">1) Abrela en Chrome.</p>
                  <p className="text-zinc-300">2) Pulsa Instalar app (si aparece abajo).</p>
                  <p className="text-zinc-300">3) Si no aparece, usa el menu (tres puntos) → Instalar aplicacion.</p>
                </>
              )}
            </div>
            )}

            {(isSafari || isIOS) && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 mb-3 text-sm text-zinc-200">
                <p className="font-semibold mb-2">Recomendado en Safari/iPhone</p>
                <p className="text-zinc-300 mb-3">Para mejor visibilidad en ruta, usa pantalla completa.</p>
                <button
                  onClick={requestFullscreen}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-2.5 transition-colors"
                >
                  Activar pantalla completa
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
                className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold transition-colors"
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
      <AppContent />
    </AuthProvider>
  );
}
