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
  // 256 px (25 kB): se muestra a 112 px; el de 512 px pesa 83 kB sin aportar nada en pantalla.
  const [src, setSrc] = useState('/ICONO-256.webp');

  return (
    <div
      className={`fixed inset-0 ${zClassName} flex flex-col items-center justify-center overflow-hidden bg-mr-page px-6 ${className}`}
      role="status"
      aria-live="polite"
    >
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

        {/* Línea de ruta: base discontinua en tinta suave y trazo ámbar que avanza */}
        <svg className="mt-9 h-8 w-56" viewBox="0 0 224 32" fill="none" aria-hidden>
          <path
            d="M4 22 C 40 22, 52 6, 92 10 S 150 28, 220 8"
            stroke="rgb(20 17 14 / 0.16)"
            strokeWidth="3"
            strokeLinecap="round"
            className="mr-route-line"
            strokeDasharray="6 9"
          />
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

        <p className="mr-title mt-1 text-xl uppercase tracking-[0.18em] text-mr-ink">MotoRide</p>
        <p className="mr-eyebrow mt-3">Preparando la ruta…</p>
      </div>
    </div>
  );
}
