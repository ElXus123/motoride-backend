import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import appLogo from '../../ICONO.png';

/** Sube este valor cuando cambien las novedades para volver a mostrar el aviso una vez por dispositivo. */
export const WHATS_NEW_VERSION = '2026.04.19';

const STORAGE_KEY = 'motoride_whats_new_seen_version';

/**
 * Solo cosas nuevas que el usuario nota en la app (sin arreglos internos ni tecnicismos).
 * Mantener pocas frases y lenguaje muy claro.
 */
const WHATS_NEW_HIGHLIGHTS: string[] = [
  'Medallas al rodar (distancia, curvas, rutas, inclinación…). En tu perfil eliges tres para enseñarlas; en el de un amigo ves las suyas. Si pulsas una, te dice de qué va.',
  'Subir de nivel pide más puntos cuanto más alto vas; el aro del avatar cambia de aspecto.',
  'Al terminar una ruta se guardan datos de esa salida (por ejemplo velocidad máxima e inclinación) para las medallas.',
  'Chat de texto con amigos y bandeja con invitaciones y avisos de mensajes en tus rutas programadas.',
  'En el mapa, la voz puede avisarte si puede llover cerca y cuando te acercas a un radar.',
  'Rutas programadas con chat del grupo para acordar hora y quedada.',
  'Si activas las notificaciones del navegador, puedes recibir avisos antes de una salida, invitaciones a ruta y solicitudes de amistad.',
];

export default function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== WHATS_NEW_VERSION) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION);
    } catch {
      /* ignore quota / private mode */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[5800] flex items-center justify-center p-4 bg-zinc-950/90"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[min(88dvh,640px)] flex flex-col min-h-0 landscape:max-h-[min(92dvh,720px)] landscape:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-8 pb-4 bg-gradient-to-b from-orange-500/12 to-transparent border-b border-zinc-800/80 shrink-0">
          <div className="flex justify-center mb-5">
            <div className="flex flex-col items-center">
              <div
                className="relative w-[4.5rem] h-[4.5rem] rounded-2xl overflow-hidden ring-2 ring-orange-500/40 shadow-[0_14px_44px_-10px_rgba(249,115,22,0.45)]"
                aria-hidden
              >
                <img src={appLogo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div
                  className="absolute inset-0 whats-new-logo-gleam pointer-events-none mix-blend-overlay"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.2) 55%, transparent 100%)',
                    width: '42%',
                    height: '160%',
                    top: '-30%',
                    left: '0',
                  }}
                />
              </div>
              <div className="relative w-[4.5rem] h-[2.1rem] -mt-0.5 overflow-hidden [perspective:420px]">
                <img
                  src={appLogo}
                  alt=""
                  aria-hidden
                  className="absolute left-0 top-0 w-[4.5rem] h-[4.5rem] object-cover scale-y-[-1] whats-new-reflection-pulse [transform:rotateX(12deg)_scaleY(-1)] origin-top"
                  style={{
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 45%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 45%, transparent 100%)',
                    filter: 'blur(0.35px) brightness(1.05)',
                  }}
                />
                <div
                  className="absolute inset-0 bg-gradient-to-b from-zinc-900/0 via-zinc-900/25 to-zinc-900 pointer-events-none"
                  aria-hidden
                />
              </div>
            </div>
          </div>
          <h2 id="whats-new-title" className="text-center text-xl font-black text-white tracking-tight">
            Novedades
          </h2>
          <p className="text-center text-sm text-zinc-500 mt-2 leading-relaxed px-1">
            Solo lo que te afecta al usar la app, en pocas líneas.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 [transform:translateZ(0)]">
          <ul className="space-y-3 text-left">
            {WHATS_NEW_HIGHLIGHTS.map((text, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 px-3.5 py-2.5"
              >
                <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-orange-400" strokeWidth={2.5} aria-hidden />
                <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 pb-6 pt-2 border-t border-zinc-800/80 shrink-0 bg-zinc-900">
          <button
            type="button"
            onClick={dismiss}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-lg shadow-orange-500/25 transition-colors"
          >
            <Check size={18} strokeWidth={2.5} />
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
