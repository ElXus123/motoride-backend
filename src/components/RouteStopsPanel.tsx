import { Check, Coffee, Fuel, Loader2, Mountain, RefreshCw, Users, X } from 'lucide-react';
import { MAX_STOP_OFF_ROUTE_M, STOP_KIND_LABEL, type RouteStopKind } from '../lib/routeStops';
import type { RouteStopCandidate } from '../lib/stopVotes';

const KIND_ICON: Record<RouteStopKind, typeof Fuel> = {
  fuel: Fuel,
  cafe: Coffee,
  viewpoint: Mountain,
};

type Props = {
  /** Candidatas: docs de Firestore del grupo o, si aún no hay, la lista local de Overpass. Null = cargando. */
  candidates: RouteStopCandidate[] | null;
  /** Miembros con un voto registrado en esta ruta (electorado de la regla de mayoría). */
  electorateSize: number;
  /** `live`: votos sincronizados con el grupo. `offline`: sin conexión, solo lectura (se muestra la última elección). */
  voteMode: 'live' | 'offline';
  loading: boolean;
  error: boolean;
  onToggle: (candidate: RouteStopCandidate) => void;
  onRetry: () => void;
  onClose: () => void;
};

/** Hoja con las paradas candidatas de la ruta. Cada miembro vota una; la más votada (por mayoría) es la próxima del grupo. */
export default function RouteStopsPanel({ candidates, electorateSize, voteMode, loading, error, onToggle, onRetry, onClose }: Props) {
  const live = voteMode === 'live';
  return (
    <div className="fixed inset-0 z-[2200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3" role="dialog" aria-modal="true" aria-label="Paradas en ruta">
      <div className="mr-sheet w-full max-w-md max-h-[80dvh] flex flex-col overflow-hidden p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <p className="mr-eyebrow">Paradas</p>
            <h2 className="text-lg font-black text-mr-ink leading-tight">Gasolineras, cafés y miradores</h2>
            <p className="text-xs text-mr-muted mt-1">
              {live
                ? `Vota la parada que quieres. La más votada por mayoría será la próxima del grupo.`
                : 'Sin conexión con el grupo: se muestra tu última elección.'}
            </p>
            <p className="text-[11px] text-mr-muted mt-1">Junto al trazado (hasta {MAX_STOP_OFF_ROUTE_M} m).</p>
          </div>
          <button type="button" onClick={onClose} className="mr-focus p-2 rounded-full bg-zinc-800 text-zinc-300" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain py-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-mr-muted py-6 justify-center">
              <Loader2 size={18} className="animate-spin text-orange-400" aria-hidden />
              Buscando paradas a lo largo de la ruta (máx. 2 min)...
            </div>
          )}

          {!loading && (error || candidates === null) && (
            <div className="text-center py-6">
              <p className="text-sm text-mr-muted">No se pudieron cargar las paradas ahora (el servicio de mapas puede estar saturado o sin conexión).</p>
              <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200">
                <RefreshCw size={14} className="text-orange-400" aria-hidden />
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && candidates && candidates.length === 0 && (
            <p className="text-sm text-mr-muted text-center py-6">No hay gasolineras, cafés ni miradores junto al trazado.</p>
          )}

          {!loading &&
            !error &&
            candidates?.map((c) => {
              const Icon = KIND_ICON[c.kind];
              return (
                <div key={c.docId} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${c.chosen ? 'bg-emerald-500/10 ring-emerald-400/30' : 'bg-mr-page/60 ring-mr-line'}`}>
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-orange-400 shrink-0">
                    <Icon size={18} aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-mr-ink break-words leading-snug">{c.name ?? STOP_KIND_LABEL[c.kind]}</p>
                    <p className="text-[11px] text-mr-muted tabular-nums">
                      {STOP_KIND_LABEL[c.kind]} · km {(c.alongM / 1000).toFixed(1)}
                      {c.chosen ? ' · elegida por el grupo' : ''}
                    </p>
                    <p className="text-[11px] text-mr-muted tabular-nums">
                      {c.votes === 1 ? '1 voto' : `${c.votes} votos`}
                      {electorateSize > 0 ? ` de ${electorateSize}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggle(c)}
                    disabled={!live}
                    aria-pressed={c.mine}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40 ${
                      c.mine ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/30'
                    }`}
                  >
                    {c.mine ? <Check size={13} aria-hidden /> : null}
                    {c.mine ? 'Mi voto' : 'Me apunto'}
                  </button>
                </div>
              );
            })}
        </div>

        <p className="flex items-center gap-1.5 pt-3 border-t border-white/10 text-[10px] text-zinc-500 leading-snug">
          <Users size={12} aria-hidden />
          Datos © colaboradores de OpenStreetMap (consulta vía Overpass). Pueden faltar o estar desactualizados; confirma el horario antes de parar.
        </p>
      </div>
    </div>
  );
}
