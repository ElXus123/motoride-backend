import { useId, useMemo } from 'react';
import { ChevronDown, MapPin, X } from 'lucide-react';
import { EXPLORE_NONE_KEY, formatPlaceLabel, type ExploreOption, type ExploreProvinceOption } from '../lib/exploreRouteFilters';

type Props = {
  provinces: ExploreProvinceOption[];
  provinceKey: string;
  localityKey: string;
  onProvinceChange: (key: string) => void;
  onLocalityChange: (key: string) => void;
  onClear: () => void;
  /** Rutas que cumplen la selección actual (para el texto de estado). */
  matchCount: number;
};

const selectClass =
  'mr-focus peer w-full min-h-[48px] appearance-none rounded-[var(--radius-control)] border border-white/[0.12] bg-zinc-950/80 pl-11 pr-11 text-base sm:text-sm font-semibold text-zinc-100 transition-colors duration-200 hover:border-white/25 focus:border-orange-500 disabled:cursor-not-allowed disabled:opacity-45';

const plural = (n: number) => (n === 1 ? 'ruta' : 'rutas');

/** Desplegables en cascada: primero provincia, luego localidad (solo las que tienen rutas). */
export default function ExplorePlaceSelects({
  provinces,
  provinceKey,
  localityKey,
  onProvinceChange,
  onLocalityChange,
  onClear,
  matchCount,
}: Props) {
  const provinceId = useId();
  const localityId = useId();
  const statusId = useId();

  // Si la selección viene de la ubicación GPS y aún no hay rutas en esa provincia, se muestra igualmente.
  const options = useMemo(() => {
    if (!provinceKey || provinces.some((p) => p.key === provinceKey)) return provinces;
    const extra: ExploreProvinceOption = {
      key: provinceKey,
      label: formatPlaceLabel(provinceKey),
      count: 0,
      localities: [],
    };
    return [...provinces, extra];
  }, [provinces, provinceKey]);

  const selectedProvince = options.find((p) => p.key === provinceKey);
  const localities: ExploreOption[] = selectedProvince?.localities ?? [];
  const selectedLocality = localities.find((l) => l.key === localityKey);
  const localityTotal = selectedProvince?.count ?? 0;

  const statusText = !provinceKey
    ? 'Elige una provincia para ver sus rutas.'
    : `${matchCount} ${plural(matchCount)} en ${selectedLocality ? selectedLocality.label : selectedProvince?.label ?? 'esta zona'}${
        selectedLocality || !selectedProvince ? '' : ' (todas las localidades)'
      }.`;

  return (
    <div className="flex w-full flex-col gap-3 md:w-[30rem]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={provinceId} className="mr-eyebrow">
            Provincia
          </label>
          <div className="relative">
            <MapPin aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" size={16} />
            <select
              id={provinceId}
              value={provinceKey}
              onChange={(e) => onProvinceChange(e.target.value)}
              className={selectClass}
              aria-describedby={statusId}
            >
              <option value="">Elige provincia</option>
              {options.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} · {p.count} {plural(p.count)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 peer-focus:text-orange-400" size={18} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={localityId} className={`mr-eyebrow ${provinceKey ? '' : 'opacity-50'}`}>
            Localidad
          </label>
          <div className="relative">
            <MapPin aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-orange-400/70" size={16} />
            <select
              id={localityId}
              value={localityKey}
              onChange={(e) => onLocalityChange(e.target.value)}
              disabled={!provinceKey}
              className={selectClass}
              aria-describedby={statusId}
            >
              <option value="">{provinceKey ? `Todas las localidades · ${localityTotal} ${plural(localityTotal)}` : 'Elige antes la provincia'}</option>
              {localities.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label} · {l.count} {plural(l.count)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 peer-focus:text-orange-400" size={18} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p id={statusId} role="status" aria-live="polite" className="min-w-0 text-xs leading-snug text-zinc-400">
          {statusText}
          {provinceKey === EXPLORE_NONE_KEY ? ' Rutas creadas sin provincia.' : ''}
        </p>
        {(provinceKey || localityKey) && (
          <button
            type="button"
            onClick={onClear}
            className="mr-focus inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-xs font-bold text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <X size={14} aria-hidden />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
