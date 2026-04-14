import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

/** Sube este valor cuando cambien las novedades para volver a mostrar el aviso una vez por dispositivo. */
export const WHATS_NEW_VERSION = '2026.04.14';

const STORAGE_KEY = 'motoride_whats_new_seen_version';

const ITEMS: { title: string; detail: string }[] = [
  {
    title: 'Apuntados en rutas programadas',
    detail:
      'En cada ruta programada puedes desplegar la lista de apuntados: nombre de usuario, nivel y moto si la tienes en tu perfil.',
  },
  {
    title: 'Rutas e invitaciones',
    detail:
      'Organiza salidas con visibilidad (explorar, solo amigos o privada), invita desde la bandeja y entra al mapa y chat de voz desde 1 h antes de la hora.',
  },
  {
    title: 'Experiencia en ruta',
    detail:
      'Mapa, participantes y voz siguen pensados para rodar en grupo con la estética y el rendimiento que ya conoces.',
  },
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
      className="fixed inset-0 z-[5800] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-8 pb-2 bg-gradient-to-b from-orange-500/12 to-transparent border-b border-zinc-800/80">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center ring-1 ring-orange-500/30">
              <Sparkles size={34} strokeWidth={2} />
            </div>
          </div>
          <h2 id="whats-new-title" className="text-center text-xl font-black text-white tracking-tight">
            Novedades en MotoRide
          </h2>
          <p className="text-center text-xs text-zinc-500 mt-2 font-medium">
            Un vistazo a lo más reciente. Podrás ver de nuevo las próximas actualizaciones cuando publiquemos más cambios.
          </p>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[min(52vh,420px)] overflow-y-auto">
          {ITEMS.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-left"
            >
              <p className="text-sm font-bold text-orange-400/95 mb-1">{item.title}</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={dismiss}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-lg shadow-orange-500/25 transition-colors"
          >
            <Check size={18} strokeWidth={2.5} />
            Entendido, no mostrar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}
