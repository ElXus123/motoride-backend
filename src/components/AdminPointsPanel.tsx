import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  addDoc,
  updateDoc,
  getDocs,
  writeBatch,
  limit,
  startAt,
  endAt,
  deleteDoc
} from 'firebase/firestore';
import { X, Shield, Save, PlusCircle, Search, Crown, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPointsPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === 'juarp123@gmail.com';
  const [baseMultiplier, setBaseMultiplier] = useState(1);
  const [distanceMultiplier, setDistanceMultiplier] = useState(1);
  const [events, setEvents] = useState<any[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventMultiplier, setEventMultiplier] = useState(1.2);
  const [eventHours, setEventHours] = useState(24);
  const [premiumSearchQuery, setPremiumSearchQuery] = useState('');
  const [premiumSearchResults, setPremiumSearchResults] = useState<any[]>([]);
  const [premiumSearchLoading, setPremiumSearchLoading] = useState(false);
  const [premiumCandidates, setPremiumCandidates] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin) onClose();
  }, [isAdmin, onClose]);

  useEffect(() => {
    const unsubCfg = onSnapshot(doc(db, 'appConfig', 'points'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBaseMultiplier(Number(data.baseMultiplier || 1));
        setDistanceMultiplier(Number(data.distanceMultiplier || 1));
      }
    });
    const unsubEvents = onSnapshot(query(collection(db, 'pointsEvents'), orderBy('createdAt', 'desc')), (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubCfg();
      unsubEvents();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'premiumCandidates'), orderBy('updatedAt', 'desc')),
      (snap) => setPremiumCandidates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('premiumCandidates', err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (premiumSearchQuery.trim().length < 2) {
      setPremiumSearchResults([]);
      return;
    }
    const normalize = (txt: string) =>
      txt
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    const t = window.setTimeout(() => {
      void (async () => {
        setPremiumSearchLoading(true);
        try {
          const qText = normalize(premiumSearchQuery);
          const q = query(
            collection(db, 'users'),
            orderBy('displayNameLower'),
            startAt(qText),
            endAt(`${qText}\uf8ff`),
            limit(20)
          );
          const snap = await getDocs(q);
          let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (results.length < 5) {
            const wide = await getDocs(query(collection(db, 'users'), limit(120)));
            const merged = wide.docs
              .map((d) => ({ id: d.id, ...d.data() } as any))
              .filter((u) => normalize(u.displayName || '').includes(qText));
            const map = new Map<string, any>();
            [...results, ...merged].forEach((u) => map.set(u.id, u));
            results = Array.from(map.values()).slice(0, 30);
          }
          setPremiumSearchResults(results);
        } catch (e) {
          console.error(e);
        } finally {
          setPremiumSearchLoading(false);
        }
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [premiumSearchQuery]);

  const setUserPremium = async (uid: string, isPremium: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), { isPremium });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      window.alert('No se pudo actualizar el estado Premium.');
    }
  };

  const removePremiumCandidate = async (uid: string) => {
    if (!window.confirm('¿Quitar este usuario de la lista de candidatos?')) return;
    try {
      await deleteDoc(doc(db, 'premiumCandidates', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `premiumCandidates/${uid}`);
    }
  };

  const saveConfig = async () => {
    await setDoc(doc(db, 'appConfig', 'points'), {
      baseMultiplier: Math.max(0, Math.min(10, Number(baseMultiplier) || 1)),
      distanceMultiplier: Math.max(0, Math.min(10, Number(distanceMultiplier) || 1)),
      updatedAt: Date.now(),
      updatedBy: user?.uid || null
    }, { merge: true });
    alert('Configuración de puntos actualizada.');
  };

  const createEvent = async () => {
    if (!eventName.trim()) return;
    const now = Date.now();
    await addDoc(collection(db, 'pointsEvents'), {
      name: eventName.trim(),
      multiplier: Math.max(0, Math.min(10, Number(eventMultiplier) || 1)),
      startAt: now,
      endAt: now + Math.max(1, Number(eventHours) || 1) * 3600000,
      active: true,
      createdAt: now,
      createdBy: user?.uid || null
    });
    setEventName('');
    setEventMultiplier(1.2);
    setEventHours(24);
  };

  const toggleEvent = async (event: any) => {
    await updateDoc(doc(db, 'pointsEvents', event.id), {
      active: !event.active,
      updatedAt: Date.now()
    });
  };

  const resetGroupsOnly = async () => {
    const ok = window.confirm('Esto borrará TODOS los grupos guardados. ¿Continuar?');
    if (!ok) return;
    try {
      const groupsSnap = await getDocs(query(collection(db, 'groups')));

      let batch = writeBatch(db);
      let ops = 0;
      const flush = async () => {
        if (ops > 0) await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };

      for (const g of groupsSnap.docs) {
        batch.delete(g.ref);
        ops++;
        if (ops >= 450) await flush();
      }
      await flush();
      alert('Reset completado: grupos eliminados.');
    } catch (error) {
      console.error(error);
      alert('No se pudo completar el reset. Revisa permisos de reglas.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield size={18} className="text-orange-400" />
            Panel Admin
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800 text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="border border-zinc-800 rounded-2xl p-4 space-y-3 bg-zinc-950/50">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Crown size={16} className="text-amber-400" />
              Premium (voz y futuras ventajas)
            </h3>
            <p className="text-xs text-zinc-500">
              Busca por nombre (mín. 2 caracteres). Los cambios se guardan en la cuenta del usuario en Firestore.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={premiumSearchQuery}
                  onChange={(e) => setPremiumSearchQuery(e.target.value)}
                  placeholder="Nombre de usuario…"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white"
                />
              </div>
              {premiumSearchLoading && <span className="text-xs text-zinc-500 self-center">Buscando…</span>}
            </div>
            {premiumSearchResults.length > 0 && (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {premiumSearchResults.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{u.displayName || u.id}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{u.id}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {u.isPremium ? (
                        <button
                          type="button"
                          onClick={() => void setUserPremium(u.id, false)}
                          className="text-[11px] font-bold px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        >
                          Quitar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void setUserPremium(u.id, true)}
                          className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                        >
                          Premium
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-amber-500/20 rounded-2xl p-4 space-y-3 bg-amber-500/5">
            <h3 className="text-white font-bold text-sm">Candidatos Ko-fi (modal donación ≥10 s)</h3>
            {premiumCandidates.length === 0 ? (
              <p className="text-xs text-zinc-500">Nadie en la lista todavía.</p>
            ) : (
              <ul className="space-y-2 max-h-52 overflow-y-auto">
                {premiumCandidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.displayName || c.email || c.id}</p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {c.email || 'sin email'} ·{' '}
                        {typeof c.updatedAt === 'number' && Number.isFinite(c.updatedAt)
                          ? new Date(c.updatedAt).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void setUserPremium(c.id, true)}
                        className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      >
                        Marcar premium
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePremiumCandidate(c.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-300"
                        title="Quitar de candidatos"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-zinc-800 pt-5">
            <h3 className="text-white font-bold mb-3">Puntos</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-zinc-300">
              Multiplicador base
              <input value={baseMultiplier} onChange={(e) => setBaseMultiplier(Number(e.target.value))} type="number" step="0.1" className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2" />
            </label>
            <label className="text-sm text-zinc-300">
              Multiplicador distancia
              <input value={distanceMultiplier} onChange={(e) => setDistanceMultiplier(Number(e.target.value))} type="number" step="0.1" className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2" />
            </label>
          </div>
          <button onClick={saveConfig} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2">
            <Save size={16} /> Guardar configuración
          </button>

          <div className="border-t border-zinc-800 pt-5 space-y-3">
            <h3 className="text-white font-bold">Crear evento global de puntos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Nombre evento" className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
              <input value={eventMultiplier} onChange={(e) => setEventMultiplier(Number(e.target.value))} type="number" step="0.1" placeholder="x1.5" className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
              <input value={eventHours} onChange={(e) => setEventHours(Number(e.target.value))} type="number" min={1} placeholder="Horas" className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
            </div>
            <button onClick={createEvent} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2">
              <PlusCircle size={16} /> Crear evento
            </button>
          </div>

          <div className="border-t border-zinc-800 pt-5 space-y-2">
            <h3 className="text-white font-bold">Eventos</h3>
            {events.map((event) => (
              <div key={event.id} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{event.name}</p>
                  <p className="text-xs text-zinc-500">x{event.multiplier} • {new Date(event.startAt).toLocaleString()} - {new Date(event.endAt).toLocaleString()}</p>
                </div>
                <button onClick={() => toggleEvent(event)} className={`px-3 py-1 rounded-lg text-xs font-bold ${event.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-300'}`}>
                  {event.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800 pt-5">
            <button onClick={resetGroupsOnly} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl">
              Reset global: solo grupos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
