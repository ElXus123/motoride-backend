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
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={open.title ? 'app-msg-title' : 'app-msg-body'}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl overflow-hidden text-white">
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
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <button
                type="button"
                onClick={close}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white font-black py-3 rounded-2xl transition-colors"
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
