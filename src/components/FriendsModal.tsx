import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, onSnapshot, orderBy, limit, startAt, endAt } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { X, Search, UserPlus, UserMinus, User as UserIcon, Play, Check, Clock, Ban } from 'lucide-react';

export default function FriendsModal({ onClose, onRepeatRoute }: { onClose: () => void, onRepeatRoute: (route: string) => void }) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingUsers, setIncomingUsers] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<any[]>([]);
  const [historyBlockedMessage, setHistoryBlockedMessage] = useState<string | null>(null);

  const friendsIds: string[] = userData?.friends || [];
  const incomingIds: string[] = userData?.friendRequestsIncoming || [];
  const outgoingIds: string[] = userData?.friendRequestsOutgoing || [];

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserData(docSnap.data());
      }
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!userData?.friends || userData.friends.length === 0) {
      setFriends([]);
      return;
    }
    const fetchFriends = async () => {
      try {
        // Firestore 'in' query supports up to 10 items.
        // For a real app, we might need to chunk this or fetch individually.
        const chunks = [];
        for (let i = 0; i < userData.friends.length; i += 10) {
          chunks.push(userData.friends.slice(i, i + 10));
        }
        
        let allFriends: any[] = [];
        for (const chunk of chunks) {
          const q = query(collection(db, 'users'), where('uid', 'in', chunk));
          const snap = await getDocs(q);
          allFriends = [...allFriends, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
        }
        setFriends(allFriends);
      } catch (error) {
        console.error("Error fetching friends:", error);
      }
    };
    fetchFriends();
  }, [userData?.friends]);

  useEffect(() => {
    if (!incomingIds.length) {
      setIncomingUsers([]);
      return;
    }
    const fetchIncoming = async () => {
      const chunks = [];
      for (let i = 0; i < incomingIds.length; i += 10) chunks.push(incomingIds.slice(i, i + 10));
      let all: any[] = [];
      for (const chunk of chunks) {
        const q = query(collection(db, 'users'), where('uid', 'in', chunk));
        const snap = await getDocs(q);
        all = [...all, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))];
      }
      setIncomingUsers(all);
    };
    fetchIncoming().catch(() => setIncomingUsers([]));
  }, [incomingIds.join(',')]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const normalize = (txt: string) =>
        txt
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
      const qText = normalize(searchQuery);
      const q = query(
        collection(db, 'users'),
        orderBy('displayNameLower'),
        startAt(qText),
        endAt(`${qText}\uf8ff`),
        limit(20)
      );
      const snap = await getDocs(q);
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(u => u.id !== user?.uid);
      if (results.length < 5) {
        // Fallback: wider search for contains (still capped).
        const wide = await getDocs(query(collection(db, 'users'), limit(120)));
        const merged = wide.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(u => u.id !== user?.uid && normalize(u.displayName || '').includes(qText));
        const map = new Map<string, any>();
        [...results, ...merged].forEach((u) => map.set(u.uid || u.id, u));
        results = Array.from(map.values()).slice(0, 30);
      }
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching users:", error);
    }
  };

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const removeFriend = async (friendId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { friends: arrayRemove(friendId) });
      await updateDoc(doc(db, 'users', friendId), { friends: arrayRemove(user.uid) });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const sendFriendRequest = async (targetId: string) => {
    if (!user || targetId === user.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { friendRequestsOutgoing: arrayUnion(targetId) });
      await updateDoc(doc(db, 'users', targetId), { friendRequestsIncoming: arrayUnion(user.uid) });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const cancelFriendRequest = async (targetId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { friendRequestsOutgoing: arrayRemove(targetId) });
      await updateDoc(doc(db, 'users', targetId), { friendRequestsIncoming: arrayRemove(user.uid) });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const acceptFriendRequest = async (requesterId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        friendRequestsIncoming: arrayRemove(requesterId),
        friends: arrayUnion(requesterId)
      });
      await updateDoc(doc(db, 'users', requesterId), {
        friendRequestsOutgoing: arrayRemove(user.uid),
        friends: arrayUnion(user.uid)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const rejectFriendRequest = async (requesterId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { friendRequestsIncoming: arrayRemove(requesterId) });
      await updateDoc(doc(db, 'users', requesterId), { friendRequestsOutgoing: arrayRemove(user.uid) });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const viewProfile = async (friendUser: any) => {
    setSelectedUser(friendUser);
    setHistoryBlockedMessage(null);
    const canViewHistory = friendsIds.includes(friendUser.uid);
    if (!canViewHistory) {
      setSelectedUserHistory([]);
      setHistoryBlockedMessage('Debes ser amigo aceptado para ver su historial.');
      return;
    }
    try {
      const q = query(collection(db, 'rideHistory'), where('uid', '==', friendUser.uid), orderBy('endTime', 'desc'), limit(10));
      const snap = await getDocs(q);
      setSelectedUserHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching friend history:", error);
    }
  };

  const repeatRoute = (gpx: string) => {
    if (!gpx) return;
    onRepeatRoute(gpx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl h-[80vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {selectedUser ? (
              <button onClick={() => setSelectedUser(null)} className="text-orange-500 hover:text-orange-400 mr-2">
                &larr; Volver
              </button>
            ) : 'Comunidad y Amigos'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {selectedUser ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-orange-500 bg-zinc-800">
                  {selectedUser.photoURL ? (
                    <img src={selectedUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <UserIcon size={32} className="text-zinc-500" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{selectedUser.displayName}</h3>
                  <p className="text-zinc-400">Nivel {selectedUser.level || 1} • {selectedUser.points || 0} pts</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800 px-4 py-3 rounded-2xl text-center border border-zinc-700">
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Km Totales</p>
                  <p className="font-black text-xl text-white">{(selectedUser.totalDistance || 0).toFixed(1)}</p>
                </div>
                <div className="bg-zinc-800 px-4 py-3 rounded-2xl text-center border border-zinc-700">
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Curvas Totales</p>
                  <p className="font-black text-xl text-white">{(selectedUser.totalLeftTurns || 0) + (selectedUser.totalRightTurns || 0)}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-lg mb-4">Historial de Rutas</h4>
                {historyBlockedMessage && (
                  <div className="mb-3 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-400">
                    {historyBlockedMessage}
                  </div>
                )}
                <div className="space-y-3">
                  {selectedUserHistory.length > 0 ? (
                    selectedUserHistory.map(ride => (
                      <div key={ride.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="font-bold text-orange-500">{ride.groupName || 'Ruta sin nombre'}</h5>
                          <p className="text-xs text-zinc-500">
                            {new Date(ride.endTime).toLocaleDateString()} • {ride.distance?.toFixed(1)} km
                          </p>
                        </div>
                        {ride.routeGeoJSON && (
                          <button 
                            onClick={() => repeatRoute(ride.routeGeoJSON)}
                            className="flex items-center gap-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-all"
                          >
                            <Play size={14} /> Repetir
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-zinc-500 text-sm italic">Este usuario no tiene rutas públicas.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Search */}
              <div>
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input 
                      type="text"
                      placeholder="Buscar moteros por nombre..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={handleSearch}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-6 rounded-xl font-bold transition-colors"
                  >
                    Buscar
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2 mb-8">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase mb-3">Resultados</h3>
                  {searchResults.map(res => {
                      const isFriend = friendsIds.includes(res.uid);
                      const isIncoming = incomingIds.includes(res.uid);
                      const isOutgoing = outgoingIds.includes(res.uid);
                      return (
                        <div key={res.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                          <div className="flex items-center gap-3 cursor-pointer" onClick={() => viewProfile(res)}>
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800">
                              {res.photoURL ? <img src={res.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-auto h-full text-zinc-500" />}
                            </div>
                            <div>
                              <p className="font-bold">{res.displayName}</p>
                              <p className="text-xs text-zinc-500">Nivel {res.level || 1}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isIncoming ? (
                              <>
                                <button onClick={() => acceptFriendRequest(res.uid)} className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Check size={18} /></button>
                                <button onClick={() => rejectFriendRequest(res.uid)} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20"><Ban size={18} /></button>
                              </>
                            ) : isFriend ? (
                              <button 
                                onClick={() => removeFriend(res.uid)}
                                className="p-2 rounded-lg transition-colors bg-red-500/10 text-red-500 hover:bg-red-500/20"
                              >
                                <UserMinus size={18} />
                              </button>
                            ) : isOutgoing ? (
                              <button
                                onClick={() => cancelFriendRequest(res.uid)}
                                className="p-2 rounded-lg transition-colors bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                                title="Solicitud pendiente"
                              >
                                <Clock size={18} />
                              </button>
                            ) : (
                              <button 
                                onClick={() => sendFriendRequest(res.uid)}
                                className="p-2 rounded-lg transition-colors bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                              >
                                <UserPlus size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {incomingIds.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-zinc-500 uppercase mb-3">Solicitudes recibidas</h3>
                  <div className="space-y-2">
                    {incomingUsers.map((u) => (
                        <div key={`incoming-${u.uid}`} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                          <p className="text-sm font-semibold">{u.displayName}</p>
                          <div className="flex gap-2">
                            <button onClick={() => acceptFriendRequest(u.uid)} className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Check size={18} /></button>
                            <button onClick={() => rejectFriendRequest(u.uid)} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20"><Ban size={18} /></button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Friends List */}
              <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <UserIcon className="text-orange-500" size={20} />
                  Mis Amigos
                </h3>
                {friends.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {friends.map(friend => (
                      <div key={friend.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-3 rounded-xl hover:border-orange-500/50 transition-colors">
                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => viewProfile(friend)}>
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                            {friend.photoURL ? <img src={friend.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-auto h-full text-zinc-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate">{friend.displayName}</p>
                            <p className="text-xs text-zinc-500">Nivel {friend.level || 1}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeFriend(friend.uid)}
                          className="p-2 text-zinc-600 hover:text-red-500 transition-colors shrink-0"
                          title="Eliminar amigo"
                        >
                          <UserMinus size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-zinc-950 rounded-2xl border border-zinc-800">
                    <p className="text-zinc-500 text-sm">Aún no has añadido amigos.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
