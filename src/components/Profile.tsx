import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import {
  doc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth, logOut, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { ArrowLeft, Camera, LogOut, ChevronDown, ChevronUp, Activity, Trash2, Play, Clock, Shield } from 'lucide-react';
import PremiumBadge from './PremiumBadge';
import AdminPointsPanel from './AdminPointsPanel';
import { formatRideCardSubtitle, formatRideCardTitle, rideHistoryPointsEarned } from '../lib/rideHistoryDisplay';

type Props = {
  onBack: () => void;
  onRepeatRoute: (routeGeoJSON: string) => void;
};

export default function Profile({ onBack, onRepeatRoute }: Props) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [motorcycle, setMotorcycle] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [userData, setUserData] = useState<any>(null);

  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [indexBuilding, setIndexBuilding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === 'juarp123@gmail.com';

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (docSnap) => {
        const data = docSnap.data();
        setUserData(data);
        if (data?.motorcycle != null) setMotorcycle(String(data.motorcycle));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const historyQ = query(
      collection(db, 'rideHistory'),
      where('uid', '==', user.uid),
      orderBy('endTime', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      historyQ,
      (snapshot) => {
        setRideHistory(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setIndexBuilding(false);
      },
      (error) => {
        if (error.message.includes('index') && error.message.includes('building')) {
          setIndexBuilding(true);
        }
        console.error('Historial perfil:', error);
        handleFirestoreError(error, OperationType.LIST, 'rideHistory');
      }
    );
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
        displayName,
      });
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoURL,
        motorcycle: motorcycle.trim().slice(0, 120),
      });
      showMessage({ variant: 'success', title: 'Perfil', message: 'Perfil actualizado.' });
    } catch (error) {
      console.error('Error updating profile:', error);
      showMessage({ variant: 'error', title: 'Perfil', message: 'Error al actualizar el perfil.' });
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
    setLoading(false);
  };

  const deleteRide = (rideId: string) => setDeletingId(rideId);

  const confirmDeleteRide = async (rideId: string) => {
    try {
      await deleteDoc(doc(db, 'rideHistory', rideId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rideHistory/${rideId}`);
    }
    setDeletingId(null);
  };

  const repeatFromHistory = useCallback(
    (gpx: string) => {
      if (!gpx) return;
      onRepeatRoute(gpx);
      onBack();
    },
    [onRepeatRoute, onBack]
  );

  return (
    <div className="min-h-dvh bg-zinc-950 text-white pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="max-w-md mx-auto pt-4 pb-8">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={onBack} className="p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 transition-colors shrink-0">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold truncate">Mi Perfil</h1>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminPanel(true)}
              className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-orange-400 shrink-0"
              title="Panel de administración"
            >
              <Shield size={20} />
            </button>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col items-center">
          <div className="relative mb-6 group">
            <div
              className={`w-32 h-32 rounded-full overflow-hidden border-4 bg-zinc-800 ${
                user?.isPremium === true || userData?.isPremium === true ? 'border-amber-500' : 'border-orange-500'
              }`}
            >
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

          {(user?.isPremium === true || userData?.isPremium === true) && (
            <div className="mb-4">
              <PremiumBadge />
            </div>
          )}

          {userData &&
            (() => {
              const totalPoints = Math.max(0, Number(userData.points || 0));
              const { level, pointsForNextLevel, prevLevelPoints } = calculateLevel(totalPoints);
              const levelProgress = totalPoints - prevLevelPoints;
              const levelRequired = pointsForNextLevel - prevLevelPoints;
              return (
                <div className="w-full mb-6">
                  <div className="flex justify-between items-center text-xs font-bold text-zinc-400 mb-2">
                    <span className="text-orange-500 font-black tracking-wider">NIVEL {level}</span>
                    <span className="text-zinc-500">
                      <span className="font-bold text-orange-400 tabular-nums">{totalPoints}</span>
                      {' / '}
                      {pointsForNextLevel} pts
                    </span>
                  </div>
                  <div className="h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min((levelProgress / levelRequired) * 100, 100)}%` }}
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
              <p className="font-black text-xl text-white">
                {(userData?.totalLeftTurns || 0) + (userData?.totalRightTurns || 0)}
              </p>
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

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Tu moto</label>
              <textarea
                value={motorcycle}
                onChange={(e) => setMotorcycle(e.target.value.slice(0, 120))}
                placeholder="Ej: Yamaha MT-07 2022"
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-600 mt-1">{motorcycle.length}/120</p>
            </div>

            <button
              onClick={saveProfile}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>

        {/* Historial de rutas (desplegable) */}
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/50 transition-colors"
          >
            <span className="font-bold flex items-center gap-2">
              <Activity className="text-orange-500" size={18} />
              Historial de rutas
            </span>
            {historyOpen ? <ChevronUp size={20} className="text-zinc-500" /> : <ChevronDown size={20} className="text-zinc-500" />}
          </button>
          {historyOpen && (
            <div className="border-t border-zinc-800 px-3 sm:px-5 pb-5 pt-4">
              {indexBuilding && (
                <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex items-center gap-2 mb-4">
                  <Clock className="text-blue-400 shrink-0" size={16} />
                  <p className="text-xs text-blue-400">Cargando historial…</p>
                </div>
              )}
              <div className="space-y-4 max-h-[55vh] overflow-y-auto overflow-x-hidden px-0.5 sm:px-0">
                {rideHistory.length > 0 ? (
                  rideHistory.map((ride) => (
                    <div
                      key={ride.id}
                      className="bg-zinc-950 border border-zinc-800 p-4 sm:p-5 rounded-2xl relative group flex flex-col gap-2"
                    >
                      <div className="absolute top-3 right-3 z-10">
                        {deletingId === ride.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => void confirmDeleteRide(ride.id)}
                              className="text-[10px] bg-red-600 text-white px-2 py-1 rounded font-bold"
                            >
                              Confirmar
                            </button>
                            <button onClick={() => setDeletingId(null)} className="text-[10px] text-zinc-500 px-2">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => deleteRide(ride.id)}
                            className="text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <h4 className="text-lg font-black text-orange-500 leading-snug tracking-tight pr-14">
                        {formatRideCardTitle(ride.groupName, ride.endTime)}
                      </h4>
                      <p className="text-sm text-zinc-500">{formatRideCardSubtitle(ride.endTime)}</p>
                      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 mt-1">
                        <span className="text-sm">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Dist.{' '}
                          </span>
                          <span className="font-semibold text-white tabular-nums">
                            {ride.distance != null ? Number(ride.distance).toFixed(1) : '—'} km
                          </span>
                        </span>
                        <span className="text-sm">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Pts{' '}
                          </span>
                          <span className="font-bold text-orange-400 tabular-nums">
                            +{rideHistoryPointsEarned(ride)}
                          </span>
                        </span>
                      </div>
                      {ride.routeGeoJSON && (
                        <button
                          type="button"
                          onClick={() => repeatFromHistory(ride.routeGeoJSON)}
                          className="mt-2 flex items-center gap-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-xl w-full sm:w-auto self-start"
                        >
                          <Play size={14} /> Repetir ruta
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  !indexBuilding && <p className="text-sm text-zinc-500 py-6 text-center">Aún no hay rutas guardadas</p>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={logOut}
          className="w-full mt-8 flex items-center justify-center gap-2 text-red-500 hover:text-red-400 transition-colors py-4"
        >
          <LogOut size={20} />
          Cerrar Sesión
        </button>
      </div>

      {showAdminPanel && isAdmin && <AdminPointsPanel onClose={() => setShowAdminPanel(false)} />}
    </div>
  );
}
