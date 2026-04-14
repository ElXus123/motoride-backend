import { useEffect, useState } from 'react';
import { Check, Sparkles, Wrench } from 'lucide-react';
import appLogo from '../../ICONO.png';

/** Sube este valor cuando cambien las novedades para volver a mostrar el aviso una vez por dispositivo. */
export const WHATS_NEW_VERSION = '2026.04.15';

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
 * Incluye trabajo documentado desde el bloque 11 de CONTEXTO_APP.txt y mejoras posteriores.
 */
const CHANGELOG: DayGroup[] = [
  {
    label: '14 de abril de 2026',
    entries: [
      {
        time: '23:45',
        kind: 'novedad',
        text: 'Ventana de novedades renovada: cabecera con el logo de MotoRide y lista actualizada con todo lo publicado desde la última nota de contexto.',
      },
      {
        time: '22:30',
        kind: 'novedad',
        text: 'Mapa de ruta: aviso automático (unos 30 s) si puede llover en tu trazado o cerca de ti (≈10 km), con datos de Open-Meteo. Recuerda conducir con precaución.',
      },
      {
        time: '21:10',
        kind: 'novedad',
        text: 'En el inicio, al tocar tu nivel (Lv.) o la barra de experiencia entras al perfil igual que con el avatar.',
      },
      {
        time: '20:50',
        kind: 'arreglo',
        text: 'Bandeja de invitaciones a rutas: en móvil queda centrada en pantalla (antes podía quedar incómoda abajo).',
      },
      {
        time: '20:20',
        kind: 'arreglo',
        text: 'Rutas programadas: provincia y municipio se toman del punto de salida con GPS al planificar; si no se leen, se usa tu ubicación al guardar.',
      },
      {
        time: '19:30',
        kind: 'novedad',
        text: 'Al volver al inicio, tus puntos y tu nivel se sincronizan con el servidor y se guardan si correspondía subir de nivel.',
      },
      {
        time: '18:45',
        kind: 'arreglo',
        text: 'Ventanas del planificador y de previsualizar ruta: scroll más suave en móvil (menos tirones del fondo).',
      },
      {
        time: '18:00',
        kind: 'arreglo',
        text: 'Si eras organizador, a veces no aparecía invitar amigos en «Mis próximas rutas»; debería mostrarse cuando corresponda.',
      },
      {
        time: '17:15',
        kind: 'novedad',
        text: 'Bloque «Rutas de amigos» reubicado: justo encima de «Mis próximas rutas».',
      },
      {
        time: '16:30',
        kind: 'novedad',
        text: 'Rutas programadas: lista de apuntados con nombre, nivel y moto (si la tienes en tu perfil).',
      },
      {
        time: '15:00',
        kind: 'novedad',
        text: 'Este aviso de novedades: te enteras de cambios y arreglos sin tener que buscarlos.',
      },
      {
        time: '14:00',
        kind: 'novedad',
        text: 'Rutas con visibilidad (pública, solo amigos o privada), invitaciones por bandeja y salida al mapa/voz desde 1 h antes.',
      },
      {
        time: '13:00',
        kind: 'novedad',
        text: 'Crear ruta: provincia y municipio sugeridos por GPS; búsqueda Nominatim prioriza ciudad frente a POIs sueltos. El historial de rutas pasa al perfil.',
      },
      {
        time: '12:00',
        kind: 'novedad',
        text: 'Perfil: campo «Tu moto», historial de rutas con borrar y «Repetir ruta». Cabecera del inicio con anillo de nivel/premium.',
      },
      {
        time: '11:00',
        kind: 'novedad',
        text: 'Mapa: avatares con «aro» según nivel y premium. Explorador de rutas con visibilidad y reglas de quién puede ver cada ruta.',
      },
      {
        time: '10:15',
        kind: 'novedad',
        text: 'Mensajes globales de la app (info, éxito, error) y buzón de invitaciones unificado con el flujo de grupo y rutas.',
      },
      {
        time: '09:30',
        kind: 'novedad',
        text: 'Inclinación y estimación de moto refinadas; invitaciones de amistad con IDs unificados y reintento si la amistad estaba desincronizada.',
      },
      {
        time: '09:00',
        kind: 'arreglo',
        text: 'Mapa: mejor elección de destinos ambiguos, avisos apilados sin tapar el HUD, iPhone con modo horizontal forzado si hace falta.',
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
