/**
 * Esqueleto inmediato mientras se descarga el chunk del mapa (MapView + Leaflet).
 * Se muestra como fallback de Suspense: la pantalla responde al instante aunque las teselas tarden.
 */
export default function MapSkeleton({ label = 'Cargando mapa…' }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-[5000] overflow-hidden bg-[#dfe0e6]"
      role="status"
      aria-live="polite"
    >
      <div
        className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,#c9cad3_1px,transparent_1px),linear-gradient(to_bottom,#c9cad3_1px,transparent_1px)] [background-size:64px_64px]"
        aria-hidden
      />
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/30 via-transparent to-black/5" aria-hidden />
      <div className="absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top,0px))] mx-auto flex w-fit items-center gap-2 rounded-full bg-zinc-950/85 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-lg backdrop-blur">
        <span className="h-2.5 w-2.5 animate-ping rounded-full bg-orange-500" aria-hidden />
        {label}
      </div>
    </div>
  );
}
