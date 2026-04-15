import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import appLogo from '../../ICONO.png';

/** Sube este valor cuando cambien las novedades para volver a mostrar el aviso una vez por dispositivo. */
export const WHATS_NEW_VERSION = '2026.04.15c';

const STORAGE_KEY = 'motoride_whats_new_seen_version';

/** Textos breves para cualquier usuario (sin tecnicismos). */
const HIGHLIGHTS: string[] = [
  'Inclinómetro: a muy baja velocidad se apoya más en la gravedad (moto parada o casi); al ir más rápido combina giro, gravedad y la física de la curva para que el ángulo sea más estable y fiel.',
  'Mapa al grabar: la cámara se aleja un poco cuando vas más rápido y se carga más mapa de reserva al girar la vista con el rumbo, para que no se vean huecos en los bordes.',
  'Navegación por ruta: iconos de giro más claros (flecha en L gruesa, rotondas y salidas de autovía con dibujos propios).',
  'Resumen al terminar la ruta: pantalla de cierre más cuidada y una imagen para compartir con mejor diseño (WhatsApp, etc.).',
  'Archivos GPX: lectura más fiable (más tipos de track) y mensajes claros al subir o si el archivo no trae una ruta válida.',
  'Al planificar una ruta: si subes un archivo GPX, el buscador de destino se oculta y ves distancia y tiempo estimado; puedes volver al buscador con un solo toque. En salidas espontáneas el GPX no está en este cuadro (sigue disponible desde el mapa).',
  'Dos ceros guardados: uno con el móvil en el soporte o manillar y otro en bolsillo o MirrorLink; al terminar la cuenta atrás del modo bolsillo se ajusta el cero con el teléfono ya guardado.',
  'Si llevas el móvil suelto en el pantalón, la inclinación va más suavizada para que en la pantalla de la moto no salten tanto los números.',
  'Si vas a rodar y puede llover en tu ruta o cerca de ti (unos 10 km), verás un aviso unos segundos. Conduce con cuidado.',
  'Instalación en iPhone: en Safari usa Compartir → Añadir a pantalla de inicio. En Chrome, Compartir → Ver más → Añadir a pantalla de inicio.',
  'Rutas con amigos: invitaciones, visibilidad de rutas y lista de apuntados en rutas programadas.',
  'Perfil con tu moto, historial de rutas y repetir una ruta; en el mapa, anillos de nivel alrededor de los avatares.',
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
            Un resumen de lo que hemos mejorado. Puedes cerrar esto y seguir usando la app con normalidad.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0 [transform:translateZ(0)]">
          <ul className="space-y-3 text-left">
            {HIGHLIGHTS.map((text, i) => (
              <li
                key={i}
                className="flex gap-3 text-sm text-zinc-300 leading-relaxed border border-zinc-800/80 bg-zinc-950/50 rounded-2xl px-3.5 py-2.5"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500/90" aria-hidden />
                <span>{text}</span>
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
