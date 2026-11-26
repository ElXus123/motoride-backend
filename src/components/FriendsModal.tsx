import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, getDoc, updateDoc, writeBatch, arrayUnion, arrayRemove, onSnapshot, orderBy, limit, startAt, endAt, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { X, Search, UserPlus, UserMinus, User as UserIcon, Play, Check, Clock, Ban, MessageCircle } from 'lucide-react';
import PremiumBadge from './PremiumBadge';
import { AvatarFrame } from './AvatarFrame';
import { resolvePeerFrameId } from '../lib/frames';
import FriendDirectChatModal from './FriendDirectChatModal';
import MedalShowcase from './MedalShowcase';
import { formatRideCardSubtitle, formatRideCardTitle, rideHistoryPointsEarned } from '../lib/rideHistoryDisplay';

export default function FriendsModal({ onClose, onRepeatRoute }: { onClose: () => void; onRepeatRoute: (route: string) => void }) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingUsers, setIncomingUsers] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState<any[]>([]);
  const [historyBlockedMessage, setHistoryBlockedMessage] = useState<string | null>(null);
  const [dmPeer, setDmPeer] = useState<{ uid: string; name: string } | null>(null);

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
        const ids: string[] = [...userData.friends];
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 30) {
          chunks.push(ids.slice(i, i + 30));
        }
        const allFriends: any[] = [];
        for (const chunk of chunks) {
          const snaps = await Promise.all(chunk.map((fid) => getDoc(doc(db, 'users', fid))));
          for (const s of snaps) {
            if (s.exists()) {
              // El ID canónico de Firestore debe prevalecer sobre cualquier campo `uid` legado del documento.
              allFriends.push({ ...s.data(), id: s.id, uid: s.id });
            }
          }
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
      const chunks: string[][] = [];
      for (let i = 0; i < incomingIds.length; i += 30) chunks.push(incomingIds.slice(i, i + 30));
      const all: any[] = [];
      for (const chunk of chunks) {
        const snaps = await Promise.all(chunk.map((fid) => getDoc(doc(db, 'users', fid))));
        for (const s of snaps) {
          if (s.exists()) all.push({ ...s.data(), id: s.id, uid: s.id });
        }
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
      let results = snap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id, uid: d.id } as any))
        .filter((u) => u.id !== user?.uid);
      if (results.length < 5) {
        // Fallback: wider search for contains (still capped).
        const wide = await getDocs(query(collection(db, 'users'), limit(120)));
        const merged = wide.docs
          .map((d) => ({ ...(d.data() as any), id: d.id, uid: d.id } as any))
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
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), { friends: arrayRemove(friendId) });
      batch.update(doc(db, 'users', friendId), { friends: arrayRemove(user.uid) });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const sendFriendRequest = async (targetId: string) => {
    if (!user || targetId === user.uid) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), { friendRequestsOutgoing: arrayUnion(targetId) });
      batch.update(doc(db, 'users', targetId), { friendRequestsIncoming: arrayUnion(user.uid) });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const cancelFriendRequest = async (targetId: string) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), { friendRequestsOutgoing: arrayRemove(targetId) });
      batch.update(doc(db, 'users', targetId), { friendRequestsIncoming: arrayRemove(user.uid) });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const acceptFriendRequest = async (requesterId: string) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), {
        friendRequestsIncoming: arrayRemove(requesterId),
        friends: arrayUnion(requesterId)
      });
      batch.update(doc(db, 'users', requesterId), {
        friendRequestsOutgoing: arrayRemove(user.uid),
        friends: arrayUnion(user.uid)
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const rejectFriendRequest = async (requesterId: string) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), { friendRequestsIncoming: arrayRemove(requesterId) });
      batch.update(doc(db, 'users', requesterId), { friendRequestsOutgoing: arrayRemove(user.uid) });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const viewProfile = async (friendUser: any) => {
    setSelectedUser(friendUser);
    setHistoryBlockedMessage(null);
    const fid = friendUser.uid || friendUser.id;
    // Marco equipado del amigo: se lee de users/{uid} al abrir el perfil (la lista puede no traerlo).
    getDoc(doc(db, 'users', fid))
      .then((s) => {
        const frameId = s.exists() ? s.data()?.profileFrameId ?? null : null;
        setSelectedUser((prev: any) => (prev && (prev.uid || prev.id) === fid ? { ...prev, profileFrameId: frameId } : prev));
      })
      .catch(() => {
        /* sin marco si no se puede leer */
      });
    const canViewHistory = friendsIds.includes(fid);
    if (!canViewHistory) {
      setSelectedUserHistory([]);
      setHistoryBlockedMessage('Debes ser amigo aceptado para ver su historial.');
      return;
    }
    try {
      const q = query(collection(db, 'rideHistory'), where('uid', '==', fid), orderBy('endTime', 'desc'), limit(10));
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
    <>
    <div
      className="mr-scrim-enter fixed inset-0 z-50 flex items-end justify-center bg-[#14110e73] p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="mr-sheet mr-sheet-enter flex h-[88dvh] w-full max-w-2xl flex-col overflow-hidden sm:h-[80vh] sm:rounded-[22px] sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-mr-line flex items-center justify-between shrink-0">
          <h2 className="mr-title flex items-center gap-2 text-[2rem] uppercase">
            {selectedUser ? (
              <button onClick={() => setSelectedUser(null)} className="text-mr-accent-text hover:text-mr-accent-text mr-2">
                &larr; Volver
              </button>
            ) : 'Comunidad y Amigos'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-mr-line rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {selectedUser ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <AvatarFrame frameId={resolvePeerFrameId(selectedUser.profileFrameId)} size={80} className="shrink-0">
                  <div
                    className={`w-20 h-20 rounded-full overflow-hidden border-2 bg-mr-line ${
                      selectedUser.isPremium === true ? 'border-mr-accent' : 'border-mr-accent'
                    }`}
                  >
                    {selectedUser.photoURL ? (
                      <img src={selectedUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserIcon size={32} className="text-mr-muted" />
                      </div>
                    )}
                  </div>
                </AvatarFrame>
                <div>
                  <h3 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
                    {selectedUser.displayName}
                    {selectedUser.isPremium === true ? <PremiumBadge /> : null}
                  </h3>
                  <p className="text-mr-muted">
                    Nivel {selectedUser.level || 1} •{' '}
                    <span className="font-bold text-mr-accent-text tabular-nums">{selectedUser.points || 0}</span> pts
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-mr-paper px-4 py-3 rounded-[14px] text-center border border-mr-line">
                  <p className="text-[11px] text-mr-muted uppercase font-bold tracking-wider mb-1">Km Totales</p>
                  <p className="font-black text-xl text-mr-ink">{(selectedUser.totalDistance || 0).toFixed(1)}</p>
                </div>
                <div className="bg-mr-paper px-4 py-3 rounded-[14px] text-center border border-mr-line">
                  <p className="text-[11px] text-mr-muted uppercase font-bold tracking-wider mb-1">Curvas Totales</p>
                  <p className="font-black text-xl text-mr-ink">{(selectedUser.totalLeftTurns || 0) + (selectedUser.totalRightTurns || 0)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-mr-line bg-mr-page/50 p-4">
                <MedalShowcase user={selectedUser} readOnly />
              </div>

              {friendsIds.includes(String(selectedUser.uid || selectedUser.id || '').trim()) ? (
                <button
                  type="button"
                  onClick={() =>
                    setDmPeer({
                      uid: String(selectedUser.uid || selectedUser.id || '').trim(),
                      name: String(selectedUser.displayName || 'Amigo').slice(0, 80),
                    })
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-mr-accent bg-mr-accent/20 py-3 text-sm font-black text-mr-accent-text hover:bg-mr-accent-hover/20"
                >
                  <MessageCircle size={18} />
                  Chat privado
                </button>
              ) : null}

              <div>
                <h4 className="font-bold text-lg mb-4">Historial de Rutas</h4>
                {historyBlockedMessage && (
                  <div className="mb-3 bg-mr-page border border-mr-line rounded-xl px-3 py-2 text-sm text-mr-muted">
                    {historyBlockedMessage}
                  </div>
                )}
                <div className="space-y-3">
                  {selectedUserHistory.length > 0 ? (
                    selectedUserHistory.map((ride) => (
                      <div
                        key={ride.id}
                        className="bg-mr-page border border-mr-line rounded-2xl p-4 flex flex-col gap-2"
                      >
                        <h5 className="text-lg font-black text-mr-accent-text leading-snug tracking-tight">
                          {formatRideCardTitle(ride.groupName, ride.endTime)}
                        </h5>
                        <p className="text-sm text-mr-muted">{formatRideCardSubtitle(ride.endTime)}</p>
                        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 mt-1">
                          <span className="text-sm">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-mr-muted">
                              Dist.{' '}
                            </span>
                            <span className="font-semibold text-mr-ink tabular-nums">
                              {ride.distance != null ? Number(ride.distance).toFixed(1) : '—'} km
                            </span>
                          </span>
                          <span className="text-sm">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-mr-muted">
                              Pts{' '}
                            </span>
                            <span className="font-bold text-mr-accent-text tabular-nums">
                              +{rideHistoryPointsEarned(ride)}
                            </span>
                          </span>
                        </div>
                        {ride.routeGeoJSON && (
                          <button
                            type="button"
                            onClick={() => repeatRoute(ride.routeGeoJSON)}
                            className="mt-2 flex items-center justify-center gap-2 text-xs font-bold bg-mr-line hover:bg-mr-line text-mr-ink px-4 py-2.5 rounded-xl transition-all w-full sm:w-auto sm:self-start"
                          >
                            <Play size={14} /> Repetir ruta
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-mr-muted text-sm italic">Este usuario no tiene rutas públicas.</p>
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mr-muted" size={18} />
                    <input 
                      type="text"
                      placeholder="Buscar moteros por nombre..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-mr-page border border-mr-line rounded-xl pl-10 pr-4 py-3 text-mr-ink focus:outline-none focus:border-mr-accent transition-colors"
                    />
                  </div>
                  <button 
                    onClick={handleSearch}
                    className="mr-btn-primary min-h-[48px] px-6 rounded-xl font-bold"
                  >
                    Buscar
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2 mb-8">
                    <h3 className="text-sm font-bold text-mr-muted uppercase mb-3">Resultados</h3>
                  {searchResults.map(res => {
                      const rid = res.uid || res.id;
                      const isFriend = friendsIds.includes(rid);
                      const isIncoming = incomingIds.includes(rid);
                      const isOutgoing = outgoingIds.includes(rid);
                      return (
                        <div key={rid} className="flex items-center justify-between bg-mr-page border border-mr-line p-3 rounded-xl">
                          <div className="flex items-center gap-3 cursor-pointer" onClick={() => viewProfile({ ...res, uid: rid })}>
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-mr-line">
                              {res.photoURL ? <img src={res.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-auto h-full text-mr-muted" />}
                            </div>
                            <div>
                              <p className="font-bold flex items-center gap-2 flex-wrap">
                                {res.displayName}
                                {res.isPremium === true ? <PremiumBadge compact /> : null}
                              </p>
                              <p className="text-xs text-mr-muted">Nivel {res.level || 1}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isIncoming ? (
                              <>
                                <button onClick={() => acceptFriendRequest(rid)} className="p-2 rounded-lg bg-[#1f6b3a]/10 text-[#1f6b3a] hover:bg-[#1f6b3a]/20"><Check size={18} /></button>
                                <button onClick={() => rejectFriendRequest(rid)} className="p-2 rounded-lg bg-[#a3261c]/10 text-[#a3261c] hover:bg-[#8a1f17]/20"><Ban size={18} /></button>
                              </>
                            ) : isFriend ? (
                              <button 
                                onClick={() => removeFriend(rid)}
                                className="p-2 rounded-lg transition-colors bg-[#a3261c]/10 text-[#a3261c] hover:bg-[#8a1f17]/20"
                              >
                                <UserMinus size={18} />
                              </button>
                            ) : isOutgoing ? (
                              <button
                                onClick={() => cancelFriendRequest(rid)}
                                className="p-2 rounded-lg transition-colors bg-mr-accent/10 text-mr-accent-text hover:bg-mr-accent-hover/20"
                                title="Solicitud pendiente"
                              >
                                <Clock size={18} />
                              </button>
                            ) : (
                              <button 
                                onClick={() => sendFriendRequest(rid)}
                                className="p-2 rounded-lg transition-colors bg-[#1d4f8a]/10 text-[#1d4f8a] hover:bg-[#1d4f8a]/20"
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
                  <h3 className="text-sm font-bold text-mr-muted uppercase mb-3">Solicitudes recibidas</h3>
                  <div className="space-y-2">
                    {incomingUsers.map((u) => (
                        <div key={`incoming-${u.uid || u.id}`} className="flex items-center justify-between bg-mr-page border border-mr-line p-3 rounded-xl">
                          <p className="text-sm font-semibold flex items-center gap-2">
                            {u.displayName}
                            {u.isPremium === true ? <PremiumBadge compact /> : null}
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => acceptFriendRequest(u.uid)} className="p-2 rounded-lg bg-[#1f6b3a]/10 text-[#1f6b3a] hover:bg-[#1f6b3a]/20"><Check size={18} /></button>
                            <button onClick={() => rejectFriendRequest(u.uid)} className="p-2 rounded-lg bg-[#a3261c]/10 text-[#a3261c] hover:bg-[#8a1f17]/20"><Ban size={18} /></button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Friends List */}
              <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <UserIcon className="text-mr-accent-text" size={20} />
                  Mis Amigos
                </h3>
                {friends.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {friends.map(friend => {
                      const fid = friend.uid || friend.id;
                      return (
                      <div key={fid} className="flex items-center justify-between rounded-[var(--radius-control)] border border-mr-line bg-mr-paper p-3 transition-colors hover:border-mr-accent">
                        <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => viewProfile({ ...friend, uid: fid })}>
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-mr-line shrink-0">
                            {friend.photoURL ? <img src={friend.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-auto h-full text-mr-muted" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate flex items-center gap-2">
                              <span className="truncate">{friend.displayName}</span>
                              {friend.isPremium === true ? <PremiumBadge compact /> : null}
                            </p>
                            <p className="text-xs text-mr-muted">Nivel {friend.level || 1}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDmPeer({ uid: fid, name: String(friend.displayName || 'Amigo').slice(0, 80) });
                            }}
                            className="mr-focus inline-flex h-11 w-11 items-center justify-center rounded-full text-mr-muted transition-colors hover:bg-mr-line hover:text-mr-accent-text"
                            title="Chat privado"
                          >
                            <MessageCircle size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeFriend(fid);
                            }}
                            className="mr-focus inline-flex h-11 w-11 items-center justify-center rounded-full text-mr-subtle transition-colors hover:bg-mr-line hover:text-[#a3261c]"
                            title="Eliminar amigo"
                          >
                            <UserMinus size={18} />
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-mr-page rounded-2xl border border-mr-line">
                    <p className="text-mr-muted text-sm">Aún no has añadido amigos.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {dmPeer ? (
      <FriendDirectChatModal
        open
        onClose={() => setDmPeer(null)}
        peerUid={dmPeer.uid}
        peerDisplayName={dmPeer.name}
      />
    ) : null}
    </>
  );
}
