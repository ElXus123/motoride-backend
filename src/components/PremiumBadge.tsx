import { Crown } from 'lucide-react';

export default function PremiumBadge({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-mr-accent/25 text-mr-accent-text border border-mr-accent/60 p-0.5"
        title="Premium"
      >
        <Crown size={11} strokeWidth={2.5} className="shrink-0" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-mr-accent/15 text-mr-accent-text px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide border border-mr-accent/60"
      title="Cuenta Premium"
    >
      <Crown size={10} strokeWidth={2.5} className="shrink-0" />
      Premium
    </span>
  );
}
