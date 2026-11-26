import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mic, Radio, Route, Users } from 'lucide-react';
import { signInWithGoogle } from '../firebase';
import LoginBackdrop from './LoginBackdrop';

const FEATURES = [
  { icon: Radio, text: 'Ves a tu grupo en el mapa, en directo' },
  { icon: Route, text: 'Rutas compartidas y archivos GPX' },
  { icon: Mic, text: 'Hablas con tus compañeros mientras rodáis' },
  { icon: Users, text: 'Quedadas programadas con su hora y su sitio' },
] as const;

/**
 * Pantalla de acceso. Móvil: columna única. Escritorio (≥1024 px): marca a la izquierda, tarjeta a la derecha.
 * La entrada usa GSAP cargado en diferido; si falla o hay movimiento reducido, todo se muestra sin animar.
 */
export default function Login() {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const showAll = () => {
      root.querySelectorAll<HTMLElement>('[data-intro]').forEach((el) => {
        el.style.opacity = '1';
      });
    };
    if (reduceMotion) {
      showAll();
      return;
    }

    let cancelled = false;
    let revert: (() => void) | undefined;

    void import('gsap')
      .then(({ gsap }) => {
        if (cancelled) return;
        const ctx = gsap.context(() => {
          gsap
            .timeline({ defaults: { ease: 'power3.out' } })
            .fromTo(
              '[data-intro="logo"]',
              { opacity: 0, scale: 0.84 },
              { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out' }
            )
            .fromTo('[data-intro="title"]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, '-=0.4')
            .fromTo('[data-intro="tagline"]', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45 }, '-=0.3')
            .fromTo(
              '[data-intro="feature"]',
              { opacity: 0, x: -10 },
              { opacity: 1, x: 0, duration: 0.4, stagger: 0.06 },
              '-=0.25'
            )
            .fromTo(
              '[data-intro="card"]',
              { opacity: 0, y: 20 },
              { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' },
              '-=0.5'
            );
        }, root);
        revert = () => ctx.revert();
      })
      .catch(showAll);

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [reduceMotion]);

  return (
    <div ref={rootRef} className="relative min-h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <LoginBackdrop />
      {/* Horizonte ámbar: una sola luz, no un degradado genérico */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%] bg-[radial-gradient(ellipse_80%_55%_at_30%_0%,rgba(245,138,31,0.16),transparent_70%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center gap-10 px-5 pt-[max(2.5rem,env(safe-area-inset-top,0px))] pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] sm:px-8 lg:flex-row lg:justify-between lg:gap-16 lg:px-12">
        <section className="flex w-full max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
          <img
            data-intro="logo"
            src="/ICONO-512.webp"
            alt=""
            width={96}
            height={96}
            style={{ opacity: 0 }}
            className="mr-logo-breathe mb-6 h-20 w-20 rounded-[1.4rem] object-cover lg:h-24 lg:w-24"
          />

          <p data-intro="tagline" style={{ opacity: 0 }} className="mr-eyebrow mb-2">
            Rutas en moto, en grupo
          </p>
          <h1
            data-intro="title"
            style={{ opacity: 0 }}
            className="text-6xl uppercase leading-[0.9] tracking-normal text-zinc-50 sm:text-7xl lg:text-[6.5rem]"
          >
            Moto<span className="text-orange-400">Ride</span>
          </h1>

          <p data-intro="tagline" style={{ opacity: 0 }} className="mt-5 max-w-md text-base leading-relaxed text-zinc-400 sm:text-lg">
            Sal con tu grupo, comparte la ruta y mira dónde está cada uno mientras rodáis.
          </p>

          <div className="mr-perf mt-8 w-full max-w-md opacity-70" aria-hidden />
          <ul className="mt-6 w-full max-w-md divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li
                key={text}
                data-intro="feature"
                style={{ opacity: 0 }}
                className="flex items-center gap-3.5 py-3.5 text-left text-[0.9375rem] text-zinc-300"
              >
                <Icon size={18} strokeWidth={2} aria-hidden className="shrink-0 text-orange-400" />
                <span className="leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          data-intro="card"
          style={{ opacity: 0 }}
          className="mr-sheet w-full max-w-md p-6 sm:p-8"
        >
          <h2 className="text-[2rem] uppercase leading-none text-zinc-50">Entra y sal a rodar</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Usa tu cuenta de Google para ver tus grupos, tus rutas y las quedadas que tienes apuntadas.
          </p>

          <motion.button
            type="button"
            onClick={signInWithGoogle}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="mr-focus mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-control)] bg-zinc-50 px-6 py-3.5 font-semibold text-zinc-950 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] transition-colors hover:bg-white"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6"
            />
            Continuar con Google
          </motion.button>
        </section>
      </div>
    </div>
  );
}
