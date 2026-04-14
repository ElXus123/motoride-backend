import { Clock, MapIcon } from 'lucide-react';

type Props = {
  open: boolean;
  routeName: string;
  scheduledTimestamp: number;
  onDismiss: () => void;
  /** Entrar al mapa / grupo en vivo (misma acción que «Entrar a la ruta»). */
  onJoinNow: () => void;
};

/**
 * Aviso cuando la ruta programada ya está en la ventana de 1 h antes: puedes unirte al grupo.
 */
export default function ScheduledRouteSoonOverlay({
  open,
  routeName,
  scheduledTimestamp,
  onDismiss,
  onJoinNow,
}: Props) {
  if (!open) return null;

  const when = new Date(scheduledTimestamp).toLocaleString([], {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div
      className="fixed inset-0 z-[5600] flex items-center justify-center p-4 bg-zinc-950/92"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheduled-soon-title"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-orange-500/35 rounded-3xl shadow-2xl shadow-orange-500/10 overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800 bg-gradient-to-b from-orange-500/15 to-transparent">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-400/95 mb-2">Ruta programada</p>
          <h2 id="scheduled-soon-title" className="text-lg font-black text-white leading-snug">
            Tu salida <span className="text-orange-400">{routeName}</span> está a punto de empezar
          </h2>
          <p className="flex items-center gap-2 text-xs text-zinc-400 mt-3">
            <Clock size={14} className="text-zinc-500 shrink-0" />
            <span>Hora: {when}</span>
          </p>
          <p className="text-sm text-zinc-300 mt-3 leading-relaxed">
            Ya puedes <strong className="text-zinc-100">unirte al grupo</strong> y abrir el mapa con participantes y chat de voz.
          </p>
        </div>
        <div className="p-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end bg-zinc-950/50">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-zinc-700 bg-zinc-800/80 text-zinc-200 text-sm font-bold hover:bg-zinc-800"
          >
            Más tarde
          </button>
          <button
            type="button"
            onClick={() => {
              onJoinNow();
            }}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 text-zinc-950 text-sm font-black flex items-center justify-center gap-2 min-w-[10rem] shadow-lg shadow-orange-500/25"
          >
            <MapIcon size={18} />
            Unirse al grupo
          </button>
        </div>
      </div>
    </div>
  );
}
