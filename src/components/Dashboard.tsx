import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, onSnapshot, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db, logOut, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { parseGPX, parseRouteData } from '../lib/gpx';
import { calculateLevel } from '../lib/utils';
import { requestJson } from '../lib/network';
import { Users, Plus, LogOut, User as UserIcon, Activity, Trash2, Trophy, Calendar, MapPin, Search, Clock, ChevronRight, Upload, X, Map as MapIcon, Play, HeartHandshake, CircleDollarSign, Shield, CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import FriendsModal from './FriendsModal';
import AdminPointsPanel from './AdminPointsPanel';
import PremiumBadge from './PremiumBadge';

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
  const [userData, setUserData] = useState<any>(null);
  const [pointsFixError, setPointsFixError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      setUserData(doc.data());
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user || !userData) return;
    let cancelled = false;

    const normalizePointsLevelFields = async () => {
      try {
        setPointsFixError(null);
        const rawPoints = Number(userData.points ?? 0);
        const rawLevel = Number(userData.level ?? 1);

        if (!Number.isFinite(rawPoints)) {
          await updateDoc(doc(db, 'users', user.uid), { points: 0, level: 1 });
          return;
        }

        const safePoints = Math.max(0, Math.floor(rawPoints));
        const calculatedLevel = calculateLevel(safePoints).level;
        const safeLevel = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : calculatedLevel;

        if (safePoints !== rawPoints || safeLevel !== calculatedLevel) {
          await updateDoc(doc(db, 'users', user.uid), {
            points: safePoints,
            level: calculatedLevel
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error normalizando puntos/nivel:', error);
        setPointsFixError('Error corrigiendo puntos. Se reintentara automaticamente.');
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    };

    normalizePointsLevelFields();
    return () => {
      cancelled = true;
    };
  }, [user, userData?.points, userData?.level]);

  const points = Math.max(0, Number(userData?.points || 0));
  const levelData = calculateLevel(points);
  const level = levelData.level;
  const levelRange = levelData.pointsForNextLevel - levelData.prevLevelPoints;
  const progress = levelRange > 0 ? (levelData.remainingPoints / levelRange) * 100 : 0;

  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [scheduledRoutes, setScheduledRoutes] = useState<any[]>([]);
  const [nearbyRoutes, setNearbyRoutes] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [routeGenFeedback, setRouteGenFeedback] = useState<null | { kind: 'success' | 'error'; title: string; detail?: string }>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [donationEngagementStart, setDonationEngagementStart] = useState<number | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState<any>(null);
  const supportPopupRef = useRef<Window | null>(null);
  const premiumCandidateWrittenThisOpenRef = useRef(false);
  const lastBackHandledAtRef = useRef(0);
  const prevLayersRef = useRef({
    showCreateModal: false,
    showFriendsModal: false,
    showSupportModal: false,
    hasPreview: false,
  });
  const [indexBuilding, setIndexBuilding] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<'history' | 'scheduled' | null>(null);
  
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
  const [destination, setDestination] = useState('');
  const [destinationPreview, setDestinationPreview] = useState<string | null>(null);
  const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([]);
  const [routeOptions, setRouteOptions] = useState({
    curves: true,
    secondary: true,
    highway: false
  });

  // Debounce destination for preview
  useEffect(() => {
    if (destination.length < 3) {
      setDestinationPreview(null);
      setDestinationSuggestions([]);
      return;
    }
    // Only fetch if it's not already previewed
    if (destinationPreview && destinationPreview !== 'Demasiadas peticiones, espera un poco...' && destinationPreview !== 'Error al buscar' && destinationPreview !== 'No encontrado') {
      return;
    }
    const timer = setTimeout(async () => {
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&limit=5&countrycodes=es`;
      try {
        const geoData = await requestJson<any[]>(geocodeUrl, { timeoutMs: 9000, retries: 1, backoffMs: 500 });
        if (geoData && geoData.length > 0) {
          setDestinationPreview(geoData[0].display_name);
          setDestinationSuggestions(geoData.slice(0, 5));
        } else {
          setDestinationPreview('No encontrado');
          setDestinationSuggestions([]);
        }
      } catch (e) {
        const status = (e as any)?.status;
        if (status === 429) {
          setDestinationPreview('Demasiadas peticiones, espera un poco...');
          return;
        }
        console.error(e);
        setDestinationPreview('Error al buscar');
        setDestinationSuggestions([]);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [destination]);

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
  const isAdmin = user?.email?.toLowerCase() === 'juarp123@gmail.com';

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
    if (showCreateModal && !prev.showCreateModal) window.history.pushState({ layer: 'create' }, '');
    if (showFriendsModal && !prev.showFriendsModal) window.history.pushState({ layer: 'friends' }, '');
    if (showSupportModal && !prev.showSupportModal) window.history.pushState({ layer: 'support' }, '');
    if (!!showPreviewModal && !prev.hasPreview) window.history.pushState({ layer: 'preview' }, '');

    prevLayersRef.current = {
      showCreateModal,
      showFriendsModal,
      showSupportModal,
      hasPreview: !!showPreviewModal,
    };
  }, [showCreateModal, showFriendsModal, showSupportModal, showPreviewModal]);

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
      if (showCreateModal) {
        setShowCreateModal(false);
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
  }, [showCreateModal, showFriendsModal, showSupportModal, showPreviewModal, routeGenFeedback]);

  useEffect(() => {
    if (!user) return;
    const historyQ = query(collection(db, 'rideHistory'), where('uid', '==', user.uid), orderBy('endTime', 'desc'), limit(10));
    const unsubscribeHistory = onSnapshot(historyQ, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setRideHistory(historyData);
      setIndexBuilding(false);
    }, (error) => {
      if (error.message.includes('index') && error.message.includes('building')) {
        setIndexBuilding(true);
      }
      console.error("Error en historial (posible falta de índice):", error);
      handleFirestoreError(error, OperationType.LIST, 'rideHistory');
    });

    // Listen to scheduled routes I'm part of
    const scheduledQ = query(collection(db, 'groups'), where('members', 'array-contains', user.uid), where('isScheduled', '==', true));
    const unsubscribeScheduled = onSnapshot(scheduledQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setScheduledRoutes(data.filter(r => (r.scheduledTimestamp || 0) > Date.now() - 3600000));
    }, (error) => {
      console.error("Error en rutas programadas:", error);
      handleFirestoreError(error, OperationType.LIST, 'groups');
    });

    return () => {
      unsubscribeHistory();
      unsubscribeScheduled();
    };
  }, [user]);

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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setNearbyRoutes(data.filter(r => (r.scheduledTimestamp || 0) > Date.now()));
    }, (error) => {
      console.error("Error buscando rutas cercanas:", error);
      handleFirestoreError(error, OperationType.LIST, 'groups');
    });

    return () => unsubscribe();
  }, [searchProvince, searchMunicipality]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      const parsed = parseGPX(raw);
      const routeCoords = (parsed as any)?.features?.find((f: any) => f?.geometry?.type === 'LineString')?.geometry?.coordinates;
      if (!routeCoords || routeCoords.length < 2) {
        alert('El archivo GPX no contiene una ruta válida.');
        return;
      }
      setGpxData(JSON.stringify(parsed));
      setRouteGenerated(true);
    };
    reader.readAsText(file);
  };

  const createRoute = async () => {
    if (!user) return;
    
    // Default name for spontaneous routes if empty
    const finalRouteName = routeName || (isEsporadica ? `Ruta Espontánea ${new Date().toLocaleDateString()}` : '');
    if (!finalRouteName) {
      alert('Por favor, introduce un nombre para la ruta.');
      return;
    }

    setLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const scheduledTimestamp = routeType === 'scheduled' 
      ? new Date(`${scheduledDate}T${scheduledTime}`).getTime() 
      : Date.now();

    const groupData = {
      name: finalRouteName,
      code,
      createdBy: user.uid,
      members: [user.uid],
      routeGeoJSON: gpxData,
      isScheduled: routeType === 'scheduled',
      scheduledTimestamp,
      province: province.trim().toLowerCase(),
      municipality: municipality.trim().toLowerCase(),
      description: description.trim(),
      isEsporadica,
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'groups', code), groupData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `groups/${code}`);
    }
    setLoading(false);
    setShowCreateModal(false);
    
    if (routeType === 'instant') {
      onJoinGroup(code);
    }
  };

  const generateLocalRoute = async () => {
    if (!destination || !user) return;
    setLoading(true);
    try {
      // Use Nominatim with addressdetails to get province/municipality
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}&limit=1&countrycodes=es&addressdetails=1`;
      const geoData = await requestJson<any[]>(geocodeUrl, { timeoutMs: 10000, retries: 1, backoffMs: 600 });
      
      let destCoords = "";
      if (geoData && geoData.length > 0) {
        destCoords = `${geoData[0].lon},${geoData[0].lat}`;
      } else if (destination.includes(',')) {
        destCoords = destination;
      } else {
        setRouteGenFeedback({
          kind: 'error',
          title: 'Destino no encontrado',
          detail: 'Prueba con una ciudad más concreta (por ejemplo: Salou, Tarragona).'
        });
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(async (pos) => {
        const start = `${pos.coords.longitude},${pos.coords.latitude}`;
        
        // Use a more flexible routing profile if possible, or simulate by adding parameters
        // OSRM public API is limited, but we can try to influence it by choosing different endpoints if available
        // For now, we'll use the standard driving profile but we'll try to use 'driving' vs 'car' if supported
        const profile = 'driving'; 
        
        // If curves or secondary are selected and NOT highway, we can try to use a different routing engine or waypoints
        // Since we are limited to OSRM public API, we will use it but add a note.
        // Actually, some OSRM instances support 'continue_straight' or other hints.
        const url = `https://router.project-osrm.org/route/v1/${profile}/${start};${destCoords}?overview=full&geometries=geojson&steps=true`;
        
        const data = await requestJson<any>(url, { timeoutMs: 12000, retries: 1, backoffMs: 700 });
        if (data.code === 'Ok') {
          const route = data.routes[0];
          setGpxData(JSON.stringify(route.geometry));
          setRouteStats({
            distance: route.distance / 1000,
            duration: route.duration / 60
          });
          setRouteGenerated(true);
          setIsEsporadica(false);
          
          // Try to extract province and municipality from geocoding result
          if (geoData[0].address) {
            const addr = geoData[0].address;
            const city = addr.city || addr.town || addr.village || addr.municipality;
            const prov = addr.province || addr.state || addr.region;
            if (city) setMunicipality(city);
            if (prov) setProvince(prov);
          } else {
            // Fallback: try to parse display_name
            const parts = geoData[0].display_name.split(',').map((p: string) => p.trim());
            if (parts.length >= 2) {
              setMunicipality(parts[0]);
              setProvince(parts[parts.length - 2] || parts[1]);
            }
          }

          if (!routeOptions.highway && route.distance > 0) {
            // If the user doesn't want highways, we should ideally use a different API.
            // For now, we'll just alert them if the route seems to use highways (OSRM usually does)
            console.log("Route generated with OSRM. Note: OSRM public API defaults to fastest route.");
          }

          setRouteGenFeedback({
            kind: 'success',
            title: '¡Ruta lista!',
            detail: geoData[0]?.display_name || destination
          });
        } else {
          setRouteGenFeedback({
            kind: 'error',
            title: 'No se pudo calcular la ruta',
            detail: 'Prueba con otro destino o inténtalo de nuevo en unos segundos.'
          });
        }
        setLoading(false);
      }, () => {
        setRouteGenFeedback({
          kind: 'error',
          title: 'Sin posición GPS',
          detail: 'Permite el acceso a la ubicación en el navegador y vuelve a generar la ruta.'
        });
        setLoading(false);
      });
    } catch (e) {
      console.error(e);
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
        onJoinGroup(code);
      } else {
        alert('Grupo no encontrado. Comprueba el código.');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${code}`);
    }
    setLoading(false);
  };

  const toggleRSVP = async (routeCode: string, isJoined: boolean) => {
    if (!user) return;
    const groupRef = doc(db, 'groups', routeCode);
    try {
      if (isJoined) {
        const snap = await getDoc(groupRef);
        const d = snap.data();
        if (d?.isScheduled === true && d?.createdBy === user.uid) {
          alert('Como organizador de una ruta programada no puedes desapuntarte. Borra la ruta si ya no la quieres.');
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

  const deleteRide = async (rideId: string) => {
    setDeletingId(rideId);
    setDeletingType('history');
  };

  const confirmDeleteRide = async (rideId: string) => {
    try {
      await deleteDoc(doc(db, 'rideHistory', rideId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rideHistory/${rideId}`);
    }
    setDeletingId(null);
    setDeletingType(null);
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 px-6 py-4">
        <div className="max-w-5xl mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={onOpenProfile}
              className="w-10 h-10 rounded-full overflow-hidden border-2 border-orange-500 hover:opacity-80 transition-opacity"
            >
              {userData?.photoURL ? (
                <img src={userData.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                  <UserIcon size={20} className="text-zinc-500" />
                </div>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center min-w-0">
            <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-full px-3 py-1.5 max-w-full">
              <span className="text-[11px] font-black text-orange-400 bg-orange-500/15 rounded-full px-2 py-0.5 whitespace-nowrap">
                Lv. {level}
              </span>
              {(user?.isPremium === true || userData?.isPremium === true) && <PremiumBadge compact />}
              <p className="text-sm font-bold text-white truncate max-w-[42vw] sm:max-w-xs">
                {userData?.displayName || user?.displayName || 'Motero'}
              </p>
              {isOffline && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" title="Modo Offline" />}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button 
                onClick={() => setShowAdminPanel(true)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-orange-400"
                title="Panel Admin"
              >
                <Shield size={20} />
              </button>
            )}
            <a
              href="mailto:juarp123@gmail.com?subject=Soporte%20MotoRide&body=Describe%20tu%20problema%20%28dispositivo%2C%20pasos%20para%20reproducirlo%29%3A%0A%0A"
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-sky-400"
              title="Contactar soporte"
            >
              <Mail size={20} />
            </a>
            <button 
              onClick={() => setShowFriendsModal(true)}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
              title="Amigos y Comunidad"
            >
              <Users size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        <div className="flex justify-end">
          <button
            onClick={() => setShowSupportModal(true)}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 hover:border-orange-500/40 rounded-2xl px-4 py-3 flex items-center justify-center gap-3 transition-all"
          >
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <HeartHandshake size={18} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">Apoyar proyecto</p>
              <p className="text-[11px] text-zinc-500">Ko-fi · desbloquea Premium (revisión manual)</p>
            </div>
          </button>
        </div>

        {pointsFixError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 text-sm text-red-200">
            {pointsFixError}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-8 rounded-[2rem] shadow-xl shadow-orange-500/10 relative overflow-hidden group">
            <div className="relative z-10">
              <h2 className="text-3xl font-black mb-2 leading-tight">¿Listo para rodar?</h2>
              <p className="text-orange-100 mb-8 text-base opacity-90 max-w-md">Crea una ruta instantánea o programa una para el futuro con tus amigos.</p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-white text-orange-600 px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-orange-50 shadow-lg transition-all active:scale-95"
              >
                <Plus size={24} />
                Crear Nueva Ruta
              </button>
            </div>
            <MapIcon size={200} className="absolute -right-10 -bottom-10 text-white opacity-10 group-hover:scale-110 transition-transform duration-500" />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-5 md:p-8 rounded-3xl md:rounded-[2rem] shadow-xl">
            <h2 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3">
              <Users className="text-blue-500" size={24} />
              Unirse con código
            </h2>
            <div className="flex flex-col gap-4">
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  placeholder="CÓDIGO" 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full h-14 bg-zinc-950 border border-zinc-800 rounded-2xl px-6 text-white uppercase tracking-[0.3em] font-mono text-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-600 placeholder:text-sm"
                  maxLength={6}
                />
              </div>
              <button 
                onClick={() => joinGroup()}
                disabled={loading || joinCode.length < 3}
                className="h-14 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-10 rounded-2xl font-bold transition-all active:scale-95 whitespace-nowrap flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {loading ? <Clock className="animate-spin" size={20} /> : <ChevronRight size={20} />}
                Unirse al grupo
              </button>
            </div>
          </div>
        </div>

        {/* Search & Discovery */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Search className="text-orange-500" size={20} />
              Explorar rutas planificadas
            </h2>
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
                  <div className="flex justify-between items-start mb-3">
                    <div className="bg-orange-500/10 text-orange-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                      {route.isEsporadica ? 'Espontánea' : 'GPX'}
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
                        const isLive = Date.now() >= route.scheduledTimestamp;
                        const isCreator = route.createdBy === user?.uid;
                        return (
                          <button 
                            onClick={() => {
                              if (isLive) joinGroup(route.code);
                              else if (isJoined && isCreator) return;
                              else toggleRSVP(route.code, isJoined);
                            }}
                            disabled={!isLive && isJoined && isCreator}
                            title={!isLive && isJoined && isCreator ? 'Como organizador, borra la ruta si no quieres participar' : undefined}
                            className={`flex-1 py-2 text-white text-sm font-bold rounded-xl transition-all ${isLive ? 'bg-orange-500 hover:bg-orange-600' : (isJoined && isCreator) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-70' : (isJoined ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-blue-500 hover:bg-blue-600')}`}
                          >
                            {isLive ? 'Unirse a la ruta' : (isJoined && isCreator) ? 'Organizador' : (isJoined ? 'Desapuntarse' : 'Apuntarse')}
                          </button>
                        );
                      })()}
                    </div>
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

        {/* Scheduled & History Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Scheduled Routes */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="text-blue-500" size={18} />
              Mis Próximas Rutas
            </h3>
            <div className="space-y-3">
              {scheduledRoutes.length > 0 ? (
                scheduledRoutes.map(route => {
                  const canJoin = Date.now() >= route.scheduledTimestamp;
                  return (
                    <div key={route.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-3 group">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate pr-2">{route.name}</p>
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
                      
                      <div className="flex gap-2">
                        {route.routeGeoJSON && (
                          <button 
                            onClick={() => setShowPreviewModal(route)}
                            className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1"
                          >
                            <MapIcon size={12} /> Vista Previa
                          </button>
                        )}
                        {canJoin ? (
                          <button 
                            onClick={() => onJoinGroup(route.code)}
                            className="flex-1 py-1.5 text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600"
                          >
                            <ChevronRight size={12} />
                            Unirse a la ruta
                          </button>
                        ) : route.createdBy === user?.uid ? (
                          <div className="flex-1 py-1.5 text-[10px] font-medium rounded-lg flex items-center justify-center gap-1 bg-zinc-800/80 text-zinc-500 border border-zinc-700/80 text-center px-1">
                            Eres el organizador — usa la papelera para borrar la ruta
                          </div>
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
                    </div>
                  );
                })
              ) : (
                <p className="text-zinc-600 text-xs italic">No tienes rutas programadas</p>
              )}
            </div>
          </div>

          {/* Ride History */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Activity className="text-orange-500" size={18} />
              Historial Reciente
            </h3>
            {indexBuilding && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                <Clock className="text-blue-400" size={18} />
                <p className="text-xs text-blue-400 font-medium">Optimizando base de datos... Tu historial aparecerá en un momento.</p>
              </div>
            )}
            <div className="grid gap-4">
              {rideHistory.length > 0 ? (
                rideHistory.map(ride => (
                  <div key={ride.id} className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl relative group hover:border-zinc-700 transition-all">
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      {deletingId === ride.id && deletingType === 'history' ? (
                        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800 shadow-xl">
                          <button 
                            onClick={() => confirmDeleteRide(ride.id)}
                            className="bg-red-600 text-white text-[10px] px-3 py-1.5 rounded-md font-bold hover:bg-red-700 transition-colors"
                          >
                            Confirmar Borrado
                          </button>
                          <button 
                            onClick={() => setDeletingId(null)}
                            className="bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-md hover:text-white transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteRide(ride.id); }}
                          className="text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-orange-500">{ride.groupName || 'Ruta sin nombre'}</h4>
                        <p className="text-xs text-zinc-500">
                          {new Date(ride.endTime).toLocaleDateString()} • {new Date(ride.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-500 uppercase font-bold">Distancia</p>
                          <p className="font-bold">{ride.distance?.toFixed(1)} km</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-500 uppercase font-bold">Inclinación</p>
                          <p className="font-bold text-sm">{Math.max(ride.maxLeanLeft || 0, ride.maxLeanRight || 0)}°</p>
                        </div>
                        <div className="bg-yellow-500/10 px-3 py-1 rounded-xl text-center">
                          <p className="text-[10px] text-yellow-500 uppercase font-bold">Puntos</p>
                          <p className="font-bold text-yellow-500">{ride.score || 0}</p>
                        </div>
                      </div>
                    </div>
                    {ride.routeGeoJSON && (
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={() => onRepeatRoute(ride.routeGeoJSON)}
                          className="flex items-center gap-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-all"
                        >
                          <Play size={14} /> Repetir Ruta
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-zinc-900">
                  <p className="text-zinc-600 text-sm">Aún no has realizado ninguna ruta</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Friends Modal */}
      {showFriendsModal && <FriendsModal onClose={() => setShowFriendsModal(false)} onRepeatRoute={onRepeatRoute} />}
      {showAdminPanel && isAdmin && <AdminPointsPanel onClose={() => setShowAdminPanel(false)} />}

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
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
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
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <CircleDollarSign size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Donar (Ko-fi)</p>
                  <p className="text-[11px] text-zinc-500">Aporte voluntario · chat de voz Premium tras activación manual.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Route Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xl font-bold">Configurar Nueva Ruta</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
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
                          onChange={(e) => setDestination(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 transition-all"
                        />
                        {destinationPreview && (
                          <p className="text-[10px] text-zinc-500 mt-1 ml-1 truncate">{destinationPreview}</p>
                        )}
                        {destinationSuggestions.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/80">
                            {destinationSuggestions.map((item, idx) => (
                              <button
                                key={`${item.place_id || idx}`}
                                onClick={() => {
                                  setDestination(item.display_name || '');
                                  setDestinationPreview(item.display_name || null);
                                  setDestinationSuggestions([]);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
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
                        disabled={!destination || loading}
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
                              <p className="text-lg font-black text-white">{Math.round(routeStats.duration)} min</p>
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

                {(routeType === 'scheduled' || !isEsporadica) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-zinc-500 uppercase ml-1">Provincia</label>
                      <input 
                        placeholder="Ej: Tarragona" 
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-zinc-500 uppercase ml-1">Municipio</label>
                      <input 
                        placeholder="Ej: Salou" 
                        value={municipality}
                        onChange={(e) => setMunicipality(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-all text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-zinc-950 border-t border-zinc-800">
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
      {/* Route Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <div>
                <h2 className="text-lg font-bold text-orange-500">{showPreviewModal.name}</h2>
                <p className="text-xs text-zinc-500 capitalize">{showPreviewModal.municipality}, {showPreviewModal.province}</p>
              </div>
              <button onClick={() => setShowPreviewModal(null)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 relative bg-zinc-950">
              <MapContainer 
                center={[40.4168, -3.7038]} 
                zoom={6} 
                className="w-full h-full"
                zoomControl={true}
              >
                <TileLayer 
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                  attribution='&copy; OpenStreetMap'
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
