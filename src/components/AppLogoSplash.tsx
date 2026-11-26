import { useState } from 'react';

/**
 * Pantalla de carga de marca: logo del icono + una línea de ruta que se dibuja en bucle.
 * Si el WebP no carga, cae al PNG de 512 px; nunca deja un hueco vacío.
 * Sin spinner genérico: el trazo de ruta es el indicador de progreso.
 */
export default function AppLogoSplash({
  className = '',
  zClassName = 'z-[10000]',
}: {
  className?: string;
  /** Tailwind z-index (p. ej. z-[9999] bajo MainApp). */
  zClassName?: string;
}) {
  const [src, setSrc] = useState('/ICONO-512.webp');

  return (
    <div
      className={`fixed inset-0 ${zClassName} flex flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Horizonte tenue: un resplandor ámbar bajo el logo, sin gradientes de plantilla */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(245,138,31,0.14),transparent_70%)]"
      />

      <div className="relative flex flex-col items-center">
        <img
          src={src}
          alt="MotoRide"
          width={112}
          height={112}
          decoding="async"
          fetchPriority="high"
          onError={() => setSrc('/icon-512.png')}
          className="mr-logo-breathe h-28 w-28 rounded-[1.75rem] object-cover"
        />

        <svg
          className="mt-9 h-8 w-56"
          viewBox="0 0 224 32"
          fill="none"
          aria-hidden
        >
          <path d="M4 22 C 40 22, 52 6, 92 10 S 150 28, 220 8" stroke="rgb(39 38 35)" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M4 22 C 40 22, 52 6, 92 10 S 150 28, 220 8"
            stroke="#f58a1f"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            className="mr-route-travel"
            style={{ strokeDasharray: '34 66' }}
          />
        </svg>

        <p className="mr-display mt-1 text-lg uppercase tracking-[0.18em] text-zinc-300">MotoRide</p>
        <p className="mr-eyebrow mt-3 text-[0.625rem] text-orange-400/80">Preparando la ruta…</p>
      </div>
    </div>
  );
}
