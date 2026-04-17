import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import appLogo from '../../ICONO.png';

/** Sube este valor cuando cambien las novedades para volver a mostrar el aviso una vez por dispositivo. */
export const WHATS_NEW_VERSION = '2026.05.17';

const STORAGE_KEY = 'motoride_whats_new_seen_version';

export type ChangelogKind = 'novedad' | 'arreglo';

export type ChangelogEntry = {
  kind: ChangelogKind;
  text: string;
  /** Fecha/hora de la modificación (ISO 8601 local conceptual; sirve para ordenar). */
  updatedAt: string;
};

/** Orden visual: más recientes arriba; `updatedAt` descendente. */
const CHANGELOG: ChangelogEntry[] = [
  {
    kind: 'arreglo',
    text: 'Mapa con el rumbo arriba en marcha: corregidos los huecos grises en las esquinas al girar el mapa; la capa se escala para cubrir siempre el marco de la pantalla.',
    updatedAt: '2026-05-17T12:00:00',
  },
  {
    kind: 'arreglo',
    text: 'Desactivada la detección automática de «caída» que podía disparar un aviso al inclinar mucho el móvil estando casi parado; el resto de alertas manuales del menú no cambia.',
    updatedAt: '2026-05-17T11:55:00',
  },
  {
    kind: 'novedad',
    text: 'Notificaciones: barra inferior «Activar» para pedir el permiso del navegador con un toque (necesario en muchos móviles); así encajan mejor los avisos de invitación a ruta y amistad.',
    updatedAt: '2026-05-17T11:50:00',
  },
  {
    kind: 'novedad',
    text: 'Notificaciones del sistema (navegador): si aceptas el permiso, la app puede avisarte ~1 h antes de una ruta programada a la que vas apuntado, cuando recibes una invitación a ruta (bandeja o invitación en curso) y cuando tienes una solicitud de amistad nueva.',
    updatedAt: '2026-05-02T14:00:00',
  },
  {
    kind: 'novedad',
    text: 'Perfil y nivel: progreso hacia el siguiente nivel más claro y coherente con el guardado en servidor; el panel de administración de puntos incluye más detalle y acciones.',
    updatedAt: '2026-05-02T13:45:00',
  },
  {
    kind: 'novedad',
    text: 'HUD del mapa: velocidad del viento (km/h, Open-Meteo) y flecha relativa a tu rumbo de GPS/navegación («arriba» = sentido de marcha) para leer mejor viento de frente, lateral o a favor.',
    updatedAt: '2026-05-02T13:30:00',
  },
  {
    kind: 'arreglo',
    text: 'Chat de voz: al volver la conexión el micrófono pasa otra vez a verde; el modo «Reconectando» está más pulido (texto y aspecto).',
    updatedAt: '2026-05-01T11:30:00',
  },
  {
    kind: 'novedad',
    text: 'Chat de voz: si pierdes cobertura o hay un corte breve, el botón del micrófono muestra un círculo de carga y debajo «Reconectando» hasta que la sesión vuelva a estabilizarse.',
    updatedAt: '2026-04-30T11:00:00',
  },
  {
    kind: 'novedad',
    text: 'Historial de rutas (tu perfil y el de tus amigos): tarjetas con título, fecha y hora, distancia y puntos; los puntos se destacan en color para leerlos mejor.',
    updatedAt: '2026-04-30T10:30:00',
  },
  {
    kind: 'novedad',
    text: 'Geolocalización en el mapa: hemos mejorado cómo se muestra la posición; tu flecha y los avatares de los demás van ahora más suaves, con menos saltos y sensación de seguimiento más fluido al navegar.',
    updatedAt: '2026-04-29T10:00:00',
  },
  {
    kind: 'novedad',
    text: 'Enlace con ?join= a una ruta programada: la app pregunta si quieres apuntarte; al confirmar quedas en la lista sin entrar al mapa GPS (el mapa en vivo sigue siendo desde 1 h antes, como siempre).',
    updatedAt: '2026-04-28T12:00:00',
  },
  {
    kind: 'novedad',
    text: 'Invitar desde el mapa: si tu amigo aún no se ha unido al grupo, puedes pulsar «Reenviar» para volver a mandarle la invitación a la bandeja.',
    updatedAt: '2026-04-28T11:50:00',
  },
  {
    kind: 'arreglo',
    text: 'Invitados en una ruta en vivo: corregidas las reglas del servidor para poder abandonar el grupo con «Salir»; si algo falla, verás un mensaje en lugar de quedar bloqueado.',
    updatedAt: '2026-04-28T11:40:00',
  },
  {
    kind: 'arreglo',
    text: 'Al salir de la ruta con el modal de invitar abierto o con resumen de participante: el resumen queda por encima y se cierra el invitar para que «Salir» y «Continuar» respondan bien.',
    updatedAt: '2026-04-28T11:35:00',
  },
  {
    kind: 'novedad',
    text: 'Rutas programadas: si vas apuntado (no solo el organizador), también puedes invitar amigos y copiar código o enlace desde «Mis próximas rutas».',
    updatedAt: '2026-04-28T11:30:00',
  },
  {
    kind: 'novedad',
    text: 'Resumen al terminar la ruta: un solo botón «Continuar». El historial solo guarda rutas de más de 5 km; los puntos y la distancia total en tu perfil se suman siempre.',
    updatedAt: '2026-04-27T14:00:00',
  },
  {
    kind: 'novedad',
    text: 'Interfaz más pulida: tipografía Plus Jakarta Sans, pantalla de acceso, avisos del sistema y cabecera del panel con un aspecto más claro y profesional.',
    updatedAt: '2026-04-27T13:45:00',
  },
  {
    kind: 'novedad',
    text: 'Apaisado: el menú «Opciones de mapa» (rueda, Modificar ruta, capa lluvia, etc.) usa más alto útil y ancho, con scroll cómodo para ver toda la lista.',
    updatedAt: '2026-04-26T12:00:00',
  },
  {
    kind: 'novedad',
    text: 'Anfitrión: si aún no has pulsado «Iniciar grabación», al moverte unos 20 m la app inicia la grabación sola (misma acción que el botón).',
    updatedAt: '2026-04-26T11:45:00',
  },
  {
    kind: 'arreglo',
    text: 'Inclinómetro en horizontal: al girar el móvil, la inclinación a derecha/izquierda coincide mejor con la realidad (signo en apaisado).',
    updatedAt: '2026-04-24T19:30:00',
  },
  {
    kind: 'arreglo',
    text: 'Búsqueda «Huesca» y similares: se prioriza la ciudad frente a poblaciones homónimas (p. ej. Adahuesca) y se reduce ruido en Nominatim.',
    updatedAt: '2026-04-24T19:00:00',
  },
  {
    kind: 'novedad',
    text: 'Anfitrión: botón «Iniciar grabación» en el HUD si aún no hay marcha; Pausa y Finalizar visibles desde el inicio de la grabación y sin recortes en pantallas estrechas.',
    updatedAt: '2026-04-24T18:00:00',
  },
  {
    kind: 'novedad',
    text: 'Invitado: al salir de la ruta con la marcha en curso, mismo resumen y puntos que al terminar; vuelves al menú al cerrar el resumen.',
    updatedAt: '2026-04-24T17:30:00',
  },
  {
    kind: 'novedad',
    text: 'Ruta en marcha: el anfitrión puede pausar la grabación sin cerrar el grupo; el tiempo en pausa no cuenta en el resumen. Si cierras la web en pausa, aviso al volver.',
    updatedAt: '2026-04-20T11:00:00',
  },
  {
    kind: 'novedad',
    text: 'Gastos de comida o bebida (opcional) en el resumen con reparto a escote; no salen en la imagen al compartir.',
    updatedAt: '2026-04-20T10:45:00',
  },
  {
    kind: 'arreglo',
    text: 'GPS en mapa: posición visible al abrir el grupo aunque aún no se haya iniciado la grabación.',
    updatedAt: '2026-04-18T16:20:00',
  },
  {
    kind: 'novedad',
    text: 'Iconos de giro en navegación (flechas en L, rotondas con salida, enlaces y rampas).',
    updatedAt: '2026-04-17T12:00:00',
  },
  {
    kind: 'novedad',
    text: 'Inclinómetro adaptado al móvil en horizontal (remap de sensores según orientación de pantalla).',
    updatedAt: '2026-04-16T15:00:00',
  },
  {
    kind: 'novedad',
    text: 'Mapa al grabar: zoom según velocidad y más teselas de reserva al girar el mapa con el rumbo.',
    updatedAt: '2026-04-16T14:30:00',
  },
  {
    kind: 'novedad',
    text: 'Resumen al terminar la ruta con imagen para compartir rediseñada; GPX con lectura más robusta.',
    updatedAt: '2026-04-15T10:00:00',
  },
  {
    kind: 'novedad',
    text: 'Planificar con archivo GPX: el buscador se oculta, tiempo estimado; botón para volver al buscador. Espontánea sin GPX en el modal (sigue en el mapa).',
    updatedAt: '2026-04-15T09:30:00',
  },
  {
    kind: 'novedad',
    text: 'Dos ceros de inclinación: manillar/soporte y bolsillo/MirrorLink; calibración al terminar la cuenta atrás en bolsillo.',
    updatedAt: '2026-04-14T18:00:00',
  },
  {
    kind: 'arreglo',
    text: 'Inclinación en bolsillo más suavizada para que no «salten» tanto los números en pantalla.',
    updatedAt: '2026-04-14T17:45:00',
  },
  {
    kind: 'novedad',
    text: 'Aviso si puede llover en tu ruta o cerca (~10 km).',
    updatedAt: '2026-04-14T12:00:00',
  },
  {
    kind: 'novedad',
    text: 'Instalación en iPhone: Safari o Chrome (Compartir → Añadir a pantalla de inicio).',
    updatedAt: '2026-04-14T11:00:00',
  },
  {
    kind: 'novedad',
    text: 'Rutas con amigos: invitaciones, visibilidad y lista de apuntados en programadas; enlace con día de salida.',
    updatedAt: '2026-04-13T16:00:00',
  },
  {
    kind: 'novedad',
    text: 'Perfil con tu moto, historial y repetir ruta; anillos de nivel en avatares del mapa.',
    updatedAt: '2026-04-12T10:00:00',
  },
];

function formatChangelogDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  const sortedEntries = useMemo(() => {
    return [...CHANGELOG].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, []);

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
            Arriba lo más reciente; abajo entradas anteriores. Cada ítem indica si es novedad o arreglo y cuándo se registró.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 [transform:translateZ(0)]">
          <ul className="space-y-3 text-left">
            {sortedEntries.map((entry, i) => (
              <li
                key={`${entry.updatedAt}-${i}`}
                className="flex flex-col gap-2 border border-zinc-800/80 bg-zinc-950/50 rounded-2xl px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${
                      entry.kind === 'novedad'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-200 border border-amber-500/35'
                    }`}
                  >
                    {entry.kind === 'novedad' ? 'Novedad' : 'Arreglo'}
                  </span>
                  <time
                    className="text-[10px] font-mono tabular-nums text-zinc-500"
                    dateTime={entry.updatedAt}
                  >
                    {formatChangelogDate(entry.updatedAt)}
                  </time>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">{entry.text}</p>
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
