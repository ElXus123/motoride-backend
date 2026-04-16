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
  getDoc,
  getCountFromServer,
  writeBatch,
  limit,
  startAt,
  endAt,
  deleteDoc,
} from 'firebase/firestore';
import {
  X,
  Shield,
  Save,
  PlusCircle,
  Search,
  Crown,
  Trash2,
  LayoutGrid,
  Navigation,
  Layers,
  CloudRain,
  Thermometer,
  Mic,
  Coins,
  CalendarRange,
  Skull,
  Users,
  RefreshCw,
  Award,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import {
  DEFAULT_PREMIUM_GPS_POLICY,
  normalizePremiumGpsPolicy,
  type PremiumGpsPolicy,
} from '../lib/premiumGpsConfig';
import { calculateLevel } from '../lib/utils';

type AdminSection = 'gps' | 'accounts' | 'userstats' | 'points' | 'events' | 'danger';

const SECTIONS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: 'gps', label: 'GPS Premium', icon: <Navigation size={16} /> },
  { id: 'accounts', label: 'Cuentas Premium', icon: <Crown size={16} /> },
  { id: 'userstats', label: 'Nivel y puntos', icon: <Award size={16} /> },
  { id: 'points', label: 'Puntos', icon: <Coins size={16} /> },
  { id: 'events', label: 'Eventos puntos', icon: <CalendarRange size={16} /> },
  { id: 'danger', label: 'Zona peligro', icon: <Skull size={16} /> },
];

function ToggleRow({
  checked,
  onChange,
  title,
  description,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 cursor-pointer hover:border-zinc-700 transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-orange-500' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white flex items-center gap-2">
          <span className="text-orange-400 shrink-0">{icon}</span>
          {title}
        </p>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{description}</p>
      </div>
    </label>
  );
}

export default function AdminPointsPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const isAdmin = user?.email?.toLowerCase() === 'juarp123@gmail.com';
  const [section, setSection] = useState<AdminSection>('gps');

  const [baseMultiplier, setBaseMultiplier] = useState(1);
  const [distanceMultiplier, setDistanceMultiplier] = useState(1);
  const [events, setEvents] = useState<any[]>([]);
  const [eventName, setEventName] = useState('');
  const [eventMultiplier, setEventMultiplier] = useState(1.2);
  const [eventHours, setEventHours] = useState(24);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [statsEditUid, setStatsEditUid] = useState<string | null>(null);
  const [statsEditName, setStatsEditName] = useState('');
  const [statsPointsInput, setStatsPointsInput] = useState('');
  const [statsLevelInput, setStatsLevelInput] = useState('');
  const [statsEditLoading, setStatsEditLoading] = useState(false);
  const [statsSaveLoading, setStatsSaveLoading] = useState(false);
  const [premiumCandidates, setPremiumCandidates] = useState<any[]>([]);
  const [premiumGpsDraft, setPremiumGpsDraft] = useState<PremiumGpsPolicy>(DEFAULT_PREMIUM_GPS_POLICY);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalUsersLoading, setTotalUsersLoading] = useState(false);

  const refreshTotalUsers = async () => {
    setTotalUsersLoading(true);
    try {
      const agg = await getCountFromServer(query(collection(db, 'users')));
      setTotalUsers(agg.data().count);
    } catch (e) {
      console.error('getCountFromServer users', e);
      setTotalUsers(null);
      showMessage({
        variant: 'error',
        title: 'Usuarios',
        message: 'No se pudo obtener el total. Revisa reglas de Firestore o conexión.',
      });
    } finally {
      setTotalUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) onClose();
  }, [isAdmin, onClose]);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshTotalUsers();
  }, [isAdmin]);

  useEffect(() => {
    const unsubCfg = onSnapshot(doc(db, 'appConfig', 'points'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBaseMultiplier(Number(data.baseMultiplier || 1));
        setDistanceMultiplier(Number(data.distanceMultiplier || 1));
      }
    });
    const unsubGps = onSnapshot(
      doc(db, 'appConfig', 'premiumGps'),
      (snap) => {
        setPremiumGpsDraft(normalizePremiumGpsPolicy(snap.exists() ? snap.data() : null));
      },
      () => setPremiumGpsDraft(DEFAULT_PREMIUM_GPS_POLICY)
    );
    const unsubEvents = onSnapshot(query(collection(db, 'pointsEvents'), orderBy('createdAt', 'desc')), (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubCfg();
      unsubGps();
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
    if (userSearchQuery.trim().length < 2) {
      setUserSearchResults([]);
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
        setUserSearchLoading(true);
        try {
          const qText = normalize(userSearchQuery);
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
          setUserSearchResults(results);
        } catch (e) {
          console.error(e);
        } finally {
          setUserSearchLoading(false);
        }
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [userSearchQuery]);

  const openStatsEditor = async (u: { id: string; displayName?: string; points?: number; level?: number }) => {
    setStatsEditUid(u.id);
    setStatsEditName(String(u.displayName || u.id));
    setStatsPointsInput('');
    setStatsLevelInput('');
    setStatsEditLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', u.id));
      if (!snap.exists()) {
        showMessage({ variant: 'error', title: 'Usuario', message: 'No se encontró el documento en Firestore.' });
        setStatsEditUid(null);
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      const pts = Math.max(0, Math.round(Number(d.points) || 0));
      const lvl = Math.max(1, Math.round(Number(d.level) || calculateLevel(pts).level));
      setStatsPointsInput(String(pts));
      setStatsLevelInput(String(lvl));
    } catch (e) {
      console.error(e);
      showMessage({ variant: 'error', title: 'Usuario', message: 'No se pudo cargar el perfil.' });
      setStatsEditUid(null);
    } finally {
      setStatsEditLoading(false);
    }
  };

  const applyPointsFromLevel = () => {
    const lv = Math.max(1, Math.round(Number(statsLevelInput) || 1));
    const ptsMin = (lv - 1) * 1000;
    setStatsLevelInput(String(lv));
    setStatsPointsInput(String(ptsMin));
  };

  const applyLevelFromPoints = () => {
    const pts = Math.max(0, Math.round(Number(statsPointsInput) || 0));
    const { level } = calculateLevel(pts);
    setStatsPointsInput(String(pts));
    setStatsLevelInput(String(level));
  };

  const saveUserStats = async () => {
    if (!statsEditUid) return;
    const pts = Math.max(0, Math.round(Number(statsPointsInput)));
    const lvl = Math.max(1, Math.round(Number(statsLevelInput)));
    if (!Number.isFinite(pts) || !Number.isFinite(lvl)) {
      showMessage({ variant: 'error', title: 'Valores', message: 'Introduce números válidos.' });
      return;
    }
    setStatsSaveLoading(true);
    try {
      await updateDoc(doc(db, 'users', statsEditUid), { points: pts, level: lvl });
      setUserSearchResults((prev) =>
        prev.map((u) => (u.id === statsEditUid ? { ...u, points: pts, level: lvl } : u))
      );
      showMessage({ variant: 'success', title: 'Perfil', message: 'Puntos y nivel actualizados.' });
      setStatsEditUid(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${statsEditUid}`);
      showMessage({
        variant: 'error',
        title: 'Guardar',
        message: 'No se pudo guardar. ¿Reglas de Firestore desplegadas?',
      });
    } finally {
      setStatsSaveLoading(false);
    }
  };

  const setUserPremium = async (uid: string, premium: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), { isPremium: premium });
      setUserSearchResults((prev) => prev.map((u) => (u.id === uid ? { ...u, isPremium: premium } : u)));
      showMessage({
        variant: 'success',
        title: 'Premium',
        message: premium ? 'Usuario marcado como Premium.' : 'Premium desactivado para este usuario.',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      showMessage({
        variant: 'error',
        title: 'Premium',
        message: 'No se pudo actualizar el estado Premium. ¿Reglas de Firestore desplegadas?',
      });
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
    await setDoc(
      doc(db, 'appConfig', 'points'),
      {
        baseMultiplier: Math.max(0, Math.min(10, Number(baseMultiplier) || 1)),
        distanceMultiplier: Math.max(0, Math.min(10, Number(distanceMultiplier) || 1)),
        updatedAt: Date.now(),
        updatedBy: user?.uid || null,
      },
      { merge: true }
    );
    showMessage({ variant: 'success', title: 'Admin', message: 'Configuración de puntos actualizada.' });
  };

  const savePremiumGps = async () => {
    await setDoc(
      doc(db, 'appConfig', 'premiumGps'),
      {
        ...premiumGpsDraft,
        updatedAt: Date.now(),
        updatedBy: user?.uid || null,
      },
      { merge: true }
    );
    showMessage({
      variant: 'success',
      title: 'Política Premium',
      message: 'Guardado. GPS, tiempo y voz se aplican al instante en el mapa.',
    });
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
      createdBy: user?.uid || null,
    });
    setEventName('');
    setEventMultiplier(1.2);
    setEventHours(24);
  };

  const toggleEvent = async (event: any) => {
    await updateDoc(doc(db, 'pointsEvents', event.id), {
      active: !event.active,
      updatedAt: Date.now(),
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
      showMessage({ variant: 'success', title: 'Reset', message: 'Reset completado: grupos eliminados.' });
    } catch (error) {
      console.error(error);
      showMessage({ variant: 'error', title: 'Reset', message: 'No se pudo completar el reset. Revisa permisos de reglas.' });
    }
  };

  const patchPremiumGps = (key: keyof PremiumGpsPolicy, value: boolean) => {
    setPremiumGpsDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[min(92dvh,900px)] bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 min-w-0">
              <Shield size={18} className="text-orange-400 shrink-0" />
              <span className="truncate">Administración</span>
            </h2>
            <div
              className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-sm"
              title="Cuentas en la colección users de Firestore"
            >
              <Users size={16} className="text-zinc-400 shrink-0" aria-hidden />
              <span className="text-zinc-500 font-medium">Registrados</span>
              <span className="font-black tabular-nums text-orange-300 min-w-[2.5rem] text-right">
                {totalUsersLoading ? '…' : totalUsers != null ? totalUsers : '—'}
              </span>
              <button
                type="button"
                onClick={() => void refreshTotalUsers()}
                disabled={totalUsersLoading}
                className="p-1 rounded-lg text-zinc-500 hover:text-orange-400 hover:bg-zinc-800 disabled:opacity-50"
                title="Actualizar contador"
                aria-label="Actualizar contador de usuarios"
              >
                <RefreshCw size={15} className={totalUsersLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800 text-zinc-300 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col sm:flex-row min-h-0">
          <nav
            className="shrink-0 border-b sm:border-b-0 sm:border-r border-zinc-800 bg-zinc-950/50 flex sm:flex-col gap-1 p-2 overflow-x-auto sm:w-52 sm:py-3"
            aria-label="Secciones admin"
          >
            <p className="hidden sm:flex items-center gap-2 px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-zinc-600">
              <LayoutGrid size={12} />
              Menú
            </p>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  section === s.id
                    ? 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                }`}
              >
                <span className="opacity-90">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
            {section === 'gps' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <h3 className="text-white font-bold text-base">Mapa y Premium</h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Con todo desactivado, el comportamiento es el de siempre (mismas funciones para todos). Si activas una opción,
                    solo los usuarios con <span className="text-amber-400/95">Premium</span> reciben esa ventaja; el resto usa la
                    alternativa básica o no ve la función.
                  </p>
                </div>
                <div className="space-y-2">
                  <ToggleRow
                    checked={premiumGpsDraft.voiceChatRequiresPremium}
                    onChange={(v) => patchPremiumGps('voiceChatRequiresPremium', v)}
                    title="Chat de voz solo con Premium (o anfitrión Premium)"
                    description="Si está activo: solo pueden hablar por el micrófono quienes tengan Premium o se unan a una ruta cuyo anfitrión sea Premium. Si está desactivado, todos pueden usar el chat de voz en el mapa."
                    icon={<Mic size={16} />}
                  />
                  <ToggleRow
                    checked={premiumGpsDraft.highAccuracyPremiumOnly}
                    onChange={(v) => patchPremiumGps('highAccuracyPremiumOnly', v)}
                    title="Alta precisión GPS solo Premium"
                    description="Si está activo: solo Premium usa el modo de alta precisión del GPS. El resto obtiene posiciones algo menos precisas (menor uso del chip)."
                    icon={<Navigation size={16} />}
                  />
                  <ToggleRow
                    checked={premiumGpsDraft.rainRadarPremiumOnly}
                    onChange={(v) => patchPremiumGps('rainRadarPremiumOnly', v)}
                    title="Capa de radar de lluvia solo Premium"
                    description="Si está activo: el mapa de precipitación (Rain Viewer) solo la pueden activar cuentas Premium."
                    icon={<Layers size={16} />}
                  />
                  <ToggleRow
                    checked={premiumGpsDraft.precipAlertsPremiumOnly}
                    onChange={(v) => patchPremiumGps('precipAlertsPremiumOnly', v)}
                    title="Avisos de lluvia en ruta solo Premium"
                    description="Si está activo: el aviso automático de posible lluvia en la ruta o cerca solo se muestra a Premium."
                    icon={<CloudRain size={16} />}
                  />
                  <ToggleRow
                    checked={premiumGpsDraft.weatherHudPremiumOnly}
                    onChange={(v) => patchPremiumGps('weatherHudPremiumOnly', v)}
                    title="Tiempo en el HUD solo Premium"
                    description="Si está activo: temperatura e icono meteorológico en el bloque de velocidad solo para Premium (el resto ve el velocímetro igual)."
                    icon={<Thermometer size={16} />}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void savePremiumGps()}
                  className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl inline-flex items-center justify-center gap-2"
                >
                  <Save size={16} /> Guardar política
                </button>
              </div>
            )}

            {section === 'accounts' && (
              <div className="space-y-6">
                <div className="border border-zinc-800 rounded-2xl p-4 space-y-3 bg-zinc-950/50">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Crown size={16} className="text-amber-400" />
                    Buscar usuario
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Busca por nombre (mín. 2 caracteres). Los cambios se guardan en la cuenta en Firestore.
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder="Nombre de usuario…"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white"
                      />
                    </div>
                    {userSearchLoading && <span className="text-xs text-zinc-500 self-center">Buscando…</span>}
                  </div>
                  {userSearchResults.length > 0 && (
                    <ul className="space-y-2 max-h-52 overflow-y-auto">
                      {userSearchResults.map((u) => (
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
              </div>
            )}

            {section === 'userstats' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Award size={18} className="text-amber-400" />
                    Puntos y nivel por usuario
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Busca por nombre (mín. 2 caracteres), elige un usuario y edita puntos y nivel. La app usa 1000 puntos por
                    nivel; puedes alinear nivel con puntos con los botones de ayuda.
                  </p>
                </div>
                <div className="border border-zinc-800 rounded-2xl p-4 space-y-3 bg-zinc-950/50">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        placeholder="Nombre de usuario…"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white"
                      />
                    </div>
                    {userSearchLoading && <span className="text-xs text-zinc-500 self-center">Buscando…</span>}
                  </div>
                  {userSearchResults.length > 0 && (
                    <ul className="space-y-2 max-h-56 overflow-y-auto">
                      {userSearchResults.map((u) => (
                        <li
                          key={u.id}
                          className="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{u.displayName || u.id}</p>
                            <p className="text-[10px] text-zinc-500 truncate">
                              {u.id} · pts {u.points != null ? Math.round(Number(u.points)) : '—'} · nv{' '}
                              {u.level != null ? Math.round(Number(u.level)) : '—'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openStatsEditor(u)}
                            className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/30"
                          >
                            Editar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {section === 'points' && (
              <div className="space-y-4 max-w-lg">
                <h3 className="text-white font-bold">Multiplicadores globales</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm text-zinc-300">
                    Multiplicador base
                    <input
                      value={baseMultiplier}
                      onChange={(e) => setBaseMultiplier(Number(e.target.value))}
                      type="number"
                      step="0.1"
                      className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2"
                    />
                  </label>
                  <label className="text-sm text-zinc-300">
                    Multiplicador distancia
                    <input
                      value={distanceMultiplier}
                      onChange={(e) => setDistanceMultiplier(Number(e.target.value))}
                      type="number"
                      step="0.1"
                      className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void saveConfig()}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                >
                  <Save size={16} /> Guardar configuración
                </button>
              </div>
            )}

            {section === 'events' && (
              <div className="space-y-5 max-w-2xl">
                <div className="space-y-3">
                  <h3 className="text-white font-bold">Crear evento global de puntos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      placeholder="Nombre evento"
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      value={eventMultiplier}
                      onChange={(e) => setEventMultiplier(Number(e.target.value))}
                      type="number"
                      step="0.1"
                      placeholder="x1.5"
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      value={eventHours}
                      onChange={(e) => setEventHours(Number(e.target.value))}
                      type="number"
                      min={1}
                      placeholder="Horas"
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void createEvent()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                  >
                    <PlusCircle size={16} /> Crear evento
                  </button>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-zinc-400">Eventos activos / histórico</h4>
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{event.name}</p>
                        <p className="text-xs text-zinc-500">
                          x{event.multiplier} • {new Date(event.startAt).toLocaleString()} — {new Date(event.endAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleEvent(event)}
                        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold ${
                          event.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-300'
                        }`}
                      >
                        {event.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section === 'danger' && (
              <div className="space-y-3 max-w-md">
                <p className="text-sm text-zinc-400">
                  Acción destructiva. Solo grupos en Firestore; no borra usuarios ni rutas guardadas en perfiles.
                </p>
                <button
                  type="button"
                  onClick={() => void resetGroupsOnly()}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl w-full sm:w-auto"
                >
                  Reset global: solo grupos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {statsEditUid && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-stats-title"
          onClick={() => !statsSaveLoading && !statsEditLoading && setStatsEditUid(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-stats-title" className="text-lg font-bold text-white mb-1">
              Editar puntos y nivel
            </h3>
            <p className="text-xs text-zinc-500 mb-4 truncate" title={statsEditName}>
              {statsEditName}
            </p>
            {statsEditLoading ? (
              <p className="text-sm text-zinc-400 py-8 text-center">Cargando datos…</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <label className="text-sm text-zinc-300">
                    Puntos totales
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={statsPointsInput}
                      onChange={(e) => setStatsPointsInput(e.target.value)}
                      className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white tabular-nums"
                    />
                  </label>
                  <label className="text-sm text-zinc-300">
                    Nivel
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={statsLevelInput}
                      onChange={(e) => setStatsLevelInput(e.target.value)}
                      className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white tabular-nums"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    onClick={applyLevelFromPoints}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >
                    Nivel según puntos (1000 pts / nivel)
                  </button>
                  <button
                    type="button"
                    onClick={applyPointsFromLevel}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >
                    Puntos mínimos del nivel
                  </button>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    disabled={statsSaveLoading}
                    onClick={() => setStatsEditUid(null)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={statsSaveLoading}
                    onClick={() => void saveUserStats()}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
                  >
                    {statsSaveLoading ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
