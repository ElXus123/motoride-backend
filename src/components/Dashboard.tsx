import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import { db, logOut, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { parseGPX, parseRouteData } from '../lib/gpx';
import { calculateLevel, formatDurationHoursMinutes } from '../lib/utils';
import { requestJson } from '../lib/network';
import { LEAFLET_LIGHT_ERROR_TILE } from '../lib/leafletTiles';
import { Users, Plus, LogOut, User as UserIcon, Activity, Trash2, Calendar, MapPin, Search, Clock, ChevronRight, Upload, X, Map as MapIcon, HeartHandshake, CircleDollarSign, Shield, CheckCircle2, AlertCircle, Mail, Share2, Copy, Check, Loader2, Globe, Lock, Inbox, UserPlus, ListOrdered } from 'lucide-react';
import { copyTextToClipboard, getSupportMailtoHref } from '../lib/clientInfo';
import { generateGroupCode } from '../lib/groupCode';
import {
  canShowRouteInExplore,
  canInviteToScheduledRoute,
  normalizeFriendIds,
  ROUTE_LISTING_LABELS,
  type RouteListing,
} from '../lib/routeListing';
import { requestUserLocation, reverseGeocodeProvinceMunicipality } from '../lib/reverseGeocode';
import { getLevelRingWrapperClass } from '../lib/levelRing';
import { canEnterScheduledRouteSession } from '../lib/scheduledRouteAccess';
import {
  fetchNominatimSuggestions,
  resolveDestinationForRouting,
  formatOsrmDestCoords,
  destinationLabelsMatch,
  type PickedDestination,
  type NominatimItem,
} from '../lib/routePlannerDestination';
import appIcon from '../../ICONO.png';
import FriendsModal from './FriendsModal';
import InvitesMailboxModal from './InvitesMailboxModal';
import InviteFriendsModal from './InviteFriendsModal';
import PremiumBadge from './PremiumBadge';
import ScheduledRouteAttendees from './ScheduledRouteAttendees';
import ScheduledRouteSoonOverlay from './ScheduledRouteSoonOverlay';

interface DashboardProps {
  onJoinGroup: (id: string) => void;
  onRepeatRoute: (route: string) => void;
  onOpenProfile: () => void;
}

const PROVINCE_MAPPING: {[key: string]: string} = {
  'Álava': '01', 'Albacete': '02', 'Alicante': '03', 'Almería': '04', 'Ávila': '05', 'Badajoz': '06',
  'Islas Baleares': '07', 'Barcelona': '08', 'Burgos': '09', 'Cáceres': '10', 'Cádiz': '11', 'Castellón': '12',
  'Ciudad Real': '13', 'Córdoba': '14', 'La Coruña': '15', 'Cuenca': '16', 'Gerona': '17', 'Granada': '18',
  'Guadalajara': '19', 'Guipúzcoa': '20', 'Huelva': '21', 'Huesca': '22', 'Jaén': '23', 'León': '24',
  'Lérida': '25', 'La Rioja': '26', 'Lugo': '27', 'Madrid': '28', 'Málaga': '29', 'Murcia': '30',
  'Navarra': '31', 'Orense': '32', 'Asturias': '33', 'Palencia': '34', 'Las Palmas': '35', 'Pontevedra': '36',
  'Salamanca': '37', 'Santa Cruz de Tenerife': '38', 'Cantabria': '39', 'Segovia': '40', 'Sevilla': '41',
  'Soria': '42', 'Tarragona': '43', 'Teruel': '44', 'Toledo': '45', 'Valencia': '46', 'Valladolid': '47',
  'Vizcaya': '48', 'Zamora': '49', 'Zaragoza': '50'
};

export default function Dashboard({ onJoinGroup, onRepeatRoute, onOpenProfile }: DashboardProps) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setUserData(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [user]);

  const points = Math.max(0, Number(userData?.points || 0));
  const pendingFriendRequestCount = Array.isArray(userData?.friendRequestsIncoming)
    ? userData.friendRequestsIncoming.length
    : 0;
  const levelData = calculateLevel(points);
  const level = levelData.level;
  const levelRange = levelData.pointsForNextLevel - levelData.prevLevelPoints;
  /** 0–100 % del tramo actual hacia el siguiente nivel (solo para la barra visual del header). */
  const levelProgressPercent =
    levelRange > 0 ? Math.min(100, (levelData.remainingPoints / levelRange) * 100) : 0;

  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [scheduledRoutes, setScheduledRoutes] = useState<any[]>([]);
  const [nearbyRoutes, setNearbyRoutes] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [routeGenFeedback, setRouteGenFeedback] = useState<null | { kind: 'success' | 'error'; title: string; detail?: string }>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [donationEngagementStart, setDonationEngagementStart] = useState<number | null>(null);
  const [scheduledInviteModal, setScheduledInviteModal] = useState<null | { groupId: string; groupName: string; memberUids: string[] }>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<any>(null);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const supportPopupRef = useRef<Window | null>(null);
  const premiumCandidateWrittenThisOpenRef = useRef(false);
  const lastBackHandledAtRef = useRef(0);
  const prevLayersRef = useRef({
    showCreateModal: false,
    showFriendsModal: false,
    showSupportModal: false,
    hasPreview: false,
    showJoinCodeModal: false,
  });
  /** Tras crear ruta programada: mostrar código y enlaces de invitación (antes no se veía el código). */
  const [postScheduleInvite, setPostScheduleInvite] = useState<{
    code: string;
    name: string;
    routeListing: RouteListing;
  } | null>(null);
  const [scheduleInviteCopied, setScheduleInviteCopied] = useState<'code' | 'link' | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<'scheduled' | null>(null);
  const exploreGpsFilledRef = useRef(false);
  const [exploreFromGpsHint, setExploreFromGpsHint] = useState(false);
  /** Aviso 1 h antes: ruta programada a la que estás apuntado y ya puedes entrar al grupo. */
  const [scheduledSoonRoute, setScheduledSoonRoute] = useState<{
    id: string;
    name: string;
    code: string;
    ts: number;
  } | null>(null);
  /** Abrir bloque «Apuntados» desde el botón inferior (por id de ruta/grupo). */
  const [attendeesExpandNonceByRouteId, setAttendeesExpandNonceByRouteId] = useState<Record<string, number>>({});
  const bumpAttendeesList = (routeId: string) => {
    setAttendeesExpandNonceByRouteId((prev) => ({
      ...prev,
      [routeId]: (prev[routeId] ?? 0) + 1,
    }));
  };

  // Create Route Form State
  const [routeName, setRouteName] = useState('');
  const [routeType, setRouteType] = useState<'instant' | 'scheduled'>('instant');
  const [isEsporadica, setIsEsporadica] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [province, setProvince] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [description, setDescription] = useState('');
  const [gpxData, setGpxData] = useState<string | null>(null);
  /** Solo para rutas programadas (`isScheduled`): quién ve la ruta en "Explorar". */
  const [routeListing, setRouteListing] = useState<RouteListing>('public');
  const [destination, setDestination] = useState('');
  const [destinationPreview, setDestinationPreview] = useState<string | null>(null);
  const [destinationSuggestions, setDestinationSuggestions] = useState<NominatimItem[]>([]);
  /** Si el usuario elige una sugerencia, reutilizamos coords y evitamos otra petición Nominatim al generar. */
  const destinationPickedRef = useRef<PickedDestination | null>(null);
  /** Índice resaltado en la lista (Enter elige esta fila). */
  const [destinationHighlightIdx, setDestinationHighlightIdx] = useState(0);
  const [routeOptions, setRouteOptions] = useState({
    curves: true,
    secondary: true,
    highway: false
  });

  // Debounce destino: misma orden que `resolveDestinationForRouting` (pickBest) para alinear lista y cálculo
  useEffect(() => {
    const ac = new AbortController();
    if (destination.trim().length < 3) {
      setDestinationPreview(null);
      setDestinationSuggestions([]);
      setDestinationHighlightIdx(0);
      return () => ac.abort();
    }
    const timer = setTimeout(() => {
      const q = destination.trim();
      fetchNominatimSuggestions(q, { signal: ac.signal })
        .then((sorted) => {
          if (sorted.length > 0) {
            const top = sorted.slice(0, 5);
            setDestinationPreview(top[0]?.display_name ?? '');
            setDestinationSuggestions(top);
            setDestinationHighlightIdx(0);
          } else {
            setDestinationPreview('No encontrado');
            setDestinationSuggestions([]);
            setDestinationHighlightIdx(0);
          }
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === 'AbortError') return;
          const status = (e as { status?: number })?.status;
          if (status === 429) {
            setDestinationPreview('Demasiadas peticiones, espera un poco...');
            return;
          }
          console.error(e);
          setDestinationPreview('Error al buscar');
          setDestinationSuggestions([]);
          setDestinationHighlightIdx(0);
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [destination]);

  useEffect(() => {
    setDestinationHighlightIdx((i) =>
      destinationSuggestions.length === 0 ? 0 : Math.min(i, destinationSuggestions.length - 1)
    );
  }, [destinationSuggestions]);

  // Search State
  const [searchProvince, setSearchProvince] = useState('');
  const [searchMunicipality, setSearchMunicipality] = useState('');

  const [routeStats, setRouteStats] = useState<{ distance: number, duration: number } | null>(null);
  const [routeGenerated, setRouteGenerated] = useState(false);

  // Constants for provinces
  const PROVINCES = [
    'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona', 'Burgos', 'Cáceres',
    'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Gerona', 'Granada', 'Guadalajara',
    'Guipúzcoa', 'Huelva', 'Huesca', 'Islas Baleares', 'Jaén', 'La Coruña', 'La Rioja', 'Las Palmas', 'León',
    'Lérida', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Orense', 'Palencia', 'Pontevedra', 'Salamanca',
    'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia',
    'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza'
  ];

  const [searchMunis, setSearchMunis] = useState<string[]>([]);
  const [createMunis, setCreateMunis] = useState<string[]>([]);
  const [inviteInboxCount, setInviteInboxCount] = useState(0);
  const [showInvitesMailbox, setShowInvitesMailbox] = useState(false);
  const [friendsPlannedRoutes, setFriendsPlannedRoutes] = useState<any[]>([]);
  const friendsRoutesChunkRef = useRef<Record<number, Record<string, any>>>({});

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'invites'), (snap) => {
      setInviteInboxCount(snap.size);
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const friendIds = normalizeFriendIds(userData?.friends);
    friendsRoutesChunkRef.current = {};
    if (friendIds.length === 0) {
      setFriendsPlannedRoutes([]);
      return;
    }
    const chunkSize = 28;
    const chunks: string[][] = [];
    for (let i = 0; i < friendIds.length; i += chunkSize) {
      chunks.push(friendIds.slice(i, i + chunkSize));
    }
    const unsubs = chunks.map((chunk, chunkIdx) => {
      const q = query(
        collection(db, 'groups'),
        where('isScheduled', '==', true),
        where('createdBy', 'in', chunk)
      );
      return onSnapshot(
        q,
        (snapshot) => {
          const map: Record<string, any> = {};
          snapshot.docs.forEach((d) => {
            map[d.id] = { id: d.id, ...d.data() };
          });
          friendsRoutesChunkRef.current[chunkIdx] = map;
          const merged = Object.values(friendsRoutesChunkRef.current).flatMap((m) => Object.values(m));
          const now = Date.now();
          setFriendsPlannedRoutes(
            merged.filter((r) => (r.scheduledTimestamp || 0) > now && r.code)
          );
        },
        (error) => {
          console.error('Rutas de amigos:', error);
          handleFirestoreError(error, OperationType.LIST, 'groups/friends-routes');
        }
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, userData?.friends]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const openSupportLink = (url: string) => {
    const popup = window.open(
      url,
      'supportWindow',
      'popup=yes,width=520,height=760,noopener,noreferrer'
    );
    if (popup) {
      supportPopupRef.current = popup;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const closeSupportModal = () => {
    setShowSupportModal(false);
    setDonationEngagementStart(null);
  };

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setLoading(false);
    setRouteListing('public');
  }, []);

  useEffect(() => {
    if (showSupportModal) {
      premiumCandidateWrittenThisOpenRef.current = false;
    } else {
      setDonationEngagementStart(null);
    }
  }, [showSupportModal]);

  useEffect(() => {
    if (!showSupportModal || donationEngagementStart == null || !user) return;
    const id = window.setInterval(async () => {
      if (Date.now() - donationEngagementStart < 10000) return;
      if (premiumCandidateWrittenThisOpenRef.current) return;
      premiumCandidateWrittenThisOpenRef.current = true;
      try {
        await setDoc(
          doc(db, 'premiumCandidates', user.uid),
          {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || userData?.displayName || '',
            photoURL: user.photoURL || userData?.photoURL || '',
            updatedAt: Date.now(),
            source: 'support_modal_donation_10s'
          },
          { merge: true }
        );
      } catch (error) {
        premiumCandidateWrittenThisOpenRef.current = false;
        handleFirestoreError(error, OperationType.WRITE, `premiumCandidates/${user.uid}`);
      }
    }, 500);
    return () => clearInterval(id);
  }, [showSupportModal, donationEngagementStart, user, userData?.displayName, userData?.photoURL]);

  // Create browser-history layers for dashboard overlays.
  useEffect(() => {
    const prev = prevLayersRef.current;
    if (showJoinCodeModal && !prev.showJoinCodeModal) window.history.pushState({ layer: 'joinCode' }, '');
    if (showCreateModal && !prev.showCreateModal) window.history.pushState({ layer: 'create' }, '');
    if (showFriendsModal && !prev.showFriendsModal) window.history.pushState({ layer: 'friends' }, '');
    if (showSupportModal && !prev.showSupportModal) window.history.pushState({ layer: 'support' }, '');
    if (!!showPreviewModal && !prev.hasPreview) window.history.pushState({ layer: 'preview' }, '');

    prevLayersRef.current = {
      showCreateModal,
      showFriendsModal,
      showSupportModal,
      hasPreview: !!showPreviewModal,
      showJoinCodeModal,
    };
  }, [showJoinCodeModal, showCreateModal, showFriendsModal, showSupportModal, showPreviewModal]);

  // Mobile back button: close external popup/overlays before leaving dashboard.
  useEffect(() => {
    const onPopState = () => {
      const now = Date.now();
      if (now - lastBackHandledAtRef.current < 300) return;
      lastBackHandledAtRef.current = now;

      if (supportPopupRef.current && !supportPopupRef.current.closed) {
        supportPopupRef.current.close();
        supportPopupRef.current = null;
        return;
      }
      if (routeGenFeedback) {
        setRouteGenFeedback(null);
        return;
      }
      if (showPreviewModal) {
        setShowPreviewModal(null);
        return;
      }
      if (showJoinCodeModal) {
        setShowJoinCodeModal(false);
        return;
      }
      if (showCreateModal) {
        closeCreateModal();
        return;
      }
      if (showFriendsModal) {
        setShowFriendsModal(false);
        return;
      }
      if (showSupportModal) {
        closeSupportModal();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [
    showJoinCodeModal,
    showCreateModal,
    showFriendsModal,
    showSupportModal,
    showPreviewModal,
    routeGenFeedback,
    closeCreateModal,
  ]);

  useEffect(() => {
    if (!user) return;
    const scheduledQ = query(collection(db, 'groups'), where('members', 'array-contains', user.uid), where('isScheduled', '==', true));
    const unsubscribeScheduled = onSnapshot(scheduledQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setScheduledRoutes(data.filter(r => (r.scheduledTimestamp || 0) > Date.now() - 3600000));
    }, (error) => {
      console.error("Error en rutas programadas:", error);
      handleFirestoreError(error, OperationType.LIST, 'groups');
    });

    return () => {
      unsubscribeScheduled();
    };
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;

    const evaluate = () => {
      const now = Date.now();
      for (const r of scheduledRoutes) {
        const ts = Number(r.scheduledTimestamp);
        if (!Number.isFinite(ts) || ts <= 0) continue;
        if (!canEnterScheduledRouteSession(ts)) continue;
        if (now > ts + 6 * 60 * 60 * 1000) continue;
        try {
          const dismissKey = `motoride_soon_dismiss_${r.id}_${ts}`;
          if (sessionStorage.getItem(dismissKey)) continue;
        } catch {
          /* private mode */
        }
        const code = String((r as { code?: string }).code || r.id || '')
          .toUpperCase()
          .trim();
        if (code.length !== 6) continue;
        setScheduledSoonRoute({
          id: String(r.id),
          name: String((r as { name?: string }).name || 'Ruta'),
          code,
          ts,
        });
        return;
      }
      setScheduledSoonRoute(null);
    };

    evaluate();
    const tick = window.setInterval(evaluate, 15000);
    return () => clearInterval(tick);
  }, [scheduledRoutes, user?.uid]);

  /** Explorar rutas: rellenar provincia/municipio desde GPS una vez al cargar. */
  useEffect(() => {
    if (!user?.uid || exploreGpsFilledRef.current) return;
    let cancelled = false;
    (async () => {
      const pos = await requestUserLocation();
      if (!pos || cancelled) return;
      const parts = await reverseGeocodeProvinceMunicipality(pos.lat, pos.lon);
      if (!parts || cancelled) return;
      exploreGpsFilledRef.current = true;
      if (parts.province) setSearchProvince(parts.province);
      if (parts.municipality) setSearchMunicipality(parts.municipality);
      setExploreFromGpsHint(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  /** Crear ruta: al abrir el modal, rellenar provincia/municipio desde GPS hasta que el planificador los fije por el punto de salida. */
  useEffect(() => {
    if (!user || !showCreateModal) return;
    let cancelled = false;
    (async () => {
      const pos = await requestUserLocation();
      if (!pos || cancelled) return;
      const parts = await reverseGeocodeProvinceMunicipality(pos.lat, pos.lon);
      if (!parts || cancelled) return;
      if (parts.province) setProvince(parts.province);
      if (parts.municipality) setMunicipality(parts.municipality);
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreateModal, user]);

  // Search for routes
  useEffect(() => {
    if (!searchProvince) {
      setNearbyRoutes([]);
      return;
    }

    let q = query(
      collection(db, 'groups'), 
      where('province', '==', searchProvince.trim().toLowerCase()),
      where('isScheduled', '==', true)
    );

    if (searchMunicipality) {
      q = query(q, where('municipality', '==', searchMunicipality.trim().toLowerCase()));
    }

    const friendIds = normalizeFriendIds(userData?.friends);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      const uid = user?.uid;
      setNearbyRoutes(
        data.filter(
          (r) =>
            (r.scheduledTimestamp || 0) > Date.now() &&
            canShowRouteInExplore(r, uid, friendIds)
        )
      );
    }, (error) => {
      console.error("Error buscando rutas cercanas:", error);
      handleFirestoreError(error, OperationType.LIST, 'groups');
    });

    return () => unsubscribe();
  }, [searchProvince, searchMunicipality, user?.uid, userData?.friends]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      const parsed = parseGPX(raw);
      const routeCoords = (parsed as any)?.features?.find((f: any) => f?.geometry?.type === 'LineString')?.geometry?.coordinates;
      if (!routeCoords || routeCoords.length < 2) {
        showMessage({ variant: 'error', title: 'GPX', message: 'El archivo GPX no contiene una ruta válida.' });
        return;
      }
      setGpxData(JSON.stringify(parsed));
      setRouteGenerated(true);
    };
    reader.readAsText(file);
  };

  /** Provincia/municipio desde coordenadas GPS; si falla, reintenta con ubicación actual. */
  const resolveProvinceMunicipalityFromCoords = async (
    lat: number,
    lon: number
  ): Promise<{ province: string; municipality: string } | null> => {
    let r = await reverseGeocodeProvinceMunicipality(lat, lon);
    if (r) return r;
    const again = await requestUserLocation();
    if (!again) return null;
    r = await reverseGeocodeProvinceMunicipality(again.lat, again.lon);
    return r;
  };

  const createRoute = async () => {
    if (!user) return;
    
    // Default name for spontaneous routes if empty
    const finalRouteName = routeName || (isEsporadica ? `Ruta Espontánea ${new Date().toLocaleDateString()}` : '');
    if (!finalRouteName) {
      showMessage({ variant: 'info', title: 'Nombre', message: 'Por favor, introduce un nombre para la ruta.' });
      return;
    }

    setLoading(true);
    const code = generateGroupCode();
    
    const scheduledTimestamp = routeType === 'scheduled' 
      ? new Date(`${scheduledDate}T${scheduledTime}`).getTime() 
      : Date.now();

    let provFinal = province.trim().toLowerCase();
    let munFinal = municipality.trim().toLowerCase();
    if (!provFinal || !munFinal) {
      const pos = await requestUserLocation();
      if (pos) {
        const rev = await resolveProvinceMunicipalityFromCoords(pos.lat, pos.lon);
        if (rev) {
          provFinal = rev.province;
          munFinal = rev.municipality;
          setProvince(rev.province);
          setMunicipality(rev.municipality);
        }
      }
    }

    // Firestore rules: routeGeoJSON must be absent or a string — null rejects validation (espontánea sin GPX).
    const groupData = {
      name: finalRouteName,
      code,
      createdBy: user.uid,
      members: [user.uid],
      isScheduled: routeType === 'scheduled',
      scheduledTimestamp,
      province: provFinal,
      municipality: munFinal,
      description: description.trim(),
      isEsporadica,
      createdAt: Date.now(),
      ...(routeType === 'scheduled' ? { routeListing } : {}),
      ...(gpxData ? { routeGeoJSON: gpxData } : {}),
    };

    try {
      await setDoc(doc(db, 'groups', code), groupData);
      closeCreateModal();
      if (routeType === 'instant') {
        onJoinGroup(code);
      } else {
        setPostScheduleInvite({ code, name: finalRouteName, routeListing });
        setScheduleInviteCopied(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `groups/${code}`);
    } finally {
      setLoading(false);
    }
  };

  const generateLocalRoute = async () => {
    if (!destination.trim() || !user) return;
    setLoading(true);
    try {
      if (!navigator.geolocation) {
        setRouteGenFeedback({
          kind: 'error',
          title: 'GPS no disponible',
          detail: 'Tu navegador no permite obtener la ubicación. Prueba desde el móvil o otro navegador.'
        });
        return;
      }

      const trimmed = destination.trim();

      const gpsPromise = new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 12000,
          maximumAge: 120000,
          enableHighAccuracy: false,
        });
      });

      const destPromise = resolveDestinationForRouting(trimmed, destinationPickedRef.current);

      const gpsOutcomePromise = gpsPromise
        .then((p) => ({ ok: true as const, p }))
        .catch(() => ({ ok: false as const, gpsErr: true as const }));

      const [destRes, gpsOutcome] = await Promise.all([destPromise, gpsOutcomePromise]);

      if (!gpsOutcome.ok) {
        setRouteGenFeedback({
          kind: 'error',
          title: 'Sin posición GPS',
          detail: 'Permite la ubicación en el navegador o espera unos segundos. Si ya diste permiso, activa el GPS del dispositivo.',
        });
        return;
      }

      if (destRes.ok === false) {
        const reason = destRes.reason;
        setRouteGenFeedback({
          kind: 'error',
          title: reason === 'network' ? 'Error de red' : 'Destino no encontrado',
          detail:
            reason === 'network'
              ? 'No se pudo contactar con el buscador de direcciones. Revisa la conexión e inténtalo de nuevo.'
              : 'Prueba con una ciudad más concreta o elige un resultado de la lista.',
        });
        return;
      }

      const destCoords = formatOsrmDestCoords(destRes.lon, destRes.lat);
      const geoData = [destRes.primary];
      const pos = gpsOutcome.p;

      const start = `${pos.coords.longitude},${pos.coords.latitude}`;
      const profile = 'driving';
      // steps=false aligera la respuesta del servidor público OSRM (solo necesitamos la geometría).
      const url = `https://router.project-osrm.org/route/v1/${profile}/${start};${destCoords}?overview=full&geometries=geojson&steps=false`;

      const data = await requestJson<any>(url, { timeoutMs: 15000, retries: 0, backoffMs: 500 });
      if (data.code === 'Ok') {
        const route = data.routes[0];
        setGpxData(JSON.stringify(route.geometry));
        setRouteStats({
          distance: route.distance / 1000,
          duration: route.duration / 60
        });
        setRouteGenerated(true);
        setIsEsporadica(false);

        // Zona de la ruta = punto de salida (GPS), no el destino
        const rev = await resolveProvinceMunicipalityFromCoords(
          pos.coords.latitude,
          pos.coords.longitude
        );
        if (rev) {
          setProvince(rev.province);
          setMunicipality(rev.municipality);
        }

        if (!routeOptions.highway && route.distance > 0) {
          console.log('Route generated with OSRM. Note: OSRM public API defaults to fastest route.');
        }

        setRouteGenFeedback({
          kind: 'success',
          title: '¡Ruta lista!',
          detail: destRes.displayName || geoData[0]?.display_name || destination
        });
      } else {
        setRouteGenFeedback({
          kind: 'error',
          title: 'No se pudo calcular la ruta',
          detail: 'Prueba con otro destino o inténtalo de nuevo en unos segundos.'
        });
      }
    } catch (e) {
      console.error(e);
      setRouteGenFeedback({
        kind: 'error',
        title: 'Error de red',
        detail: 'No se pudo contactar con el servicio de rutas. Revisa la conexión e inténtalo de nuevo.'
      });
    } finally {
      setLoading(false);
    }
  };

  const joinGroup = async (codeToJoin?: string) => {
    const code = (codeToJoin || joinCode).toUpperCase().trim();
    if (!user || !code) return;
    setLoading(true);
    const groupRef = doc(db, 'groups', code);
    try {
      const snap = await getDoc(groupRef);
      
      if (snap.exists()) {
        await updateDoc(groupRef, {
          members: arrayUnion(user.uid)
        });
        setShowJoinCodeModal(false);
        onJoinGroup(code);
      } else {
        showMessage({ variant: 'error', title: 'Código', message: 'Grupo no encontrado. Comprueba el código.' });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${code}`);
    }
    setLoading(false);
  };

  const openScheduledInvite = (route: { code?: string; name?: string; members?: unknown }) => {
    const raw = String(route.code || '').trim().toUpperCase();
    if (raw.length !== 6) return;
    setScheduledInviteModal({
      groupId: raw,
      groupName: String(route.name || 'Ruta').trim().slice(0, 120) || 'Ruta',
      memberUids: Array.isArray(route.members)
        ? route.members.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [],
    });
  };

  const toggleRSVP = async (routeCode: string, isJoined: boolean) => {
    if (!user) return;
    const groupRef = doc(db, 'groups', routeCode);
    try {
      if (isJoined) {
        const snap = await getDoc(groupRef);
        const d = snap.data();
        if (d?.isScheduled === true && d?.createdBy === user.uid) {
          showMessage({
            variant: 'info',
            title: 'Ruta programada',
            message: 'Como organizador de una ruta programada no puedes desapuntarte. Borra la ruta si ya no la quieres.',
          });
          return;
        }
        await updateDoc(groupRef, {
          members: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(groupRef, {
          members: arrayUnion(user.uid)
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${routeCode}`);
    }
  };

  const deleteScheduledRoute = async (e: React.MouseEvent, routeId: string) => {
    e.stopPropagation();
    setDeletingId(routeId);
    setDeletingType('scheduled');
  };

  const confirmDeleteScheduled = async (routeId: string) => {
    try {
      await deleteDoc(doc(db, 'groups', routeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${routeId}`);
    }
    setDeletingId(null);
    setDeletingType(null);
  };

  const applyDestinationSuggestion = useCallback(
    (item: NominatimItem) => {
      const name = (item.display_name || '').trim();
      setDestination(name);
      setDestinationPreview(name || null);
      setDestinationSuggestions([]);
      setDestinationHighlightIdx(0);
      const lat = parseFloat(String(item.lat));
      const lon = parseFloat(String(item.lon));
      if (name && Number.isFinite(lat) && Number.isFinite(lon)) {
        destinationPickedRef.current = {
          label: name,
          lat,
          lon,
          address: item.address,
        };
      } else {
        destinationPickedRef.current = null;
      }
    },
    []
  );

  const isPremiumUser = user?.isPremium === true || userData?.isPremium === true;
  const displayName = userData?.displayName || user?.displayName || 'Motero';

  const renderHeaderAvatar = () => (
    <button
      type="button"
      onClick={onOpenProfile}
      className={`shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full p-[2px] hover:opacity-90 transition-opacity ${getLevelRingWrapperClass(level, isPremiumUser)}`}
    >
      <span className="block w-full h-full rounded-full overflow-hidden bg-zinc-800 border border-zinc-900">
        {userData?.photoURL ? (
          <img src={userData.photoURL} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserIcon size={20} className="text-zinc-500" />
          </div>
        )}
      </span>
    </button>
  );

  const renderHeaderProfileCard = () => (
    <button
      type="button"
      onClick={onOpenProfile}
      className="flex w-full min-w-0 flex-col gap-0 py-0 text-center rounded-[1rem] sm:rounded-[1.15rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      aria-label={`Abrir perfil: nivel ${level} y experiencia hacia el nivel ${level + 1}`}
    >
      <div className="relative flex flex-col gap-1 rounded-[1rem] sm:rounded-[1.15rem] border border-zinc-800 bg-zinc-900/90 px-2 py-1.5 sm:px-2.5 sm:py-1.5 transition-colors hover:border-zinc-700 hover:bg-zinc-900">
        {isOffline && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 ring-1 ring-red-900/40"
            title="Modo sin conexión"
          />
        )}
        <div className="flex min-h-0 w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 text-left leading-none pl-0.5">
          <span className="shrink-0 whitespace-nowrap rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black text-orange-400">
            Lv. {level}
          </span>
          {isPremiumUser && (
            <span className="shrink-0">
              <PremiumBadge compact />
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-left text-xs sm:text-sm font-bold text-white leading-tight">
            {displayName}
          </p>
        </div>
        <div
          className="h-1 w-full shrink-0 overflow-hidden rounded-full bg-zinc-800/95 ring-1 ring-zinc-700/50 pointer-events-none sm:h-1.5"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-amber-400 transition-[width] duration-500 ease-out"
            style={{ width: `${levelProgressPercent}%` }}
          />
        </div>
      </div>
    </button>
  );

  const renderHeaderActions = () => (
    <>
      <button
        type="button"
        onClick={() => setShowSupportModal(true)}
        className="flex h-9 w-9 sm:h-10 sm:w-auto sm:min-w-0 items-center justify-center gap-1.5 sm:px-2.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 transition-colors shrink-0"
        title="Apoyar MotoRide (Ko-fi)"
      >
        <HeartHandshake size={15} className="shrink-0 sm:w-4 sm:h-4" />
        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wide hidden sm:inline">Apoyar</span>
      </button>
      <button
        type="button"
        onClick={() => setShowInvitesMailbox(true)}
        className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center p-0 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-orange-400 shrink-0"
        title="Invitaciones a rutas"
      >
        <Inbox size={18} className="sm:w-5 sm:h-5" />
        {(inviteInboxCount > 0 || user?.rideInvitePending?.groupId) && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-[10px] font-black text-white flex items-center justify-center border-2 border-zinc-950">
            {inviteInboxCount > 0 ? (inviteInboxCount > 9 ? '9+' : inviteInboxCount) : '1'}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setShowFriendsModal(true)}
        className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center p-0 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white shrink-0"
        aria-label={
          pendingFriendRequestCount > 0
            ? `Amigos, ${pendingFriendRequestCount} solicitud${pendingFriendRequestCount === 1 ? '' : 'es'} pendiente${pendingFriendRequestCount === 1 ? '' : 's'}`
            : 'Amigos y Comunidad'
        }
        title={
          pendingFriendRequestCount > 0
            ? `Amigos y Comunidad (${pendingFriendRequestCount} solicitud${pendingFriendRequestCount === 1 ? '' : 'es'} pendiente${pendingFriendRequestCount === 1 ? '' : 's'})`
            : 'Amigos y Comunidad'
        }
      >
        <Users size={18} className="sm:w-5 sm:h-5" />
        {pendingFriendRequestCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-zinc-950" aria-hidden />
        )}
      </button>
    </>
  );

  return (
    <div className="min-h-dvh bg-zinc-950 text-white overflow-x-hidden pb-[env(safe-area-inset-bottom,0px)]">
      {/* Header — una fila: avatar | nivel/nombre/XP | acciones (como HUD compacto) */}
      <header className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-2.5 sm:pb-3">
        <div className="max-w-5xl mx-auto flex flex-nowrap items-center gap-2 sm:gap-3 min-w-0">
          {renderHeaderAvatar()}
          <div className="flex-1 min-w-0">{renderHeaderProfileCard()}</div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">{renderHeaderActions()}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-8 py-6 pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))]">
        {/* Quick Actions — estética alineada con cabecera zinc + acento naranja */}
        <div className="grid grid-cols-1 gap-6">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-orange-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-orange-950/35 p-6 sm:p-8 shadow-[0_0_0_1px_rgba(24,24,27,0.8),0_24px_48px_-16px_rgba(0,0,0,0.55)] ring-1 ring-orange-500/10">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,rgba(249,115,22,0.18),transparent_55%)]"
              aria-hidden
            />
            <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-orange-500/15 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute right-6 top-5 h-14 w-14 rounded-2xl opacity-[0.14] ring-1 ring-orange-400/40 overflow-hidden sm:h-16 sm:w-16">
              <img src={appIcon} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="relative z-10 max-w-xl pr-16 sm:pr-20">
              <h2 className="text-2xl sm:text-3xl font-black mb-2 leading-tight text-white tracking-tight">
                ¿Listo para rodar?
              </h2>
              <p className="text-zinc-400 mb-6 text-sm sm:text-base leading-relaxed">
                Crea una ruta al momento o programa una con tus amigos. Elige cómo quieres empezar.
              </p>
              <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-row sm:flex-nowrap sm:items-stretch sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLoading(false);
                    setShowCreateModal(true);
                  }}
                  className="min-h-[52px] w-full sm:flex-1 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 px-4 py-3.5 text-sm sm:text-base font-black text-zinc-950 shadow-lg shadow-orange-500/25 transition-all hover:brightness-105 active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <Plus size={22} strokeWidth={2.5} className="shrink-0" />
                  <span>Crear ruta</span>
                </button>
                <div className="hidden shrink-0 items-center justify-center text-orange-400/80 sm:flex" aria-hidden>
                  <ChevronRight size={22} strokeWidth={2.5} />
                </div>
                <button
                  type="button"
                  onClick={() => setShowJoinCodeModal(true)}
                  className="min-h-[52px] w-full sm:flex-1 rounded-2xl border border-zinc-600/90 bg-zinc-800/90 px-4 py-3.5 text-sm sm:text-base font-bold text-zinc-100 shadow-inner transition-all hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.99]"
                >
                  Unirse con código
                </button>
              </div>
            </div>
            <MapIcon
              size={160}
              className="pointer-events-none absolute -left-6 -bottom-8 text-orange-500/[0.07] sm:-left-4 sm:-bottom-6"
              aria-hidden
            />
          </div>
        </div>

        {/* Search & Discovery */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Search className="text-orange-500" size={20} />
                Explorar rutas planificadas
              </h2>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-xl">
                Las rutas <span className="text-zinc-400">solo amigos</span> o <span className="text-zinc-400">privadas</span> solo las ves tú y quien corresponda; el resto usa código o enlace para unirse. Mapa y chat de voz: desde{' '}
                <span className="text-zinc-400">1 h antes</span> de la hora.
              </p>
              {exploreFromGpsHint && (
                <p className="text-[10px] text-emerald-500/90 mt-1 flex items-center gap-1">
                  <MapPin size={10} /> Provincia y municipio sugeridos desde tu ubicación (puedes cambiarlos).
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 sm:flex-none">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                <input 
                  placeholder="Provincia" 
                  value={searchProvince}
                  onChange={(e) => setSearchProvince(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:border-orange-500 outline-none w-full sm:w-40 transition-all"
                />
              </div>
              <div className="relative flex-1 sm:flex-none">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                <input 
                  placeholder="Municipio" 
                  value={searchMunicipality}
                  onChange={(e) => setSearchMunicipality(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:border-orange-500 outline-none w-full sm:w-40 transition-all"
                />
              </div>
              {(searchProvince || searchMunicipality) && (
                <button 
                  onClick={() => { setSearchProvince(''); setSearchMunicipality(''); }}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {nearbyRoutes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyRoutes.map(route => (
                <div key={route.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl hover:border-orange-500/50 transition-all group">
                  <div className="flex justify-between items-start mb-3 gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                      <div className="bg-orange-500/10 text-orange-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                        {route.isEsporadica ? 'Espontánea' : 'GPX'}
                      </div>
                      {route.routeListing === 'friends_only' && (
                        <div className="bg-blue-500/15 text-blue-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase flex items-center gap-1">
                          <HeartHandshake size={10} /> Solo amigos
                        </div>
                      )}
                    </div>
                  <div className="text-zinc-500 text-xs flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Users size={12} />
                      {route.members?.length || 0}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(route.scheduledTimestamp).toLocaleDateString()}
                    </div>
                  </div>
                  </div>
                  <h3 className="font-bold mb-1 group-hover:text-orange-500 transition-colors">{route.name}</h3>
                  {route.description && (
                    <p className="text-[10px] text-zinc-400 mb-2 line-clamp-2 italic">"{route.description}"</p>
                  )}
                  <p className="text-xs text-zinc-500 mb-4 flex items-center gap-1 capitalize">
                    <MapPin size={12} />
                    {route.municipality}, {route.province}
                  </p>
                  <ScheduledRouteAttendees
                    memberUids={Array.isArray(route.members) ? route.members : []}
                    className="mb-3"
                    expandNonce={attendeesExpandNonceByRouteId[route.id] ?? 0}
                  />
                    <div className="flex gap-2">
                      {route.routeGeoJSON && (
                        <button 
                          onClick={() => setShowPreviewModal(route)}
                          className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                          <MapIcon size={14} /> Vista Previa
                        </button>
                      )}
                      {(() => {
                        const isJoined = route.members?.includes(user?.uid);
                        const canEnterSession = canEnterScheduledRouteSession(route.scheduledTimestamp);
                        const isCreator = route.createdBy === user?.uid;
                        return (
                          <button 
                            type="button"
                            onClick={() => {
                              if (canEnterSession) void joinGroup(route.code);
                              else if (isJoined && isCreator) return;
                              else toggleRSVP(route.code, isJoined);
                            }}
                            disabled={!canEnterSession && isJoined && isCreator}
                            title={!canEnterSession && isJoined && isCreator ? 'Como organizador, borra la ruta si no quieres participar' : undefined}
                            className={`flex-1 py-2 text-white text-sm font-bold rounded-xl transition-all ${canEnterSession ? 'bg-orange-500 hover:bg-orange-600' : (isJoined && isCreator) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-70' : (isJoined ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-blue-500 hover:bg-blue-600')}`}
                          >
                            {canEnterSession ? 'Entrar a la ruta' : (isJoined && isCreator) ? 'Organizador' : (isJoined ? 'Desapuntarse' : 'Apuntarse')}
                          </button>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => bumpAttendeesList(route.id)}
                      className="mt-4 w-full py-2 rounded-xl border border-zinc-600/60 bg-zinc-800/50 text-zinc-100 text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 hover:border-zinc-500 transition-colors"
                    >
                      <ListOrdered size={14} className="text-orange-400 shrink-0" />
                      Ver lista de apuntados
                    </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl">
              <MapIcon className="mx-auto text-zinc-700 mb-2" size={32} />
              <p className="text-zinc-500 text-sm">
                {searchProvince ? 'No hay rutas programadas en esta zona' : 'Introduce tu provincia para buscar rutas'}
              </p>
            </div>
          )}
        </section>

        {/* Rutas planificadas por tus amigos (encima de Mis próximas rutas) */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 max-w-xl mx-auto w-full">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Users className="text-orange-500" size={20} />
            Rutas de amigos
          </h2>
          <p className="text-[10px] text-zinc-500 mb-4 leading-relaxed">
            Apunta y revisa la ruta en vista previa. El mapa, participantes y chat de voz se abren desde{' '}
            <span className="text-zinc-400">1 hora antes</span> de la hora programada.
          </p>
          {friendsPlannedRoutes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {friendsPlannedRoutes.map((route) => {
                const canEnterSession = canEnterScheduledRouteSession(route.scheduledTimestamp);
                const isJoined = route.members?.includes(user?.uid);
                const isCreator = route.createdBy === user?.uid;
                return (
                  <div
                    key={route.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3"
                  >
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <p className="font-bold text-white truncate min-w-0">{route.name}</p>
                      <div className="text-zinc-500 text-[10px] flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-0.5">
                          <Users size={10} />
                          {route.members?.length || 0}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />
                          {route.scheduledTimestamp
                            ? new Date(route.scheduledTimestamp).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : ''}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-600 capitalize flex items-center gap-1">
                      <MapPin size={10} />
                      {route.municipality}, {route.province}
                    </p>
                    <ScheduledRouteAttendees
                      memberUids={Array.isArray(route.members) ? route.members : []}
                      className="mb-3"
                      expandNonce={attendeesExpandNonceByRouteId[route.id] ?? 0}
                    />
                    <div className="flex gap-2">
                      {route.routeGeoJSON && (
                        <button
                          type="button"
                          onClick={() => setShowPreviewModal(route)}
                          className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                        >
                          <MapIcon size={12} /> Vista Previa
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (canEnterSession) void joinGroup(route.code);
                          else if (isJoined && isCreator) return;
                          else toggleRSVP(route.code, isJoined);
                        }}
                        disabled={!canEnterSession && isJoined && isCreator}
                        title={
                          !canEnterSession && isJoined && isCreator
                            ? 'Como organizador, borra la ruta si no quieres participar'
                            : undefined
                        }
                        className={`flex-1 py-2 text-white text-xs font-bold rounded-xl transition-all ${
                          canEnterSession
                            ? 'bg-orange-500 hover:bg-orange-600'
                            : isJoined && isCreator
                              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-70'
                              : isJoined
                                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                : 'bg-blue-500 hover:bg-blue-600'
                        }`}
                      >
                        {canEnterSession
                          ? 'Entrar a la ruta'
                          : isJoined && isCreator
                            ? 'Organizador'
                            : isJoined
                              ? 'Desapuntarse'
                              : 'Apuntarse'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => bumpAttendeesList(route.id)}
                      className="mt-3 w-full py-2 rounded-xl border border-zinc-600/60 bg-zinc-800/50 text-zinc-100 text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 hover:border-zinc-500 transition-colors"
                    >
                      <ListOrdered size={14} className="text-orange-400 shrink-0" />
                      Ver lista de apuntados
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Cuando tus amigos programen rutas, aparecerán aquí para que puedas unirte.
            </p>
          )}
        </section>

        <div className="max-w-xl mx-auto w-full space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="text-blue-500" size={18} />
              Mis Próximas Rutas
            </h3>
            <div className="space-y-3">
              {scheduledRoutes.length > 0 ? (
                scheduledRoutes.map(route => {
                  const canEnterSession = canEnterScheduledRouteSession(route.scheduledTimestamp);
                  return (
                    <div key={route.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-3 group">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 pr-2">
                            <p className="font-bold text-sm truncate">{route.name}</p>
                            {route.routeListing === 'friends_only' && (
                              <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                                Solo amigos
                              </span>
                            )}
                            {route.routeListing === 'unlisted' && (
                              <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 flex items-center gap-0.5">
                                <Lock size={9} /> Privada
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-1">
                            <p>
                              {new Date(route.scheduledTimestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                            <div className="flex items-center gap-1">
                              <Users size={10} />
                              {route.members?.length || 0}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {route.createdBy === user?.uid && (
                            <div className="flex items-center gap-1">
                              {deletingId === route.id && deletingType === 'scheduled' ? (
                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800 shadow-xl">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); confirmDeleteScheduled(route.id); }}
                                    className="bg-red-600 text-white text-[10px] px-3 py-1.5 rounded-md font-bold hover:bg-red-700 transition-colors"
                                  >
                                    Confirmar Borrado
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                                    className="bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-md hover:text-white transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={(e) => deleteScheduledRoute(e, route.id)}
                                  className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Borrar ruta programada"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <ScheduledRouteAttendees
                        memberUids={Array.isArray(route.members) ? route.members : []}
                        className="mb-3"
                        expandNonce={attendeesExpandNonceByRouteId[route.id] ?? 0}
                      />
                      
                      <div className="flex gap-2">
                        {route.routeGeoJSON && (
                          <button 
                            onClick={() => setShowPreviewModal(route)}
                            className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                          >
                            <MapIcon size={12} /> Vista Previa
                          </button>
                        )}
                        {canEnterSession ? (
                          <button 
                            type="button"
                            onClick={() => void joinGroup(route.code)}
                            className="flex-1 py-1.5 text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600"
                          >
                            <ChevronRight size={12} />
                            Entrar a la ruta
                          </button>
                        ) : route.createdBy === user?.uid ? (
                          canInviteToScheduledRoute(route, user?.uid) ? (
                            <button
                              type="button"
                              onClick={() => openScheduledInvite(route)}
                              className="flex-1 py-1.5 rounded-lg border border-orange-500/35 bg-orange-500/10 text-orange-200 text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-orange-500/20"
                            >
                              <UserPlus size={12} />
                              Invitar amigos
                            </button>
                          ) : (
                            <div className="flex-1 py-1.5 text-[10px] font-medium rounded-lg flex items-center justify-center gap-1 bg-zinc-800/80 text-zinc-500 border border-zinc-700/80 text-center px-1">
                              Organizador — papelera arriba para borrar
                            </div>
                          )
                        ) : (
                          <button 
                            onClick={() => toggleRSVP(route.code, true)}
                            className="flex-1 py-1.5 text-red-500 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                          >
                            <X size={12} />
                            Desapuntarse
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => bumpAttendeesList(route.id)}
                        className="mt-3 w-full py-2 rounded-xl border border-zinc-600/60 bg-zinc-800/50 text-zinc-100 text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-zinc-800 hover:border-zinc-500 transition-colors"
                      >
                        <ListOrdered size={12} className="text-orange-400 shrink-0" />
                        Ver lista de apuntados
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-zinc-600 text-xs italic">No tienes rutas programadas</p>
              )}
            </div>
        </div>
      </main>

      {/* Friends Modal */}
      {showFriendsModal && <FriendsModal onClose={() => setShowFriendsModal(false)} onRepeatRoute={onRepeatRoute} />}
      <InvitesMailboxModal
        open={showInvitesMailbox}
        onClose={() => setShowInvitesMailbox(false)}
        onJoinGroup={(code) => {
          setShowInvitesMailbox(false);
          onJoinGroup(code);
        }}
      />
      <ScheduledRouteSoonOverlay
        open={scheduledSoonRoute !== null}
        routeName={scheduledSoonRoute?.name ?? ''}
        scheduledTimestamp={scheduledSoonRoute?.ts ?? 0}
        onDismiss={() => {
          if (scheduledSoonRoute) {
            try {
              sessionStorage.setItem(
                `motoride_soon_dismiss_${scheduledSoonRoute.id}_${scheduledSoonRoute.ts}`,
                '1'
              );
            } catch {
              /* quota / private */
            }
          }
          setScheduledSoonRoute(null);
        }}
        onJoinNow={() => {
          if (!scheduledSoonRoute) return;
          try {
            sessionStorage.setItem(
              `motoride_soon_dismiss_${scheduledSoonRoute.id}_${scheduledSoonRoute.ts}`,
              '1'
            );
          } catch {
            /* */
          }
          const c = scheduledSoonRoute.code;
          setScheduledSoonRoute(null);
          void joinGroup(c);
        }}
      />
      {scheduledInviteModal && (
        <InviteFriendsModal
          open
          onClose={() => setScheduledInviteModal(null)}
          groupId={scheduledInviteModal.groupId}
          groupName={scheduledInviteModal.groupName}
          memberUids={scheduledInviteModal.memberUids}
          inviteKind="scheduled_ride"
        />
      )}

      {/* Resultado generar ruta (sustituye alert nativo) */}
      {routeGenFeedback && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="route-gen-feedback-title"
          onClick={() => setRouteGenFeedback(null)}
        >
          <div
            className={`w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 ${
              routeGenFeedback.kind === 'success'
                ? 'bg-zinc-900 border-orange-500/35 ring-1 ring-orange-500/20'
                : 'bg-zinc-900 border-red-500/30 ring-1 ring-red-500/15'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`relative px-6 pt-8 pb-6 ${routeGenFeedback.kind === 'success' ? 'bg-gradient-to-b from-orange-500/10 to-transparent' : 'bg-gradient-to-b from-red-500/10 to-transparent'}`}>
              <div className="flex justify-center mb-4">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    routeGenFeedback.kind === 'success' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {routeGenFeedback.kind === 'success' ? <CheckCircle2 size={36} strokeWidth={2} /> : <AlertCircle size={36} strokeWidth={2} />}
                </div>
              </div>
              <h2 id="route-gen-feedback-title" className="text-center text-xl font-black text-white tracking-tight">
                {routeGenFeedback.title}
              </h2>
              {routeGenFeedback.detail && (
                <p className="mt-3 text-center text-sm text-zinc-400 leading-relaxed break-words">
                  {routeGenFeedback.kind === 'success' ? (
                    <>
                      <span className="text-zinc-500 block text-xs font-bold uppercase tracking-wider mb-1">Destino</span>
                      <span className="text-zinc-100 font-semibold">{routeGenFeedback.detail}</span>
                    </>
                  ) : (
                    routeGenFeedback.detail
                  )}
                </p>
              )}
              {routeGenFeedback.kind === 'success' && (
                <p className="mt-4 text-center text-xs text-zinc-500">
                  Revisa distancia y duración abajo y pulsa crear cuando quieras guardar la ruta.
                </p>
              )}
            </div>
            <div className="px-6 pb-6 pt-0">
              <button
                type="button"
                onClick={() => setRouteGenFeedback(null)}
                className={`w-full py-3.5 rounded-2xl text-sm font-black transition-all ${
                  routeGenFeedback.kind === 'success'
                    ? 'bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-lg shadow-orange-500/25'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                }`}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {showSupportModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={closeSupportModal}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <HeartHandshake size={20} className="text-orange-400" />
                Apoyar MotoRide
              </h2>
              <button onClick={closeSupportModal} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Si abres la donación y dejas este cuadro abierto al menos 10 segundos, te añadimos a la lista de posibles Premium para contrastar con Ko-fi (no activa Premium solo).
              </p>
              <button
                type="button"
                onClick={() => {
                  openSupportLink('https://ko-fi.com/motorideapp');
                  if (user) setDonationEngagementStart(Date.now());
                }}
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CircleDollarSign size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Donar (Ko-fi)</p>
                  <p className="text-[11px] text-zinc-500">Aporte voluntario · chat de voz Premium tras activación manual.</p>
                </div>
              </button>

              <div className="pt-4 border-t border-zinc-800 space-y-2">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  ¿Dudas, algo no funciona o una idea? Escríbenos por correo; leemos los mensajes y te ayudamos cuando podamos.
                </p>
                <a
                  href={getSupportMailtoHref()}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-sky-500/40 rounded-2xl p-4 flex items-start gap-3 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">Contacto por correo</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Se abrirá tu app de correo con un texto breve; puedes cambiarlo o borrarlo y enviar cuando quieras.
                    </p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {showJoinCodeModal && (
        <div
          className="fixed inset-0 z-[51] flex items-center justify-center p-4 bg-zinc-950/[0.97]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-code-modal-title"
          onClick={() => setShowJoinCodeModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="text-blue-500 shrink-0" size={22} />
                <h2 id="join-code-modal-title" className="text-lg font-bold text-white truncate">
                  Unirse con código
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinCodeModal(false)}
                className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="CÓDIGO"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  autoFocus
                  className="w-full h-14 bg-zinc-950 border border-zinc-800 rounded-2xl px-6 text-white uppercase tracking-[0.3em] font-mono text-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-600 placeholder:text-sm"
                  maxLength={6}
                />
              </div>
              <button
                type="button"
                onClick={() => void joinGroup()}
                disabled={loading || joinCode.length < 3}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 rounded-2xl font-bold transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {loading ? <Clock className="animate-spin" size={20} /> : <ChevronRight size={20} />}
                Unirse al grupo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Route Modal — sin backdrop-blur en el overlay: el blur sobre toda la pantalla ralentiza el scroll interno */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/[0.97]"
          onClick={closeCreateModal}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[min(92dvh,900px)] flex flex-col min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold">Configurar Nueva Ruta</h2>
              <button onClick={closeCreateModal} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar [transform:translateZ(0)]">
              {/* Tipo de salida (Cards) - Moved to top */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-500 uppercase ml-1">Tipo de salida</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => { 
                      setIsEsporadica(true); 
                      setGpxData(null); 
                      setRouteType('instant');
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${isEsporadica ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-800 bg-zinc-950 text-zinc-500'}`}
                  >
                    <Activity size={20} className={isEsporadica ? 'text-orange-500 mb-2' : 'mb-2'} />
                    <p className="font-bold text-sm">Espontánea</p>
                    <p className="text-[10px] opacity-60">Sin trazado fijo</p>
                  </button>
                  <button 
                    onClick={() => setIsEsporadica(false)}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${!isEsporadica ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-800 bg-zinc-950 text-zinc-500'}`}
                  >
                    <MapIcon size={20} className={!isEsporadica ? 'text-blue-500 mb-2' : 'mb-2'} />
                    <p className="font-bold text-sm">Planificar</p>
                    <p className="text-[10px] opacity-60">Ruta con destino</p>
                  </button>
                </div>

                {!isEsporadica && (
                  <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${routeType === 'scheduled' ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        <Clock size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Programar para después</p>
                        <p className="text-[10px] text-zinc-500">Elige fecha y hora</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setRouteType(routeType === 'scheduled' ? 'instant' : 'scheduled')}
                      className={`w-12 h-6 rounded-full transition-all relative ${routeType === 'scheduled' ? 'bg-blue-600' : 'bg-zinc-800'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${routeType === 'scheduled' ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                )}

                {!isEsporadica && (
                  <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="p-5 bg-zinc-950 border border-blue-500/30 rounded-2xl space-y-4 shadow-lg shadow-blue-500/5">
                      <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <Search size={16} />
                        <p className="text-xs font-bold uppercase tracking-wider">Planificador de Ruta</p>
                      </div>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                        <input 
                          placeholder="¿A dónde quieres ir? (Ej: Salou, Tarragona)" 
                          value={destination}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDestination(v);
                            const p = destinationPickedRef.current;
                            if (p && !destinationLabelsMatch(v, p.label)) {
                              destinationPickedRef.current = null;
                            }
                          }}
                          onKeyDown={(e) => {
                            if (destinationSuggestions.length === 0) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setDestinationHighlightIdx((i) =>
                                Math.min(i + 1, destinationSuggestions.length - 1)
                              );
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setDestinationHighlightIdx((i) => Math.max(i - 1, 0));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              const item = destinationSuggestions[destinationHighlightIdx];
                              if (item) applyDestinationSuggestion(item);
                            }
                          }}
                          autoComplete="off"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 transition-all"
                        />
                        {destinationPreview &&
                          destinationSuggestions.length === 0 &&
                          (destinationPreview === 'No encontrado' ||
                            destinationPreview === 'Error al buscar' ||
                            destinationPreview === 'Demasiadas peticiones, espera un poco...') && (
                            <p className="text-[10px] text-amber-500/90 mt-1.5 ml-1 leading-snug">
                              {destinationPreview}
                            </p>
                          )}
                        {destinationSuggestions.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto overscroll-contain rounded-xl border border-zinc-800 bg-zinc-950/90 [transform:translateZ(0)] shadow-inner">
                            {destinationSuggestions.map((item, idx) => (
                              <button
                                key={`sug-${idx}-${String(item.lat)}-${String(item.lon)}-${(item.display_name || '').slice(0, 24)}`}
                                type="button"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => applyDestinationSuggestion(item)}
                                className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-zinc-800/80 last:border-b-0 ${
                                  idx === destinationHighlightIdx
                                    ? 'bg-blue-500/20 text-white ring-inset ring-1 ring-blue-500/40'
                                    : 'text-zinc-300 hover:bg-zinc-800'
                                }`}
                              >
                                {item.display_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                      </div>
                      <button 
                        onClick={generateLocalRoute}
                        disabled={!destination.trim() || loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                      >
                        {loading ? <Clock className="animate-spin" size={18} /> : <MapIcon size={18} />}
                        {routeGenerated ? 'Listo' : 'Generar Ruta'}
                      </button>

                      {routeGenerated && routeStats && (
                        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                              <p className="text-[10px] text-zinc-500 uppercase font-bold">Distancia</p>
                              <p className="text-lg font-black text-white">{routeStats.distance.toFixed(1)} km</p>
                            </div>
                            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                              <p className="text-[10px] text-zinc-500 uppercase font-bold">Duración</p>
                              <p className="text-lg font-black text-white">{formatDurationHoursMinutes(routeStats.duration)}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setShowPreviewModal({ name: 'Previsualización', routeGeoJSON: gpxData, municipality, province, description })}
                            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                          >
                            <Search size={14} /> Previsualizar Ruta
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-zinc-800"></div>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-zinc-900 px-2 text-zinc-500">O sube tu archivo</span>
                      </div>
                    </div>

                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-800 rounded-2xl cursor-pointer hover:bg-zinc-800/30 transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-zinc-500" />
                        <p className="text-sm text-zinc-400">
                          {gpxData ? 'Ruta lista' : 'Subir archivo .gpx'}
                        </p>
                      </div>
                      <input type="file" className="hidden" accept=".gpx" onChange={handleFileUpload} />
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {(routeType === 'scheduled' || !isEsporadica) && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1 ml-1">Nombre de la ruta</label>
                      <input 
                        placeholder="Ej: Ruta Dominguera" 
                        value={routeName}
                        onChange={(e) => setRouteName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1 ml-1">Lugar de quedada / Descripción</label>
                      <textarea 
                        placeholder="Ej: Gasolinera Repsol a las 9:00. Traer depósito lleno." 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-all text-sm min-h-[80px] resize-none"
                      />
                    </div>
                  </>
                )}

                {routeType === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1 ml-1">Fecha</label>
                      <input 
                        type="date" 
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1 ml-1">Hora</label>
                      <input 
                        type="time" 
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all text-sm"
                      />
                    </div>
                  </div>
                )}

                {routeType === 'scheduled' && (
                  <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/90 space-y-3">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Shield size={16} className="text-blue-400 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider">Privacidad</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Controla quién ve esta ruta en <span className="text-zinc-400">Explorar rutas planificadas</span>. El código y el enlace siguen sirviendo para unirse.
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {(['public', 'friends_only', 'unlisted'] as const).map((key) => {
                        const meta = ROUTE_LISTING_LABELS[key];
                        const Icon = key === 'public' ? Globe : key === 'friends_only' ? HeartHandshake : Lock;
                        const active = routeListing === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setRouteListing(key)}
                            className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                              active
                                ? 'border-orange-500/60 bg-orange-500/10 ring-1 ring-orange-500/30'
                                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                            }`}
                          >
                            <Icon
                              size={18}
                              className={`shrink-0 mt-0.5 ${active ? 'text-orange-400' : 'text-zinc-500'}`}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-white">{meta.title}</span>
                              <span className="block text-[10px] text-zinc-500 mt-0.5 leading-snug">{meta.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-zinc-950 border-t border-zinc-800 shrink-0">
              <button 
                onClick={createRoute}
                disabled={loading || (!isEsporadica && !routeName) || (routeType === 'scheduled' && (!scheduledDate || !scheduledTime))}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/20 transition-all active:scale-95"
              >
                {loading ? 'Creando...' : routeType === 'instant' ? (isEsporadica ? 'Iniciar Ahora' : 'Iniciar Ruta') : 'Programar Ruta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {postScheduleInvite && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-zinc-950/[0.97]"
          onClick={() => setPostScheduleInvite(null)}
        >
          <div
            className="bg-zinc-900 border border-orange-500/40 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl shadow-orange-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Users className="text-orange-500" size={22} />
                Invita a tu ruta
              </h2>
              <p className="text-sm text-zinc-400 mt-2">
                Ruta programada: <span className="text-white font-semibold">{postScheduleInvite.name}</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Comparte el <strong className="text-zinc-300">código</strong> o el <strong className="text-zinc-300">enlace</strong> para que se apunten desde la app.
              </p>
              {postScheduleInvite.routeListing === 'friends_only' && (
                <p className="text-xs text-blue-300/90 mt-2 flex items-start gap-2">
                  <HeartHandshake size={14} className="shrink-0 mt-0.5" />
                  Solo tus amigos verán esta ruta en el explorador; otros pueden unirse con el código o enlace.
                </p>
              )}
              {postScheduleInvite.routeListing === 'unlisted' && (
                <p className="text-xs text-zinc-400 mt-2 flex items-start gap-2">
                  <Lock size={14} className="shrink-0 mt-0.5" />
                  Esta ruta no aparece en el explorador público: comparte código o enlace con quien quieras.
                </p>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Código</p>
                <p className="text-3xl font-black text-orange-500 tracking-wider">{postScheduleInvite.code}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyTextToClipboard(postScheduleInvite.code);
                    if (ok) {
                      setScheduleInviteCopied('code');
                      setTimeout(() => setScheduleInviteCopied(null), 2000);
                    } else {
                      window.prompt('Copia el código:', postScheduleInvite.code);
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm"
                >
                  {scheduleInviteCopied === 'code' ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                  Copiar código
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}${window.location.pathname}?join=${postScheduleInvite.code}`;
                    const ok = await copyTextToClipboard(url);
                    if (ok) {
                      setScheduleInviteCopied('link');
                      setTimeout(() => setScheduleInviteCopied(null), 2000);
                    } else {
                      window.prompt('Copia el enlace:', url);
                    }
                  }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm"
                >
                  {scheduleInviteCopied === 'link' ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                  Copiar enlace
                </button>
              </div>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}${window.location.pathname}?join=${postScheduleInvite.code}`;
                    try {
                      await navigator.share({
                        title: `Ruta: ${postScheduleInvite.name}`,
                        text: 'Apúntate a esta salida en MotoRide:',
                        url,
                      });
                    } catch (e) {
                      const err = e as { name?: string };
                      if (err?.name !== 'AbortError') console.error(e);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm"
                >
                  <Share2 size={18} />
                  Compartir…
                </button>
              )}
              <button
                type="button"
                onClick={() => setPostScheduleInvite(null)}
                className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-300 font-semibold text-sm hover:bg-zinc-800"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route Preview Modal — overlay opaco sin blur para no penalizar pan/zoom del mapa */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/[0.96]"
          onClick={() => setShowPreviewModal(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <div>
                <h2 className="text-lg font-bold text-orange-500">{showPreviewModal.name}</h2>
                <p className="text-xs text-zinc-500 capitalize">{showPreviewModal.municipality}, {showPreviewModal.province}</p>
              </div>
              <button onClick={() => setShowPreviewModal(null)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 relative bg-[#dfe0e6]">
              <MapContainer 
                center={[40.4168, -3.7038]} 
                zoom={6} 
                className="w-full h-full"
                zoomControl={true}
                fadeAnimation={false}
              >
                <TileLayer 
                  url="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                  keepBuffer={200}
                  updateWhenIdle={false}
                  updateWhenZooming
                  detectRetina={false}
                  crossOrigin
                  className="motoride-base-tiles"
                  errorTileUrl={LEAFLET_LIGHT_ERROR_TILE}
                />
                {showPreviewModal.routeGeoJSON && parseRouteData(showPreviewModal.routeGeoJSON) && (
                  <GeoJSON 
                    data={parseRouteData(showPreviewModal.routeGeoJSON) as any} 
                    style={{ color: '#f97316', weight: 5, opacity: 0.8 }} 
                  />
                )}
                <PreviewBounds route={showPreviewModal.routeGeoJSON} />
              </MapContainer>
              
              <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/90 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 shadow-xl z-[1000]">
                <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Punto de encuentro</p>
                <p className="text-sm text-white">{showPreviewModal.description || 'No se ha especificado lugar de quedada.'}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-400 font-bold">
                  <Clock size={14} />
                  <span>Inicia el {new Date(showPreviewModal.scheduledTimestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function PreviewBounds({ route }: { route: string }) {
  const map = useMap();
  useEffect(() => {
    if (!route) return;
    try {
      const geojson = parseRouteData(route);
      if (!geojson) return;
      const layer = L.geoJSON(geojson as any);
      map.fitBounds(layer.getBounds(), { padding: [50, 50] });
    } catch (e) {
      console.error(e);
    }
  }, [route, map]);
  return null;
}
