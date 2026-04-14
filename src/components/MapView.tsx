import { useEffect, useState, useRef, useMemo, useCallback, type CSSProperties, type MutableRefObject } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, useMapEvents, Pane } from 'react-leaflet';
import L from 'leaflet';
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  query,
  where,
  addDoc,
  getDoc,
  setDoc,
  arrayRemove,
  deleteField,
} from 'firebase/firestore';
import { db, logOut, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { useOpenMeteoWeather } from '../hooks/useOpenMeteoWeather';
import { useLeanAngle } from '../hooks/useLeanAngle';
import { useNavigation } from '../hooks/useNavigation';
import { useNavigationHeading } from '../hooks/useNavigationHeading';
import { getLineCoordinates, snapPointToRouteDetailed } from '../lib/navigationPose';
import {
  anyPrecipitationRiskAtPoints,
  dedupeNearbyPoints,
  samplePolylineByDistance,
} from '../lib/precipitationRisk';
import {
  DEFAULT_PREMIUM_GPS_POLICY,
  normalizePremiumGpsPolicy,
  type PremiumGpsPolicy,
} from '../lib/premiumGpsConfig';
import { useRoadData } from '../hooks/useRoadData';
import { parseGPX, parseRouteData } from '../lib/gpx';
import { getDistance, offsetByMeters } from '../lib/geoUtils';
import { requestJson } from '../lib/network';
import { getActivePointsConfig } from '../lib/pointsConfig';
import { fetchRainViewerTileUrl } from '../lib/rainviewer';
import { LEAFLET_LIGHT_ERROR_TILE, LEAFLET_TRANSPARENT_ERROR_TILE } from '../lib/leafletTiles';
import { getLevelRingBoxStyle, getLevelRingWrapperClass } from '../lib/levelRing';
import { pickBestNominatimResult, sortNominatimResults } from '../lib/nominatimPick';
import { prefetchAroundUser } from '../lib/mapTileCache';
import { weatherWmoToLucide } from '../lib/weatherWmo';
import socket from '../lib/socket';
import { useVoiceChat } from '../hooks/useVoiceChat';
import PremiumBadge from './PremiumBadge';
import InviteFriendsModal from './InviteFriendsModal';
import { Upload, ArrowLeft, Copy, Check, Navigation, AlertTriangle, Play, Square, ArrowUp, MapPin, Trophy, Bell, AlertCircle, Wrench, Fuel, X, Maximize, Minimize, Search, Share2, Menu, Target, LogOut, Users, UserPlus, Mic, MicOff, ShieldAlert, Activity, Layers, Lock, LockOpen, Smartphone, RotateCw, Crown, WifiOff, Monitor, Loader2, Mail, Ban, CloudRain } from 'lucide-react';
import { copyTextToClipboard, getSupportMailtoHref } from '../lib/clientInfo';
import { formatNavDistanceMeters } from '../lib/navFormat';
import { generateGroupCode } from '../lib/groupCode';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Modo bolsillo / MirrorLink: el móvil no va fijado al chasis → el IMU no mide la inclinación de la moto.
 * En **bolsillo** damos aún más peso al GPS que en MirrorLink (menos lecturas “locas” del sensor).
 */
function blendLeanPocketMirror(
  sensorDeg: number,
  gpsDeg: number,
  speedMps: number,
  mode: 'pocket' | 'mirrorlink'
): number {
  if (speedMps < 3) return 0;
  const sensorAtten = sensorDeg * (mode === 'pocket' ? 0.22 : 0.32);
  let wGps: number;
  if (speedMps >= 14) wGps = mode === 'pocket' ? 0.99 : 0.97;
  else if (speedMps >= 10) wGps = mode === 'pocket' ? 0.965 : 0.94;
  else if (speedMps >= 7) wGps = mode === 'pocket' ? 0.93 : 0.9;
  else if (speedMps >= 5) wGps = mode === 'pocket' ? 0.88 : 0.85;
  else wGps = mode === 'pocket' ? 0.84 : 0.8;
  const blended = wGps * gpsDeg + (1 - wGps) * sensorAtten;
  return Math.max(-60, Math.min(60, blended));
}

/** Por debajo de esto el modelo v·ω/g pierde sentido; alineado con bolsillo (blend desde 3 m/s). */
const MIN_SPEED_MPS_GPS_LEAN = 3.2;

/**
 * Valores válidos para `screen.orientation.lock()` (Screen Orientation API).
 * Algunos `lib.dom` no incluyen `lock` en `ScreenOrientation`; evitamos depender de ellos.
 */
type ScreenOrientationLockArg =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

// Custom icon creator for avatars with level (aro evoluciona con el nivel)
const createAvatarIcon = (url: string, level: number = 1, isPremium: boolean = false) => {
  const rv = getLevelRingBoxStyle(level, isPremium);
  const lvlBg = isPremium ? '#d97706' : '#f97316';
  const crown = isPremium
    ? `<div style="position:absolute;top:-5px;left:-3px;width:17px;height:17px;background:linear-gradient(160deg,#fde68a,#f59e0b);border-radius:50%;border:2px solid #18181b;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;">👑</div>`
    : '';
  return L.divIcon({
    className: 'custom-avatar-icon',
    html: `<div style="position: relative; width: 44px; height: 44px;">
             ${crown}
             <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; ${rv.border}; box-shadow: ${rv.boxShadow}, 0 4px 6px -1px rgb(0 0 0 / 0.12); background: white;">
               <img src="${url || 'https://via.placeholder.com/40'}" style="width: 100%; height: 100%; object-fit: cover;" />
             </div>
             <div style="position: absolute; bottom: -2px; right: -2px; background: ${lvlBg}; color: white; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; border: 2px solid #18181b; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
               ${level}
             </div>
           </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

// Component for the current user marker to handle smooth rotation and position
const CurrentUserMarker = ({
  position,
  heading,
  displayNameToUse,
  userLevel,
  score,
  isPremium
}: {
  position: [number, number];
  heading: number;
  displayNameToUse: string;
  userLevel: number;
  score: number;
  isPremium?: boolean;
}) => {
  const markerRef = useRef<any>(null);
  
  const icon = useMemo(() => {
    return L.divIcon({
      className: 'current-user-icon',
      html: `<div class="user-arrow-container" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: transform 0.3s ease-out;">
               <svg viewBox="0 0 100 100" width="32" height="32" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">
                 <path d="M 50 10 L 90 90 L 50 75 L 10 90 Z" fill="#3b82f6" stroke="white" stroke-width="6" stroke-linejoin="round" />
               </svg>
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }, []);

  useEffect(() => {
    if (markerRef.current) {
      const el = markerRef.current.getElement();
      if (el) {
        const container = el.querySelector('.user-arrow-container') as HTMLElement;
        if (container) {
          container.style.transform = `rotate(${heading}deg)`;
          container.style.transition = 'transform 0.18s ease-out';
        }
      }
    }
  }, [heading]);

  return (
    <Marker 
      position={position}
      icon={icon}
      zIndexOffset={1000}
      ref={markerRef}
    >
      <Popup className="custom-popup">
        <div className="font-semibold text-center">{displayNameToUse} (Tú)</div>
        <div className="text-xs text-gray-500 text-center">
          Nivel {userLevel} • {score} pts
          {isPremium ? <div className="mt-1 text-amber-500 font-bold">Premium</div> : null}
        </div>
      </Popup>
    </Marker>
  );
};

const getDirectionIcon = (type?: string, modifier?: string) => {
  if (type === 'arrive') return <MapPin size={28} />;
  if (
    type === 'roundabout' ||
    type === 'rotary' ||
    type === 'roundabout turn' ||
    type === 'exit roundabout' ||
    type === 'exit rotary'
  ) {
    return <RotateCw size={28} className="shrink-0" aria-hidden />;
  }
  if (type === 'off ramp' || type === 'on ramp') {
    const rot = modifier?.includes('left') ? -50 : 50;
    return <ArrowUp size={28} style={{ transform: `rotate(${rot}deg)`, transition: 'transform 0.3s ease-out' }} />;
  }

  let rotation = 0;
  if (modifier?.includes('right')) {
    rotation = modifier.includes('slight') ? 45 : (modifier.includes('sharp') ? 135 : 90);
  } else if (modifier?.includes('left')) {
    rotation = modifier.includes('slight') ? -45 : (modifier.includes('sharp') ? -135 : -90);
  } else if (type === 'u-turn') {
    rotation = 180;
  }

  return <ArrowUp size={28} style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease-out' }} />;
};

const MotorcycleIcon = ({ angle }: { angle: number }) => (
  <div
    style={{ transform: `rotate(${angle}deg)`, transformOrigin: 'bottom center', transition: 'transform 45ms linear' }}
    className="w-24 h-24 flex items-center justify-center"
  >
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">
      {/* Front View Classic/Cruiser - Based on User Image */}
      
      {/* Front Tire */}
      <rect x="44" y="60" width="12" height="35" rx="6" fill="#0a0a0a" stroke="white" strokeWidth="1" />
      <path d="M 44 70 L 56 70 M 44 80 L 56 80 M 44 90 L 56 90" stroke="#333" strokeWidth="1" />
      
      {/* Forks */}
      <rect x="38" y="35" width="4" height="45" rx="2" fill="#94a3b8" stroke="white" strokeWidth="0.5" />
      <rect x="58" y="35" width="4" height="45" rx="2" fill="#94a3b8" stroke="white" strokeWidth="0.5" />
      
      {/* Crash Bars / Engine Guards */}
      <path d="M 38 55 Q 25 55 25 70 Q 25 85 38 85" fill="none" stroke="white" strokeWidth="2" />
      <path d="M 62 55 Q 75 55 75 70 Q 75 85 62 85" fill="none" stroke="white" strokeWidth="2" />
      
      {/* Main Body / Tank Area */}
      <path d="M 35 45 L 65 45 L 60 65 L 40 65 Z" fill="#7f1d1d" stroke="white" strokeWidth="1" />
      
      {/* Round Headlight */}
      <circle cx="50" cy="42" r="10" fill="white" stroke="white" strokeWidth="1.5" className="animate-pulse shadow-[0_0_20px_rgba(255,255,255,0.8)]" />
      <circle cx="50" cy="42" r="8" fill="#fef08a" opacity="0.5" />
      
      {/* Turn Signals */}
      <circle cx="35" cy="40" r="4" fill="#f59e0b" stroke="white" strokeWidth="0.5" />
      <circle cx="65" cy="40" r="4" fill="#f59e0b" stroke="white" strokeWidth="0.5" />
      
      {/* Handlebars */}
      <path d="M 20 35 Q 35 30 50 35 Q 65 30 80 35" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M 20 35 Q 35 30 50 35 Q 65 30 80 35" fill="none" stroke="#111" strokeWidth="1.5" strokeLinecap="round" />
      
      {/* Rider - Helmet & Body */}
      <path d="M 35 35 Q 50 10 65 35" fill="#111" stroke="white" strokeWidth="1" /> {/* Body/Shoulders */}
      <circle cx="50" cy="22" r="12" fill="#111" stroke="white" strokeWidth="1" /> {/* Helmet */}
      <rect x="40" y="20" width="20" height="6" rx="3" fill="#334155" /> {/* Visor */}
      
      {/* Mirrors */}
      <path d="M 25 32 L 15 22" stroke="white" strokeWidth="1.5" />
      <ellipse cx="15" cy="22" rx="8" ry="5" fill="#111" stroke="white" strokeWidth="1" transform="rotate(-20 15 22)" />
      
      <path d="M 75 32 L 85 22" stroke="white" strokeWidth="1.5" />
      <ellipse cx="85" cy="22" rx="8" ry="5" fill="#111" stroke="white" strokeWidth="1" transform="rotate(20 85 22)" />
    </svg>
  </div>
);

// Solo invalidar cuando cambia el modo “mapa rotado” o tema; no en cada grado de rumbo (eso recargaba teselas y dejaba cuadrados negros).
const MapInvalidateHelper = ({ layoutKey }: { layoutKey: string }) => {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 120);
    return () => clearTimeout(id);
  }, [map, layoutKey]);
  return null;
};

/** Actualiza zoom/centro del mapa y dispara precarga de teselas (misma caché que el SW). */
function MapTilePrefetchBridge({
  mapZoomRef,
  mapCenterRef,
  onSchedulePrefetch,
}: {
  mapZoomRef: MutableRefObject<number>;
  mapCenterRef: MutableRefObject<{ lat: number; lng: number } | null>;
  onSchedulePrefetch: () => void;
}) {
  const map = useMap();
  const debounceRef = useRef<number>();

  const syncAndSchedule = useCallback(() => {
    const c = map.getCenter();
    mapCenterRef.current = { lat: c.lat, lng: c.lng };
    mapZoomRef.current = map.getZoom();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onSchedulePrefetch();
    }, 420);
  }, [map, mapZoomRef, mapCenterRef, onSchedulePrefetch]);

  useMapEvents({
    zoomend: syncAndSchedule,
    moveend: syncAndSchedule,
    load: syncAndSchedule,
  });

  useEffect(() => {
    syncAndSchedule();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [syncAndSchedule]);

  return null;
}

// Component to handle map centering and rotation
const MapController = ({
  location,
  bearingForMapOffset,
  headingRotationActive,
  isFollowing,
  showRanking,
  isRecording,
  speedKmh,
  hasActiveRoute,
  isLandscapeUi,
}: {
  location: any;
  /** Rumbo para desplazar el centro en horizontal con mapa rotado (flecha a la derecha como GPS). */
  bearingForMapOffset: number;
  /** Mismo criterio que el `rotate()` del contenedor del mapa. */
  headingRotationActive: boolean;
  isFollowing: boolean;
  showRanking: boolean;
  isRecording: boolean;
  speedKmh: number;
  hasActiveRoute: boolean;
  /** Sincronizado con resize/orientación (evita desfase flecha / centro tras MirrorLink o giro). */
  isLandscapeUi: boolean;
}) => {
  const map = useMap();
  const hasAutoZoomedRef = useRef(false);
  const lastFollowRef = useRef<{ lat: number; lng: number; zoom: number; t: number } | null>(null);

  useEffect(() => {
    if (isFollowing && location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      const speedZoomSteps = Math.floor(Math.max(speedKmh, 0) / 10);
      const dynamicZoom = Math.max(15.4, 17.15 - speedZoomSteps * 0.22);
      const followZoomInitial = hasActiveRoute ? 15.35 : Math.max(map.getZoom(), 17);
      const zoom = isRecording ? dynamicZoom : hasAutoZoomedRef.current ? map.getZoom() : followZoomInitial;
      const size = map.getSize();
      const mapW = size.x;
      const mapH = size.y;
      const landscapeMap = mapW > mapH || isLandscapeUi;

      const animatePan = !hasAutoZoomedRef.current;
      const now = Date.now();
      const prev = lastFollowRef.current;
      const zoomChanged = prev != null && Math.abs(prev.zoom - zoom) > 0.04;
      const movedM =
        prev != null ? getDistance(location.lat, location.lng, prev.lat, prev.lng) : Number.POSITIVE_INFINITY;
      const tooSoon = prev != null && now - prev.t < 1100 && movedM < 3.2 && !zoomChanged;
      if (hasAutoZoomedRef.current && tooSoon) {
        return;
      }

      if (!hasAutoZoomedRef.current) {
        map.invalidateSize();
      }

      if (landscapeMap && mapW > 40) {
        // Apaisado: flecha a la derecha (carretera “adelante” a la izquierda-centro).
        // Con mapa rotado por rumbo, un offset solo en X de Leaflet no coincide con la derecha de pantalla → centro geográfico desplazado ⊥ al rumbo.
        const useGeoOffset =
          headingRotationActive &&
          Number.isFinite(bearingForMapOffset) &&
          speedKmh > 3;
        if (useGeoOffset) {
          const lat = location.lat as number;
          const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
          const mpp = (40075016.686 * cosLat) / (256 * Math.pow(2, zoom));
          const shiftM = Math.min(130, Math.max(38, mapW * mpp * 0.26 * (showRanking ? 1.08 : 1)));
          const centerLeftOfTravel = offsetByMeters(lat, location.lng as number, bearingForMapOffset - 90, shiftM);
          map.setView([centerLeftOfTravel.lat, centerLeftOfTravel.lng], zoom, { animate: animatePan });
        } else {
          const frac = showRanking ? 0.34 : 0.30;
          const offsetX = mapW * frac;
          const targetPoint = map.project([location.lat, location.lng], zoom).subtract([offsetX, 0]);
          const targetLatLng = map.unproject(targetPoint, zoom);
          map.setView(targetLatLng, zoom, { animate: animatePan });
        }
      } else {
        map.setView([location.lat, location.lng], zoom, { animate: animatePan });
      }

      lastFollowRef.current = { lat: location.lat, lng: location.lng, zoom, t: now };

      if (!hasAutoZoomedRef.current) {
        hasAutoZoomedRef.current = true;
      }
    }
  }, [
    location,
    isFollowing,
    map,
    showRanking,
    isRecording,
    speedKmh,
    hasActiveRoute,
    isLandscapeUi,
    bearingForMapOffset,
    headingRotationActive,
  ]);

  return null;
};

export default function MapView({
  groupId,
  onLeave,
  preloadedRoute,
  prepareHistoryLeave,
  onPromoteFromRepeat,
}: {
  groupId: string;
  onLeave: () => void;
  preloadedRoute?: string | null;
  prepareHistoryLeave?: () => void;
  /** Repetir ruta → crear grupo real y enlazar la sesión (invitaciones con código de 6 caracteres). */
  onPromoteFromRepeat?: (liveGroupCode: string) => void;
}) {
  const LOCAL_RIDE_DRAFT_KEY = `motoride_ride_draft_${groupId}`;
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [customName, setCustomName] = useState<string | null>(null);
  const [customPhotoURL, setCustomPhotoURL] = useState<string | null>(null);
  const [group, setGroup] = useState<any>(null);
  const [memberPremiumByUid, setMemberPremiumByUid] = useState<Record<string, boolean>>({});
  const [memberDisplayNameByUid, setMemberDisplayNameByUid] = useState<Record<string, string>>({});

  const groupMembersKey = useMemo(() => {
    if (!Array.isArray(group?.members)) return '';
    return [...group.members].filter(Boolean).sort().join('|');
  }, [group?.members]);

  useEffect(() => {
    if (!groupMembersKey) {
      setMemberPremiumByUid({});
      setMemberDisplayNameByUid({});
      return;
    }
    const ids = groupMembersKey.split('|').filter(Boolean);
    const unsubs = ids.map((uid) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const v = snap.exists() && snap.data()?.isPremium === true;
          const dn = snap.exists() ? String(snap.data()?.displayName || 'Motero').slice(0, 80) || 'Motero' : 'Motero';
          setMemberPremiumByUid((prev) => (prev[uid] === v ? prev : { ...prev, [uid]: v }));
          setMemberDisplayNameByUid((prev) => (prev[uid] === dn ? prev : { ...prev, [uid]: dn }));
        },
        () => {
          setMemberPremiumByUid((prev) => (uid in prev ? { ...prev, [uid]: false } : prev));
          setMemberDisplayNameByUid((prev) => {
            if (!(uid in prev)) return prev;
            const next = { ...prev };
            delete next[uid];
            return next;
          });
        }
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [groupMembersKey]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setCustomName(doc.data().displayName || null);
        setCustomPhotoURL(doc.data().photoURL || null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });
    return unsub;
  }, [user]);

  const displayNameToUse = customName || user?.displayName || 'Motero';
  const photoURLToUse = customPhotoURL || user?.photoURL || '';

  const [locations, setLocations] = useState<any[]>([]);
  /** Fuerza re-render para caducar avisos de otros a los 30s aunque no llegue otro paquete socket. */
  const [peerAlertTick, setPeerAlertTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const lastHeadingRef = useRef<number | null>(null);
  const lastHeadingTimeRef = useRef<number>(Date.now());
  /** Prefetch de teselas: posición GPS y centro del mapa (misma caché persistente que el SW). */
  const lastKnownLocForPrefetchRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapZoomRef = useRef(16);
  const mapViewportCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const tilePrefetchGenRef = useRef(0);
  const [tilePrefetchEpoch, setTilePrefetchEpoch] = useState(0);
  const bumpTilePrefetch = useCallback(() => setTilePrefetchEpoch((n) => n + 1), []);

  const [premiumGpsPolicy, setPremiumGpsPolicy] = useState<PremiumGpsPolicy>(DEFAULT_PREMIUM_GPS_POLICY);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'appConfig', 'premiumGps'),
      (snap) => {
        setPremiumGpsPolicy(normalizePremiumGpsPolicy(snap.exists() ? snap.data() : null));
      },
      () => setPremiumGpsPolicy(DEFAULT_PREMIUM_GPS_POLICY)
    );
    return () => unsub();
  }, []);

  const selfPremium = user?.isPremium === true;
  const gpsHighAccuracyEnabled = !premiumGpsPolicy.highAccuracyPremiumOnly || selfPremium;
  const weatherLayerAllowed = !premiumGpsPolicy.rainRadarPremiumOnly || selfPremium;
  const showHudWeather = !premiumGpsPolicy.weatherHudPremiumOnly || selfPremium;

  const [showTraffic, setShowTraffic] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const showWeatherEffective = showWeather && weatherLayerAllowed;
  const [rainRadar, setRainRadar] = useState<{ url: string; maxNativeZoom: number } | null>(null);
  const [weatherFetchFailed, setWeatherFetchFailed] = useState(false);
  const [weatherTilesLoaded, setWeatherTilesLoaded] = useState(false);
  const [weatherTileErrors, setWeatherTileErrors] = useState(0);

  const [distance, setDistance] = useState(0); // in km
  const [localDistance, setLocalDistance] = useState(0); // for auto-start and save check
  const lastLocRef = useRef<{lat: number, lng: number} | null>(null);
  const [autoStarted, setAutoStarted] = useState(false);
  
  // New state for ranking and alerts
  const [score, setScore] = useState(0);
  const [inCurve, setInCurve] = useState(false);
  const [currentCurveMax, setCurrentCurveMax] = useState(0);
  const [alertType, setAlertType] = useState<string | null>(null);
  const [hostLeftRoute, setHostLeftRoute] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rotationLockAppliedRef = useRef(false);
  const [rotationLocked, setRotationLocked] = useState(false);
  const [forceLandscapeUi, setForceLandscapeUi] = useState(false);
  const [pocketRingSession, setPocketRingSession] = useState(0);
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [recordedPath, setRecordedPath] = useState<{lat: number, lng: number}[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  
  type TouchLockKind = 'pocket' | 'mirrorlink';
  // Bolsillo (retrato) o MirrorLink (paisaje: móvil en bolsillo, telemetría en pantalla externa de la moto)
  const [touchLockKind, setTouchLockKind] = useState<TouchLockKind | null>(null);
  const [pocketCountdown, setPocketCountdown] = useState(30);
  const [isPocketLocked, setIsPocketLocked] = useState(false);
  const [pocketTaps, setPocketTaps] = useState(0);
  const [lastPocketTapTime, setLastPocketTapTime] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimerRef = useRef<any>(null);
  const tapResetTimerRef = useRef<any>(null);
  const pocketTapsRef = useRef(0);
  const hasExplicitlyLeftRef = useRef(false);
  const leaveInProgressRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [exitLeaving, setExitLeaving] = useState(false);
  const [showLeanBetaNotice, setShowLeanBetaNotice] = useState(false);

  // Ensure score is always an integer, rounding up if necessary
  useEffect(() => {
    if (score % 1 !== 0) {
      setScore(Math.ceil(score));
    }
  }, [score]);

  const confirmLeaveInFlightRef = useRef(false);

  useEffect(() => {
    const onRouteBack = () => {
      if (hasExplicitlyLeftRef.current || confirmLeaveInFlightRef.current || leaveInProgressRef.current) return;
      setShowExitConfirm((wasOpen) => (wasOpen ? false : true));
    };
    window.addEventListener('motoride:route-back', onRouteBack);
    return () => window.removeEventListener('motoride:route-back', onRouteBack);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem('motoride_lean_beta_dismissed_v1') === '1') return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setShowLeanBetaNotice(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (premiumGpsPolicy.rainRadarPremiumOnly && !selfPremium && showWeather) {
      setShowWeather(false);
    }
  }, [premiumGpsPolicy.rainRadarPremiumOnly, selfPremium, showWeather]);

  // Rain Viewer: load real tile path from API (paths are hashed; /v2/radar/0 is invalid). Refresh cada 5 min.
  useEffect(() => {
    if (!showWeatherEffective) {
      setRainRadar(null);
      setWeatherFetchFailed(false);
      setWeatherTilesLoaded(false);
      setWeatherTileErrors(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const res = await fetchRainViewerTileUrl();
      if (cancelled) return;
      if (res) {
        setRainRadar({ url: res.baseUrl, maxNativeZoom: res.maxNativeZoom });
        setWeatherFetchFailed(false);
      } else {
        setRainRadar(null);
        setWeatherFetchFailed(true);
      }
    };
    load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [showWeatherEffective]);

  // Cuenta atrás 30 s (bolsillo / MirrorLink); al llegar a 0, bloqueo táctil
  useEffect(() => {
    if (!touchLockKind || isPocketLocked || pocketCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setPocketCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [touchLockKind, isPocketLocked, pocketCountdown]);

  useEffect(() => {
    pocketTapsRef.current = pocketTaps;
  }, [pocketTaps]);

  const startPocketLongPressUnlock = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    setIsLongPressing(true);
    longPressTimerRef.current = setTimeout(() => {
      // Unlock!
      setIsPocketLocked(false);
      setTouchLockKind(null);
      setPocketCountdown(30);
      setPocketTaps(0);
      pocketTapsRef.current = 0;
      setIsLongPressing(false);
      if (navigator.vibrate) navigator.vibrate(100);
      releaseOrientationLockUi();
    }, 1500);
  };

  const handlePocketTouchStart = () => {
    if (!isPocketLocked) return;
    
    const now = Date.now();
    const timeDiff = now - lastPocketTapTime;

    let nextTaps = pocketTapsRef.current;
    if (nextTaps < 3) {
      nextTaps = (timeDiff < 450 || nextTaps === 0) ? nextTaps + 1 : 1;
      setPocketTaps(nextTaps);
      pocketTapsRef.current = nextTaps;
      setLastPocketTapTime(now);

      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
      if (nextTaps < 3) {
        // Reset combo if user pauses too much between taps.
        tapResetTimerRef.current = setTimeout(() => {
          setPocketTaps(0);
          pocketTapsRef.current = 0;
        }, 1200);
      }
    }

    // Once armed (3 taps), this press is the required long-press.
    if (nextTaps >= 3) {
      startPocketLongPressUnlock();
    }
  };

  const handlePocketTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsLongPressing(false);
    if (pocketTapsRef.current >= 3 && isPocketLocked) {
      // Keep unlock armed briefly, then reset if no successful long press.
      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
      tapResetTimerRef.current = setTimeout(() => {
        setPocketTaps(0);
        pocketTapsRef.current = 0;
      }, 1800);
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!rotationLockAppliedRef.current) return;
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
      } catch {
        /* ignore */
      }
      rotationLockAppliedRef.current = false;
    };
  }, []);

  const releaseOrientationLockUi = () => {
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    } catch {
      /* ignore */
    }
    rotationLockAppliedRef.current = false;
    setRotationLocked(false);
  };

  const enterTouchLockMode = async (kind: TouchLockKind) => {
    setPocketRingSession((s) => s + 1);
    setTouchLockKind(kind);
    setPocketCountdown(30);
    setIsPocketLocked(false);
    setPocketTaps(0);
    pocketTapsRef.current = 0;
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
    setShowSettings(false);

    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (e) {
        console.warn('Fullscreen failed for touch lock mode', e);
      }
    }

    const so = screen.orientation as ScreenOrientation & {
      lock?: (orientation: ScreenOrientationLockArg) => Promise<void>;
    };
    const lockArg: ScreenOrientationLockArg = kind === 'pocket' ? 'portrait' : 'landscape-primary';
    if (so?.lock) {
      so.lock(lockArg).catch((e: Error) => {
        console.warn('Touch lock orientation failed', e);
        if (kind === 'mirrorlink') {
          so.lock!('landscape').catch(() => {});
        }
        if (e?.message?.includes('sandboxed')) {
          showMessage({
            variant: 'info',
            title: 'Orientación',
            message:
              "Limitación del navegador: el bloqueo de orientación está restringido en algunas vistas embebidas.\n\nPara Modo Bolsillo y MirrorLink, abre MotoRide en una pestaña normal del navegador.",
          });
        }
      });
    }
  };

  const enterPocketMode = () => void enterTouchLockMode('pocket');
  const enterMirrorLinkMode = () => void enterTouchLockMode('mirrorlink');
  const [searchDestination, setSearchDestination] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const selectedSearchSuggestionRef = useRef<{ displayName: string; lat: number; lon: number } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [shared, setShared] = useState(false);
  const [showInviteFriends, setShowInviteFriends] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteModalContext, setInviteModalContext] = useState<{ groupId: string; groupName: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const offlineDebounceRef = useRef<number | null>(null);

  // Conexión: ignora microcortes (<~3s) para no tapar el mapa con el banner en cada parpadeo.
  useEffect(() => {
    const clearOfflineTimer = () => {
      if (offlineDebounceRef.current != null) {
        window.clearTimeout(offlineDebounceRef.current);
        offlineDebounceRef.current = null;
      }
    };
    const handleOnline = () => {
      clearOfflineTimer();
      setIsOnline(true);
      if (groupId && groupId !== 'REPEATED') {
        getDoc(doc(db, 'groups', groupId)).then((snap) => {
          if (snap.exists()) setGroup(snap.data());
        });
      }
    };
    const handleOffline = () => {
      clearOfflineTimer();
      offlineDebounceRef.current = window.setTimeout(() => setIsOnline(false), 2800);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearOfflineTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [groupId]);

  const [weakMapTilesNotice, setWeakMapTilesNotice] = useState(false);
  const baseMapTileErrorTsRef = useRef<number[]>([]);
  const weakMapNoticeDismissedRef = useRef(false);

  const WEAK_MAP_WINDOW_MS = 12_000;
  const WEAK_MAP_ERROR_THRESHOLD = 6;

  const recordBaseMapTileError = useCallback(() => {
    const now = Date.now();
    baseMapTileErrorTsRef.current = baseMapTileErrorTsRef.current.filter((t) => now - t < WEAK_MAP_WINDOW_MS);
    baseMapTileErrorTsRef.current.push(now);
    if (weakMapNoticeDismissedRef.current) return;
    if (baseMapTileErrorTsRef.current.length >= WEAK_MAP_ERROR_THRESHOLD) {
      setWeakMapTilesNotice(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const next = baseMapTileErrorTsRef.current.filter((t) => now - t < WEAK_MAP_WINDOW_MS);
      baseMapTileErrorTsRef.current = next;
      if (next.length === 0 && weakMapNoticeDismissedRef.current) {
        weakMapNoticeDismissedRef.current = false;
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    baseMapTileErrorTsRef.current = [];
    weakMapNoticeDismissedRef.current = false;
    setWeakMapTilesNotice(false);
  }, [groupId]);

  useEffect(() => {
    if (!weakMapTilesNotice) return;
    const id = window.setTimeout(() => {
      weakMapNoticeDismissedRef.current = true;
      setWeakMapTilesNotice(false);
    }, 30000);
    return () => window.clearTimeout(id);
  }, [weakMapTilesNotice]);

  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [isCompactUI, setIsCompactUI] = useState(window.innerWidth < 420 || window.innerHeight < 760);
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [viewportTopInset, setViewportTopInset] = useState(0);
  const [forcedLandscapeUiDeg, setForcedLandscapeUiDeg] = useState<90 | -90>(90);
  const isIphoneDevice = useMemo(
    () => typeof navigator !== 'undefined' && /iPhone|iPod/i.test(navigator.userAgent),
    []
  );
  const forceLandscapeOnIphone = isIphoneDevice && forceLandscapeUi;
  const isLandscapeUi = isLandscape || forceLandscapeOnIphone;
  const shouldRotateUi = forceLandscapeOnIphone && !isLandscape;

  const containerRef = useRef<HTMLDivElement>(null);
  const alertsMenuContainerRef = useRef<HTMLDivElement>(null);
  const settingsMenuContainerRef = useRef<HTMLDivElement>(null);
  const rankingPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsLandscape(w > h);
      setIsCompactUI(w < 420 || h < 760);
      setViewportSize({ width: w, height: h });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isIphoneDevice || !forceLandscapeUi) return;
    const updateForcedDeg = () => {
      const angleRaw =
        typeof screen !== 'undefined' &&
        screen.orientation &&
        typeof screen.orientation.angle === 'number'
          ? screen.orientation.angle
          : typeof window !== 'undefined' && typeof (window as any).orientation === 'number'
            ? Number((window as any).orientation)
            : 0;
      const normalized = ((angleRaw % 360) + 360) % 360;
      setForcedLandscapeUiDeg(normalized === 270 ? -90 : 90);
    };
    updateForcedDeg();
    window.addEventListener('orientationchange', updateForcedDeg);
    return () => window.removeEventListener('orientationchange', updateForcedDeg);
  }, [isIphoneDevice, forceLandscapeUi]);

  useEffect(() => {
    const updateViewportInset = () => {
      const offsetTop = window.visualViewport?.offsetTop || 0;
      setViewportTopInset(Math.max(0, Math.round(offsetTop)));
    };

    updateViewportInset();
    window.visualViewport?.addEventListener('resize', updateViewportInset);
    window.visualViewport?.addEventListener('scroll', updateViewportInset);
    window.addEventListener('orientationchange', updateViewportInset);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewportInset);
      window.visualViewport?.removeEventListener('scroll', updateViewportInset);
      window.removeEventListener('orientationchange', updateViewportInset);
    };
  }, []);

  useEffect(() => {
    const handleOutsideTap = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      if (showAlertMenu && alertsMenuContainerRef.current && !alertsMenuContainerRef.current.contains(target)) {
        setShowAlertMenu(false);
      }
      if (showSettings && settingsMenuContainerRef.current && !settingsMenuContainerRef.current.contains(target)) {
        setShowSettings(false);
      }
      if (showRanking && rankingPanelRef.current && !rankingPanelRef.current.contains(target)) {
        setShowRanking(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideTap);
    document.addEventListener('touchstart', handleOutsideTap, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideTap);
      document.removeEventListener('touchstart', handleOutsideTap);
    };
  }, [showAlertMenu, showSettings, showRanking]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const { level: userLevel } = calculateLevel(score);
  const isHost = group?.createdBy === user?.uid;
  /** Evita cleanups del efecto pagehide/unmount cuando `isHost` pasa de false→true al cargar el snapshot del grupo (p. ej. tras promover desde REPEATED). */
  const isHostRef = useRef(!!isHost);
  isHostRef.current = !!isHost;
  const isRecording = group?.isRecording || false;
  
  const headingHistoryRef = useRef<{heading: number, time: number}[]>([]);
  const angleHistoryRef = useRef<number[]>([]);
  const lastLeanAutoCalibMsRef = useRef(0);

  // Activate real-time location tracking
  const { speed, heading, currentLocation, courseOverGround, horizontalAccuracy, error: gpsError } = useLocationTracking(
    true,
    groupId,
    {
      score,
      alert: alertType ? { type: alertType, timestamp: Date.now() } : null,
      displayName: displayNameToUse,
      photoURL: photoURLToUse,
      level: userLevel,
      isHost,
    },
    { enableHighAccuracy: gpsHighAccuracyEnabled }
  );

  const [precipitationBanner, setPrecipitationBanner] = useState(false);
  const lastPrecipBannerAtRef = useRef(0);

  /** Rumbo para telemetría (inclinación GPS / auto-calibración): muchos navegadores no rellenan `coords.heading`; usamos COG derivado de posiciones. */
  const headingOrCourseForTelemetry = useMemo(() => {
    if (heading !== null && Number.isFinite(heading)) return heading;
    if ((speed ?? 0) >= 1.2 && courseOverGround !== null && Number.isFinite(courseOverGround)) {
      return courseOverGround;
    }
    return null;
  }, [heading, speed, courseOverGround]);

  const mapWeather = useOpenMeteoWeather(currentLocation?.lat, currentLocation?.lng);
  const {
    leanAngle: sensorLeanAngle,
    maxLeanLeft,
    maxLeanRight,
    permissionGranted: leanPermissionGranted,
    requestPermission,
    resetMaxLean,
    calibrate,
    applyCalibrationStep,
  } = useLeanAngle(speed);
  const isScreenShareLikeMode = touchLockKind === 'mirrorlink' || forceLandscapeUi;

  const playTouchLockReadyFeedback = () => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch {
      /* ignore */
    }
  };

  // Bolsillo o MirrorLink: al terminar la cuenta atrás, bloqueo táctil (MirrorLink = móvil en bolsillo, datos en pantalla de la moto).
  useEffect(() => {
    if (!touchLockKind || pocketCountdown !== 0 || isPocketLocked) return;
    setIsPocketLocked(true);
    playTouchLockReadyFeedback();
  }, [touchLockKind, pocketCountdown, isPocketLocked]);

  const needsOrientationUserGesture =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> })
      .requestPermission === 'function';
  const [estimatedLeanAngle, setEstimatedLeanAngle] = useState(0);
  const lastLeanGpsAutoCalibMsRef = useRef(0);

  // Auto-calibración en recta: antes era casi imposible (>40 km/h y rumbo ±1,5°). Afinado para uso real.
  useEffect(() => {
    if (!currentLocation || headingOrCourseForTelemetry === null) return;

    const now = Date.now();
    headingHistoryRef.current.push({ heading: headingOrCourseForTelemetry, time: now });
    if (headingHistoryRef.current.length > 40) headingHistoryRef.current.shift();

    angleHistoryRef.current.push(sensorLeanAngle);
    if (angleHistoryRef.current.length > 40) angleHistoryRef.current.shift();

    const currentSpeedKmh = (speed || 0) * 3.6;

    if (currentSpeedKmh < 22 || headingHistoryRef.current.length < 24) return;

    const headings = headingHistoryRef.current.map((h) => h.heading);
    const minH = Math.min(...headings);
    const maxH = Math.max(...headings);
    let hDiff = maxH - minH;
    if (hDiff > 180) {
      const adjustedHeadings = headings.map((h) => (h < 180 ? h + 360 : h));
      hDiff = Math.max(...adjustedHeadings) - Math.min(...adjustedHeadings);
    }

    // Recta tolerante al GPS real (~6–7° en ~4 s)
    if (hDiff > 7) return;

    const n = angleHistoryRef.current.length;
    if (n < 12) return;
    const avgAngle = angleHistoryRef.current.reduce((a, b) => a + b, 0) / n;
    const variance = angleHistoryRef.current.reduce((a, b) => a + (b - avgAngle) ** 2, 0) / n;

    if (variance > 18) return;

    const nowMs = Date.now();
    if (nowMs - lastLeanAutoCalibMsRef.current < 480) return;
    lastLeanAutoCalibMsRef.current = nowMs;

    const strength = currentSpeedKmh > 45 ? 0.022 : currentSpeedKmh > 30 ? 0.016 : 0.012;
    applyCalibrationStep(avgAngle, strength);
  }, [currentLocation, headingOrCourseForTelemetry, speed, sensorLeanAngle, applyCalibrationStep]);

  // Auto-calibración también en modo GPS normal (sin bolsillo/mirrorlink): ayuda a centrar en uso real continuado.
  useEffect(() => {
    if (!isRecording || isPocketLocked || touchLockKind) return;
    if (!currentLocation || headingOrCourseForTelemetry === null) return;

    const speedKmh = (speed || 0) * 3.6;
    if (speedKmh < 18 || headingHistoryRef.current.length < 18) return;

    const headings = headingHistoryRef.current.map((h) => h.heading);
    const minH = Math.min(...headings);
    const maxH = Math.max(...headings);
    let hDiff = maxH - minH;
    if (hDiff > 180) {
      const adjusted = headings.map((h) => (h < 180 ? h + 360 : h));
      hDiff = Math.max(...adjusted) - Math.min(...adjusted);
    }
    if (hDiff > 8) return;

    const n = angleHistoryRef.current.length;
    if (n < 12) return;
    const avgAngle = angleHistoryRef.current.reduce((a, b) => a + b, 0) / n;
    const variance = angleHistoryRef.current.reduce((a, b) => a + (b - avgAngle) ** 2, 0) / n;
    if (variance > 22) return;

    const nowMs = Date.now();
    if (nowMs - lastLeanGpsAutoCalibMsRef.current < 900) return;
    lastLeanGpsAutoCalibMsRef.current = nowMs;

    const strength = speedKmh > 40 ? 0.014 : speedKmh > 28 ? 0.01 : 0.008;
    applyCalibrationStep(avgAngle, strength);
  }, [
    isRecording,
    isPocketLocked,
    touchLockKind,
    currentLocation,
    headingOrCourseForTelemetry,
    speed,
    applyCalibrationStep,
  ]);

  const leftTurnsRef = useRef(0);
  const rightTurnsRef = useRef(0);
  /** Entrada en curva con ≥20 km/h e inclinación >10° → permite puntuar al salir aunque baje un poco la velocidad. */
  const curveEntryQualifiedRef = useRef(false);
  const [parsedRoute, setParsedRoute] = useState<any>(null);

  // iPhone/Safari: requestPermission() debe ir tras un gesto del usuario; no llamar solo al montar.
  useEffect(() => {
    if (!needsOrientationUserGesture) {
      void requestPermission();
    }
  }, [needsOrientationUserGesture, requestPermission]);

  useEffect(() => {
    if (group?.routeGeoJSON) {
      setParsedRoute(parseRouteData(group.routeGeoJSON));
    } else {
      setParsedRoute(null);
    }
  }, [group?.routeGeoJSON]);

  /** Ocultar guía OSRM solo en este dispositivo (sigue la ruta del grupo en servidor). */
  const [navigationGuideHiddenLocal, setNavigationGuideHiddenLocal] = useState(false);
  useEffect(() => {
    setNavigationGuideHiddenLocal(false);
  }, [group?.routeGeoJSON]);

  /** Solo hidrata la ruta repetida una vez; las búsquedas posteriores no las pisa el efecto. */
  const repeatedPreloadAppliedRef = useRef(false);
  useEffect(() => {
    repeatedPreloadAppliedRef.current = false;
  }, [groupId]);

  const effectiveRouteForNav = useMemo(
    () => (navigationGuideHiddenLocal ? null : parsedRoute),
    [navigationGuideHiddenLocal, parsedRoute]
  );

  useEffect(() => {
    if (!precipitationBanner) return;
    const id = window.setTimeout(() => setPrecipitationBanner(false), 30000);
    return () => window.clearTimeout(id);
  }, [precipitationBanner]);

  useEffect(() => {
    setPrecipitationBanner(false);
    lastPrecipBannerAtRef.current = 0;
  }, [groupId]);

  useEffect(() => {
    if (!isOnline || !currentLocation) return;
    let cancelled = false;
    const COOLDOWN_MS = 10 * 60 * 1000;
    const INTERVAL_MS = 4 * 60 * 1000;

    const run = async () => {
      if (cancelled) return;
      if (premiumGpsPolicy.precipAlertsPremiumOnly && !selfPremium) return;
      if (Date.now() - lastPrecipBannerAtRef.current < COOLDOWN_MS) return;
      const lat = currentLocation.lat;
      const lng = currentLocation.lng;
      const pts: { lat: number; lng: number }[] = [{ lat, lng }];
      for (const deg of [0, 90, 180, 270] as const) {
        pts.push(offsetByMeters(lat, lng, deg, 10000));
      }
      const routeGeo = effectiveRouteForNav;
      if (routeGeo) {
        const coords = getLineCoordinates(routeGeo);
        if (coords.length >= 2) {
          samplePolylineByDistance(coords, 4).forEach((p) => pts.push(p));
        }
      }
      const unique = dedupeNearbyPoints(pts);
      if (unique.length === 0) return;
      try {
        const risk = await anyPrecipitationRiskAtPoints(unique);
        if (cancelled || !risk) return;
        lastPrecipBannerAtRef.current = Date.now();
        setPrecipitationBanner(true);
        if (navigator.vibrate) navigator.vibrate(80);
      } catch {
        /* ignore */
      }
    };

    const boot = window.setTimeout(() => void run(), 22000);
    const interval = window.setInterval(() => void run(), INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      window.clearInterval(interval);
    };
  }, [
    isOnline,
    currentLocation?.lat,
    currentLocation?.lng,
    effectiveRouteForNav,
    groupId,
    premiumGpsPolicy.precipAlertsPremiumOnly,
    selfPremium,
  ]);

  const navState = useNavigation(currentLocation, effectiveRouteForNav);
  const navigationHeading = useNavigationHeading(
    heading,
    speed,
    courseOverGround,
    currentLocation,
    effectiveRouteForNav,
    navState
  );
  const displayLocation = useMemo(() => {
    if (!currentLocation) return null;
    const snapCandidate = navState.routeGeometry || effectiveRouteForNav;
    if (!snapCandidate) return currentLocation;

    const snapped = snapPointToRouteDetailed(currentLocation.lat, currentLocation.lng, snapCandidate);
    const acc = horizontalAccuracy;
    let maxSnapM = 42;
    if (acc != null && Number.isFinite(acc) && acc > 18) {
      // GPS impreciso: acotar el snap para no “saltar” a la polilínea equivocada.
      maxSnapM = Math.max(16, Math.min(42, 52 - acc * 0.42));
    }
    if (snapped.distanceMeters <= maxSnapM) {
      return { lat: snapped.lat, lng: snapped.lng };
    }
    return currentLocation;
  }, [currentLocation, navState.routeGeometry, effectiveRouteForNav, horizontalAccuracy]);

  const { nearbyRadar, radars } = useRoadData(currentLocation);
  const [hostIsPremium, setHostIsPremium] = useState(false);
  useEffect(() => {
    const hostId = group?.createdBy;
    if (!hostId) {
      setHostIsPremium(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', hostId),
      (snap) => {
        setHostIsPremium(snap.exists() && snap.data()?.isPremium === true);
      },
      () => setHostIsPremium(false)
    );
    return () => unsub();
  }, [group?.createdBy]);

  const voiceAllowed = selfPremium || hostIsPremium;

  const { isVoiceActive, toggleVoice, peersCount, micError, clearMicError } = useVoiceChat(groupId, voiceAllowed);

  // Listen to group data
  useEffect(() => {
    if (groupId === 'REPEATED' && preloadedRoute && !repeatedPreloadAppliedRef.current) {
      repeatedPreloadAppliedRef.current = true;
      setGroup({
        name: 'Repitiendo Ruta',
        routeGeoJSON: preloadedRoute,
        isEsporadica: true,
        startTime: Date.now(),
        createdBy: user?.uid,
        members: user?.uid ? [user.uid] : [],
      });
      return;
    }
    if (!groupId || groupId === 'REPEATED') return;
    const unsub = onSnapshot(doc(db, 'groups', groupId), (doc) => {
      setGroup(doc.data());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `groups/${groupId}`);
    });
    return unsub;
  }, [groupId, preloadedRoute, user?.uid]);

  useEffect(() => {
    const has = locations.some((l) => l.alert);
    if (!has) return;
    const id = window.setInterval(() => setPeerAlertTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [locations]);

  // Listen to locations of group members via Socket.io
  useEffect(() => {
    const handleLocationUpdate = (data: any) => {
      setLocations(prev => {
        const idx = prev.findIndex(l => l.uid === data.uid);
        if (idx >= 0) {
          const existing = prev[idx];
          const nextTs = data?.timestamp || 0;
          const prevTs = existing?.timestamp || 0;
          if (nextTs <= prevTs && !data?.alert) return prev;
          const newLocs = [...prev];
          newLocs[idx] = { ...existing, ...data };
          return newLocs;
        }
        return [...prev, data];
      });
    };
    const handleUserLeft = (data: { uid: string }) => {
      setLocations(prev => prev.filter(l => l.uid !== data.uid));
    };
    const handleHostLeftRoute = () => {
      setHostLeftRoute(true);
      setGroup((prev: any) => (prev ? { ...prev, isRecording: false, hostLeftAt: Date.now() } : prev));
    };
    const handleAlertTriggered = (data: {
      uid: string;
      displayName: string;
      type: string;
      lat?: number;
      lng?: number;
    }) => {
      const ts = Date.now();
      const alertPayload = { type: data.type, timestamp: ts };
      const latOk = typeof data.lat === 'number' && Number.isFinite(data.lat);
      const lngOk = typeof data.lng === 'number' && Number.isFinite(data.lng);
      setLocations((prev) => {
        const idx = prev.findIndex((l) => l.uid === data.uid);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], alert: alertPayload };
          return next;
        }
        // Sin entrada previa (p. ej. aún no llegó update-location / Firestore): igual mostrar el aviso.
        const base: Record<string, unknown> = {
          uid: data.uid,
          displayName: data.displayName || 'Motero',
          timestamp: ts,
          alert: alertPayload,
          score: 0,
          speed: 0,
          heading: 0,
          photoURL: '',
          level: 1,
        };
        if (latOk && lngOk) {
          base.lat = data.lat;
          base.lng = data.lng;
        }
        return [...prev, base as any];
      });
      setTimeout(() => {
        setLocations((prev) => prev.map((l) => (l.uid === data.uid ? { ...l, alert: null } : l)));
      }, 30000);
    };

    socket.on('location-updated', handleLocationUpdate);
    socket.on('user-left', handleUserLeft);
    socket.on('host-left-route', handleHostLeftRoute);
    socket.on('alert-triggered', handleAlertTriggered);

    const unsubs: Array<() => void> = [];
    // Firestore: posición reciente como respaldo del socket. Los avisos no se leen ni escriben en Firestore (solo tiempo real).
    if (group?.members?.length) {
      const chunks = [];
      for (let i = 0; i < group.members.length; i += 10) {
        chunks.push(group.members.slice(i, i + 10));
      }

      chunks.forEach(chunk => {
        const q = query(collection(db, 'locations'), where('uid', 'in', chunk));
        const unsub = onSnapshot(q, (snap) => {
          setLocations(prev => {
            const newLocs = [...prev];
            snap.docs.forEach(d => {
              const raw = d.data();
              const { alert: _dropAlert, ...data } = raw;
              if (Date.now() - (data.timestamp as number) < 10 * 60 * 1000) {
                const idx = newLocs.findIndex(l => l.uid === d.id);
                if (idx >= 0) {
                  if ((data.timestamp as number) > (newLocs[idx].timestamp || 0)) {
                    newLocs[idx] = { ...newLocs[idx], ...data };
                  }
                } else {
                  newLocs.push(data as any);
                }
              }
            });
            return newLocs;
          });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'locations');
        });
        unsubs.push(unsub);
      });
    }

    return () => {
      socket.off('location-updated', handleLocationUpdate);
      socket.off('user-left', handleUserLeft);
      socket.off('host-left-route', handleHostLeftRoute);
      socket.off('alert-triggered', handleAlertTriggered);
      unsubs.forEach(u => u());
    };
  }, [group?.members]);

  useEffect(() => {
    if (isHost) return;
    if (group?.hostLeftAt) {
      setHostLeftRoute(true);
    }
  }, [group?.hostLeftAt, isHost]);

  const deleteGroupIfHost = async (reason: string) => {
    if (!groupId || groupId === 'REPEATED' || !user || leaveInProgressRef.current) return;
    leaveInProgressRef.current = true;
    try {
      if (isHostRef.current) {
        const hostLeftAt = Date.now();
        await updateDoc(doc(db, 'groups', groupId), {
          isRecording: false,
          hostLeftAt,
          hostLeftUid: user.uid,
          members: arrayRemove(user.uid)
        });
        socket.emit('leave-group', { groupId, uid: user.uid, isHost: true, timestamp: hostLeftAt });
      } else {
        await updateDoc(doc(db, 'groups', groupId), {
          members: arrayRemove(user.uid)
        });
        socket.emit('leave-group', { groupId, uid: user.uid, isHost: false, timestamp: Date.now() });
      }
    } catch (error) {
      console.error(`Error leaving group (${reason}):`, error);
      handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
    } finally {
      leaveInProgressRef.current = false;
    }
  };

  const confirmLeaveRoute = async () => {
    if (confirmLeaveInFlightRef.current) return;
    confirmLeaveInFlightRef.current = true;
    setExitLeaving(true);
    setShowExitConfirm(false);
    hasExplicitlyLeftRef.current = true;
    try {
      await deleteGroupIfHost('leave-route');
    } catch (e) {
      console.error('confirmLeaveRoute:', e);
    } finally {
      prepareHistoryLeave?.();
      onLeave();
      if (window.history.state && (window.history.state as { motorideRoute?: boolean }).motorideRoute) {
        window.history.back();
      }
      confirmLeaveInFlightRef.current = false;
      setExitLeaving(false);
    }
  };

  // Wake Lock siempre en vista de mapa (GPS/ruta visible); iOS 16.4+ Safari / PWA; a menudo hace falta un gesto.
  useEffect(() => {
    let cancelled = false;
    const shouldKeepAwake = true;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<any> } };

    const requestWakeLock = async () => {
      if (!shouldKeepAwake || !nav.wakeLock?.request) return;
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
        wakeLockRef.current = await nav.wakeLock.request('screen');
        wakeLockRef.current?.addEventListener?.('release', () => {
          wakeLockRef.current = null;
        });
      } catch {
        // iPhone: a menudo hace falta un gesto del usuario; se reintenta al tocar la pantalla.
      }
    };

    const onInteract = () => {
      if (!shouldKeepAwake || cancelled || wakeLockRef.current) return;
      void requestWakeLock();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldKeepAwake && !cancelled) {
        void requestWakeLock();
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && shouldKeepAwake && !cancelled) {
        void requestWakeLock();
      }
    };

    if (shouldKeepAwake) {
      void requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pageshow', handlePageShow);
      document.addEventListener('touchstart', onInteract, { capture: true, passive: true });
      document.addEventListener('pointerdown', onInteract, { capture: true });
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('touchstart', onInteract, true);
      document.removeEventListener('pointerdown', onInteract, true);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  // Leave group when route view is closed/app is backgrounded or closed.
  useEffect(() => {
    if (!groupId || groupId === 'REPEATED') return;

    const handleBeforeUnload = () => {
      hasExplicitlyLeftRef.current = true;
      deleteGroupIfHost('beforeunload');
    };
    const handlePageHide = () => {
      hasExplicitlyLeftRef.current = true;
      deleteGroupIfHost('pagehide');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      if (!hasExplicitlyLeftRef.current) {
        deleteGroupIfHost('unmount');
      }
    };
    // No incluir `isHost` aquí: al llegar el snapshot del grupo, isHost pasa a true y el cleanup
    // anterior ejecutaría deleteGroupIfHost con valores obsoletos y podría expulsar al anfitrión.
  }, [groupId, user?.uid]);

  // GPS-based lean angle estimation (fallback for when phone is in pocket/screen off)
  useEffect(() => {
    if (!isRecording || !currentLocation || speed === null || speed < MIN_SPEED_MPS_GPS_LEAN) {
      setEstimatedLeanAngle(0);
      return;
    }

    if (lastHeadingRef.current !== null && headingOrCourseForTelemetry !== null) {
      const now = Date.now();
      const dt = (now - lastHeadingTimeRef.current) / 1000; // seconds
      
      if (dt > 0.22) {
        let deltaHeading = headingOrCourseForTelemetry - lastHeadingRef.current;
        // Normalize deltaHeading to [-180, 180]
        if (deltaHeading > 180) deltaHeading -= 360;
        if (deltaHeading < -180) deltaHeading += 360;

        const deltaHeadingRad = (deltaHeading * Math.PI) / 180;
        const angularVelocity = deltaHeadingRad / dt; // rad/s

        if (Math.abs(angularVelocity) > 0.01) {
          // r = v / omega
          const radius = speed / Math.abs(angularVelocity);
          const g = 9.81;
          // tan(theta) = v^2 / (r * g) => theta = atan(v^2 / (r * g))
          // But since r = v / |omega|, theta = atan(v * |omega| / g)
          const thetaRad = Math.atan((speed * Math.abs(angularVelocity)) / g);
          let thetaDeg = (thetaRad * 180) / Math.PI;
          const cap = 48;
          if (thetaDeg > cap) thetaDeg = cap;
          if (thetaDeg < -cap) thetaDeg = -cap;

          // Apply direction
          if (angularVelocity < 0) thetaDeg = -thetaDeg;

          // Smooth the estimate (float para fluidez; la UI redondea grados enteros)
          setEstimatedLeanAngle((prev) => prev * 0.62 + thetaDeg * 0.38);
        } else {
          setEstimatedLeanAngle((prev) => prev * 0.82);
        }

        lastHeadingRef.current = headingOrCourseForTelemetry;
        lastHeadingTimeRef.current = now;
      }
    } else if (headingOrCourseForTelemetry !== null) {
      lastHeadingRef.current = headingOrCourseForTelemetry;
      lastHeadingTimeRef.current = Date.now();
    }
  }, [currentLocation, headingOrCourseForTelemetry, speed, isRecording]);

  useEffect(() => {
    if (currentLocation) {
      lastKnownLocForPrefetchRef.current = { lat: currentLocation.lat, lng: currentLocation.lng };
    }
  }, [currentLocation?.lat, currentLocation?.lng]);

  // Precarga ~5 km alrededor del usuario en el zoom actual (±1) y rellena map-tiles-v3 (igual que el service worker).
  useEffect(() => {
    const loc =
      displayLocation &&
      typeof displayLocation.lat === 'number' &&
      typeof displayLocation.lng === 'number' &&
      Number.isFinite(displayLocation.lat) &&
      Number.isFinite(displayLocation.lng)
        ? { lat: displayLocation.lat, lng: displayLocation.lng }
        : lastKnownLocForPrefetchRef.current ?? mapViewportCenterRef.current;
    if (!loc) return;

    const gen = ++tilePrefetchGenRef.current;
    const id = window.setTimeout(() => {
      if (tilePrefetchGenRef.current !== gen) return;
      void prefetchAroundUser(loc.lat, loc.lng, mapZoomRef.current, 5000);
    }, 520);
    return () => clearTimeout(id);
  }, [tilePrefetchEpoch, displayLocation, localDistance]);

  // Use sensor data if available, otherwise fallback to GPS estimate
  /**
   * Bolsillo / MirrorLink bloqueado: mezcla IMU + estimación GPS (el GPS solo es aproximado por rumbo).
   * Modo GPS normal (móvil en manillar): prioridad al sensor del móvil; GPS solo como respaldo suave.
   */
  const leanAngle = useMemo(() => {
    const telemetryFromPocket =
      isPocketLocked && isRecording && (touchLockKind === 'pocket' || touchLockKind === 'mirrorlink');
    if (telemetryFromPocket) {
      if (speed !== null && speed >= 3) {
        const mode = touchLockKind === 'mirrorlink' ? 'mirrorlink' : 'pocket';
        return blendLeanPocketMirror(sensorLeanAngle, estimatedLeanAngle, speed, mode);
      }
      return 0;
    }
    // En modo compartir pantalla priorizamos GPS cuando el sensor está casi en cero para evitar sesgo a derecha en parado.
    if (isScreenShareLikeMode && speed != null && speed < 3 && Math.abs(sensorLeanAngle) <= 2.5) {
      return 0;
    }
    if (Math.abs(sensorLeanAngle) > 2) return sensorLeanAngle;
    return estimatedLeanAngle;
  }, [
    touchLockKind,
    isPocketLocked,
    isRecording,
    speed,
    estimatedLeanAngle,
    sensorLeanAngle,
    isScreenShareLikeMode,
  ]);

  // Curve detection & scoring (>20 km/h e inclinación >10° al entrar; puntuación si hubo pico >10°)
  useEffect(() => {
    if (!isRecording) return;
    const currentSpeed = (speed || 0) * 3.6;
    const MIN_CURVE_SPEED_KMH = 20;
    const CURVE_START_DEG = 10;
    const CURVE_END_DEG = 5;
    const absAngle = Math.abs(leanAngle);
    if (currentSpeed >= MIN_CURVE_SPEED_KMH && absAngle > CURVE_START_DEG) {
      if (!inCurve) {
        setInCurve(true);
        curveEntryQualifiedRef.current = true;
        if (leanAngle > 0) {
          rightTurnsRef.current += 1;
        } else {
          leftTurnsRef.current += 1;
        }
      }
      if (absAngle > currentCurveMax) setCurrentCurveMax(absAngle);
    } else if ((currentSpeed < MIN_CURVE_SPEED_KMH || absAngle <= CURVE_END_DEG) && inCurve) {
      setInCurve(false);
      if (curveEntryQualifiedRef.current && currentCurveMax > CURVE_START_DEG) {
        setScore((prev) => Math.ceil(prev + currentCurveMax));
      }
      curveEntryQualifiedRef.current = false;
      setCurrentCurveMax(0);
    }
  }, [leanAngle, isRecording, inCurve, currentCurveMax, speed]);

  useEffect(() => {
    if (isRecording) return;
    setInCurve(false);
    setCurrentCurveMax(0);
    curveEntryQualifiedRef.current = false;
  }, [isRecording]);

  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isSharingSummary, setIsSharingSummary] = useState(false);

  const prevRecordingRef = useRef(isRecording);
  const recordingStartTimeRef = useRef<number>(0);
  const ridePointsCommittedSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isRecording || summaryData) return;
    const draft = readRideDraft();
    if (draft?.summaryData) {
      setSummaryData(draft.summaryData);
      setRecordedPath(Array.isArray(draft.path) ? draft.path : []);
      setShowSummary(true);
      // Borradores antiguos sin clave: asumimos que los puntos ya se sumaron al cerrar la ruta.
      ridePointsCommittedSessionKeyRef.current =
        draft.summaryData.rideSessionKey ?? 'legacy-draft';
    }
  }, [isRecording, summaryData]);

  const persistRideDraft = (payload: any) => {
    try {
      localStorage.setItem(LOCAL_RIDE_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota/private mode errors.
    }
  };

  const readRideDraft = () => {
    try {
      const raw = localStorage.getItem(LOCAL_RIDE_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const clearRideDraft = () => {
    try {
      localStorage.removeItem(LOCAL_RIDE_DRAFT_KEY);
    } catch {
      // Ignore storage errors.
    }
  };

  const createSummaryImage = async () => {
    if (!summaryData) return null;

    const canvas = document.createElement('canvas');
    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#18181b');
    bg.addColorStop(1, '#09090b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Card
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(70, 70, width - 140, height - 140, 40);
    ctx.fill();

    // Title
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 58px Inter, Arial, sans-serif';
    ctx.fillText('Ruta Finalizada', 140, 190);
    ctx.fillStyle = '#e4e4e7';
    ctx.font = '28px Inter, Arial, sans-serif';
    ctx.fillText(group?.name || 'Ruta Motera', 140, 240);

    const totalScore = summaryData.score || 0;
    const baseScore = summaryData.baseScore || totalScore;
    const bonusScore = summaryData.distanceBonus || 0;
    const averageSpeed = summaryData.duration > 0 ? Math.round(summaryData.distance / (summaryData.duration / 3600000)) : 0;

    const metrics = [
      `Distancia: ${summaryData.distance} km`,
      `Tiempo: ${Math.floor(summaryData.duration / 60000)}m ${Math.floor((summaryData.duration % 60000) / 1000)}s`,
      `Velocidad media: ${averageSpeed} km/h`,
      `Curvas: Izq ${summaryData.leftTurns} / Der ${summaryData.rightTurns}`,
      `Inclinacion max: Izq ${summaryData.maxLeanLeft}° / Der ${summaryData.maxLeanRight}°`,
      `Puntos base: +${baseScore}`,
      `Bonus distancia: +${bonusScore}`,
      `Puntos totales: +${totalScore}`
    ];

    ctx.fillStyle = '#f4f4f5';
    ctx.font = 'bold 36px Inter, Arial, sans-serif';
    ctx.fillText('Resumen detallado', 140, 330);

    ctx.font = '30px Inter, Arial, sans-serif';
    let y = 400;
    for (const line of metrics) {
      ctx.fillStyle = line.includes('totales') ? '#f97316' : line.includes('Bonus') ? '#34d399' : '#f4f4f5';
      ctx.fillText(line, 140, y);
      y += 95;
    }

    ctx.fillStyle = '#71717a';
    ctx.font = '24px Inter, Arial, sans-serif';
    ctx.fillText('MotoRide - Conduce con seguridad', 140, height - 120);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob;
  };

  const shareSummaryImage = async () => {
    if (!summaryData || isSharingSummary) return;
    setIsSharingSummary(true);
    try {
      const blob = await createSummaryImage();
      if (!blob) {
        showMessage({ variant: 'error', title: 'Resumen', message: 'No se pudo generar la imagen del resumen.' });
        return;
      }

      const file = new File([blob], `resumen-ruta-${Date.now()}.png`, { type: 'image/png' });
      const shareText = `Resumen de ruta: +${summaryData.score || 0} puntos en ${summaryData.distance} km.`;

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Resumen de Ruta - MotoRide',
          text: shareText,
          files: [file]
        });
      } else {
        const imageUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `resumen-ruta-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(imageUrl);
        showMessage({
          variant: 'info',
          title: 'Compartir',
          message:
            'Tu dispositivo no permite compartir archivos directamente. Se ha descargado la imagen para que la compartas por WhatsApp o la app que quieras.',
        });
      }
    } catch (err) {
      console.error('Error sharing summary image:', err);
      showMessage({ variant: 'error', title: 'Compartir', message: 'No se pudo compartir el resumen.' });
    } finally {
      setIsSharingSummary(false);
    }
  };

  useEffect(() => {
    if (isRecording && group?.startTime) {
      recordingStartTimeRef.current = group.startTime;
    }
  }, [isRecording, group?.startTime]);

  const commitRidePointsToProfile = useCallback(
    async (stats: {
      distance: number;
      score: number;
      leftTurns: number;
      rightTurns: number;
      maxLeanLeft: number;
      maxLeanRight: number;
    }): Promise<boolean> => {
      if (!user?.uid) return false;
      const userRef = doc(db, 'users', user.uid);
      try {
        const userSnap = await getDoc(userRef);
        const finalScore = stats.score;
        const dist = stats.distance;
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const currentPoints = userData.points || 0;
          const newPoints = currentPoints + finalScore;
          const { level: newLevel } = calculateLevel(newPoints);
          await updateDoc(userRef, {
            points: newPoints,
            level: newLevel,
            totalDistance: (userData.totalDistance || 0) + dist,
            totalLeftTurns: (userData.totalLeftTurns || 0) + stats.leftTurns,
            totalRightTurns: (userData.totalRightTurns || 0) + stats.rightTurns,
          });
        } else {
          const { level: newLevel } = calculateLevel(finalScore);
          await setDoc(userRef, {
            points: finalScore,
            level: newLevel,
            totalDistance: dist,
            totalLeftTurns: stats.leftTurns,
            totalRightTurns: stats.rightTurns,
          });
        }
        return true;
      } catch (err: unknown) {
        console.error('Error al sumar puntos al perfil:', err);
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        return false;
      }
    },
    [user?.uid]
  );

  // Handle start/stop recording for all members
  useEffect(() => {
    const handleStopRecording = async () => {
      const startTime = group?.startTime ?? recordingStartTimeRef.current;
      if (!(prevRecordingRef.current && !isRecording && user && startTime)) {
        return;
      }

      const rideSessionKey = `${user.uid}:${groupId}:${startTime}`;
      if (ridePointsCommittedSessionKeyRef.current === rideSessionKey) {
        return;
      }

      const rideDuration = Math.max(0, Date.now() - startTime);
      const distanceBonus = Math.floor(localDistance / 100) * 20;
      const pointsConfig = await getActivePointsConfig();
      const adjustedBaseScore = Math.round(score * pointsConfig.baseMultiplier);
      const adjustedDistanceBonus = Math.round(distanceBonus * pointsConfig.distanceMultiplier);
      const finalScore = Math.round((adjustedBaseScore + adjustedDistanceBonus) * pointsConfig.eventMultiplier);
      const currentRideStats = {
        distance: Number(localDistance.toFixed(2)),
        score: finalScore,
        baseScore: adjustedBaseScore,
        distanceBonus: adjustedDistanceBonus,
        leftTurns: leftTurnsRef.current,
        rightTurns: rightTurnsRef.current,
        maxLeanLeft,
        maxLeanRight,
        duration: rideDuration,
        multipliers: pointsConfig,
        rideSessionKey,
      };

      const pathSnapshot = [...recordedPath];
      const ok = await commitRidePointsToProfile({
        distance: currentRideStats.distance,
        score: finalScore,
        leftTurns: currentRideStats.leftTurns,
        rightTurns: currentRideStats.rightTurns,
        maxLeanLeft: currentRideStats.maxLeanLeft,
        maxLeanRight: currentRideStats.maxLeanRight,
      });

      if (!ok) {
        setSummaryData(currentRideStats);
        setShowSummary(true);
        persistRideDraft({ createdAt: Date.now(), summaryData: currentRideStats, path: pathSnapshot });
        return;
      }

      ridePointsCommittedSessionKeyRef.current = rideSessionKey;
      setSummaryData(currentRideStats);
      setShowSummary(true);
      persistRideDraft({
        createdAt: Date.now(),
        summaryData: currentRideStats,
        path: pathSnapshot,
      });

      setRecordedPath([]);
      leftTurnsRef.current = 0;
      rightTurnsRef.current = 0;
      setLocalDistance(0);
      setScore(0);
      resetMaxLean();
    };

    void handleStopRecording();

    if (!prevRecordingRef.current && isRecording) {
      ridePointsCommittedSessionKeyRef.current = null;
      recordingStartTimeRef.current = group?.startTime ?? Date.now();
      clearRideDraft();
      resetMaxLean();
      setLocalDistance(0);
      setScore(0);
      setRecordedPath([]);
      lastLocRef.current = currentLocation;
    }
    prevRecordingRef.current = isRecording;
  }, [
    isRecording,
    user,
    group?.startTime,
    localDistance,
    maxLeanLeft,
    maxLeanRight,
    score,
    groupId,
    recordedPath,
    resetMaxLean,
    currentLocation,
    group?.name,
    commitRidePointsToProfile,
  ]);

  // Record path locally from the moment movement starts
  useEffect(() => {
    if (currentLocation) {
      setRecordedPath(prev => {
        const last = prev[prev.length - 1];
        if (!last || getDistance(currentLocation.lat, currentLocation.lng, last.lat, last.lng) > 10) {
          return [...prev, currentLocation];
        }
        return prev;
      });
    }
  }, [currentLocation]);

  // Calculate distance and handle auto-start
  useEffect(() => {
    if (currentLocation) {
      if (lastLocRef.current) {
        const R = 6371; // Earth's radius in km
        const dLat = (currentLocation.lat - lastLocRef.current.lat) * Math.PI / 180;
        const dLon = (currentLocation.lng - lastLocRef.current.lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lastLocRef.current.lat * Math.PI / 180) * Math.cos(currentLocation.lat * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        
        setLocalDistance(prev => {
          const newDist = prev + d;
          
          // En bolsillo no auto-calibrar por distancia: la postura del móvil no es "moto recta" y empeora el offset.

          // Add 1 point per kilometer (d is in km)
          // Only update when we cross a kilometer boundary
          if (isRecording && Math.floor(newDist) > Math.floor(prev)) {
            setScore(s => s + (Math.floor(newDist) - Math.floor(prev)));
          }

          // Auto-start recording for group if host and distance >= 100m (0.1km)
          if (isHost && newDist >= 0.1 && !isRecording && !autoStarted) {
            setAutoStarted(true);
            toggleRecording();
          }
          return newDist;
        });
      }
      lastLocRef.current = currentLocation;
    }
  }, [currentLocation, isRecording, isHost, autoStarted, touchLockKind]);

  const handleFileUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const geojson = parseGPX(text);
      const routeCoords = (geojson as any)?.features?.find((f: any) => f?.geometry?.type === 'LineString')?.geometry?.coordinates;
      if (geojson && routeCoords && routeCoords.length >= 2) {
        try {
          await updateDoc(doc(db, 'groups', groupId), {
            routeGeoJSON: JSON.stringify(geojson)
          });
          setShowSearchModal(false);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
        }
      } else {
        showMessage({ variant: 'error', title: 'GPX', message: 'No se pudo analizar el archivo GPX o no contiene una ruta válida.' });
      }
    } catch (err) {
      console.error("Error reading file:", err);
      showMessage({ variant: 'error', title: 'Archivo', message: 'Error al leer el archivo.' });
    }
  };

  const generateRouteFromSearch = async () => {
    const typedDestination = searchDestination.trim();
    if (!typedDestination || !user) return;
    setIsSearching(true);
    try {
      const selected = selectedSearchSuggestionRef.current;
      const useSelectedSuggestion =
        selected &&
        selected.displayName === typedDestination &&
        Number.isFinite(selected.lat) &&
        Number.isFinite(selected.lon);

      let destCoords = '';
      if (useSelectedSuggestion) {
        destCoords = `${selected.lon},${selected.lat}`;
      } else {
        const coordParts = typedDestination.split(',').map((p) => p.trim());
        if (coordParts.length >= 2) {
          const lon = Number.parseFloat(coordParts[0]);
          const lat = Number.parseFloat(coordParts[1]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            destCoords = `${lon},${lat}`;
          }
        }
      }

      if (!destCoords) {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(typedDestination)}&limit=12&countrycodes=es&addressdetails=1`;
        const geoData = await requestJson<any[]>(geocodeUrl, {
          timeoutMs: 10000,
          retries: 1,
          backoffMs: 600,
          headers: {
            'User-Agent': 'MoteroApp/1.0 (contact: motorideapp1@gmail.com)'
          }
        });
        const first = pickBestNominatimResult(Array.isArray(geoData) ? geoData : [], typedDestination);
        const lat = Number.parseFloat(String(first?.lat ?? ''));
        const lon = Number.parseFloat(String(first?.lon ?? ''));
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          destCoords = `${lon},${lat}`;
          if (typeof first?.display_name === 'string' && first.display_name.trim().length > 0) {
            setSearchDestination(first.display_name.trim());
            selectedSearchSuggestionRef.current = {
              displayName: first.display_name.trim(),
              lat,
              lon,
            };
          } else {
            selectedSearchSuggestionRef.current = null;
          }
        }
      }

      if (!destCoords) {
        showMessage({
          variant: 'error',
          title: 'Destino',
          message: 'No se ha podido encontrar el destino. Intenta elegir una sugerencia o usar coordenadas "lon,lat".',
        });
        return;
      }

      const start = `${currentLocation?.lng || -3.7038},${currentLocation?.lat || 40.4168}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${start};${destCoords}?overview=full&geometries=geojson`;
      
      const data = await requestJson<any>(url, { timeoutMs: 12000, retries: 1, backoffMs: 700 });
      if (data.code === 'Ok') {
        if (!data.routes?.[0]?.geometry?.coordinates?.length) {
          showMessage({ variant: 'error', title: 'Ruta', message: 'No se pudo generar una ruta válida para ese destino.' });
          return;
        }
        const routeStr = JSON.stringify(data.routes[0].geometry);
        try {
          if (groupId === 'REPEATED') {
            setGroup((prev: Record<string, unknown> | null) => ({
              ...(prev || {}),
              name: (prev?.name as string) || 'Repitiendo Ruta',
              routeGeoJSON: routeStr,
              isEsporadica: true,
              createdBy: user.uid,
              members: user?.uid ? [user.uid] : [],
            }));
          } else {
            await updateDoc(doc(db, 'groups', groupId), {
              routeGeoJSON: routeStr,
            });
          }
          setShowSearchModal(false);
          setSearchDestination('');
          setSearchSuggestions([]);
          selectedSearchSuggestionRef.current = null;
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
        }
      } else {
        showMessage({ variant: 'error', title: 'Ruta', message: 'Error al generar la ruta.' });
      }
    } catch (e) {
      console.error(e);
      showMessage({ variant: 'error', title: 'Red', message: 'Error de conexión.' });
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!showSearchModal || searchDestination.trim().length < 3) {
      setSearchSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const q = searchDestination.trim();
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=12&countrycodes=es&addressdetails=1`;
        const geoData = await requestJson<any[]>(geocodeUrl, {
          timeoutMs: 9000,
          retries: 1,
          backoffMs: 500,
          headers: { 'User-Agent': 'MoteroApp/1.0 (contact: motorideapp1@gmail.com)' },
        });
        const arr = Array.isArray(geoData) ? geoData : [];
        setSearchSuggestions(sortNominatimResults(arr, q).slice(0, 8));
      } catch {
        setSearchSuggestions([]);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [showSearchModal, searchDestination]);

  const cancelNavigation = useCallback(async () => {
    if (!user) return;
    if (groupId === 'REPEATED') {
      setGroup((prev: Record<string, unknown> | null) =>
        prev ? { ...prev, routeGeoJSON: null } : prev
      );
      setNavigationGuideHiddenLocal(false);
      showMessage({
        variant: 'success',
        title: 'Navegación',
        message: 'Ruta quitada. Puedes buscar otro destino o seguir rodando y grabando sin guía.',
      });
      return;
    }
    if (isHost) {
      try {
        await updateDoc(doc(db, 'groups', groupId), { routeGeoJSON: deleteField() });
        setNavigationGuideHiddenLocal(false);
        showMessage({
          variant: 'success',
          title: 'Navegación',
          message: 'Se ha quitado la ruta del grupo. Podéis cargar otra o seguir sin guía.',
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `groups/${groupId}`);
      }
      return;
    }
    setNavigationGuideHiddenLocal(true);
    showMessage({
      variant: 'info',
      title: 'Guía oculta',
      message:
        'Has ocultado la ruta solo en tu pantalla. El grupo sigue con la misma ruta; el anfitrión puede quitarla para todos.',
    });
  }, [user, groupId, isHost, showMessage]);

  const copyCode = async () => {
    const ok = await copyTextToClipboard(groupId);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      window.prompt('Copia el código del grupo:', groupId);
    }
  };

  const shareRoute = async () => {
    const url = `${window.location.origin}${window.location.pathname}?join=${groupId}`;
    const copied = await copyTextToClipboard(url);
    if (!copied) {
      window.prompt('Copia este enlace para invitar a tu ruta:', url);
      return;
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Únete a mi ruta: ${group?.name || 'Ruta Motera'}`,
          text: `¡Hola! Únete a mi ruta en tiempo real usando este enlace:`,
          url,
        });
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name !== 'AbortError' && e?.message !== 'Share canceled') {
          console.error('Share failed:', err);
        }
      }
    }
  };

  const openInviteFriendsModal = useCallback(async () => {
    if (groupId !== 'REPEATED') {
      setInviteModalContext(null);
      setShowInviteFriends(true);
      return;
    }
    const routeJson = typeof preloadedRoute === 'string' ? preloadedRoute.trim() : '';
    if (!routeJson) {
      showMessage({ variant: 'info', title: 'Invitar', message: 'No hay una ruta cargada para invitar desde esta sesión.' });
      return;
    }
    if (!user) return;
    if (!onPromoteFromRepeat) {
      showMessage({ variant: 'info', title: 'Invitar', message: 'No se puede generar invitación en este modo.' });
      return;
    }
    setInviteBusy(true);
    try {
      const code = generateGroupCode();
      const routeName =
        group?.name && group.name !== 'Repitiendo Ruta' ? String(group.name).slice(0, 100) : 'Ruta compartida';
      await setDoc(doc(db, 'groups', code), {
        name: routeName,
        code,
        createdBy: user.uid,
        members: [user.uid],
        isScheduled: false,
        scheduledTimestamp: Date.now(),
        isEsporadica: true,
        province: '',
        municipality: '',
        description: '',
        createdAt: Date.now(),
        routeGeoJSON: routeJson,
      });
      setInviteModalContext({ groupId: code, groupName: routeName });
      onPromoteFromRepeat(code);
      setShowInviteFriends(true);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'groups/from-repeat-invite');
    } finally {
      setInviteBusy(false);
    }
  }, [groupId, preloadedRoute, user, onPromoteFromRepeat, group?.name]);

  const toggleRecording = async () => {
    if (!isHost) return;
    if (!isRecording) {
      await requestPermission();
      setIsFollowing(true); // Force following when starting route
      try {
        await updateDoc(doc(db, 'groups', groupId), { isRecording: true, startTime: Date.now() });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
      }
    } else {
      try {
        await updateDoc(doc(db, 'groups', groupId), { isRecording: false });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
      }
    }
  };

  const sendAlert = (type: string) => {
    setAlertType(type);
    setShowAlertMenu(false);
    setShowSettings(false);
    if (navigator.vibrate) navigator.vibrate(120);
    
    // Broadcast alert via socket (lat/lng para que otros te tengan en `locations` aunque aún no hubiera paquete previo)
    socket.emit('trigger-alert', {
      groupId,
      uid: user?.uid,
      displayName: displayNameToUse,
      type,
      ...(currentLocation
        ? { lat: currentLocation.lat, lng: currentLocation.lng }
        : {}),
    });

    setTimeout(() => setAlertType(null), 30000);
  };

  const currentSpeedKmh = speed ? Math.round(speed * 3.6) : 0;
  const isMoving = currentSpeedKmh > 2;

  const DayWeatherIcon = useMemo(
    () => weatherWmoToLucide(mapWeather.dailyWeatherCode),
    [mapWeather.dailyWeatherCode]
  );

  // Fall detection
  useEffect(() => {
    const leanThreshold = Math.max(45, maxLeanLeft, maxLeanRight);
    if (isRecording && currentSpeedKmh < 5 && Math.abs(leanAngle) >= leanThreshold) {
      if (alertType !== 'Caída') {
        sendAlert('Caída');
      }
    }
  }, [currentSpeedKmh, leanAngle, alertType, isRecording, maxLeanLeft, maxLeanRight]);

  useEffect(() => {
    if (!gpsError || !isHost) return;
    const normalized = gpsError.toLowerCase();
    if (
      normalized.includes('denied') ||
      normalized.includes('permission')
    ) {
      deleteGroupIfHost('gps-error');
    }
  }, [gpsError, isHost]);

  const toggleForcedLandscapeUi = useCallback(() => {
    if (!isIphoneDevice) return;
    setForceLandscapeUi((prev) => {
      const next = !prev;
      if (!next) {
        setForcedLandscapeUiDeg(90);
      } else if (!isLandscape) {
        const vv = window.visualViewport;
        const w = vv?.width ?? window.innerWidth;
        const h = vv?.height ?? window.innerHeight;
        // Elegimos el signo según la geometría para minimizar recortes en el giro visual.
        setForcedLandscapeUiDeg(w >= h ? 90 : -90);
      }
      return next;
    });
  }, [isIphoneDevice, isLandscape]);

  const toggleRotationLock = async () => {
    const so = screen.orientation as ScreenOrientation & {
      lock?: (orientation: ScreenOrientationLockArg) => Promise<void>;
      unlock?: () => void;
    };

    if (rotationLockAppliedRef.current) {
      releaseOrientationLockUi();
      setShowSettings(false);
      return;
    }

    const isiPhone = isIphoneDevice;

    if (!so?.lock) {
      if (isiPhone) {
        showMessage({
          variant: 'info',
          title: 'Orientación',
          message:
            'En iPhone Safari el bloqueo de orientación del navegador suele estar limitado. Usa «Añadir a pantalla de inicio», abre la app desde el icono y activa «Bloquear giro» tras ponerla en horizontal.',
        });
      } else {
        showMessage({ variant: 'info', title: 'Orientación', message: 'Tu navegador no soporta bloquear la orientación.' });
      }
      return;
    }

    const lockToCurrent = async () => {
      const t = so.type as ScreenOrientationLockArg;
      await so.lock(t);
    };

    try {
      await lockToCurrent();
      rotationLockAppliedRef.current = true;
      setRotationLocked(true);
      setShowSettings(false);
    } catch (firstErr: unknown) {
      console.warn('Orientation lock failed, retrying with fullscreen:', firstErr);
      if (!document.fullscreenElement && containerRef.current) {
        try {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
          await new Promise((r) => setTimeout(r, 280));
          await lockToCurrent();
          rotationLockAppliedRef.current = true;
          setRotationLocked(true);
          setShowSettings(false);
          return;
        } catch (e) {
          console.warn('Fullscreen + orientation lock failed:', e);
        }
      }
      const msg = firstErr && typeof firstErr === 'object' && 'message' in firstErr ? String((firstErr as Error).message) : '';
      if (msg.includes('sandboxed')) {
        showMessage({
          variant: 'info',
          title: 'Orientación',
          message: 'El bloqueo de orientación no está disponible en esta vista previa. Abre la app en una pestaña normal del navegador.',
        });
      } else if (isiPhone) {
        // Fallback iPhone: bloqueamos la UI en modo paisaje aunque el lock nativo falle.
        setForceLandscapeUi(true);
        showMessage({
          variant: 'info',
          title: 'iPhone',
          message:
            'El bloqueo nativo ha fallado. Activamos el modo «paisaje forzado» solo para iPhone para mantener la interfaz en horizontal.',
        });
      } else {
        showMessage({
          variant: 'info',
          title: 'Orientación',
          message:
            'No se pudo bloquear el giro. Prueba en pantalla completa o comprueba que la rotación no esté bloqueada a nivel del sistema.',
        });
      }
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'Parado':
        return <AlertCircle size={22} className="shrink-0 text-yellow-950" />;
      case 'Averiado':
        return <Wrench size={22} className="shrink-0 text-white" />;
      case 'Repostar':
      case 'Repostando':
        return <Fuel size={22} className="shrink-0 text-white" />;
      case 'Peligro':
        return <AlertTriangle size={24} className="shrink-0" />;
      case 'Accidente':
        return <Activity size={24} className="shrink-0" />;
      case 'Policía':
        return <ShieldAlert size={24} className="shrink-0" />;
      case 'Caída':
        return <Activity size={24} className="shrink-0 text-red-100 animate-pulse" />;
      default:
        return <AlertCircle size={24} className="shrink-0" />;
    }
  };

  const getAlertUi = (type?: string) => {
    switch (type) {
      case 'Parado':
        return {
          title: 'PARADO / MARGEN',
          card: 'bg-yellow-400 border-yellow-700/60 text-zinc-900',
          badge: 'bg-yellow-900 text-yellow-50',
          sub: 'text-zinc-800',
        };
      case 'Averiado':
        return {
          title: 'AVERÍA',
          card: 'bg-red-600 border-red-400/60 text-white',
          badge: 'bg-red-950/90 text-red-50',
          sub: 'text-red-50/90',
        };
      case 'Repostar':
      case 'Repostando':
        return {
          title: 'PARADA A REPOSTAR',
          card: 'bg-blue-600 border-blue-300/55 text-white',
          badge: 'bg-blue-950/90 text-blue-50',
          sub: 'text-blue-50/90',
        };
      case 'Caída':
        return {
          title: 'CAÍDA DETECTADA',
          card: 'bg-red-600 border-red-300/40 text-white',
          badge: 'bg-red-800/70 text-red-100',
          sub: 'text-red-50/90',
        };
      case 'Accidente':
        return {
          title: 'ACCIDENTE',
          card: 'bg-orange-600 border-orange-200/40 text-white',
          badge: 'bg-orange-900/60 text-orange-100',
          sub: 'text-orange-50/90',
        };
      case 'Peligro':
        return {
          title: 'PELIGRO EN VÍA',
          card: 'bg-amber-500 border-amber-200/40 text-zinc-900',
          badge: 'bg-amber-900/55 text-amber-100',
          sub: 'text-zinc-900/80',
        };
      case 'Policía':
        return {
          title: 'CONTROL / POLICÍA',
          card: 'bg-sky-600 border-sky-200/40 text-white',
          badge: 'bg-sky-950/80 text-sky-50',
          sub: 'text-sky-50/90',
        };
      default:
        return {
          title: type?.toUpperCase() || 'ALERTA',
          card: 'bg-red-500 border-white/25 text-white',
          badge: 'bg-zinc-900/40 text-white',
          sub: 'text-white/90',
        };
    }
  };

  const isHeadingStableNow = () => {
    if (headingHistoryRef.current.length < 20) return false;
    const headings = headingHistoryRef.current.map(h => h.heading);
    const minH = Math.min(...headings);
    const maxH = Math.max(...headings);
    let hDiff = maxH - minH;

    if (hDiff > 180) {
      const adjusted = headings.map(h => h < 180 ? h + 360 : h);
      hDiff = Math.max(...adjusted) - Math.min(...adjusted);
    }
    return hDiff < 6;
  };

  const handleSmartCalibration = async () => {
    await requestPermission();
    const currentSpeedKmh = (speed || 0) * 3.6;
    const canCalibrateStopped = currentSpeedKmh <= 8;
    const canCalibrateOnStraight = currentSpeedKmh >= 22 && isHeadingStableNow();

    if (canCalibrateStopped || canCalibrateOnStraight) {
      calibrate();
      setShowSettings(false);
      return;
    }

    showMessage({
      variant: 'info',
      title: 'Calibrar inclinación',
      message: 'Para calibrar mejor: parado (o casi) o en recta estable unos segundos a partir de ~22 km/h.',
    });
  };

  const otherLocations = useMemo(
    () => locations.filter(loc => loc.uid !== user?.uid),
    [locations, user?.uid]
  );

  /** Miembros del grupo en Firestore aún sin posición en tiempo real (sin GPS o primer fix pendiente). */
  const membersWaitingGps = useMemo(() => {
    if (!Array.isArray(group?.members) || !user?.uid) return [];
    const withLoc = new Set(locations.map((l) => l.uid).filter(Boolean));
    return group.members
      .filter((uid: string) => typeof uid === 'string' && uid.length > 0 && uid !== user.uid && !withLoc.has(uid))
      .map((uid: string) => ({
        uid,
        displayName: memberDisplayNameByUid[uid] || 'Motero',
        score: 0,
        photoURL: '',
        level: 1,
        isPremium: memberPremiumByUid[uid] === true,
        waitingGps: true as const,
      }));
  }, [group?.members, locations, user?.uid, memberDisplayNameByUid, memberPremiumByUid]);

  const markerLocations = useMemo(
    () =>
      otherLocations
        .filter((loc) => typeof loc.lat === 'number' && typeof loc.lng === 'number')
        .map((loc) => ({ ...loc, isPremium: memberPremiumByUid[loc.uid] === true })),
    [otherLocations, memberPremiumByUid]
  );

  const PEER_ALERT_TTL_MS = 30000;
  const activeAlerts = useMemo(
    () =>
      otherLocations.filter(
        (loc) => loc.alert && Date.now() - loc.alert.timestamp < PEER_ALERT_TTL_MS
      ),
    [otherLocations, peerAlertTick]
  );

  const rankingLocations = useMemo(() => {
    type RankRow = {
      uid: string;
      displayName?: string;
      score?: number;
      photoURL?: string;
      level?: number;
      isPremium?: boolean;
      waitingGps?: boolean;
    };
    const rows: RankRow[] = [
      ...otherLocations.map((l) => ({
        ...l,
        isPremium: memberPremiumByUid[l.uid] === true,
      })),
      ...membersWaitingGps,
      {
        uid: user?.uid || '',
        displayName: user?.displayName || 'Tú',
        score,
        photoURL: user?.photoURL,
        level: userLevel,
        isPremium: user?.isPremium === true,
      },
    ];
    return rows
      .filter((row) => row.uid)
      .sort((a, b) => {
        const aw = a.waitingGps ? 1 : 0;
        const bw = b.waitingGps ? 1 : 0;
        if (aw !== bw) return aw - bw;
        return (b.score || 0) - (a.score || 0);
      });
  }, [
    otherLocations,
    membersWaitingGps,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    user?.isPremium,
    score,
    userLevel,
    memberPremiumByUid,
  ]);

  // Real participant count: prefer lista de miembros del grupo (incluye quien aún no tiene GPS).
  const uniqueOtherUsersCount = new Set(
    locations
      .filter(loc => loc.uid && loc.uid !== user?.uid)
      .map(loc => loc.uid)
  ).size;
  const participantCount =
    Array.isArray(group?.members) && group.members.filter(Boolean).length > 0
      ? group.members.filter(Boolean).length
      : (user ? 1 : 0) + uniqueOtherUsersCount;

  // Espaciado superior: env(safe-area-inset-top) vía CSS var (notch / Dynamic Island). Antes headerTop=0 en línea dejaba el HUD bajo el reloj.
  const edgeGap = 8;
  const topBelowSafe = (extraPx: number) =>
    `calc(var(--motoride-safe-top, env(safe-area-inset-top, 0px)) + ${extraPx + viewportTopInset}px)`;

  const connectionBannerHeight = !isOnline ? 58 : 0;
  const hostBannerHeight = hostLeftRoute && !isHost ? 64 : 0;
  const headerOverlayHeight = effectiveRouteForNav ? 220 : (!isMoving ? 98 : 0);
  const C = connectionBannerHeight;
  const H = hostBannerHeight;
  const navHeaderPad = !isMoving ? 86 : 8;

  const firstRowTop = topBelowSafe(edgeGap);
  const hostBannerTop = topBelowSafe(edgeGap + (!isOnline ? C + 8 : 8));

  let belowBanners = edgeGap;
  if (!isOnline) belowBanners += C + 8;
  if (hostLeftRoute && !isHost) belowBanners += 64 + 8;

  const peerAlertRowH = 84;
  const peerAlertsStripHeight =
    activeAlerts.length > 0 ? Math.min(activeAlerts.length, 3) * peerAlertRowH + 12 : 0;

  const peerAlertsTop = topBelowSafe(belowBanners);
  const headerTopOffset = topBelowSafe(belowBanners + peerAlertsStripHeight + (activeAlerts.length > 0 ? 6 : 0));

  const blockBelowHeader = belowBanners + peerAlertsStripHeight;
  const gpsErrorTop = topBelowSafe(blockBelowHeader + navHeaderPad);
  const weakTilesBannerTop = topBelowSafe(blockBelowHeader + navHeaderPad + (gpsError ? 58 : 0) + 6);
  const precipBannerTop = topBelowSafe(
    blockBelowHeader + navHeaderPad + (gpsError ? 58 : 0) + 6 + (weakMapTilesNotice ? 78 : 0)
  );
  const leanIosBannerTop = topBelowSafe(blockBelowHeader + navHeaderPad + (gpsError ? 58 : 0) + 8);

  const topStackBelowSafe = edgeGap + C + H;
  const headerBlockForRanking = !effectiveRouteForNav ? 56 : headerOverlayHeight;
  const rankingExtra = Math.max(
    topStackBelowSafe + peerAlertsStripHeight + headerBlockForRanking + 10,
    edgeGap + C + H + peerAlertsStripHeight + navHeaderPad + (gpsError ? 72 : 0),
    edgeGap + 68
  );
  const rankingTop = topBelowSafe(rankingExtra);
  const rootContainerStyle: CSSProperties = shouldRotateUi
    ? {
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        width: `${viewportSize.height}px`,
        height: `${viewportSize.width}px`,
        transform: `rotate(${forcedLandscapeUiDeg}deg)`,
        transformOrigin: 'center center',
        position: 'absolute',
        top: `calc(50% - ${viewportSize.width / 2}px)`,
        left: `calc(50% - ${viewportSize.height / 2}px)`,
      }
    : { paddingBottom: 'env(safe-area-inset-bottom, 0px)' };

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-dvh h-dvh flex flex-col bg-zinc-900 overflow-hidden"
      style={rootContainerStyle}
    >
      {/* Header overlay */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute left-1/2 -translate-x-1/2 z-[3000] bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-black text-sm border-2 border-white/20 backdrop-blur-md"
            style={{ top: firstRowTop }}
          >
            <ShieldAlert size={20} className="animate-pulse" />
            SIN CONEXIÓN - RECONECTANDO...
          </motion.div>
        )}
        {hostLeftRoute && !isHost && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute left-1/2 -translate-x-1/2 z-[3000] bg-amber-500 text-black px-4 py-3 rounded-2xl shadow-2xl font-black text-xs sm:text-sm border-2 border-white/30 backdrop-blur-md max-w-[92vw] text-center"
            style={{ top: hostBannerTop }}
          >
            El host ha abandonado la ruta. No se guardará progreso nuevo; se sumarán solo los puntos logrados hasta ese momento.
          </motion.div>
        )}
        {activeAlerts.length > 0 && (
          <div
            className="absolute left-0 right-0 z-[1002] flex justify-center px-2 sm:px-3 pointer-events-none"
            style={{ top: peerAlertsTop }}
          >
            <div
              className="w-full max-w-md flex flex-col gap-2 pointer-events-auto overflow-y-auto overscroll-contain pr-1"
              style={{ maxHeight: Math.min(260, peerAlertsStripHeight + 10) }}
            >
              {activeAlerts.map((loc) => {
                const dist =
                  currentLocation &&
                  typeof loc.lat === 'number' &&
                  typeof loc.lng === 'number' &&
                  Number.isFinite(loc.lat) &&
                  Number.isFinite(loc.lng)
                    ? getDistance(currentLocation.lat, currentLocation.lng, loc.lat, loc.lng)
                    : null;
                const distStr = dist != null ? (dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`) : 'Distancia…';
                const alertUi = getAlertUi(loc.alert?.type);
                const subTone = 'sub' in alertUi && alertUi.sub ? alertUi.sub : 'text-white/90';
                return (
                  <div
                    key={`${loc.uid}-${loc.alert?.timestamp ?? 0}`}
                    className={`${alertUi.card} p-3 sm:p-3.5 rounded-2xl shadow-xl border flex items-center gap-3`}
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black/15 flex items-center justify-center shrink-0">
                      {getAlertIcon(loc.alert?.type || '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-black text-[10px] sm:text-[11px] tracking-wide uppercase">{alertUi.title}</p>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${alertUi.badge}`}>
                          {distStr}
                        </span>
                      </div>
                      <p className="font-bold text-sm truncate">{loc.displayName || 'Motero'}</p>
                      <p className={`text-[11px] ${subTone} truncate`}>Aviso de otro usuario en la ruta</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute left-0 right-0 z-[1001] flex justify-between items-start pointer-events-none pl-[max(1rem,var(--motoride-safe-left,env(safe-area-inset-left,0px)))] pr-[max(1rem,var(--motoride-safe-right,env(safe-area-inset-right,0px)))] pb-4 pt-0"
            style={{ top: headerTopOffset }}
          >
         <div className="pointer-events-auto flex flex-col gap-2 min-w-0 max-w-[calc(100vw-6.5rem)] sm:max-w-sm">
        {(
           <motion.div 
             layout
             className="flex items-center gap-2 sm:gap-3 bg-zinc-950/80 backdrop-blur-md p-2 rounded-2xl sm:rounded-full border border-zinc-800 shadow-xl overflow-hidden min-w-0"
             animate={{ paddingRight: isMoving ? '8px' : '16px' }}
           >
            <button
              type="button"
              onClick={() => setShowExitConfirm(true)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors text-white shrink-0"
            >
               <ArrowLeft size={18}/>
             </button>
             
             <div className="text-white overflow-hidden pr-2 min-w-0">
               <h2 className="font-bold text-sm leading-tight truncate">{group?.name || 'Cargando...'}</h2>
               <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0 flex-wrap">
                 <span>Código: <strong className="text-orange-500">{groupId}</strong></span>
                 <div className="flex items-center gap-1 bg-zinc-800/50 px-1.5 py-0.5 rounded-md">
                   <Users size={12} className="text-zinc-400" />
                   <span className="font-bold text-white">{participantCount}</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <button onClick={copyCode} className="hover:text-white transition-colors p-1" title="Copiar código">
                     {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                   </button>
                   <button onClick={shareRoute} className="hover:text-white transition-colors p-1" title="Compartir enlace">
                     {shared ? <Check size={12} className="text-green-500" /> : <Share2 size={12} />}
                   </button>
                   <button
                     type="button"
                     disabled={inviteBusy || (groupId === 'REPEATED' && !preloadedRoute?.trim())}
                     onClick={() => void openInviteFriendsModal()}
                     className="hover:text-orange-400 text-zinc-400 transition-colors p-1 disabled:opacity-40 disabled:pointer-events-none"
                     title={
                       groupId === 'REPEATED' && !preloadedRoute?.trim()
                         ? 'Sin ruta para compartir'
                         : 'Invitar amigos desde la app'
                     }
                   >
                     {inviteBusy ? <Loader2 size={12} className="animate-spin text-orange-400" /> : <UserPlus size={12} />}
                   </button>
                 </div>
               </div>
             </div>
           </motion.div>
           )}

           {/* Navigation Instruction */}
           {effectiveRouteForNav && (
             <div className={`bg-zinc-950/95 backdrop-blur-md border-l-8 border-blue-500 rounded-2xl shadow-2xl flex flex-col gap-2 pointer-events-auto mt-2 max-w-sm ring-1 ring-white/10 transition-all duration-300 ${isCompactUI ? 'p-3' : 'p-4'}`}>
               <div className={`flex items-center ${isCompactUI ? 'gap-3' : 'gap-5'}`}>
                 <div className={`${isCompactUI ? 'w-12 h-12' : 'w-16 h-16'} bg-blue-600 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg rotate-3`}>
                   <div className="-rotate-3">
                    {getDirectionIcon(navState.maneuverType, navState.maneuverModifier)}
                   </div>
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className={`${isCompactUI ? 'text-base' : 'text-xl'} text-white font-black leading-tight tracking-tight`}>{navState.instruction}</p>
                   {navState.instructionDetail ? (
                     <p className={`${isCompactUI ? 'text-xs' : 'text-sm'} text-blue-100/90 font-semibold leading-snug mt-1`}>
                       {navState.instructionDetail}
                     </p>
                   ) : null}
                   {navState.distanceToNext !== null && (
                     <div className="mt-1.5">
                       <div className="flex items-baseline gap-1.5">
                         <span className={`${isCompactUI ? 'text-xl' : 'text-2xl'} text-blue-400 font-black tabular-nums`}>
                           {formatNavDistanceMeters(navState.distanceToNext)}
                         </span>
                       </div>
                       {!isCompactUI && (
                         <p className="text-[10px] text-zinc-500 font-medium mt-0.5 leading-tight">
                           Aprox. en línea recta hasta el siguiente giro
                         </p>
                       )}
                     </div>
                   )}
                 </div>
               </div>
               <button
                 type="button"
                 onClick={() => void cancelNavigation()}
                 className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold"
               >
                 <Ban size={14} className="text-orange-400 shrink-0" />
                 {isHost ? 'Cancelar navegación (quita la ruta para todos)' : 'Ocultar guía solo en mi pantalla'}
               </button>
             </div>
           )}
         </div>
         
        <div className="pointer-events-auto flex flex-col-reverse gap-2 items-end max-w-[min(100vw-2rem,18rem)]">
           {micError && (
             <div className="bg-red-950/95 border border-red-500/40 text-red-100 text-[11px] font-medium px-3 py-2 rounded-xl shadow-xl leading-snug">
               {micError}
               <button type="button" className="block mt-2 text-orange-400 font-bold underline" onClick={() => clearMicError()}>
                 Cerrar aviso
               </button>
             </div>
           )}
           <button 
             type="button"
             onClick={() => {
               clearMicError();
               if (!voiceAllowed) {
                 showMessage({
                   variant: 'info',
                   title: 'Chat de voz',
                   message:
                     'El chat de voz es Premium. Si el anfitrión de esta ruta tiene Premium, todo el grupo puede usarlo. Si no, puedes obtenerlo apoyando el proyecto (Ko-fi; activación manual). Menú principal → Apoyar proyecto.',
                 });
                 return;
               }
               void toggleVoice();
             }}
             className={`p-3 rounded-full shadow-xl transition-colors relative shrink-0 ${
               isVoiceActive
                 ? 'bg-green-500 text-white'
                 : micError
                   ? 'bg-red-900/80 text-red-200 ring-2 ring-red-500/50'
                   : !voiceAllowed
                     ? 'bg-zinc-800 text-amber-400 ring-2 ring-amber-500/35'
                     : 'bg-zinc-800 text-zinc-400'
             }`}
             title={
               !voiceAllowed
                 ? 'Voz Premium (o anfitrión con Premium)'
                 : isVoiceActive
                   ? 'Desconectar voz'
                   : 'Conectar voz (micrófono)'
             }
           >
             {isVoiceActive ? <Mic size={20} /> : !voiceAllowed ? <Crown size={20} /> : <MicOff size={20} />}
             {isVoiceActive && peersCount > 0 && (
               <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                 {peersCount}
               </span>
             )}
           </button>

           <button 
             onClick={() => setIsFollowing(!isFollowing)}
             className={`p-3 rounded-full shadow-xl transition-colors ${isFollowing ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}
             title={isFollowing ? "Dejar de seguir" : "Centrar mapa"}
           >
             <Navigation size={20} />
           </button>

          <div className="relative" ref={alertsMenuContainerRef}>
            <button
              onClick={() => {
                setShowSettings(false);
                setShowAlertMenu(!showAlertMenu);
              }}
              className={`p-3 rounded-full shadow-xl transition-colors ${showAlertMenu ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}
              title="Avisos rápidos"
            >
              <Bell size={20} />
            </button>

            {showAlertMenu && (
              <div className="absolute top-0 right-14 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-2 shadow-2xl flex flex-col gap-1 min-w-[220px] max-w-[min(90vw,300px)] z-[2001] animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="px-4 py-2 border-b border-zinc-800 mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Alertas</p>
                </div>
                <div className="grid grid-cols-3 gap-1 px-1">
                  <button onClick={() => sendAlert('Parado')} className="flex flex-col items-center gap-1 text-white hover:bg-zinc-800 p-2 rounded-xl text-[10px] font-bold transition-colors" title="Parado">
                    <AlertCircle size={16} className="text-yellow-500" />
                    <span>Parado</span>
                  </button>
                  <button onClick={() => sendAlert('Averiado')} className="flex flex-col items-center gap-1 text-white hover:bg-zinc-800 p-2 rounded-xl text-[10px] font-bold transition-colors" title="Averiado">
                    <Wrench size={16} className="text-red-500" />
                    <span>Avería</span>
                  </button>
                  <button onClick={() => sendAlert('Repostando')} className="flex flex-col items-center gap-1 text-white hover:bg-zinc-800 p-2 rounded-xl text-[10px] font-bold transition-colors" title="Repostando">
                    <Fuel size={16} className="text-blue-500" />
                    <span>Repostar</span>
                  </button>
                </div>
              </div>
            )}
          </div>

           <div className="relative" ref={settingsMenuContainerRef}>
             <button 
              onClick={() => {
                setShowAlertMenu(false);
                setShowSettings(!showSettings);
              }}
               className={`p-3 rounded-full shadow-xl transition-colors ${showSettings ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}
               title="Menú"
             >
                <Menu size={20} />
              </button>
              
              {showSettings && (
                <div className="absolute top-0 right-14 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-2 shadow-2xl flex flex-col gap-1 min-w-[220px] max-w-[min(90vw,300px)] z-[2001] animate-in fade-in slide-in-from-right-4 duration-200 max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
                  <div className="px-4 py-2 border-b border-zinc-800 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Opciones de Mapa</p>
                  </div>

                  {isHost && (
                   <button 
                     onClick={() => { setShowSearchModal(true); setShowSettings(false); }}
                     className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                   >
                     <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-500">
                       <Search size={18} />
                     </div>
                     Modificar Ruta
                   </button>
                 )}

                <button
                  type="button"
                  onClick={() => {
                    if (!weatherLayerAllowed) {
                      showMessage({
                        variant: 'info',
                        title: 'Capa de lluvia',
                        message: 'Esta función está reservada a usuarios Premium.',
                      });
                      return;
                    }
                    setShowWeather(!showWeather);
                    setShowSettings(false);
                  }}
                  className={`flex items-center gap-3 text-white p-3 rounded-2xl text-sm font-bold transition-colors ${
                    weatherLayerAllowed ? 'hover:bg-zinc-800' : 'opacity-55 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      showWeatherEffective ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    <Layers size={18} />
                  </div>
                  <span className="text-left">
                    Capa lluvia {showWeatherEffective ? 'ON' : 'OFF'}
                    {!weatherLayerAllowed && (
                      <span className="block text-[10px] font-semibold text-amber-400/90">Solo Premium</span>
                    )}
                  </span>
                </button>
                {showWeatherEffective && weatherFetchFailed && (
                  <p className="text-[11px] text-amber-400/90 px-3 -mt-2 mb-1 leading-snug">
                    No se pudo cargar el radar ahora. Revisa la conexión; se reintentará al abrir ajustes o cada 10 min.
                  </p>
                )}
                {showWeatherEffective && !weatherFetchFailed && rainRadar && !weatherTilesLoaded && (
                  <p className="text-[11px] text-zinc-500 px-3 -mt-2 mb-1 leading-snug">
                    Cargando radar de lluvia...
                  </p>
                )}
                {showWeatherEffective && !weatherFetchFailed && rainRadar && weatherTilesLoaded && weatherTileErrors === 0 && (
                  <p className="text-[11px] text-emerald-400/90 px-3 -mt-2 mb-1 leading-snug">
                    Radar activo. Si no ves colores, puede que no haya precipitación en la zona.
                  </p>
                )}
                {showWeatherEffective && !weatherFetchFailed && rainRadar && weatherTileErrors > 2 && (
                  <p className="text-[11px] text-red-400/90 px-3 -mt-2 mb-1 leading-snug">
                    Problema cargando teselas del radar ({weatherTileErrors}). Prueba a desactivar/activar la capa.
                  </p>
                )}

                <button 
                  onClick={() => {
                    setShowSettings(false);
                    void handleSmartCalibration();
                  }}
                   className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                 >
                   <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center text-green-500">
                     <Target size={18} />
                   </div>
                   Calibrar Inclinación
                 </button>

                 <button 
                   onClick={() => { toggleFullscreen(); setShowSettings(false); }}
                   className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                 >
                   <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
                     {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                   </div>
                   {isFullscreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}
                 </button>

                <button 
                  onClick={() => {
                    void toggleRotationLock();
                  }}
                   className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                 >
                   <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${rotationLocked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                     {rotationLocked ? <Lock size={18} /> : <Smartphone size={18} />}
                   </div>
                   {rotationLocked ? 'Desbloquear giro' : 'Bloquear giro'}
                 </button>
                {isIphoneDevice && (
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      toggleForcedLandscapeUi();
                    }}
                    className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        forceLandscapeUi ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      <RotateCw size={18} />
                    </div>
                    {forceLandscapeUi ? 'Desactivar paisaje forzado' : 'Bloquear giro (forzado iPhone)'}
                  </button>
                )}

                <button 
                  onClick={() => {
                    setShowSettings(false);
                    enterPocketMode();
                  }}
                   className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                 >
                   <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
                     <Lock size={18} />
                   </div>
                   Modo Bolsillo
                 </button>

                <button 
                  onClick={() => {
                    setShowSettings(false);
                    enterMirrorLinkMode();
                  }}
                  className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                    <Monitor size={18} />
                  </div>
                  MirrorLink
                </button>

                 <button 
                  onClick={() => { setShowRanking(!showRanking); setShowSettings(false); }}
                   className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                 >
                   <div className="w-8 h-8 rounded-xl bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                     <Users size={18} />
                   </div>
                   Usuarios
                 </button>

               </div>
             )}
           </div>
         </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gpsError && (
        <div
          className="absolute z-[1000] bg-red-500 text-white p-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2"
          style={{
            top: gpsErrorTop,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
            right: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
        >
          <AlertTriangle size={18} className="shrink-0" />
          <span>Sin señal GPS, reconectando...</span>
        </div>
      )}

      {needsOrientationUserGesture && leanPermissionGranted !== true && (
        <div
          className="absolute z-[1001] bg-indigo-600 text-white p-3 rounded-xl shadow-xl text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          style={{
            top: leanIosBannerTop,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
            right: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
          role="status"
        >
          <span className="font-medium leading-snug">
            En iPhone MotoRide necesita <strong>permiso de movimiento</strong> para mostrar la inclinación. Toca el botón de abajo. Si ya lo rechazaste antes, entra en los ajustes del mapa y usa <strong>Calibrar inclinación</strong>.
          </span>
          <button
            type="button"
            className="shrink-0 bg-white text-indigo-700 font-bold px-4 py-2 rounded-xl"
            onClick={() => void requestPermission()}
          >
            Permitir inclinómetro
          </button>
        </div>
      )}

      {isOnline && weakMapTilesNotice && (
        <div
          className="absolute z-[1000] bg-amber-600/95 text-black p-3 rounded-xl shadow-xl text-xs sm:text-sm font-semibold flex items-start gap-3 border border-amber-400/40"
          style={{
            top: weakTilesBannerTop,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
            right: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
          role="status"
        >
          <WifiOff size={18} className="shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 leading-snug">
            <p className="font-black text-[11px] sm:text-xs uppercase tracking-wide text-black/80 mb-1">Conexión débil al mapa</p>
            <p className="text-black/90">
              Muchas teselas del mapa no llegan a tiempo. Comprueba la cobertura o el Wi‑Fi; el mapa puede tardar en verse completo.
            </p>
            <button
              type="button"
              className="mt-2 text-black font-black underline underline-offset-2 text-left"
              onClick={() => {
                weakMapNoticeDismissedRef.current = true;
                setWeakMapTilesNotice(false);
              }}
            >
              Entendido, ocultar
            </button>
          </div>
        </div>
      )}

      {isOnline && precipitationBanner && (
        <div
          className="absolute z-[1000] bg-sky-900/95 text-sky-50 p-3 rounded-xl shadow-xl text-xs sm:text-sm font-semibold flex items-start gap-3 border border-sky-500/40"
          style={{
            top: precipBannerTop,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
            right: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
          role="status"
        >
          <CloudRain size={20} className="shrink-0 mt-0.5 text-sky-300" aria-hidden />
          <div className="min-w-0 flex-1 leading-snug">
            <p className="font-black text-[11px] sm:text-xs uppercase tracking-wide text-sky-200/95 mb-1">
              Posible precipitación
            </p>
            <p className="text-sky-50/95">
              Los datos meteorológicos indican lluvia o chaparrones en tu ruta o cerca de ti (aprox. 10 km). Conduce con
              precaución; el aviso se oculta solo en unos segundos.
            </p>
            <button
              type="button"
              className="mt-2 text-sky-200 font-black underline underline-offset-2 text-left"
              onClick={() => setPrecipitationBanner(false)}
            >
              Cerrar aviso
            </button>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-route-title"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="exit-route-title" className="text-lg font-black text-white mb-2">
              ¿Salir de la ruta?
            </h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Dejarás de compartir posición con el grupo en esta sesión. Puedes volver a unirte con el código.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl font-bold text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Seguir en ruta
              </button>
              <button
                type="button"
                disabled={exitLeaving}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void confirmLeaveRoute();
                }}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl font-bold text-white bg-orange-600 hover:bg-orange-500 transition-colors disabled:opacity-60 disabled:pointer-events-none"
              >
                {exitLeaving ? 'Saliendo…' : 'Salir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeanBetaNotice && (
        <div
          className="fixed inset-0 z-[6100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lean-beta-title"
          onClick={() => {
            try {
              localStorage.setItem('motoride_lean_beta_dismissed_v1', '1');
            } catch {
              /* ignore */
            }
            setShowLeanBetaNotice(false);
          }}
        >
          <div
            className="bg-zinc-900 border border-orange-500/40 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Activity className="text-orange-400 shrink-0" size={22} aria-hidden />
              <h2 id="lean-beta-title" className="text-lg font-black text-white leading-tight">
                Inclinómetro en fase de pruebas
              </h2>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed mb-4">
              La estimación de inclinación (sensor en manillar y modelo por GPS en bolsillo / MirrorLink) está en mejora
              continua. Si notas valores extraños, retrasos o diferencias según cómo lleves el móvil,{' '}
              <strong className="text-white">agradecemos cualquier informe</strong> para corregir fallos o proponer mejoras.
            </p>
            <a
              href={getSupportMailtoHref()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm mb-3 transition-colors"
            >
              <Mail size={18} aria-hidden /> Enviar informe o sugerencia
            </a>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem('motoride_lean_beta_dismissed_v1', '1');
                } catch {
                  /* ignore */
                }
                setShowLeanBetaNotice(false);
              }}
              className="w-full py-3 rounded-2xl font-black text-white bg-orange-500 hover:bg-orange-400 transition-colors"
            >
              Entendido, continuar al mapa
            </button>
          </div>
        </div>
      )}

      {/* Modo bolsillo / MirrorLink: cuenta atrás y bloqueo táctil */}
      <AnimatePresence>
        {touchLockKind && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 z-[5000] select-none ${
              touchLockKind === 'mirrorlink' && isPocketLocked
                ? 'touch-none bg-transparent pointer-events-auto'
                : 'touch-none flex flex-col items-center justify-center pointer-events-auto bg-black'
            }`}
            onPointerDown={touchLockKind === 'mirrorlink' && isPocketLocked ? handlePocketTouchStart : undefined}
            onPointerUp={touchLockKind === 'mirrorlink' && isPocketLocked ? handlePocketTouchEnd : undefined}
          >
            {!isPocketLocked ? (
              <div className="text-center space-y-8 p-8">
                <div
                  key={pocketRingSession}
                  className="relative w-[148px] h-[148px] mx-auto flex items-center justify-center"
                >
                  <svg
                    className="absolute inset-0 w-full h-full overflow-visible -rotate-90 pointer-events-none"
                    viewBox="0 0 120 120"
                    aria-hidden
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="7"
                      className="text-zinc-800"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="text-orange-500 pocket-countdown-ring"
                    />
                  </svg>
                  <span className="relative z-10 text-5xl font-black text-white tabular-nums">{pocketCountdown}</span>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
                    {touchLockKind === 'mirrorlink' ? 'MirrorLink' : 'Modo Bolsillo'}
                  </h2>
                  <p className="text-zinc-400 text-sm max-w-[260px] mx-auto leading-snug">
                    {touchLockKind === 'mirrorlink'
                      ? 'Para ver mapa y datos en la pantalla de la moto: guarda el teléfono en el bolsillo. Vista horizontal, 30 s y luego mapa con toques bloqueados. La inclinación se calcula por GPS (el móvil va guardado). Mismo desbloqueo que modo bolsillo.'
                      : 'Guarda el móvil en tu bolsillo. Se bloqueará automáticamente.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    releaseOrientationLockUi();
                    setTouchLockKind(null);
                  }}
                  className="px-6 py-3 bg-zinc-800 text-white rounded-2xl font-bold text-sm"
                >
                  Cancelar
                </button>
              </div>
            ) : touchLockKind === 'mirrorlink' ? (
              <div
                className="pointer-events-none absolute z-[5001] flex flex-col items-start gap-1"
                style={{
                  top: 'calc(0.45rem + env(safe-area-inset-top, 0px))',
                  left: 'calc(0.45rem + env(safe-area-inset-left, 0px))',
                }}
              >
                <motion.div
                  animate={{
                    scale: isLongPressing ? 1.08 : 1,
                    opacity: isLongPressing ? 0.85 : 0.42,
                  }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-start gap-2"
                >
                  {isLongPressing ? (
                    <div className="relative">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 1.5, ease: 'linear' }}
                        className="absolute -inset-2 bg-orange-500/25 rounded-full"
                      />
                      <LockOpen size={34} className="relative text-orange-400/95" strokeWidth={2.25} />
                    </div>
                  ) : (
                    <Lock size={34} className="text-white/45" strokeWidth={2.25} />
                  )}
                  {!isLongPressing && (
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                            pocketTaps >= i ? 'bg-orange-500/75' : 'bg-white/22'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
                <p className="text-[9px] font-bold text-white/32 uppercase tracking-wider max-w-[130px] leading-tight">
                  3 toques + mantener
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-12">
                <motion.div
                  animate={{
                    scale: isLongPressing ? 1.2 : 1,
                    opacity: isLongPressing ? 1 : 0.5,
                  }}
                  className="text-white p-2 rounded-full touch-none"
                  onPointerDown={handlePocketTouchStart}
                  onPointerUp={handlePocketTouchEnd}
                >
                  {isLongPressing ? (
                    <div className="relative w-24 h-24">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 1.5, ease: 'linear' }}
                        className="absolute inset-0 bg-orange-500 rounded-full opacity-20"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <LockOpen size={64} className="text-orange-500" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <Lock size={64} className="text-zinc-700" />
                      <div className="flex gap-2">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                              pocketTaps >= i ? 'bg-orange-500' : 'bg-zinc-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>

                <p className="text-zinc-800 text-[10px] font-black uppercase tracking-[0.3em] absolute bottom-12">
                  3 toques + 1 largo para desbloquear
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ranking Panel */}
      <AnimatePresence>
        {showRanking && (
          <motion.div 
            ref={rankingPanelRef}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`absolute z-[1001] bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 shadow-2xl w-64 pointer-events-auto transition-all duration-500 ${
              isLandscapeUi
                ? 'bottom-40 flex flex-col max-h-[46vh]' 
                : ''
            }`}
            style={{
              top: isLandscapeUi ? undefined : rankingTop,
              left: 'max(1rem, env(safe-area-inset-left, 0px))',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Users size={18} className="text-yellow-500" />
                Usuarios
              </h3>
              <button 
                onClick={() => setShowRanking(false)}
                className="text-zinc-500 hover:text-white transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-2 max-h-[40vh] landscape:max-h-none landscape:flex-1 overflow-y-auto pr-1 custom-scrollbar">
              {rankingLocations
                .map((loc, index) => (
                  <div key={loc.uid} className={`flex items-center gap-3 p-2 rounded-xl border ${loc.uid === user?.uid ? 'bg-orange-500/10 border-orange-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                    <div className="w-6 text-xs font-black text-zinc-500">#{index + 1}</div>
                    <div className="relative shrink-0">
                      <div
                        className={`rounded-full p-[2px] ${getLevelRingWrapperClass(loc.level || 1, loc.isPremium === true)}`}
                      >
                        <img
                          src={loc.photoURL || 'https://via.placeholder.com/32'}
                          alt=""
                          className="w-8 h-8 rounded-full block bg-zinc-800"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-zinc-900">
                        {loc.level || 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{loc.displayName}</span>
                        {loc.isPremium ? <PremiumBadge compact /> : null}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        {loc.waitingGps ? 'Esperando señal GPS…' : `${loc.score || 0} pts`}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Overlay */}
      <div className={`absolute left-0 right-0 z-[1000] pointer-events-none flex justify-center px-2 sm:px-4 landscape:justify-start landscape:left-4 landscape:right-auto ${isLandscapeUi ? 'landscape:bottom-3' : 'bottom-5'}`}>
        <div className="bg-zinc-950/90 backdrop-blur-3xl rounded-[2rem] sm:rounded-[2.5rem] p-1.5 border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] flex items-center gap-0.5 sm:gap-1 pointer-events-auto max-w-full overflow-hidden landscape:scale-90 landscape:origin-bottom-left">
          
          {/* Speed + tiempo en ubicación */}
          <div className="flex flex-col items-center justify-center min-w-[80px] sm:min-w-[120px] py-2 sm:py-3 px-3 sm:px-6 bg-white/5 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 shrink-0 landscape:min-w-[80px] landscape:px-3">
            <div
              className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1 min-h-[22px] sm:min-h-[26px]"
              title={
                showHudWeather
                  ? 'Temperatura ahora e icono según la previsión del día (Open-Meteo)'
                  : 'Tiempo en pantalla reservado a Premium'
              }
            >
              {showHudWeather ? (
                mapWeather.loading && mapWeather.tempC == null ? (
                  <span className="inline-block h-3.5 w-3.5 sm:h-4 sm:w-4 border-2 border-sky-400/30 border-t-sky-300 rounded-full animate-spin" aria-hidden />
                ) : (
                  <>
                    <DayWeatherIcon
                      className="shrink-0 text-sky-200"
                      size={isLandscapeUi ? 15 : 19}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="text-[11px] sm:text-sm font-black tabular-nums text-zinc-100 leading-none">
                      {mapWeather.tempC != null ? `${Math.round(mapWeather.tempC)}°` : '—'}
                    </span>
                  </>
                )
              ) : (
                <span className="text-[10px] sm:text-[11px] font-black text-zinc-500 leading-none flex items-center gap-1">
                  <Crown size={14} className="text-amber-500/80 shrink-0" aria-hidden />
                  Premium
                </span>
              )}
            </div>
            <span className="text-3xl sm:text-5xl font-black leading-none tracking-tighter text-white tabular-nums">{currentSpeedKmh}</span>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-blue-400 mt-0.5 sm:mt-1">km/h</span>
          </div>

          {/* Lean Angle & Stats Section */}
          <div className="flex items-center gap-3 sm:gap-6 px-3 sm:px-6 py-1 sm:py-2 min-w-0">
            {/* Lean Angle Display */}
            <div className="flex flex-col items-center shrink-0">
              <div className="flex justify-between w-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-1 mb-0.5 sm:mb-1">
                <div className="flex flex-col items-center">
                  <span className="text-blue-400">Izq. {maxLeanLeft}°</span>
                  <span className="text-zinc-500">{leftTurnsRef.current}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-red-500">Der. {maxLeanRight}°</span>
                  <span className="text-zinc-500">{rightTurnsRef.current}</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center justify-center">
                <div className="h-10 sm:h-14 flex items-end justify-center overflow-visible">
                  <div className="scale-[0.55] sm:scale-[0.65] origin-bottom">
                    <MotorcycleIcon angle={leanAngle} />
                  </div>
                </div>
                <div className="mt-1 flex flex-col items-center">
                  <span className="text-lg sm:text-2xl font-black leading-none text-white tabular-nums">
                    {Math.round(Math.abs(leanAngle))}°
                  </span>
                </div>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="w-px h-10 sm:h-12 bg-white/10 shrink-0" />

            {/* Score & Stop Recording */}
            <div className="flex flex-col gap-1 sm:gap-1.5 min-w-[80px] sm:min-w-[100px]">
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-yellow-500/10 rounded-lg sm:rounded-xl border border-yellow-500/20">
                <Trophy size={12} className="text-yellow-500 sm:w-[14px] sm:h-[14px]" />
                <span className="text-xs sm:text-sm font-black text-white tabular-nums">{score}</span>
              </div>
              
              {isHost && isRecording && localDistance >= 0.05 && (
                <button 
                  onClick={toggleRecording}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-600 hover:bg-red-700 rounded-lg sm:rounded-xl shadow-lg shadow-red-600/20 transition-all active:scale-95 border border-white/20"
                  title="Finalizar Ruta"
                >
                  <Square fill="currentColor" size={12} className="text-white sm:w-[14px] sm:h-[14px]" />
                  <span className="text-[9px] sm:text-xs font-black text-white uppercase tracking-tight">Finalizar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Modificar Ruta</h2>
              <button onClick={() => setShowSearchModal(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2 ml-1">Buscar destino</label>
                  <p className="text-[10px] text-zinc-500 mb-2 leading-relaxed">
                    Escribe ciudad y región (ej. Huesca, Aragón) y elige la sugerencia que coincida con el municipio. Así evitamos que el buscador te lleve a un punto suelto lejos del centro.
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                      <input 
                        placeholder="¿A dónde quieres ir?" 
                        value={searchDestination}
                        onChange={(e) => {
                          const next = e.target.value;
                          setSearchDestination(next);
                          const selected = selectedSearchSuggestionRef.current;
                          if (selected && selected.displayName !== next.trim()) {
                            selectedSearchSuggestionRef.current = null;
                          }
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && generateRouteFromSearch()}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-orange-500 transition-all"
                      />
                    </div>
                    <button 
                      onClick={generateRouteFromSearch}
                      disabled={isSearching || !searchDestination}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white p-3 rounded-xl transition-all"
                    >
                      {isSearching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search size={20} />}
                    </button>
                  </div>
                  {searchSuggestions.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/80">
                      {searchSuggestions.map((item, idx) => (
                        <button
                          key={`${item.place_id || idx}`}
                          onClick={() => {
                            const displayName = String(item.display_name || '').trim();
                            const lat = Number.parseFloat(String(item.lat ?? ''));
                            const lon = Number.parseFloat(String(item.lon ?? ''));
                            setSearchDestination(displayName);
                            setSearchSuggestions([]);
                            if (displayName && Number.isFinite(lat) && Number.isFinite(lon)) {
                              selectedSearchSuggestionRef.current = { displayName, lat, lon };
                            } else {
                              selectedSearchSuggestionRef.current = null;
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                          {item.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-zinc-900 px-2 text-zinc-500">O sube un archivo</span>
                  </div>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-800 rounded-2xl cursor-pointer hover:bg-zinc-800/30 transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-zinc-500" />
                    <p className="text-sm text-zinc-400 font-medium">Cargar archivo .gpx</p>
                  </div>
                  <input type="file" className="hidden" accept=".gpx" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full flex-1 relative overflow-hidden bg-[#dfe0e6]">
        <div
          className="w-full h-full transition-transform duration-500 ease-out isolate"
          style={{
            transform: isRecording && currentSpeedKmh > 3 && localDistance >= 0.05 ? `rotate(${-navigationHeading}deg)` : 'none',
            transformOrigin: 'center center',
            willChange: isRecording && currentSpeedKmh > 5 ? 'transform' : 'auto',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
          }}
        >
          <MapContainer
            center={[40.4168, -3.7038]}
            zoom={6}
            className="w-full h-full z-0"
            zoomControl={false}
            attributionControl={false}
            fadeAnimation={false}
            zoomAnimation
          >
        <MapInvalidateHelper
          layoutKey={`${isRecording && currentSpeedKmh > 3 && localDistance >= 0.05 ? 1 : 0}`}
        />
        <MapTilePrefetchBridge
          mapZoomRef={mapZoomRef}
          mapCenterRef={mapViewportCenterRef}
          onSchedulePrefetch={bumpTilePrefetch}
        />
        <TileLayer
          url="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
          keepBuffer={260}
          updateWhenIdle={false}
          updateWhenZooming={false}
          maxZoom={20}
          maxNativeZoom={19}
          detectRetina={false}
          crossOrigin
          preferCanvas
          className="motoride-base-tiles"
          errorTileUrl={LEAFLET_LIGHT_ERROR_TILE}
          eventHandlers={{
            tileerror: recordBaseMapTileError,
          }}
        />
        
        {showTraffic && false && (
          <TileLayer 
            url="https://mt1.google.com/vt?lyrs=h,traffic&x={x}&y={y}&z={z}" 
            opacity={0.6}
            zIndex={10}
          />
        )}
        {showWeatherEffective && rainRadar && (
          <Pane name="rainRadarPane" style={{ zIndex: 350 }}>
            <TileLayer
              key={rainRadar.url}
              url={rainRadar.url}
              opacity={0.62}
              maxNativeZoom={rainRadar.maxNativeZoom}
              maxZoom={20}
              className="leaflet-radar-overlay"
              keepBuffer={96}
              noWrap={false}
              errorTileUrl={LEAFLET_TRANSPARENT_ERROR_TILE}
              eventHandlers={{
                tileload: () => setWeatherTilesLoaded(true),
                tileerror: () => setWeatherTileErrors((e) => e + 1),
              }}
              updateWhenIdle={false}
              updateWhenZooming={false}
            />
          </Pane>
        )}
        
        {/* Draw GPX Route */}
        {effectiveRouteForNav && (
          <GeoJSON 
            key={group?.routeGeoJSON?.length || 'route'} // Force re-render when route changes
            data={effectiveRouteForNav} 
            style={{ color: '#3b82f6', weight: 5, opacity: 0.8 }} 
          />
        )}

        {/* Draw OSRM Navigation Route to GPX */}
        {navState.routeGeometry && (
          <GeoJSON 
            key={`${navState.instruction}-${navState.distanceToNext ?? 0}`}
            data={navState.routeGeometry} 
            style={{ color: '#3b82f6', weight: 5, opacity: 0.8, dashArray: '10, 10' }} 
          />
        )}

        {/* Radar Markers */}
        {radars && radars.map((radar, index) => (
          <Marker 
            key={`radar-${index}`} 
            position={[radar.lat, radar.lng]} 
            icon={L.divIcon({
              html: `<div style="width: 38px; height: 38px; border-radius: 9999px; background: #ffffff; border: 3px solid #dc2626; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);">
                <img src="/RADAR.png" alt="Radar" style="width: 22px; height: 22px; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=&quot;color:#dc2626;font-size:16px;font-weight:900;&quot;>R</span>';" />
              </div>`,
              className: 'custom-radar-icon',
              iconSize: [38, 38],
              iconAnchor: [19, 19]
            })}
          >
            <Popup className="custom-popup">
              <div className="font-semibold text-center">Radar</div>
            </Popup>
          </Marker>
        ))}

        {/* Other Users' Markers */}
        {markerLocations.map((loc) => (
          <Marker
            key={loc.uid}
            position={[loc.lat, loc.lng]}
            icon={createAvatarIcon(loc.photoURL, loc.level, loc.isPremium === true)}
            zIndexOffset={100}
          >
            <Popup className="custom-popup">
              <div className="font-semibold text-center">{loc.displayName}</div>
              <div className="text-xs text-gray-500 text-center">
                Nivel {loc.level || 1} • {loc.score || 0} pts
                {loc.isPremium ? <div className="mt-1 text-amber-500 font-bold">Premium</div> : null}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Current User Marker (Navigation Arrow) */}
        {displayLocation && typeof displayLocation.lat === 'number' && typeof displayLocation.lng === 'number' && (
          <CurrentUserMarker
            position={[displayLocation.lat, displayLocation.lng]}
            heading={currentSpeedKmh > 2 ? navigationHeading : 0}
            displayNameToUse={displayNameToUse}
            userLevel={userLevel}
            score={score}
            isPremium={user?.isPremium === true}
          />
        )}

        <MapController
          location={displayLocation}
          bearingForMapOffset={navigationHeading}
          headingRotationActive={
            isRecording && currentSpeedKmh > 3 && localDistance >= 0.05
          }
          isFollowing={isFollowing}
          showRanking={showRanking}
          isRecording={isRecording}
          speedKmh={currentSpeedKmh}
          hasActiveRoute={!!effectiveRouteForNav}
          isLandscapeUi={isLandscapeUi}
        />
          </MapContainer>
        </div>
      </div>
      {/* Ride Summary Modal */}
      <AnimatePresence>
        {showSummary && summaryData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[3000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="relative bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl p-6 text-center my-auto"
            >
              <button
                onClick={shareSummaryImage}
                disabled={isSharingSummary}
                className="absolute top-5 right-5 w-11 h-11 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white flex items-center justify-center transition-colors"
                title={isSharingSummary ? 'Generando imagen...' : 'Compartir resumen'}
              >
                <Share2 size={18} />
              </button>
              <div className="w-16 h-16 bg-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
                <Trophy size={32} className="text-white" />
              </div>
              
              <h2 className="text-2xl font-black text-white mb-1">¡Ruta Finalizada!</h2>
              <p className="text-zinc-400 font-medium mb-6 text-sm">Has completado tu recorrido con éxito.</p>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Distancia</p>
                  <p className="text-xl font-black text-white">{summaryData.distance} <span className="text-xs text-zinc-500">km</span></p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Tiempo</p>
                  <p className="text-xl font-black text-white">
                    {Math.floor(summaryData.duration / 60000)}<span className="text-xs text-zinc-500">m</span> {Math.floor((summaryData.duration % 60000) / 1000)}<span className="text-xs text-zinc-500">s</span>
                  </p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Vel. Media</p>
                  <p className="text-xl font-black text-white">
                    {summaryData.duration > 0 ? Math.round(summaryData.distance / (summaryData.duration / 3600000)) : 0} <span className="text-xs text-zinc-500">km/h</span>
                  </p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Curvas Izq./Der.</p>
                  <p className="text-lg font-black text-white">{summaryData.leftTurns} / {summaryData.rightTurns}</p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Puntos Base</p>
                  <p className="text-xl font-black text-white">+{summaryData.baseScore ?? summaryData.score}</p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Puntos + Bonus</p>
                  <p className="text-xl font-black text-orange-500">+{summaryData.score}</p>
                  {summaryData.distanceBonus > 0 && (
                    <p className="text-[10px] text-emerald-400 font-bold mt-1">Bonus distancia: +{summaryData.distanceBonus}</p>
                  )}
                </div>
                <div className="bg-zinc-950 p-3 rounded-3xl border border-zinc-800 col-span-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Inclinación Máx.</p>
                  <p className="text-2xl font-black text-white">Izq. {summaryData.maxLeanLeft}° / Der. {summaryData.maxLeanRight}°</p>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={async () => {
                    if (!summaryData || !user?.uid) return;
                    try {
                      if (
                        summaryData.rideSessionKey &&
                        ridePointsCommittedSessionKeyRef.current !== summaryData.rideSessionKey
                      ) {
                        const ok = await commitRidePointsToProfile({
                          distance: summaryData.distance,
                          score: summaryData.score,
                          leftTurns: summaryData.leftTurns,
                          rightTurns: summaryData.rightTurns,
                          maxLeanLeft: summaryData.maxLeanLeft,
                          maxLeanRight: summaryData.maxLeanRight,
                        });
                        if (!ok) {
                          showMessage({
                            variant: 'error',
                            title: 'Puntos',
                            message: 'No se pudieron sumar los puntos al perfil. Revisa la conexión e inténtalo de nuevo.',
                          });
                          return;
                        }
                        ridePointsCommittedSessionKeyRef.current = summaryData.rideSessionKey;
                      }
                      const draft = readRideDraft();
                      const pathForHistory = Array.isArray(draft?.path) && draft.path.length > 0 ? draft.path : recordedPath;
                      await addDoc(collection(db, 'rideHistory'), {
                        uid: user.uid,
                        groupId,
                        groupName: group?.name || 'Ruta',
                        startTime: Date.now() - summaryData.duration,
                        endTime: Date.now(),
                        distance: summaryData.distance,
                        maxLeanLeft: summaryData.maxLeanLeft,
                        maxLeanRight: summaryData.maxLeanRight,
                        leftTurns: summaryData.leftTurns,
                        rightTurns: summaryData.rightTurns,
                        score: summaryData.score,
                        baseScore: summaryData.baseScore ?? summaryData.score,
                        pointsEarned: summaryData.score,
                        path: pathForHistory,
                      });
                      clearRideDraft();
                      setShowSummary(false);
                      showMessage({ variant: 'success', title: 'Historial', message: 'Ruta guardada en tu historial.' });
                    } catch (e) {
                      console.error(e);
                      showMessage({ variant: 'error', title: 'Historial', message: 'Error al guardar en el historial.' });
                    }
                  }}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-orange-500/20"
                >
                  Guardar en Historial
                </button>
                <button 
                  onClick={async () => {
                    if (summaryData?.rideSessionKey && user?.uid) {
                      if (ridePointsCommittedSessionKeyRef.current !== summaryData.rideSessionKey) {
                        const ok = await commitRidePointsToProfile({
                          distance: summaryData.distance,
                          score: summaryData.score,
                          leftTurns: summaryData.leftTurns,
                          rightTurns: summaryData.rightTurns,
                          maxLeanLeft: summaryData.maxLeanLeft,
                          maxLeanRight: summaryData.maxLeanRight,
                        });
                        if (ok) {
                          ridePointsCommittedSessionKeyRef.current = summaryData.rideSessionKey;
                        } else {
                          showMessage({
                            variant: 'error',
                            title: 'Puntos',
                            message:
                              'Los puntos de esta ruta no se han podido sumar al perfil (conexión o servidor). Los intentaremos de nuevo si reaparece el resumen al volver a entrar.',
                          });
                        }
                      }
                    }
                    clearRideDraft();
                    setShowSummary(false);
                  }}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all"
                >
                  No guardar en historial (los puntos sí cuentan para el nivel)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <InviteFriendsModal
        open={showInviteFriends}
        onClose={() => {
          setShowInviteFriends(false);
          setInviteModalContext(null);
        }}
        groupId={inviteModalContext?.groupId ?? groupId}
        groupName={inviteModalContext?.groupName ?? group?.name ?? 'Ruta'}
        memberUids={
          Array.isArray(group?.members) && group.members.length > 0
            ? group.members.filter(Boolean)
            : user?.uid
              ? [user.uid]
              : []
        }
      />
    </div>
  );
}
