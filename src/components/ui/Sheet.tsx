import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Título visible; se enlaza con aria-labelledby */
  title: string;
  /** Texto secundario bajo el título */
  description?: string;
  children: React.ReactNode;
  /** Barra de acciones fija al pie (botones) */
  footer?: React.ReactNode;
  /** Cierra al pulsar el fondo (por defecto true) */
  dismissOnScrim?: boolean;
  /** Ancho máximo en PC (centrado). En móvil siempre ocupa el ancho y se ancla abajo. */
  size?: 'sm' | 'md';
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal de marca. En móvil es una hoja inferior; desde 640 px se centra.
 * role="dialog", aria-modal, Escape para cerrar, foco inicial dentro, Tab atrapado
 * y foco devuelto al elemento que abrió el modal. Sin animación si hay reduced-motion.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissOnScrim = true,
  size = 'md',
  className,
}: SheetProps) {
  const titleId = React.useId();
  const descId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  // Foco: guardar el disparador, enfocar el panel y devolver el foco al cerrar
  React.useEffect(() => {
    if (!open) return;
    const previous: HTMLElement | null = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel: HTMLElement | null = panelRef.current;
    const first: HTMLElement | null = panel ? panel.querySelector<HTMLElement>(FOCUSABLE) : null;
    const target: HTMLElement | null = first ?? panel;
    if (target) target.focus({ preventScroll: true });
    return () => {
      if (previous) previous.focus({ preventScroll: true });
    };
  }, [open]);

  // Bloquea el scroll de la página mientras el modal está abierto
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Tab atrapado dentro del panel
      const items: HTMLElement[] = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const firstEl: HTMLElement = items[0];
      const lastEl: HTMLElement = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === firstEl || active === panelRef.current)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[6000] flex items-end justify-center sm:items-center sm:p-4">
      {/* Fondo: tinta al 45 % */}
      <div
        aria-hidden="true"
        className="mr-scrim-enter absolute inset-0 bg-[#14110e73]"
        onClick={dismissOnScrim ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'mr-sheet relative flex w-full flex-col outline-none',
          'max-h-[88dvh] sm:max-h-[85dvh] sm:rounded-[22px] sm:border',
          'mr-sheet-enter',
          size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg',
          className,
        )}
        style={{ paddingBottom: 'var(--motoride-safe-bottom)' }}
      >
        {/* Asa de arrastre: solo visual, en móvil */}
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-mr-line-strong sm:hidden" />

        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="mr-title text-[1.75rem] leading-none">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1.5 text-sm leading-snug text-mr-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="mr-focus -mr-2 -mt-1 inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-mr-ink transition-colors hover:bg-mr-line"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">{children}</div>

        {footer ? (
          <footer className="flex flex-col gap-2 border-t border-mr-line px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
