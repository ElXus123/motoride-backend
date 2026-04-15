import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type AppMessagePayload = {
  title?: string;
  message: string;
  variant?: 'info' | 'error' | 'success';
};

type ShowFn = (p: AppMessagePayload) => void;

const AppMessageContext = createContext<ShowFn>(() => {});

export function AppMessageProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<AppMessagePayload | null>(null);

  const show = useCallback((p: AppMessagePayload) => {
    setOpen(p);
  }, []);

  const close = useCallback(() => setOpen(null), []);

  return (
    <AppMessageContext.Provider value={show}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-md"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={open.title ? 'app-msg-title' : 'app-msg-body'}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/95 text-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.04]">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                {open.variant === 'error' ? (
                  <AlertCircle className="w-8 h-8 text-red-400 shrink-0" aria-hidden />
                ) : open.variant === 'success' ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" aria-hidden />
                ) : (
                  <Info className="w-8 h-8 text-orange-400 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  {open.title ? (
                    <h2 id="app-msg-title" className="font-black text-lg leading-tight text-white mb-2">
                      {open.title}
                    </h2>
                  ) : null}
                  <p
                    id="app-msg-body"
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${open.title ? 'text-zinc-300' : 'text-white font-semibold'}`}
                  >
                    {open.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t border-white/[0.06] bg-zinc-950/40 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <button
                type="button"
                onClick={close}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-black text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-105 active:scale-[0.99]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppMessageContext.Provider>
  );
}

export function useAppMessage(): ShowFn {
  return useContext(AppMessageContext);
}
