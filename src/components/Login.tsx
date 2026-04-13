import { signInWithGoogle } from '../firebase';
import appIcon from '../../ICONO.png';

export default function Login() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-md w-full">
        <div className="w-20 h-20 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 overflow-hidden border border-zinc-700">
          <img src={appIcon} alt="App Icon" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-4xl font-bold mb-3 tracking-tight">MotoRide</h1>
        <p className="text-zinc-400 mb-10 text-center leading-relaxed">
          Únete a tu grupo, comparte rutas y rueda seguro viendo a tus compañeros en tiempo real.
        </p>
        <button 
          onClick={signInWithGoogle} 
          className="w-full bg-white hover:bg-zinc-200 text-black px-6 py-4 rounded-full font-semibold flex items-center justify-center gap-3 transition-colors"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          Entrar con Google
        </button>
      </div>
    </div>
  );
}
