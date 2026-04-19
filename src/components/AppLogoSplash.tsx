/**
 * Splash con logo de la app (sin spinner naranja): uso en carga de auth y en MainApp.
 */
export default function AppLogoSplash({
  className = '',
  zClassName = 'z-[10000]',
}: {
  className?: string;
  /** Tailwind z-index (p. ej. z-[9999] bajo MainApp). */
  zClassName?: string;
}) {
  return (
    <div
      className={`fixed inset-0 ${zClassName} flex flex-col items-center justify-center bg-black ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center">
        <div className="relative mb-8">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl overflow-hidden ring-4 ring-orange-500/20 shadow-[0_0_60px_-15px_rgba(249,115,22,0.5)]">
            <img
              src="/ICONO.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
            <div
              className="absolute inset-0 whats-new-logo-gleam pointer-events-none mix-blend-overlay"
              style={{
                background:
                  'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0.15) 55%, transparent 100%)',
                width: '42%',
                height: '160%',
                top: '-30%',
              }}
            />
          </div>
          <div
            className="absolute left-0 top-0 h-24 w-24 scale-y-[-1] [transform:rotateX(12deg)_scaleY(-1)] origin-top [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.2)_45%,transparent_100%)] [webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.2)_45%,transparent_100%)] mix-blend-overlay blur-[0.35px] brightness-105"
            aria-hidden
          />
        </div>
        <p className="text-sm font-semibold text-zinc-300">Cargando MotoRide</p>
      </div>
    </div>
  );
}
