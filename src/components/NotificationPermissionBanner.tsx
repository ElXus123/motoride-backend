import { useCallback, useState, type ReactElement } from 'react';
import { Bell, X } from 'lucide-react';

const SNOOZE_KEY = 'motoride_notif_prompt_snooze_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function notificationsSupported(): boolean {
  return typeof globalThis !== 'undefined' && 'Notification' in globalThis;
}

function readSnoozeUntil(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SNOOZE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeSnoozeUntil(until: number): void {
  try {
    globalThis.localStorage?.setItem(SNOOZE_KEY, String(until));
  } catch {
    /* ignore */
  }
}

/**
 * Barra fija: pide permiso de notificaciones con gesto de usuario (necesario en muchos móviles).
 * Las invitaciones a ruta usan la Web Notification API vía `useMotorideSystemNotifications`.
 */
export default function NotificationPermissionBanner(): ReactElement | null {
  const [snoozeUntil, setSnoozeUntil] = useState(() => readSnoozeUntil());
  const [busy, setBusy] = useState(false);

  const snoozeActive = snoozeUntil > Date.now();
  const permission = notificationsSupported() ? globalThis.Notification.permission : 'denied';
  const visible = permission === 'default' && !snoozeActive;

  const onLater = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    writeSnoozeUntil(until);
    setSnoozeUntil(until);
  }, []);

  const onActivate = useCallback(async () => {
    if (!notificationsSupported() || busy) return;
    setBusy(true);
    try {
      await globalThis.Notification.requestPermission();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const onClose = useCallback(() => {
    onLater();
  }, [onLater]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[11500] border-t border-white/[0.08] bg-zinc-900/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
      role="region"
      aria-label="Activar notificaciones"
    >
      <div className="mx-auto flex max-w-lg items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-400">
          <Bell size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-bold text-white">¿Activar avisos en el teléfono?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
            Así te avisamos cuando te inviten a una ruta o tengas solicitudes de amistad, aunque MotoRide esté en segundo
            plano (según el navegador o si instalaste la app).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onActivate()}
              disabled={busy}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-zinc-950 hover:bg-orange-400 disabled:opacity-60"
            >
              {busy ? 'Abriendo…' : 'Activar'}
            </button>
            <button
              type="button"
              onClick={onLater}
              className="rounded-xl border border-zinc-600 bg-zinc-800/80 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xl p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
