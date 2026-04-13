import { Crown } from 'lucide-react';

export default function PremiumBadge({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/40 p-0.5"
        title="Premium"
      >
        <Crown size={11} strokeWidth={2.5} className="shrink-0" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide border border-amber-500/35"
      title="Cuenta Premium"
    >
      <Crown size={10} strokeWidth={2.5} className="shrink-0" />
      Premium
    </span>
  );
}
