import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth, logOut, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { ArrowLeft, Camera, LogOut } from 'lucide-react';

export default function Profile({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      setUserData(doc.data());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });
    return unsub;
  }, [user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG to save space in Firestore
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoURL(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!user || !auth.currentUser) return;
    setLoading(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName
      });
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        photoURL
      });
      alert('Perfil actualizado');
    } catch (error) {
      console.error("Error updating profile:", error);
      alert('Error al actualizar el perfil');
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-md mx-auto pt-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">Mi Perfil</h1>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col items-center">
          <div className="relative mb-6 group">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-orange-500 bg-zinc-800">
              {photoURL ? (
                <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500">Sin foto</div>
              )}
            </div>
            <label className="absolute bottom-0 right-0 bg-orange-500 p-3 rounded-full cursor-pointer hover:bg-orange-600 transition-colors shadow-lg">
              <Camera size={20} className="text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          {/* Experience Bar */}
          {userData && (() => {
            const { level, pointsForNextLevel, remainingPoints } = calculateLevel(userData.points || 0);
            return (
              <div className="w-full mb-6">
                <div className="flex justify-between items-center text-xs font-bold text-zinc-400 mb-2">
                  <span className="text-orange-500 font-black tracking-wider">NIVEL {level}</span>
                  <span className="text-zinc-500">{remainingPoints} / {pointsForNextLevel} pts</span>
                </div>
                <div className="h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-1000 ease-out" 
                    style={{ width: `${Math.min((remainingPoints / pointsForNextLevel) * 100, 100)}%` }} 
                  />
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-4 mb-6 w-full">
            <div className="bg-zinc-800 px-4 py-3 rounded-2xl text-center border border-zinc-700">
              <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Km Totales</p>
              <p className="font-black text-xl text-white">{(userData?.totalDistance || 0).toFixed(1)}</p>
            </div>
            <div className="bg-zinc-800 px-4 py-3 rounded-2xl text-center border border-zinc-700">
              <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Curvas Totales</p>
              <p className="font-black text-xl text-white">{(userData?.totalLeftTurns || 0) + (userData?.totalRightTurns || 0)}</p>
            </div>
          </div>

          <div className="w-full space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Nombre de motero</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            
            <button 
              onClick={saveProfile}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 mt-4"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>

        <button 
          onClick={logOut}
          className="w-full mt-8 flex items-center justify-center gap-2 text-red-500 hover:text-red-400 transition-colors py-4"
        >
          <LogOut size={20} />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
