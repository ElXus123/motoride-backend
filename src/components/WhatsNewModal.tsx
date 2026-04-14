import { useEffect, useState } from 'react';
import { Check, Sparkles, Wrench } from 'lucide-react';

/** Sube este valor cuando cambien las novedades para volver a mostrar el aviso una vez por dispositivo. */
export const WHATS_NEW_VERSION = '2026.04.17';

const STORAGE_KEY = 'motoride_whats_new_seen_version';

type EntryKind = 'novedad' | 'arreglo';

type DayGroup = {
  /** Ej: "15 de abril de 2026" */
  label: string;
  entries: {
    /** Hora local legible, ej "20:15" */
    time: string;
    kind: EntryKind;
    text: string;
  }[];
};

/**
 * Cambios recientes (orden: día de más reciente a más antiguo; dentro de cada día, hora descendente).
 * Mantén el texto corto y claro para usuarios no técnicos.
 */
const CHANGELOG: DayGroup[] = [
  {
    label: '17 de abril de 2026',
    entries: [
      {
        time: '23:30',
        kind: 'novedad',
        text: 'En el mapa de ruta: aviso automático (unos 30 s) si hay posible lluvia en tu trazado o cerca de ti (≈10 km), con datos meteorológicos. Conduce con precaución.',
      },
    ],
  },
  {
    label: '16 de abril de 2026',
    entries: [
      {
        time: '22:00',
        kind: 'novedad',
        text: 'En el inicio, al tocar tu nivel (Lv.) o la barra de experiencia, entras a tu perfil igual que con el avatar.',
      },
      {
        time: '21:45',
        kind: 'arreglo',
        text: 'Bandeja de invitaciones a rutas: en el móvil ya aparece centrada en pantalla (antes quedaba pegada abajo y era incómoda).',
      },
      {
        time: '21:30',
        kind: 'arreglo',
        text: 'Rutas programadas: ya no hace falta escribir provincia y municipio a mano. Se toman del GPS del punto de salida al generar la ruta en el planificador; si no se pueden leer, se usa tu ubicación actual al guardar.',
      },
    ],
  },
  {
    label: '15 de abril de 2026',
    entries: [
      {
        time: '20:15',
        kind: 'novedad',
        text: 'Al volver al inicio, tus puntos y tu nivel se comprueban con el servidor y se guardan si hacía falta subir de nivel.',
      },
    ],
  },
  {
    label: '14 de abril de 2026',
    entries: [
      {
        time: '19:40',
        kind: 'arreglo',
        text: 'Ventanas del planificador y de previsualizar ruta: menos tirones al hacer scroll (fondo más ligero para el móvil).',
      },
      {
        time: '18:20',
        kind: 'arreglo',
        text: 'Si eras organizador, a veces no salía invitar amigos en «Mis próximas rutas»; ya debería mostrarse cuando toca.',
      },
      {
        time: '17:00',
        kind: 'novedad',
        text: 'Bloque «Rutas de amigos» movido abajo: queda justo encima de «Mis próximas rutas».',
      },
      {
        time: '15:30',
        kind: 'novedad',
        text: 'En rutas programadas: lista de apuntados con nombre, nivel y moto (solo si la tienes en tu perfil).',
      },
      {
        time: '12:00',
        kind: 'novedad',
        text: 'Este aviso de novedades: te enteras de cambios y arreglos sin tener que buscarlos.',
      },
      {
        time: '11:00',
        kind: 'novedad',
        text: 'Rutas con visibilidad (pública, solo amigos o privada), invitaciones por bandeja y salida al mapa/voz desde 1 h antes.',
      },
    ],
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
      className="fixed inset-0 z-[5800] flex items-center justify-center p-4 bg-zinc-950/90"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[min(88dvh,640px)] flex flex-col min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-8 pb-3 bg-gradient-to-b from-orange-500/12 to-transparent border-b border-zinc-800/80 shrink-0">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center ring-1 ring-orange-500/30">
              <Sparkles size={34} strokeWidth={2} />
            </div>
          </div>
          <h2 id="whats-new-title" className="text-center text-xl font-black text-white tracking-tight">
            Novedades en MotoRide
          </h2>
          <p className="text-center text-xs text-zinc-500 mt-2 font-medium leading-relaxed px-1">
            Fecha y hora orientativas de cada cambio. Las <span className="text-orange-400/95">novedades</span> son cosas nuevas; los{' '}
            <span className="text-emerald-400/95">arreglos</span> corrigen fallos o mejoran algo que ya existía.
          </p>
        </div>

        <div className="px-4 py-3 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0 [transform:translateZ(0)]">
          {CHANGELOG.map((day) => (
            <div key={day.label}>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2 px-1">{day.label}</h3>
              <ul className="space-y-2">
                {day.entries.map((entry, i) => (
                  <li
                    key={`${day.label}-${entry.time}-${i}`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-mono text-zinc-500 tabular-nums">{entry.time}</span>
                      {entry.kind === 'novedad' ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[9px] font-black uppercase text-orange-400">
                          <Sparkles size={9} /> Novedad
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-400">
                          <Wrench size={9} /> Arreglo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{entry.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 pt-2 border-t border-zinc-800/80 shrink-0 bg-zinc-900">
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
