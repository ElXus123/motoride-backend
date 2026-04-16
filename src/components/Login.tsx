import { signInWithGoogle } from '../firebase';
import appIcon from '../../ICONO.png';

export default function Login() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(234,88,12,0.12),transparent_55%)] bg-zinc-950 text-white pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
      <div className="flex w-full max-w-md flex-col items-center rounded-[2rem] border border-white/[0.07] bg-zinc-900/80 p-8 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.04] backdrop-blur-md">
        <div className="mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-inner">
          <img src={appIcon} alt="App Icon" className="h-full w-full object-cover" />
        </div>
        <h1 className="mb-3 text-4xl font-black tracking-tight">MotoRide</h1>
        <p className="mb-10 text-center leading-relaxed text-zinc-400">
          Únete a tu grupo, comparte rutas y rueda seguro viendo a tus compañeros en tiempo real.
        </p>
        <button 
          onClick={signInWithGoogle} 
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-4 font-semibold text-zinc-950 shadow-lg shadow-black/25 transition-all hover:bg-zinc-100 active:scale-[0.99]"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          Entrar con Google
        </button>
      </div>
    </div>
  );
}
