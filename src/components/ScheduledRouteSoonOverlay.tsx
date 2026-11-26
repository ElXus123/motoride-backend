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
      className="fixed inset-0 z-[5600] flex items-center justify-center p-4 bg-mr-page/92"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheduled-soon-title"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md bg-mr-paper border border-mr-accent rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-mr-line bg-mr-page text-mr-ink">
          <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-mr-accent-text">Ruta programada</p>
          <h2 id="scheduled-soon-title" className="mr-title text-[2rem] leading-tight">
            Tu salida <span className="text-mr-accent-text">{routeName}</span> está a punto de empezar
          </h2>
          <p className="flex items-center gap-2 text-xs text-mr-muted mt-3">
            <Clock size={14} className="text-mr-muted shrink-0" />
            <span>Hora: {when}</span>
          </p>
          <p className="text-sm text-mr-ink mt-3 leading-relaxed">
            Ya puedes <strong className="text-mr-ink">unirte al grupo</strong> y abrir el mapa con participantes y chat de voz.
          </p>
        </div>
        <div className="p-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end bg-mr-page/50">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-mr-line bg-mr-line/80 text-mr-ink text-sm font-bold hover:bg-mr-line"
          >
            Más tarde
          </button>
          <button
            type="button"
            onClick={() => {
              onJoinNow();
            }}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-mr-accent hover:bg-mr-accent-hover text-mr-on-accent text-sm font-black flex items-center justify-center gap-2 min-w-[10rem] shadow-lg"
          >
            <MapIcon size={18} />
            Unirse al grupo
          </button>
        </div>
      </div>
    </div>
  );
}
