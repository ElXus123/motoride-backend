/**
 * Esqueleto del perfil mientras se descarga su chunk. Mismo fondo que Profile (tinta oscura)
 * para que al abrir el perfil no aparezca ningún fotograma claro ni vacío.
 */
export default function ProfileSkeleton() {
  return (
    <div
      className="min-h-dvh bg-zinc-950 text-white pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
      role="status"
      aria-live="polite"
      aria-label="Cargando perfil"
    >
      <div className="max-w-md mx-auto pt-4 pb-8 animate-pulse">
        <div className="flex items-center gap-4 mb-8">
          <span className="h-10 w-10 rounded-full bg-zinc-900" aria-hidden />
          <span className="h-10 w-44 rounded-xl bg-zinc-900" aria-hidden />
        </div>
        <div className="flex flex-col items-center gap-4 mb-8">
          <span className="h-28 w-28 rounded-full bg-zinc-900 ring-1 ring-white/[0.06]" aria-hidden />
          <span className="h-5 w-40 rounded-md bg-zinc-900" aria-hidden />
          <span className="h-3.5 w-24 rounded-md bg-zinc-900/70" aria-hidden />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-20 rounded-2xl bg-zinc-900 ring-1 ring-white/[0.05]" aria-hidden />
          ))}
        </div>
        <span className="block h-16 rounded-2xl bg-zinc-900/80 mb-3" aria-hidden />
        <span className="block h-16 rounded-2xl bg-zinc-900/60" aria-hidden />
      </div>
    </div>
  );
}
