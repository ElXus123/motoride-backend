import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
  type MutableRefObject,
  type ChangeEvent,
  type FC,
  type ReactNode,
} from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, CircleMarker, useMap, useMapEvents, Pane } from 'react-leaflet';
import L from 'leaflet';
import {
  doc,
  onSnapshot,
  updateDoc,
  getDoc,
  setDoc,
  arrayRemove,
  deleteField,
} from 'firebase/firestore';
import { db, logOut, handleFirestoreError, OperationType } from '../firebase';
import { addPointsWithLevelUps } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { useOpenMeteoWeather } from '../hooks/useOpenMeteoWeather';
import { useLeanAngle, type LeanCalibrationProfile } from '../hooks/useLeanAngle';
import {
  clearActiveRouteSnapshot,
  readActiveRouteSnapshot,
  saveActiveRouteSnapshot,
} from '../lib/activeRouteSnapshot';
import { useNavigation } from '../hooks/useNavigation';
import { useNavigationHeading } from '../hooks/useNavigationHeading';
import { offsetByMeters } from '../lib/geoUtils';
import { anyPrecipitationRiskAtPoints, routePointsAhead } from '../lib/precipitationRisk';
import {
  DEFAULT_PREMIUM_GPS_POLICY,
  normalizePremiumGpsPolicy,
  type PremiumGpsPolicy,
} from '../lib/premiumGpsConfig';
import { useRoadData } from '../hooks/useRoadData';
import { parseGPX, parseRouteData } from '../lib/gpx';
import { getDistance } from '../lib/geoUtils';
import { requestJson } from '../lib/network';
import { curvePointsForPeak, getActivePointsConfig, RIDE_POINTS_RULES } from '../lib/pointsConfig';
import { PROGRESS_MODEL_VERSION } from '../lib/levelProgress';
import { fetchRainViewerTileUrl } from '../lib/rainviewer';
import {
  BASE_MAP_MAX_NATIVE_ZOOM,
  BASE_MAP_TILE_URL,
  LEAFLET_LIGHT_ERROR_TILE,
  LEAFLET_TRANSPARENT_ERROR_TILE,
} from '../lib/leafletTiles';
import { getLevelRingBoxStyle, getLevelRingWrapperClass } from '../lib/levelRing';
import { resolvePeerFrameId } from '../lib/frames';
import { AvatarFrame, frameOverlayHtml, getFrameOuterSize } from './AvatarFrame';
import { formatNominatimSuggestion, pickBestNominatimResult, sortRoutableNominatimResults } from '../lib/nominatimPick';
import { prefetchAroundUser, prefetchRouteTiles } from '../lib/mapTileCache';
import { weatherWmoToLucide } from '../lib/weatherWmo';
import socket from '../lib/socket';
import {
  speakMotorideGroupAlert,
  speakMotoridePrecipitationRisk,
  speakMotorideRadarNearby,
} from '../lib/motorideAlertSpeech';
import { useVoiceChat } from '../hooks/useVoiceChat';
import PremiumBadge from './PremiumBadge';
import InviteFriendsModal from './InviteFriendsModal';
import { Upload, ArrowLeft, Copy, Check, Navigation, AlertTriangle, Play, Square, MapPin, Trophy, Bell, AlertCircle, Wrench, Fuel, X, Maximize, Minimize, Search, Share2, Menu, Target, LogOut, Users, UserPlus, Mic, MicOff, ShieldAlert, Activity, Layers, Lock, LockOpen, Smartphone, RotateCw, Crown, WifiOff, Monitor, Loader2, Mail, Ban, CloudRain, Pause, Coffee, ArrowUp, CornerUpLeft, CornerUpRight } from 'lucide-react';
import { getDirectionIcon } from './NavManeuverIcons';
import RouteStopsPanel from './RouteStopsPanel';

/** Paradas en ruta (gasolineras, cafés, miradores): oculto de momento. Poner a true para reactivar. */
const ROUTE_STOPS_ENABLED = false;
import { getLineCoordinates } from '../lib/navigationPose';
import { loadSummaryLogo, renderRouteSummaryCard } from '../lib/routeSummaryCard';
import { buildRouteIndex, type RouteIndex } from '../lib/routeProgress';
import {
  fetchRouteStops,
  getCachedRouteStops,
  nextChosenStop,
  routeCacheKey,
  STOP_KIND_LABEL,
  type RouteStop,
} from '../lib/routeStops';
import {
  applyVoteOps,
  buildCandidates,
  buildVoteMoveOps,
  electorateOf,
  pickChosenStop,
  publishRouteStopCandidates,
  subscribeRouteStopVotes,
  toRouteStop,
  type RouteStopCandidate,
  type StopVoteDoc,
} from '../lib/stopVotes';
import { copyTextToClipboard, getSupportMailtoHref } from '../lib/clientInfo';
import { buildScheduledInviteSharePayload } from '../lib/scheduledRouteShare';
import { formatNavDistanceMeters, formatNavDurationS, formatNavEtaClock } from '../lib/navFormat';
import { generateGroupCode } from '../lib/groupCode';
import { motion, AnimatePresence } from 'motion/react';
import appIcon from '../../ICONO.png';
import { escapeHtml, safeProfileImageSrc } from '../lib/safeHtml';

/** Rutas con distancia ≤ esta cifra (km) no crean entrada en `rideHistory`; puntos y km al perfil sí. */
const MIN_KM_TO_SAVE_RIDE_HISTORY = 5;

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

/** Metros recorridos sin grabación (solo anfitrión) antes de iniciar la grabación sola. */
const AUTO_RECORD_IDLE_METERS = 20;

/** Importe en € desde texto del usuario (coma o punto). */
function parseEuroAmount(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const v = Number.parseFloat(t);
  if (!Number.isFinite(v) || v < 0 || v > 1e7) return null;
  return Math.round(v * 100) / 100;
}

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
const createAvatarIcon = (url: string, level: number = 1, isPremium: boolean = false, frameId: string = 'none') => {
  const rv = getLevelRingBoxStyle(level, isPremium);
  /** Marco por fuera del aro de nivel: el contenedor de 44 px no cambia; el SVG se centra sobre el avatar de 40 px. */
  const frameHtml = frameOverlayHtml(frameId, getFrameOuterSize(40, frameId), { x: 20, y: 20 });
  const lvlBg = isPremium ? '#d97706' : '#f97316';
  const crown = isPremium
    ? `<div style="position:absolute;top:-5px;left:-3px;width:17px;height:17px;background:linear-gradient(160deg,#fde68a,#f59e0b);border-radius:50%;border:2px solid #18181b;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;">👑</div>`
    : '';
  // La URL de la foto viene de Firestore (dato de usuario): solo https válida o data:image raster, y escapada.
  const imgSrc = escapeHtml(safeProfileImageSrc(url) ?? 'https://via.placeholder.com/40');
  return L.divIcon({
    className: 'custom-avatar-icon',
    html: `<div style="position: relative; width: 44px; height: 44px;">
             ${crown}
             <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; ${rv.border}; box-shadow: ${rv.boxShadow}, 0 4px 6px -1px rgb(0 0 0 / 0.12); background: white;">
               <img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: cover;" />
             </div>
             ${frameHtml}
             <div style="position: absolute; bottom: -2px; right: -2px; background: ${lvlBg}; color: white; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; border: 2px solid #18181b; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
               ${escapeHtml(level)}
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
  isPremium,
  subscribeSmooth,
}: {
  position: [number, number];
  heading: number;
  displayNameToUse: string;
  userLevel: number;
  score: number;
  isPremium?: boolean;
  /** Bucle de suavizado: mueve la flecha por frame con setLatLng (sin re-render de React). */
  subscribeSmooth?: (fn: (p: { lat: number; lng: number }) => void) => () => void;
}) => {
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!subscribeSmooth) return;
    return subscribeSmooth((p) => {
      const m = markerRef.current;
      if (m) m.setLatLng([p.lat, p.lng]);
    });
  }, [subscribeSmooth]);

  // La flecha propia no lleva marco de avatar: el marco solo se muestra en los marcadores de los demás.
  const icon = useMemo(() => {
    return L.divIcon({
      className: 'current-user-icon',
      html: `<div style="position: relative; width: 32px; height: 32px;">
               <div class="user-arrow-container" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: transform 0.3s ease-out;">
                 <svg viewBox="0 0 100 100" width="32" height="32" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">
                   <path d="M 50 10 L 90 90 L 50 75 L 10 90 Z" fill="#3b82f6" stroke="white" stroke-width="6" stroke-linejoin="round" />
                 </svg>
               </div>
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
  }, [heading, icon]);

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

const SELF_MAP_SMOOTH_ALPHA = 0.22;
const SELF_MAP_SNAP_M = 0.1;
const PEER_SMOOTH_ALPHA = 0.2;
const PEER_SNAP_M = 0.12;

/** Interpola posición en el mapa sin re-render por frame (evita saltos por GPS/socket). */
const SmoothedPeerMarker: FC<{
  targetLat: number;
  targetLng: number;
  icon: L.DivIcon;
  /** Compañero sin conexión: se mantiene su última posición, atenuada. */
  offline?: boolean;
  children?: ReactNode;
}> = ({ targetLat, targetLng, icon, offline = false, children }) => {
  const markerRef = useRef<L.Marker | null>(null);
  const smoothRef = useRef<{ lat: number; lng: number }>({ lat: targetLat, lng: targetLng });
  const targetRef = useRef({ lat: targetLat, lng: targetLng });
  targetRef.current = { lat: targetLat, lng: targetLng };

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      try {
        const t = targetRef.current;
        const s = smoothRef.current;
        const nlat = s.lat + (t.lat - s.lat) * PEER_SMOOTH_ALPHA;
        const nlng = s.lng + (t.lng - s.lng) * PEER_SMOOTH_ALPHA;
        const errM = getDistance(nlat, nlng, t.lat, t.lng);
        if (errM <= PEER_SNAP_M) {
          smoothRef.current = { lat: t.lat, lng: t.lng };
        } else {
          smoothRef.current = { lat: nlat, lng: nlng };
        }
        const m = markerRef.current;
        if (m) {
          const p = smoothRef.current;
          m.setLatLng([p.lat, p.lng]);
        }
        const p = smoothRef.current;
        const remainM = getDistance(p.lat, p.lng, t.lat, t.lng);
        if (remainM > PEER_SNAP_M) {
          rafId = requestAnimationFrame(tick);
        }
      } catch {
        /* ignore */
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [targetLat, targetLng]);

  const p0 = smoothRef.current;
  return (
    <Marker ref={markerRef} position={[p0.lat, p0.lng]} icon={icon} zIndexOffset={100} opacity={offline ? 0.45 : 1}>
      {children}
    </Marker>
  );
};

/**
 * Moto vista de frente para el indicador de inclinación. El giro lo da `angle` (grados) alrededor de la rueda.
 * Silueta simple (horquilla, depósito, faro, manillar y casco) con gradientes suaves; sin animaciones.
 */
const MotorcycleIcon = ({ angle }: { angle: number }) => (
  <div
    style={{ transform: `rotate(${angle}deg)`, transformOrigin: 'bottom center', transition: 'transform 45ms linear' }}
    className="w-24 h-24 flex items-center justify-center"
  >
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_8px_10px_rgba(0,0,0,0.45)]" aria-hidden>
      <defs>
        <linearGradient id="mr-moto-tyre" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3f3f46" />
          <stop offset="0.5" stopColor="#18181b" />
          <stop offset="1" stopColor="#09090b" />
        </linearGradient>
        <linearGradient id="mr-moto-chrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e2e8f0" />
          <stop offset="0.5" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="mr-moto-tank" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset="0.45" stopColor="#f58a1f" />
          <stop offset="1" stopColor="#9a3412" />
        </linearGradient>
        <radialGradient id="mr-moto-lamp" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#fbbf24" />
        </radialGradient>
        <linearGradient id="mr-moto-helmet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#52525b" />
          <stop offset="1" stopColor="#18181b" />
        </linearGradient>
      </defs>

      {/* Sombra en el suelo */}
      <ellipse cx="50" cy="95" rx="19" ry="2.6" fill="#000" opacity="0.4" />

      {/* Rueda delantera */}
      <rect x="42" y="60" width="16" height="35" rx="8" fill="url(#mr-moto-tyre)" stroke="rgba(255,255,255,0.14)" strokeWidth="0.6" />

      {/* Horquilla (dos barras cromadas que bajan a la rueda) */}
      <path d="M38 40 L45 40 L49 68 L43.5 68 Z" fill="url(#mr-moto-chrome)" />
      <path d="M62 40 L55 40 L51 68 L56.5 68 Z" fill="url(#mr-moto-chrome)" />

      {/* Puente superior */}
      <rect x="35" y="37" width="30" height="5" rx="2.5" fill="url(#mr-moto-chrome)" />

      {/* Manillar con puños */}
      <path d="M24 36 Q50 30 76 36" fill="none" stroke="#cbd5e1" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="19.5" y="33.5" width="6.5" height="5" rx="2.5" fill="#18181b" />
      <rect x="74" y="33.5" width="6.5" height="5" rx="2.5" fill="#18181b" />

      {/* Retrovisores */}
      <path d="M27 35 L22 24 M73 35 L78 24" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="21" cy="22" rx="5.5" ry="3.2" transform="rotate(-18 21 22)" fill="url(#mr-moto-chrome)" />
      <ellipse cx="79" cy="22" rx="5.5" ry="3.2" transform="rotate(18 79 22)" fill="url(#mr-moto-chrome)" />

      {/* Casco del piloto, sobre el depósito */}
      <circle cx="50" cy="25" r="8.5" fill="url(#mr-moto-helmet)" stroke="rgba(255,255,255,0.16)" strokeWidth="0.6" />
      <path d="M43.5 24.5 Q50 21 56.5 24.5 L55.5 27.5 Q50 29.5 44.5 27.5 Z" fill="#0f172a" opacity="0.85" />

      {/* Depósito / carenado */}
      <path d="M37 46 Q50 41 63 46 L60.5 62 Q50 66 39.5 62 Z" fill="url(#mr-moto-tank)" />
      <path d="M41 47.5 Q50 44.5 59 47.5" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.9" strokeLinecap="round" />

      {/* Faro */}
      <circle cx="50" cy="51" r="4.4" fill="url(#mr-moto-lamp)" stroke="#0a0a0a" strokeOpacity="0.6" strokeWidth="0.7" />

      {/* Intermitentes */}
      <circle cx="36.5" cy="48" r="1.7" fill="#fbbf24" />
      <circle cx="63.5" cy="48" r="1.7" fill="#fbbf24" />
    </svg>
  </div>
);

/** Seguimiento en ruta: más velocidad → cámara más alejada (lineal 5 km/h→18 … 120 km/h→12). */
function followZoomFromSpeedKmh(speedKmh: number): number {
  const lo = 5;
  const hi = 120;
  const zNear = 18;
  const zFar = 12;
  const s = Math.max(0, speedKmh);
  const clamped = Math.max(lo, Math.min(hi, s));
  const t = (clamped - lo) / (hi - lo);
  return zNear + t * (zFar - zNear);
}

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

/** Preferencias de aviso de curva (ajustes del mapa). Se leen con try/catch: en modo privado localStorage puede fallar. */
const CURVE_WARN_KEY = 'motoride_curve_warn_v1';
const CURVE_VIBRATE_KEY = 'motoride_curve_vibrate_v1';
function readStoredFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function writeStoredFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* sin persistencia: la preferencia dura lo que la sesión */
  }
}
/** Por debajo de esta distancia (m) se permite la vibración de aviso, una vez por curva. */
const CURVE_VIBRATE_DISTANCE_M = 150;
/** Margen (km/h) por encima de la recomendación antes de marcar la curva como «yendo rápido». */
const CURVE_TOO_FAST_MARGIN_KMH = 5;

/** Paradas elegidas por el usuario para esta ruta (solo se guardan con la clave de la ruta a la que pertenecen). */
type ChosenStopStore = { key: string; stops: RouteStop[] };
const chosenStopsStorageKey = (groupId: string) => `motoride_route_stops_${groupId}`;
function readChosenStopStore(groupId: string): ChosenStopStore | null {
  try {
    const raw = localStorage.getItem(chosenStopsStorageKey(groupId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.key === 'string' && Array.isArray(parsed.stops) ? parsed : null;
  } catch {
    return null;
  }
}
function writeChosenStopStore(groupId: string, store: ChosenStopStore) {
  try {
    localStorage.setItem(chosenStopsStorageKey(groupId), JSON.stringify(store));
  } catch {
    /* sin persistencia */
  }
}

/** Dónde dejó la cámara el seguimiento automático y en qué posición GPS estaba entonces. */
type FollowAnchor = { center: { lat: number; lng: number }; loc: { lat: number; lng: number } };

/** Tras soltar el mapa, si no se toca nada en este tiempo y hay ruta en marcha, el mapa vuelve a seguir la flecha. */
const AUTO_RECENTER_MS = 9000;
/** Distancia en píxeles entre el centro del mapa y donde debería estar en modo seguimiento para mostrar «recentrar». */
const OFF_CENTER_PX = 60;

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
  smoothFollow = false,
  smoothSubscribe,
  recenterSignal = 0,
  followAnchorRef,
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
  /** Posición ya interpolada: relaja el anti-jitter del seguimiento para no quedar el centro atrás. */
  smoothFollow?: boolean;
  /** Suscripción al bucle de suavizado (rAF): la cámara sigue cada frame sin re-renderizar React. */
  smoothSubscribe?: (fn: (p: { lat: number; lng: number }) => void) => () => void;
  /** Incrementa al pulsar «recentrar» o al auto-recentrar: fuerza un desplazamiento animado hacia la flecha. */
  recenterSignal?: number;
  followAnchorRef: MutableRefObject<FollowAnchor | null>;
}) => {
  const map = useMap();
  const hasAutoZoomedRef = useRef(false);
  const lastFollowRef = useRef<{ lat: number; lng: number; zoom: number; t: number } | null>(null);
  const smoothedRecordingZoomRef = useRef<number | null>(null);
  const forceAnimateRef = useRef(false);

  const follow = (location: any, fromSmooth = false) => {
    if (isFollowing && location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      let dynamicZoom = followZoomFromSpeedKmh(speedKmh);
      if (isRecording) {
        if (smoothedRecordingZoomRef.current === null) {
          smoothedRecordingZoomRef.current = followZoomFromSpeedKmh(speedKmh);
        }
        const alpha = 0.125;
        smoothedRecordingZoomRef.current += alpha * (dynamicZoom - smoothedRecordingZoomRef.current);
        dynamicZoom = Math.max(11.4, Math.min(18.6, smoothedRecordingZoomRef.current));
      } else {
        smoothedRecordingZoomRef.current = null;
      }
      const followZoomInitial = hasActiveRoute ? 15.35 : Math.max(map.getZoom(), 17);
      const zoom = isRecording ? dynamicZoom : hasAutoZoomedRef.current ? map.getZoom() : followZoomInitial;
      const size = map.getSize();
      const mapW = size.x;
      const mapH = size.y;
      const landscapeMap = mapW > mapH || isLandscapeUi;

      const forcedRecenter = forceAnimateRef.current;
      const animatePan = !hasAutoZoomedRef.current || forcedRecenter;
      const panOptions = { animate: animatePan, duration: forcedRecenter ? 0.6 : 0.25 };
      const now = Date.now();
      const prev = lastFollowRef.current;
      const zoomChanged = prev != null && Math.abs(prev.zoom - zoom) > 0.04;
      const movedM =
        prev != null ? getDistance(location.lat, location.lng, prev.lat, prev.lng) : Number.POSITIVE_INFINITY;
      const tooSoon = prev != null && now - prev.t < 1100 && movedM < 3.2 && !zoomChanged;
      if (hasAutoZoomedRef.current && tooSoon && !smoothFollow) {
        return;
      }
      // Frame de suavizado sin movimiento apreciable (<25 cm) ni cambio de zoom: no mover la cámara.
      if (fromSmooth && prev != null && !zoomChanged && movedM < 0.25) {
        return;
      }

      if (!hasAutoZoomedRef.current) {
        map.invalidateSize();
      }

      let target: { lat: number; lng: number };
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
          target = offsetByMeters(lat, location.lng as number, bearingForMapOffset - 90, shiftM);
        } else {
          const frac = showRanking ? 0.34 : 0.30;
          const offsetX = mapW * frac;
          const targetPoint = map.project([location.lat, location.lng], zoom).subtract([offsetX, 0]);
          target = map.unproject(targetPoint, zoom);
        }
      } else if (hasActiveRoute && headingRotationActive && Number.isFinite(bearingForMapOffset) && speedKmh > 3) {
        // Ruta activa con mapa girado por rumbo: el centro va un poco por delante del usuario,
        // así la flecha queda bajo la tarjeta de instrucción y no tapada por ella.
        const cosLat = Math.max(0.2, Math.cos((location.lat * Math.PI) / 180));
        const mppP = (40075016.686 * cosLat) / (256 * Math.pow(2, zoom));
        const shiftM = Math.min(90, Math.max(30, mapH * mppP * 0.14));
        target = offsetByMeters(location.lat as number, location.lng as number, bearingForMapOffset, shiftM);
      } else {
        target = { lat: location.lat, lng: location.lng };
      }
      map.setView([target.lat, target.lng], zoom, panOptions);
      forceAnimateRef.current = false;
      // Ancla: permite saber, mientras el usuario explora, dónde debería estar el centro con la flecha en su posición actual.
      followAnchorRef.current = {
        center: { lat: target.lat, lng: target.lng },
        loc: { lat: location.lat, lng: location.lng },
      };

      lastFollowRef.current = { lat: location.lat, lng: location.lng, zoom, t: now };

      if (!hasAutoZoomedRef.current) {
        hasAutoZoomedRef.current = true;
      }
    }
  };

  // Siempre la versión más reciente de `follow` (props actuales) para el bucle de suavizado.
  const followRef = useRef(follow);
  followRef.current = follow;

  useEffect(() => {
    followRef.current(location);
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
    smoothFollow,
  ]);

  useEffect(() => {
    if (!smoothSubscribe) return;
    return smoothSubscribe((p) => followRef.current(p, true));
  }, [smoothSubscribe]);

  // Recentrado pedido por el usuario o automático: desplazamiento animado hacia la última posición conocida.
  const latestLocationRef = useRef(location);
  latestLocationRef.current = location;
  useEffect(() => {
    if (!recenterSignal) return;
    const loc = latestLocationRef.current;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
    forceAnimateRef.current = true;
    followRef.current(loc);
  }, [recenterSignal]);

  return null;
};

/**
 * Distingue el movimiento del usuario (arrastre, pellizco, rueda) del movimiento automático del seguimiento.
 * Leaflet solo dispara dragstart con el dedo/ratón; los setView programáticos no lo disparan.
 */
const MapFollowGuard = ({
  location,
  isFollowing,
  autoRecenterEnabled,
  followAnchorRef,
  onUserMove,
  onAutoRecenter,
  onOffCenterChange,
}: {
  location: any;
  isFollowing: boolean;
  /** Ruta activa y en marcha: solo entonces el mapa vuelve solo a la flecha. */
  autoRecenterEnabled: boolean;
  followAnchorRef: MutableRefObject<FollowAnchor | null>;
  onUserMove: () => void;
  onAutoRecenter: () => void;
  onOffCenterChange: (offCenter: boolean) => void;
}) => {
  const map = useMap();
  const timerRef = useRef<number | undefined>(undefined);
  const offCenterRef = useRef(false);
  const latestRef = useRef({ location, isFollowing, autoRecenterEnabled });
  latestRef.current = { location, isFollowing, autoRecenterEnabled };
  const callbacksRef = useRef({ onUserMove, onAutoRecenter, onOffCenterChange });
  callbacksRef.current = { onUserMove, onAutoRecenter, onOffCenterChange };

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const armAutoRecenter = useCallback(() => {
    clearTimer();
    if (!latestRef.current.autoRecenterEnabled) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      if (latestRef.current.autoRecenterEnabled && !latestRef.current.isFollowing) {
        callbacksRef.current.onAutoRecenter();
      }
    }, AUTO_RECENTER_MS);
  }, [clearTimer]);

  const evaluateOffCenter = useCallback(() => {
    const anchor = followAnchorRef.current;
    const { location: loc, isFollowing: following } = latestRef.current;
    let off = false;
    if (!following && anchor && loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      // Centro esperado ahora = posición actual + desplazamiento que tenía la cámara respecto a la flecha al seguir.
      const expected = {
        lat: loc.lat + (anchor.center.lat - anchor.loc.lat),
        lng: loc.lng + (anchor.center.lng - anchor.loc.lng),
      };
      const pCenter = map.latLngToContainerPoint(map.getCenter());
      const pExpected = map.latLngToContainerPoint(L.latLng(expected.lat, expected.lng));
      off = pCenter.distanceTo(pExpected) > OFF_CENTER_PX;
    }
    if (off !== offCenterRef.current) {
      offCenterRef.current = off;
      callbacksRef.current.onOffCenterChange(off);
    }
  }, [map, followAnchorRef]);

  useMapEvents({
    dragstart: () => {
      clearTimer();
      callbacksRef.current.onUserMove();
    },
    dragend: () => armAutoRecenter(),
    moveend: () => evaluateOffCenter(),
  });

  // Pellizco y rueda del ratón también son movimiento del usuario.
  useEffect(() => {
    const el = map.getContainer();
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        clearTimer();
        callbacksRef.current.onUserMove();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0 && !latestRef.current.isFollowing) armAutoRecenter();
    };
    const onWheel = () => {
      clearTimer();
      callbacksRef.current.onUserMove();
      armAutoRecenter();
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [map, armAutoRecenter, clearTimer]);

  // Seguir otra vez (botón o automático) cancela cualquier temporizador pendiente.
  useEffect(() => {
    if (isFollowing) clearTimer();
  }, [isFollowing, clearTimer]);

  useEffect(() => {
    if (!autoRecenterEnabled) clearTimer();
  }, [autoRecenterEnabled, clearTimer]);

  // La flecha se mueve con el GPS aunque el mapa esté quieto: reevaluar.
  useEffect(() => {
    evaluateOffCenter();
  }, [location, isFollowing, evaluateOffCenter]);

  useEffect(() => clearTimer, [clearTimer]);

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
  const SESSION_PAUSED_KEY = `motoride_session_paused_${groupId}`;
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [customName, setCustomName] = useState<string | null>(null);
  const [customPhotoURL, setCustomPhotoURL] = useState<string | null>(null);
  const [group, setGroup] = useState<any>(null);
  const [memberPremiumByUid, setMemberPremiumByUid] = useState<Record<string, boolean>>({});
  /** Marco equipado de cada miembro (users/{uid}); respaldo cuando el payload de ubicación no lo trae. */
  const [memberFrameByUid, setMemberFrameByUid] = useState<Record<string, string>>({});
  const [memberDisplayNameByUid, setMemberDisplayNameByUid] = useState<Record<string, string>>({});

  const groupMembersKey = useMemo(() => {
    if (!Array.isArray(group?.members)) return '';
    return [...group.members].filter(Boolean).sort().join('|');
  }, [group?.members]);

  useEffect(() => {
    if (!groupMembersKey) {
      setMemberPremiumByUid({});
      setMemberDisplayNameByUid({});
      setMemberFrameByUid({});
      return;
    }
    const ids = groupMembersKey.split('|').filter(Boolean);
    const unsubs = ids.map((uid) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const v = snap.exists() && snap.data()?.isPremium === true;
          const dn = snap.exists() ? String(snap.data()?.displayName || 'Motero').slice(0, 80) || 'Motero' : 'Motero';
          const fid = resolvePeerFrameId(snap.exists() ? snap.data()?.profileFrameId : null);
          setMemberPremiumByUid((prev) => (prev[uid] === v ? prev : { ...prev, [uid]: v }));
          setMemberDisplayNameByUid((prev) => (prev[uid] === dn ? prev : { ...prev, [uid]: dn }));
          setMemberFrameByUid((prev) => (prev[uid] === fid ? prev : { ...prev, [uid]: fid }));
        },
        () => {
          setMemberFrameByUid((prev) => (uid in prev ? { ...prev, [uid]: 'none' } : prev));
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

  const [profileLevel, setProfileLevel] = useState(1);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const d = doc.data();
        setCustomName(d.displayName || null);
        setCustomPhotoURL(d.photoURL || null);
        const lv = Math.max(1, Math.floor(Number(d.level) || 1));
        setProfileLevel(lv);
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
  /** Vista descentrada de la flecha tras explorar con el dedo: muestra el botón «recentrar». */
  const [mapOffCenter, setMapOffCenter] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const followAnchorRef = useRef<FollowAnchor | null>(null);
  const recenterMapOnRider = useCallback(() => {
    setIsFollowing(true);
    setRecenterSignal((n) => n + 1);
  }, []);
  const handleUserMapMove = useCallback(() => setIsFollowing(false), []);
  const lastHeadingRef = useRef<number | null>(null);
  const lastHeadingTimeRef = useRef<number>(Date.now());
  /** Prefetch de teselas: posición GPS y centro del mapa (misma caché persistente que el SW). */
  const lastKnownLocForPrefetchRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapZoomRef = useRef(16);
  const mapViewportCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  /** Medidas del contenedor del mapa (rumbo arriba): escalamos la capa Leaflet para no dejar triángulos vacíos al rotar. */
  const mapRotationShellRef = useRef<HTMLDivElement>(null);
  const [mapRotationShellPx, setMapRotationShellPx] = useState({ w: 1, h: 1 });
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
  const idleMotionBeforeRecordMRef = useRef(0);
  const idlePrevLocForAutoRecordRef = useRef<{ lat: number; lng: number } | null>(null);
  const idleAutoRecordFiringRef = useRef(false);

  // New state for ranking and alerts
  const [score, setScore] = useState(0);
  const [inCurve, setInCurve] = useState(false);
  const [currentCurveMax, setCurrentCurveMax] = useState(0);
  const [alertType, setAlertType] = useState<string | null>(null);
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
  /** Participante: salida con resumen pendiente → `onLeave` solo al cerrar el modal. */
  const pendingLeaveAfterSummaryRef = useRef(false);

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

  useEffect(() => {
    const el = mapRotationShellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      try {
        const r = el.getBoundingClientRect();
        setMapRotationShellPx({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
      } catch {
        /* ignore */
      }
    };
    apply();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        ro?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

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
  const [curveWarnEnabled, setCurveWarnEnabled] = useState<boolean>(() => readStoredFlag(CURVE_WARN_KEY, true));
  const [curveVibrateEnabled, setCurveVibrateEnabled] = useState<boolean>(() => readStoredFlag(CURVE_VIBRATE_KEY, false));
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

  const userLevel = profileLevel;
  /** Marco equipado del propio usuario (valor guardado en users/{uid}, ya validado al guardar). */
  const [selfStoredFrameId, setSelfStoredFrameId] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => setSelfStoredFrameId(snap.exists() ? (snap.data()?.profileFrameId ?? null) : null),
      () => setSelfStoredFrameId(null)
    );
    return () => unsub();
  }, [user?.uid]);
  const selfFrameId = resolvePeerFrameId(selfStoredFrameId);
  const isHost = group?.createdBy === user?.uid;
  /** Evita cleanups del efecto pagehide/unmount cuando `isHost` pasa de false→true al cargar el snapshot del grupo (p. ej. tras promover desde REPEATED). */
  const isHostRef = useRef(!!isHost);
  isHostRef.current = !!isHost;
  const isRecording = group?.isRecording || false;
  const ridePaused = group?.ridePaused === true;
  /** Ruta en curso sin pausa (conteo km/puntos, GPS activo). */
  const rideActive = isRecording && !ridePaused;

  const headingHistoryRef = useRef<{heading: number, time: number}[]>([]);
  const angleHistoryRef = useRef<number[]>([]);
  const lastLeanAutoCalibMsRef = useRef(0);

  // GPS del mapa y presencia en el grupo: siempre en sesión real (no solo al grabar ni solo sin pausa).
  // Inclinómetro / km / trazado siguen condicionados por `rideActive` aparte.
  const { speed, heading, currentLocation, courseOverGround, horizontalAccuracy, error: gpsError } = useLocationTracking(
    !!groupId && groupId !== 'REPEATED',
    groupId,
    {
      score,
      alert: alertType ? { type: alertType, timestamp: Date.now() } : null,
      displayName: displayNameToUse,
      photoURL: photoURLToUse,
      level: userLevel,
      isHost,
      profileFrameId: selfFrameId,
    },
    { enableHighAccuracy: gpsHighAccuracyEnabled }
  );

  const speedForLean = rideActive ? speed : 0;

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
  /** Bolsillo/MirrorLink: cero IMU propio; GPS normal: cero manillar (orientación distinta). */
  const leanCalibrationProfile: LeanCalibrationProfile =
    touchLockKind !== null ? 'pocket' : 'handlebar';
  const {
    leanAngle: sensorLeanAngle,
    maxLeanLeft,
    maxLeanRight,
    permissionGranted: leanPermissionGranted,
    requestPermission,
    resetMaxLean,
    calibrate,
    applyCalibrationStep,
  } = useLeanAngle(speedForLean, leanCalibrationProfile);
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

  /** Cero IMU para bolsillo/MirrorLink: el teléfono ya está guardado; perfil `pocket` y offset dedicado. */
  useEffect(() => {
    if (!touchLockKind || !isPocketLocked) return;
    const id = window.setTimeout(() => {
      try {
        calibrate();
      } catch (e) {
        console.error('Pocket lean zero calibration', e);
      }
    }, 850);
    return () => window.clearTimeout(id);
  }, [touchLockKind, isPocketLocked, calibrate]);

  const needsOrientationUserGesture =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> })
      .requestPermission === 'function';
  const [estimatedLeanAngle, setEstimatedLeanAngle] = useState(0);
  const lastLeanGpsAutoCalibMsRef = useRef(0);

  // Auto-calibración en recta: antes era casi imposible (>40 km/h y rumbo ±1,5°). Afinado para uso real.
  useEffect(() => {
    if (!rideActive) return;
    if (touchLockKind !== null) return;
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
  }, [rideActive, touchLockKind, currentLocation, headingOrCourseForTelemetry, speed, sensorLeanAngle, applyCalibrationStep]);

  // Auto-calibración también en modo GPS normal (sin bolsillo/mirrorlink): ayuda a centrar en uso real continuado.
  useEffect(() => {
    if (!rideActive || isPocketLocked || touchLockKind) return;
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
    rideActive,
    isPocketLocked,
    touchLockKind,
    currentLocation,
    headingOrCourseForTelemetry,
    speed,
    applyCalibrationStep,
  ]);

  const leftTurnsRef = useRef(0);
  const rightTurnsRef = useRef(0);
  /** Tiempo en pausa acumulado en esta sesión (ms), si el host no ha sincronizado aún con Firestore. */
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

  // Precarga las teselas a lo largo de la ruta (en segundo plano, tras un breve retardo para no competir con el mapa inicial).
  useEffect(() => {
    if (!effectiveRouteForNav) return;
    const id = window.setTimeout(() => {
      void prefetchRouteTiles(effectiveRouteForNav);
    }, 400);
    return () => window.clearTimeout(id);
  }, [effectiveRouteForNav]);

  useEffect(() => {
    if (!precipitationBanner) return;
    const id = window.setTimeout(() => setPrecipitationBanner(false), 30000);
    return () => window.clearTimeout(id);
  }, [precipitationBanner]);

  const prevPrecipBannerRef = useRef(false);
  useEffect(() => {
    if (precipitationBanner && !prevPrecipBannerRef.current) {
      try {
        speakMotoridePrecipitationRisk();
      } catch {
        /* ignore */
      }
    }
    prevPrecipBannerRef.current = precipitationBanner;
  }, [precipitationBanner]);

  useEffect(() => {
    setPrecipitationBanner(false);
    lastPrecipBannerAtRef.current = 0;
  }, [groupId]);

  /** Tiempo entre dos anuncios de lluvia (ms). */
  const COOLDOWN_MS = 10 * 60 * 1000;

  const lastPrecipLocation = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  /** Última consulta de lluvia a Open-Meteo (throttle: el efecto se reejecuta con cada posición GPS). */
  const lastPrecipCheckAtRef = useRef(0);

  const navState = useNavigation(currentLocation, effectiveRouteForNav);

  // Paradas sobre la ruta (Overpass, una vez por ruta; ver lib/routeStops.ts).
  const [showRouteStops, setShowRouteStops] = useState(false);
  const [routeStopsState, setRouteStopsState] = useState<{ key: string; stops: RouteStop[] } | null>(null);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  const [routeStopsError, setRouteStopsError] = useState(false);
  const [chosenStopStore, setChosenStopStore] = useState<ChosenStopStore | null>(() => readChosenStopStore(groupId));
  const stopsRouteIndex: RouteIndex | null = useMemo(() => {
    if (!effectiveRouteForNav) return null;
    const parsed = parseRouteData(effectiveRouteForNav);
    return parsed ? buildRouteIndex(getLineCoordinates(parsed)) : null;
  }, [effectiveRouteForNav]);
  const stopsRouteKey = stopsRouteIndex ? routeCacheKey(stopsRouteIndex) : null;
  const routeStops = routeStopsState && routeStopsState.key === stopsRouteKey ? routeStopsState.stops : null;
  const chosenStops: RouteStop[] =
    chosenStopStore && stopsRouteKey && chosenStopStore.key === stopsRouteKey ? chosenStopStore.stops : [];
  const chosenStopIds = useMemo(() => chosenStops.map((s) => s.id), [chosenStops]);

  const loadRouteStops = useCallback(() => {
    if (!stopsRouteIndex || !stopsRouteKey) return;
    const cached = getCachedRouteStops(stopsRouteIndex);
    if (cached) {
      setRouteStopsState({ key: stopsRouteKey, stops: cached });
      setRouteStopsError(false);
      return;
    }
    setRouteStopsLoading(true);
    setRouteStopsError(false);
    fetchRouteStops(stopsRouteIndex)
      .then((stops) => setRouteStopsState({ key: stopsRouteKey, stops }))
      .catch(() => setRouteStopsError(true))
      .finally(() => setRouteStopsLoading(false));
  }, [stopsRouteIndex, stopsRouteKey]);

  // Votación del grupo sobre las paradas (lib/stopVotes.ts). Un único listener por ruta activa; se cierra al salir.
  const [groupVotes, setGroupVotes] = useState<{ key: string; status: 'live' | 'offline' | 'error'; docs: StopVoteDoc[] } | null>(null);
  useEffect(() => {
    if (!stopsRouteKey || groupId === 'REPEATED') return;
    const key = stopsRouteKey;
    const unsub = subscribeRouteStopVotes(
      db,
      groupId,
      key,
      ({ docs, fromCache }) => setGroupVotes({ key, status: fromCache ? 'offline' : 'live', docs }),
      () => setGroupVotes((prev) => ({ key, status: 'error', docs: prev?.key === key ? prev.docs : [] }))
    );
    return () => unsub();
  }, [groupId, stopsRouteKey]);
  const voteState = groupVotes && groupVotes.key === stopsRouteKey ? groupVotes : null;
  const voteDocs = useMemo(() => voteState?.docs ?? [], [voteState]);
  const voteLive = voteState?.status === 'live';
  const voteMode: 'live' | 'offline' = voteLive ? 'live' : 'offline';
  const groupChosen = useMemo(() => (voteLive ? pickChosenStop(voteDocs) : null), [voteLive, voteDocs]);
  const groupChosenStop: RouteStop | null = groupChosen ? toRouteStop(groupChosen.doc) : null;
  const electorateSize = useMemo(() => electorateOf(voteDocs).size, [voteDocs]);
  const activeChosenIds = voteLive ? (groupChosenStop ? [groupChosenStop.id] : []) : chosenStopIds;
  const candidates = useMemo(
    () => buildCandidates(voteDocs, routeStops, stopsRouteKey ?? '', user?.uid ?? null),
    [voteDocs, routeStops, stopsRouteKey, user?.uid]
  );

  // El primer miembro que abre el panel publica las candidatas (Overpass ya consultado); los demás las leen.
  const publishedRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showRouteStops || !voteLive || !routeStops || !stopsRouteKey || voteDocs.length > 0) return;
    if (groupId === 'REPEATED' || publishedRouteKeyRef.current === stopsRouteKey) return;
    publishedRouteKeyRef.current = stopsRouteKey;
    publishRouteStopCandidates(db, groupId, stopsRouteKey, routeStops).catch(() => {
      // Otro miembro publicó antes (el lote se rechaza entero y no toca votos): el listener traerá sus docs.
      publishedRouteKeyRef.current = null;
    });
  }, [showRouteStops, voteLive, routeStops, stopsRouteKey, voteDocs.length, groupId]);

  const openRouteStops = useCallback(() => {
    setShowRouteStops(true);
    // Con candidatas ya publicadas en el grupo no hace falta consultar Overpass.
    if (voteLive && voteDocs.length > 0) return;
    loadRouteStops();
  }, [loadRouteStops, voteLive, voteDocs.length]);

  // Al cargar la vista con una ruta ya conocida, pinta las paradas en el mapa (una consulta por ruta, con caché).
  useEffect(() => {
    if (!stopsRouteKey || routeStopsState?.key === stopsRouteKey) return;
    const cached = stopsRouteIndex ? getCachedRouteStops(stopsRouteIndex) : null;
    if (cached) setRouteStopsState({ key: stopsRouteKey, stops: cached });
  }, [stopsRouteKey, stopsRouteIndex, routeStopsState]);

  /** Voto propio: deja el voto en esta parada (o lo quita si ya era el mío). Solo con conexión al grupo. */
  const toggleGroupStopVote = useCallback(
    (candidate: RouteStopCandidate) => {
      if (!voteLive || !user?.uid || !stopsRouteKey || groupId === 'REPEATED') return;
      // Solo se vota sobre candidatas ya publicadas en el grupo (no sobre la lista local aún sin publicar).
      if (!voteDocs.some((d) => d.docId === candidate.docId)) return;
      const mine = candidate.mine;
      const ops = buildVoteMoveOps(voteDocs, user.uid, mine ? null : candidate.docId);
      applyVoteOps(db, groupId, user.uid, ops)
        .then(() => {
          // Respaldo sin red: se guarda la última elección de este dispositivo.
          const stop: RouteStop = {
            id: candidate.stopId,
            kind: candidate.kind,
            name: candidate.name,
            lat: candidate.lat,
            lng: candidate.lng,
            alongM: candidate.alongM,
            offRouteM: 0,
          };
          const store: ChosenStopStore = { key: stopsRouteKey, stops: mine ? [] : [stop] };
          setChosenStopStore(store);
          writeChosenStopStore(groupId, store);
        })
        .catch(() => {
          showMessage({ variant: 'error', title: 'Paradas', message: 'No se pudo registrar tu voto. Inténtalo de nuevo.' });
        });
    },
    [voteLive, voteDocs, user?.uid, stopsRouteKey, groupId, showMessage]
  );
  const navigationHeading = useNavigationHeading(
    heading,
    speed,
    courseOverGround,
    currentLocation,
    effectiveRouteForNav,
    navState
  );

  /** Misma convención que la flecha del GPS: 0° = hacia donde avanzas; la flecha del viento muestra hacia dónde sopla relativo a ese rumbo. */
  const windHudArrowRotationDeg = useMemo(() => {
    if (mapWeather.windBlowToDeg == null || !Number.isFinite(mapWeather.windBlowToDeg)) return null;
    const h = Number.isFinite(navigationHeading) ? navigationHeading : 0;
    const rel = mapWeather.windBlowToDeg - h;
    return ((rel % 360) + 360) % 360;
  }, [mapWeather.windBlowToDeg, navigationHeading]);

  const displayLocation = useMemo(() => {
    if (!currentLocation) return null;
    // Snap sobre el trazado ORIGINAL (no sobre la guía OSRM de vuelta).
    if (!effectiveRouteForNav || !navState.snapped || navState.offRouteM == null) return currentLocation;

    const acc = horizontalAccuracy;
    let maxSnapM = 42;
    if (acc != null && Number.isFinite(acc) && acc > 18) {
      // GPS impreciso: acotar el snap para no “saltar” a la polilínea equivocada.
      maxSnapM = Math.max(16, Math.min(42, 52 - acc * 0.42));
    }
    if (navState.offRouteM <= maxSnapM) {
      return { lat: navState.snapped.lat, lng: navState.snapped.lng };
    }
    return currentLocation;
  }, [currentLocation, navState.snapped, navState.offRouteM, effectiveRouteForNav, horizontalAccuracy]);

  const [smoothMapLocation, setSmoothMapLocation] = useState<{ lat: number; lng: number } | null>(null);
  const smoothMapRef = useRef<{ lat: number; lng: number } | null>(null);
  const smoothMapTargetRef = useRef<{ lat: number; lng: number } | null>(null);
  const smoothListenersRef = useRef(new Set<(p: { lat: number; lng: number }) => void>());
  const subscribeSmoothMap = useCallback((fn: (p: { lat: number; lng: number }) => void) => {
    smoothListenersRef.current.add(fn);
    return () => {
      smoothListenersRef.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!displayLocation) {
      smoothMapTargetRef.current = null;
      smoothMapRef.current = null;
      setSmoothMapLocation(null);
      return;
    }
    const t = { lat: displayLocation.lat, lng: displayLocation.lng };
    if (typeof t.lat !== 'number' || typeof t.lng !== 'number' || !Number.isFinite(t.lat) || !Number.isFinite(t.lng)) {
      return;
    }
    smoothMapTargetRef.current = t;
    if (!smoothMapRef.current) {
      smoothMapRef.current = t;
      setSmoothMapLocation(t);
    }
  }, [displayLocation]);

  useEffect(() => {
    if (!displayLocation || !smoothMapRef.current) return;

    let rafId = 0;
    const tick = () => {
      try {
        const targ = smoothMapTargetRef.current;
        const cur = smoothMapRef.current;
        if (!targ || !cur) return;

        const nlat = cur.lat + (targ.lat - cur.lat) * SELF_MAP_SMOOTH_ALPHA;
        const nlng = cur.lng + (targ.lng - cur.lng) * SELF_MAP_SMOOTH_ALPHA;
        const errM = getDistance(nlat, nlng, targ.lat, targ.lng);

        // Cada frame: solo se notifica a marcador y cámara (sin setState → sin re-render de MapView).
        const snapped = errM <= SELF_MAP_SNAP_M;
        smoothMapRef.current = snapped ? { lat: targ.lat, lng: targ.lng } : { lat: nlat, lng: nlng };
        const p = smoothMapRef.current;
        smoothListenersRef.current.forEach((fn) => fn(p));

        const remainM = getDistance(p.lat, p.lng, targ.lat, targ.lng);
        if (remainM > SELF_MAP_SNAP_M) {
          rafId = requestAnimationFrame(tick);
        } else {
          // Fin de la animación: una sola actualización de estado para props y render.
          setSmoothMapLocation({ lat: p.lat, lng: p.lng });
        }
      } catch {
        /* ignore */
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [displayLocation?.lat, displayLocation?.lng, displayLocation]);

  const mapVisualLocation =
    smoothMapLocation ??
    (displayLocation &&
    typeof displayLocation.lat === 'number' &&
    typeof displayLocation.lng === 'number' &&
    Number.isFinite(displayLocation.lat) &&
    Number.isFinite(displayLocation.lng)
      ? { lat: displayLocation.lat, lng: displayLocation.lng }
      : null);

  const { nearestRadarDistanceM, radarsNearby, precipPoints } = useRoadData(
    currentLocation,
    effectiveRouteForNav
  );

  /** Lluvia en el tramo que queda por delante: posición actual + puntos del trazado cada 5 km (hasta 60 km). */
  const precipAheadBucket = Math.floor((navState.alongM ?? 0) / 5000);
  const precipAheadPoints = useMemo(() => {
    const here = currentLocation ? [{ lat: currentLocation.lat, lng: currentLocation.lng }] : [];
    if (!stopsRouteIndex) return here.length ? here : precipPoints;
    return [...here, ...routePointsAhead(stopsRouteIndex, navState.alongM ?? 0)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsRouteIndex, precipAheadBucket, currentLocation?.lat, currentLocation?.lng, precipPoints]);

  /** Precipitaciones: chequeo periódico y por movimiento, con como mucho una consulta cada 5 min. */
  useEffect(() => {
    let cancelled = false;
    const INTERVAL_MS = 30000;
    const PRECIP_CHECK_MIN_MS = 5 * 60 * 1000;

    /** Verifica si hay riesgo de lluvia en el trazado por delante del motorista. */
    const checkPrecipitation = async () => {
      lastPrecipCheckAtRef.current = Date.now();
      try {
        const risk = await anyPrecipitationRiskAtPoints(precipAheadPoints);
        if (cancelled || !risk) return;
        lastPrecipBannerAtRef.current = Date.now();
        setPrecipitationBanner(true);
        if (navigator.vibrate) navigator.vibrate(80);
      } catch {
        /* ignore */
      }
    };

    // Revisión inmediata
    // Revisión inmediata
    if (!isOnline || !currentLocation) return;
    if (premiumGpsPolicy.precipAlertsPremiumOnly && !selfPremium) return;
    if (Date.now() - lastPrecipBannerAtRef.current < COOLDOWN_MS) return;
    if (precipAheadPoints.length === 0) return;
    if (Date.now() - lastPrecipCheckAtRef.current >= PRECIP_CHECK_MIN_MS) checkPrecipitation();

    // Revisión periódica cada 30s
    const interval = window.setInterval(() => {
      if (cancelled) return;
      if (Date.now() - lastPrecipBannerAtRef.current < COOLDOWN_MS) return;
      if (Date.now() - lastPrecipCheckAtRef.current < PRECIP_CHECK_MIN_MS) return;
      checkPrecipitation();
    }, INTERVAL_MS);

    // Guardar última posición para detectar movimiento
    lastPrecipLocation.current = { lat: currentLocation.lat || 0, lng: currentLocation.lng || 0 };

    return () => {
      cancelled = true;
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
    precipAheadPoints,
  ]);

  const wasRadarWithin500Ref = useRef(false);
  useEffect(() => {
    const d = nearestRadarDistanceM;
    const inside = d !== null && d <= 500;
    if (inside && !wasRadarWithin500Ref.current) {
      try {
        speakMotorideRadarNearby(typeof d === 'number' ? d : 500);
      } catch {
        /* ignore */
      }
    }
    wasRadarWithin500Ref.current = inside;
  }, [nearestRadarDistanceM]);

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

  const voiceAllowed = premiumGpsPolicy.voiceChatRequiresPremium
    ? selfPremium || hostIsPremium
    : true;

  const { isVoiceActive, toggleVoice, peersCount, micError, clearMicError, voiceReconnecting } = useVoiceChat(
    groupId,
    voiceAllowed
  );

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
      const fromCache = doc.metadata.fromCache;
      if (doc.exists()) {
        const data = doc.data();
        setGroup(data);
        // Copia local de la ruta activa: permite seguir las indicaciones sin cobertura al recargar.
        if (data.isRecording === true || data.ridePaused === true) saveActiveRouteSnapshot(groupId, data);
        else clearActiveRouteSnapshot(groupId);
      } else if (fromCache) {
        // Sin red y sin caché del documento: usar la copia local de la ruta, si existe.
        const local = readActiveRouteSnapshot(groupId);
        if (local) setGroup(local);
      } else {
        setGroup(undefined);
      }
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
          if (nextTs <= prevTs && !data?.alert && !existing?.offline) return prev;
          const newLocs = [...prev];
          newLocs[idx] = { ...existing, ...data, offline: false };
          return newLocs;
        }
        return [...prev, { ...data, offline: false }];
      });
    };
    const handleUserLeft = (data: { uid: string; reason?: string }) => {
      if (data?.reason === 'disconnect-timeout') {
        // Perdió la conexión: mantener su última posición atenuada hasta que vuelva.
        setLocations(prev => prev.map(l => (l.uid === data.uid ? { ...l, offline: true } : l)));
        return;
      }
      setLocations(prev => prev.filter(l => l.uid !== data.uid));
    };
    const handleHostLeftRoute = () => {
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

      if (data.uid !== user?.uid) {
        speakMotorideGroupAlert(String(data.type || ''), String(data.displayName || 'Motero'));
        try {
          if (data.type === 'Caída' && typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
          }
        } catch {
          /* ignore */
        }
      }
    };

    socket.on('location-updated', handleLocationUpdate);
    socket.on('user-left', handleUserLeft);
    socket.on('host-left-route', handleHostLeftRoute);
    socket.on('alert-triggered', handleAlertTriggered);

    const unsubs: Array<() => void> = [];
    // Firestore: posición reciente como respaldo del socket. Los avisos no se leen ni escriben en Firestore (solo tiempo real).
    // Las reglas no permiten listar `locations`: se escucha documento a documento a cada miembro del grupo
    // (solo se autoriza leer la ubicación de quien comparte tu groupId). Al cambiar de grupo se limpia todo.
    if (group?.members?.length) {
      const memberUids = Array.from(new Set((group.members as unknown[]).map(String))).filter(Boolean);

      memberUids.forEach((memberUid) => {
        const unsub = onSnapshot(doc(db, 'locations', memberUid), (snap) => {
          if (!snap.exists()) return;
          const raw = snap.data();
          const { alert: _dropAlert, ...data } = raw;
          if (Date.now() - (data.timestamp as number) < 10 * 60 * 1000) {
            setLocations(prev => {
              const newLocs = [...prev];
              const idx = newLocs.findIndex(l => l.uid === memberUid);
              if (idx >= 0) {
                if ((data.timestamp as number) > (newLocs[idx].timestamp || 0)) {
                  newLocs[idx] = { ...newLocs[idx], ...data };
                }
              } else {
                newLocs.push(data as any);
              }
              return newLocs;
            });
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `locations/${memberUid}`);
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
  }, [group?.members, user?.uid]);

  /**
   * Salida **explícita** de la ruta (botón salir). Cerrar la app, pasarla a segundo plano o perder
   * la conexión ya NO saca a nadie del grupo: así cualquiera (también el anfitrión) vuelve a entrar solo.
   *
   * - Participante: se quita de `members`.
   * - Anfitrión con la ruta en marcha y más gente: cede el mando al compañero conectado más reciente
   *   y la ruta sigue para los demás.
   * - Anfitrión solo (o ruta sin grabar): termina la ruta como antes.
   */
  const deleteGroupIfHost = async (reason: string): Promise<boolean> => {
    if (!groupId || groupId === 'REPEATED' || !user || leaveInProgressRef.current) return false;
    leaveInProgressRef.current = true;
    const groupRef = doc(db, 'groups', groupId);

    try {
      // Ruta programada que aún no ha empezado: no tocar el grupo, solo salir del mapa.
      const now = Date.now();
      if (
        group?.isScheduled === true &&
        Number.isFinite(group.scheduledTimestamp) &&
        group.scheduledTimestamp > now
      ) {
        socket.emit('leave-group', { groupId, uid: user.uid, isHost: false, timestamp: now });
        return true;
      }

      if (isHostRef.current) {
        const members: string[] = Array.isArray(group?.members) ? group.members.map(String) : [];
        const others = members.filter((m) => m !== user.uid);
        const hostLeftAt = Date.now();

        if (group?.isRecording === true && others.length > 0) {
          // Preferir al compañero que ha enviado posición más recientemente (probablemente conectado).
          const byRecency = [...others].sort((a, b) => {
            const ta = locations.find((l) => l.uid === a)?.timestamp || 0;
            const tb = locations.find((l) => l.uid === b)?.timestamp || 0;
            return tb - ta;
          });
          const newHost = byRecency[0];
          try {
            await updateDoc(groupRef, {
              createdBy: newHost,
              members: arrayRemove(user.uid),
              hostLeftAt,
              hostLeftUid: user.uid,
            });
          } catch (e) {
            // Reglas antiguas sin traspaso: al menos salir sin cortar la ruta a los demás
            // (un compañero reclamará el mando automáticamente).
            console.warn('Traspaso de anfitrión no permitido, saliendo sin cerrar la ruta', e);
            await updateDoc(groupRef, { members: arrayRemove(user.uid) });
          }
          socket.emit('leave-group', { groupId, uid: user.uid, isHost: false, timestamp: hostLeftAt });
          return true;
        }

        await updateDoc(groupRef, {
          isRecording: false,
          hostLeftAt,
          hostLeftUid: user.uid,
          ...(group?.isScheduled === true ? {} : { members: arrayRemove(user.uid) }),
        });
        socket.emit('leave-group', { groupId, uid: user.uid, isHost: true, timestamp: hostLeftAt });
        return true;
      }

      await updateDoc(groupRef, { members: arrayRemove(user.uid) });
      socket.emit('leave-group', { groupId, uid: user.uid, isHost: false, timestamp: Date.now() });
      return true;
    } catch (e) {
      console.error(`deleteGroupIfHost(${reason})`, e);
      // Permitir reintentar (antes se quedaba bloqueado para siempre tras un fallo).
      leaveInProgressRef.current = false;
      return false;
    }
  };

  /**
   * Si el anfitrión desapareció del grupo con la ruta en marcha (p. ej. salió con reglas antiguas),
   * el primer miembro de la lista reclama el mando para que alguien pueda pausar / finalizar.
   */
  useEffect(() => {
    if (!groupId || groupId === 'REPEATED' || !user?.uid || !group) return;
    const members: string[] = Array.isArray(group.members) ? group.members.map(String) : [];
    if (group.isRecording !== true || !group.createdBy || members.includes(String(group.createdBy))) return;
    if (members[0] !== user.uid) return;
    void updateDoc(doc(db, 'groups', groupId), { createdBy: user.uid }).catch((e) =>
      console.warn('No se pudo reclamar el mando de la ruta', e)
    );
  }, [groupId, user?.uid, group?.isRecording, group?.createdBy, group?.members]);

  /** Aviso al recibir el mando de la ruta. */
  const prevCreatedByRef = useRef<string | null>(null);
  useEffect(() => {
    const cb = group?.createdBy ? String(group.createdBy) : null;
    const prev = prevCreatedByRef.current;
    prevCreatedByRef.current = cb;
    if (!prev || !cb || prev === cb || !user?.uid) return;
    if (cb === user.uid) {
      showMessage({
        variant: 'info',
        title: 'Ahora eres el anfitrión',
        message: 'El anfitrión anterior ha salido de la ruta. Ahora puedes pausarla o finalizarla para todo el grupo.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.createdBy, user?.uid]);

  // Wake Lock siempre en vista de mapa (GPS/ruta visible); iOS 16.4+ Safari / PWA; a menudo hace falta un gesto.
  // NO pedir wakeLock si el usuario está en modo bolsillo (evita bloqueo del dispositivo en iPhone)
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
      // wakeLock siempre activo en vista de mapa (GPS/ruta visible); iOS pide gesto del usuario
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

  // Cerrar la app / segundo plano / perder conexión NO saca del grupo ni corta la ruta:
  // antes, si el anfitrión cerraba la app (pagehide / beforeunload) se paraba la ruta a todos.
  // Ahora el servidor marca la desconexión y, al volver, MainApp reengancha la ruta automáticamente.
  // Solo la salida explícita (confirmLeaveRoute) llama a deleteGroupIfHost.

  // GPS-based lean angle estimation (fallback for when phone is in pocket/screen off)
  useEffect(() => {
    if (!rideActive || !currentLocation || speed === null || speed < MIN_SPEED_MPS_GPS_LEAN) {
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
  }, [currentLocation, headingOrCourseForTelemetry, speed, rideActive]);

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
    rideActive,
    speed,
    estimatedLeanAngle,
    sensorLeanAngle,
    isScreenShareLikeMode,
  ]);

  // Curva: >20 km/h e inclinación estrictamente >15° al entrar; puntuación si el pico superó 15°
  useEffect(() => {
    if (!rideActive) return;
    const currentSpeed = (speed || 0) * 3.6;
    const MIN_CURVE_SPEED_KMH = 20;
    const CURVE_START_DEG = 15;
    const CURVE_END_DEG = 8;
    const absAngle = Math.abs(leanAngle);
    if (currentSpeed > MIN_CURVE_SPEED_KMH && absAngle > CURVE_START_DEG) {
      if (!inCurve) {
        setInCurve(true);
        // Solo puntúan curvas entradas a velocidad real (anti farmeo frenando/acelerando).
        curveEntryQualifiedRef.current = currentSpeed >= RIDE_POINTS_RULES.curveMinEntrySpeedKmh;
        if (leanAngle > 0) {
          rightTurnsRef.current += 1;
        } else {
          leftTurnsRef.current += 1;
        }
      }
      if (absAngle > currentCurveMax) setCurrentCurveMax(absAngle);
    } else if ((currentSpeed <= MIN_CURVE_SPEED_KMH || absAngle <= CURVE_END_DEG) && inCurve) {
      setInCurve(false);
      if (curveEntryQualifiedRef.current) {
        const curvePts = curvePointsForPeak(currentCurveMax);
        if (curvePts > 0) setScore((prev) => prev + curvePts);
      }
      curveEntryQualifiedRef.current = false;
      setCurrentCurveMax(0);
    }
  }, [leanAngle, rideActive, inCurve, currentCurveMax, speed]);

  useEffect(() => {
    if (rideActive) return;
    setInCurve(false);
    setCurrentCurveMax(0);
    curveEntryQualifiedRef.current = false;
  }, [rideActive]);

  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isSharingSummary, setIsSharingSummary] = useState(false);
  const [showResumeSessionModal, setShowResumeSessionModal] = useState(false);
  const [foodExpenseInput, setFoodExpenseInput] = useState('');

  const memberCountForSplit = useMemo(() => {
    if (!Array.isArray(group?.members) || group.members.length < 1) return 1;
    return group.members.length;
  }, [group?.members]);

  const foodExpenseEurosParsed = useMemo(() => parseEuroAmount(foodExpenseInput), [foodExpenseInput]);
  const splitPerPersonEuros =
    foodExpenseEurosParsed != null && foodExpenseEurosParsed > 0 && memberCountForSplit > 0
      ? Math.round((foodExpenseEurosParsed / memberCountForSplit) * 100) / 100
      : null;

  const prevRecordingRef = useRef(isRecording);
  const recordingStartTimeRef = useRef<number>(0);
  const ridePointsCommittedSessionKeyRef = useRef<string | null>(null);
  /** Máx. km/h en la sesión de grabación actual (GPS). */
  const sessionMaxSpeedKmhRef = useRef(0);

  useEffect(() => {
    if (!rideActive || speed == null || !Number.isFinite(speed)) return;
    const kmh = Math.max(0, speed * 3.6);
    if (kmh > sessionMaxSpeedKmhRef.current) sessionMaxSpeedKmhRef.current = kmh;
  }, [rideActive, speed]);

  useEffect(() => {
    if (isRecording || summaryData) return;
    const draft = readRideDraft();
    if (draft?.summaryData) {
      setSummaryData(draft.summaryData);
      setRecordedPath(Array.isArray(draft.path) ? draft.path : []);
      if (typeof draft.foodExpenseInput === 'string') {
        setFoodExpenseInput(draft.foodExpenseInput);
      }
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
    const logo = await loadSummaryLogo(appIcon);
    const summaryRouteGeo = group?.routeGeoJSON ? parseRouteData(group.routeGeoJSON) : null;
    return renderRouteSummaryCard({
      data: summaryData,
      routeName: group?.name || 'Ruta MotoRide',
      routeCoords: getLineCoordinates(summaryRouteGeo),
      logo,
    });
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
      const shareText = [
        `🏍️ MotoRide — ${group?.name || 'Mi ruta'}`,
        `+${summaryData.score || 0} pts · ${summaryData.distance} km`,
        `Curvas ${summaryData.leftTurns}/${summaryData.rightTurns} · Incl. máx ${summaryData.maxLeanLeft}° / ${summaryData.maxLeanRight}°`,
      ].join('\n');

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

  useEffect(() => {
    if (!isRecording || !ridePaused) {
      setShowResumeSessionModal(false);
      return;
    }
    try {
      if (sessionStorage.getItem(SESSION_PAUSED_KEY) === '1') {
        setShowResumeSessionModal(true);
      }
    } catch {
      /* ignore */
    }
  }, [isRecording, ridePaused, groupId]);

  const commitRidePointsToProfile = useCallback(
    async (stats: {
      distance: number;
      score: number;
      leftTurns: number;
      rightTurns: number;
      maxLeanLeft: number;
      maxLeanRight: number;
      maxSpeedKmh?: number;
    }): Promise<boolean> => {
      if (!user?.uid) return false;
      const userRef = doc(db, 'users', user.uid);
      try {
        const userSnap = await getDoc(userRef);
        const finalScore = stats.score;
        const dist = stats.distance;
        const rideMaxKmh = Math.max(0, Number(stats.maxSpeedKmh) || 0);
        const leanAbs = Math.max(Math.abs(Number(stats.maxLeanLeft) || 0), Math.abs(Number(stats.maxLeanRight) || 0));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const currentPoints = Math.max(0, Math.floor(Number(userData.points) || 0));
          const currentLevel = Math.max(1, Math.floor(Number(userData.level) || 1));
          const { points: newPoints, level: newLevel } = addPointsWithLevelUps(
            currentPoints,
            currentLevel,
            finalScore
          );
          const prevMaxKmh = Math.max(0, Number(userData.statsMaxSpeedKmh) || 0);
          const prevMaxLean = Math.max(0, Number(userData.statsMaxLeanDeg) || 0);
          const ridesDone = Math.max(0, Math.floor(Number(userData.ridesCompletedCount) || 0));
          const hadSample = userData.statsHadSpeedSample === true;
          await updateDoc(userRef, {
            points: newPoints,
            level: newLevel,
            progressModel: PROGRESS_MODEL_VERSION,
            totalDistance: (userData.totalDistance || 0) + dist,
            totalLeftTurns: (userData.totalLeftTurns || 0) + stats.leftTurns,
            totalRightTurns: (userData.totalRightTurns || 0) + stats.rightTurns,
            statsMaxSpeedKmh: Math.max(prevMaxKmh, rideMaxKmh),
            statsMaxLeanDeg: Math.max(prevMaxLean, leanAbs),
            ridesCompletedCount: ridesDone + 1,
            statsHadSpeedSample: hadSample || rideMaxKmh >= 5,
          });
        } else {
          const { points: newPoints, level: newLevel } = addPointsWithLevelUps(0, 1, finalScore);
          await setDoc(userRef, {
            points: newPoints,
            level: newLevel,
            progressModel: PROGRESS_MODEL_VERSION,
            totalDistance: dist,
            totalLeftTurns: stats.leftTurns,
            totalRightTurns: stats.rightTurns,
            statsMaxSpeedKmh: rideMaxKmh,
            statsMaxLeanDeg: leanAbs,
            ridesCompletedCount: 1,
            statsHadSpeedSample: rideMaxKmh >= 5,
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

      const effectivePausedMs =
        (Number(group?.pausedTimeMs) || 0) +
        (ridePaused && typeof group?.ridePauseStartedAt === 'number'
          ? Math.max(0, Date.now() - group.ridePauseStartedAt)
          : 0);
      const rideDuration = Math.max(0, Date.now() - startTime - effectivePausedMs);
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
        maxSpeedKmh: sessionMaxSpeedKmhRef.current,
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
        maxSpeedKmh: currentRideStats.maxSpeedKmh,
      });

      if (!ok) {
        setSummaryData(currentRideStats);
        setShowSummary(true);
        persistRideDraft({
          createdAt: Date.now(),
          summaryData: currentRideStats,
          path: pathSnapshot,
          foodExpenseInput,
        });
        return;
      }

      ridePointsCommittedSessionKeyRef.current = rideSessionKey;
      setSummaryData(currentRideStats);
      setShowSummary(true);
      persistRideDraft({
        createdAt: Date.now(),
        summaryData: currentRideStats,
        path: pathSnapshot,
        foodExpenseInput,
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
      sessionMaxSpeedKmhRef.current = 0;
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
    group?.pausedTimeMs,
    group?.ridePauseStartedAt,
    ridePaused,
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
    foodExpenseInput,
  ]);

  const finalizeRouteLeaveNavigation = useCallback(() => {
    try {
      prepareHistoryLeave?.();
      onLeave();
      if (window.history.state && (window.history.state as { motorideRoute?: boolean }).motorideRoute) {
        window.history.back();
      }
    } catch (e) {
      console.error('finalizeRouteLeaveNavigation:', e);
    }
  }, [prepareHistoryLeave, onLeave]);

  /** Misma fórmula que al finalizar grabación (host): bonus distancia, multiplicadores activos. */
  const computeCurrentSessionRideStats = useCallback(async () => {
    const startTime = group?.startTime ?? recordingStartTimeRef.current;
    if (!user?.uid || !startTime) return null;
    const effectivePausedMs =
      (Number(group?.pausedTimeMs) || 0) +
      (ridePaused && typeof group?.ridePauseStartedAt === 'number'
        ? Math.max(0, Date.now() - group.ridePauseStartedAt)
        : 0);
    const rideDuration = Math.max(0, Date.now() - startTime - effectivePausedMs);
    const distanceBonus = Math.floor(localDistance / 100) * 20;
    try {
      const pointsConfig = await getActivePointsConfig();
      const adjustedBaseScore = Math.round(score * pointsConfig.baseMultiplier);
      const adjustedDistanceBonus = Math.round(distanceBonus * pointsConfig.distanceMultiplier);
      const finalScore = Math.round((adjustedBaseScore + adjustedDistanceBonus) * pointsConfig.eventMultiplier);
      const rideSessionKey = `${user.uid}:${groupId}:${startTime}`;
      return {
        distance: Number(localDistance.toFixed(2)),
        score: finalScore,
        baseScore: adjustedBaseScore,
        distanceBonus: adjustedDistanceBonus,
        leftTurns: leftTurnsRef.current,
        rightTurns: rightTurnsRef.current,
        maxLeanLeft,
        maxLeanRight,
        maxSpeedKmh: sessionMaxSpeedKmhRef.current,
        duration: rideDuration,
        multipliers: pointsConfig,
        rideSessionKey,
      };
    } catch (e) {
      console.error('computeCurrentSessionRideStats:', e);
      return null;
    }
  }, [
    user?.uid,
    groupId,
    group?.startTime,
    group?.pausedTimeMs,
    group?.ridePauseStartedAt,
    ridePaused,
    localDistance,
    score,
    maxLeanLeft,
    maxLeanRight,
  ]);

  const completeParticipantLeaveIfNeeded = useCallback(() => {
    if (!pendingLeaveAfterSummaryRef.current) return;
    pendingLeaveAfterSummaryRef.current = false;
    confirmLeaveInFlightRef.current = false;
    finalizeRouteLeaveNavigation();
  }, [finalizeRouteLeaveNavigation]);

  const confirmLeaveRoute = async () => {
    if (confirmLeaveInFlightRef.current) return;
    confirmLeaveInFlightRef.current = true;
    setExitLeaving(true);
    setShowExitConfirm(false);
    hasExplicitlyLeftRef.current = true;
    /** Evita que el resumen de participante quede detrás del modal de invitar (z-5000) y bloquee nuevos intentos de salida. */
    setShowInviteFriends(false);
    setInviteModalContext(null);
    try {
      const leftGroupOk = await deleteGroupIfHost('leave-route');
      if (!leftGroupOk) {
        hasExplicitlyLeftRef.current = false;
        showMessage({
          variant: 'error',
          title: 'Salir de la ruta',
          message:
            'No se pudo abandonar el grupo en el servidor. Comprueba la conexión y vuelve a intentar. Si el fallo continúa, cierra la pestaña y entra de nuevo.',
        });
        return;
      }

      const startTime = group?.startTime ?? recordingStartTimeRef.current;
      if (!isHost && user && isRecording && startTime) {
        const currentRideStats = await computeCurrentSessionRideStats();
        if (currentRideStats) {
          const pathSnapshot = [...recordedPath];
          const ok = await commitRidePointsToProfile({
            distance: currentRideStats.distance,
            score: currentRideStats.score,
            leftTurns: currentRideStats.leftTurns,
            rightTurns: currentRideStats.rightTurns,
            maxLeanLeft: currentRideStats.maxLeanLeft,
            maxLeanRight: currentRideStats.maxLeanRight,
            maxSpeedKmh: currentRideStats.maxSpeedKmh,
          });

          if (!ok) {
            setSummaryData(currentRideStats);
            persistRideDraft({
              createdAt: Date.now(),
              summaryData: currentRideStats,
              path: pathSnapshot,
              foodExpenseInput,
            });
            setShowSummary(true);
            pendingLeaveAfterSummaryRef.current = true;
            return;
          }

          ridePointsCommittedSessionKeyRef.current = currentRideStats.rideSessionKey;
          setSummaryData(currentRideStats);
          persistRideDraft({
            createdAt: Date.now(),
            summaryData: currentRideStats,
            path: pathSnapshot,
            foodExpenseInput,
          });
          setShowSummary(true);
          pendingLeaveAfterSummaryRef.current = true;
          return;
        }
      }

      finalizeRouteLeaveNavigation();
    } catch (e) {
      console.error('confirmLeaveRoute:', e);
      /** No dejar el flujo bloqueado si falla Firestore u otra operación antes del resumen. */
      pendingLeaveAfterSummaryRef.current = false;
      confirmLeaveInFlightRef.current = false;
    } finally {
      setExitLeaving(false);
      if (!pendingLeaveAfterSummaryRef.current) {
        confirmLeaveInFlightRef.current = false;
      }
    }
  };

  // Record path locally from the moment movement starts
  useEffect(() => {
    if (!rideActive) return;
    if (currentLocation) {
      setRecordedPath(prev => {
        const last = prev[prev.length - 1];
        if (!last || getDistance(currentLocation.lat, currentLocation.lng, last.lat, last.lng) > 10) {
          return [...prev, currentLocation];
        }
        return prev;
      });
    }
  }, [currentLocation, rideActive]);

  // Calculate distance and handle auto-start
  useEffect(() => {
    if (!rideActive) return;
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
        // Anti jitter GPS parado: sin velocidad real no se suma km ni se mueve el ancla
        // (así el jitter no acumula distancia y al arrancar se mide desde el punto de parada).
        const speedKmhNow = typeof speed === 'number' && Number.isFinite(speed) ? speed * 3.6 : null;
        const isMovingNow =
          speedKmhNow !== null ? speedKmhNow >= RIDE_POINTS_RULES.minMovingSpeedKmh : d * 1000 >= 5;
        if (!isMovingNow) return;

        setLocalDistance(prev => {
          const newDist = prev + d;
          
          // En bolsillo no auto-calibrar por distancia: la postura del móvil no es "moto recta" y empeora el offset.

          // Add 1 point per kilometer (d is in km)
          // Only update when we cross a kilometer boundary
          if (rideActive && Math.floor(newDist) > Math.floor(prev)) {
            setScore((s) => s + (Math.floor(newDist) - Math.floor(prev)));
          }

          return newDist;
        });
      }
      lastLocRef.current = currentLocation;
    }
  }, [currentLocation, rideActive, isRecording, isHost, touchLockKind]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const geojson = parseGPX(text);
      const routeCoords = (geojson as GeoJSON.FeatureCollection | null)?.features?.find(
        (f) => f?.geometry?.type === 'LineString'
      )?.geometry as GeoJSON.LineString | undefined;
      const coords = routeCoords?.coordinates;
      if (geojson && coords && coords.length >= 2) {
        try {
          await updateDoc(doc(db, 'groups', groupId), {
            routeGeoJSON: JSON.stringify(geojson),
          });
          setShowSearchModal(false);
          showMessage({
            variant: 'success',
            title: 'Ruta cargada',
            message: 'El archivo GPX se ha añadido al grupo. Verás el trazado en el mapa.',
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
        }
      } else {
        showMessage({
          variant: 'error',
          title: 'GPX',
          message: 'No se pudo leer la ruta. Comprueba que el archivo tenga track o ruta (puntos GPS).',
        });
      }
    } catch (err) {
      console.error('Error reading file:', err);
      showMessage({ variant: 'error', title: 'Archivo', message: 'Error al leer el archivo.' });
    } finally {
      try {
        input.value = '';
      } catch {
        /* ignore */
      }
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
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(typedDestination)}&limit=12&countrycodes=es&addressdetails=1&dedupe=1`;
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
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=12&countrycodes=es&addressdetails=1&dedupe=1`;
        const geoData = await requestJson<any[]>(geocodeUrl, {
          timeoutMs: 9000,
          retries: 1,
          backoffMs: 500,
          headers: { 'User-Agent': 'MoteroApp/1.0 (contact: motorideapp1@gmail.com)' },
        });
        const arr = Array.isArray(geoData) ? geoData : [];
        setSearchSuggestions(sortRoutableNominatimResults(arr, q).slice(0, 8));
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
    const routeName = String(group?.name || 'Ruta Motera').trim() || 'Ruta Motera';
    const ts = typeof group?.scheduledTimestamp === 'number' ? group.scheduledTimestamp : NaN;
    const isScheduled =
      group?.isScheduled === true && Number.isFinite(ts) && ts > 0;

    let clipboardText = url;
    let shareTitle = `Únete a mi ruta: ${routeName}`;
    let shareText = `¡Hola! Únete a mi ruta en tiempo real usando este enlace:`;

    if (isScheduled) {
      const p = buildScheduledInviteSharePayload({
        routeName,
        scheduledTimestamp: ts,
        url,
      });
      clipboardText = p.clipboardText;
      shareTitle = p.title;
      shareText = p.text;
    }

    const copied = await copyTextToClipboard(clipboardText);
    if (!copied) {
      window.prompt(
        isScheduled ? 'Copia este mensaje y enlace para invitar:' : 'Copia este enlace para invitar a tu ruta:',
        clipboardText
      );
      return;
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
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
      setFoodExpenseInput('');
      await requestPermission();
      setIsFollowing(true); // Force following when starting route
      try {
        await updateDoc(doc(db, 'groups', groupId), {
          isRecording: true,
          startTime: Date.now(),
          ridePaused: false,
          pausedTimeMs: 0,
          ridePauseStartedAt: deleteField(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
      }
    } else {
      try {
        let pausedTotal = Number(group?.pausedTimeMs) || 0;
        if (ridePaused && typeof group?.ridePauseStartedAt === 'number') {
          pausedTotal += Math.max(0, Date.now() - group.ridePauseStartedAt);
        }
        await updateDoc(doc(db, 'groups', groupId), {
          isRecording: false,
          ridePaused: false,
          ridePauseStartedAt: deleteField(),
          ...(pausedTotal > 0 ? { pausedTimeMs: Math.round(pausedTotal) } : {}),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
      }
    }
  };

  const toggleRecordingRef = useRef(toggleRecording);
  toggleRecordingRef.current = toggleRecording;

  /** Anfitrión: si aún no grabas y te mueves ~20 m, inicia la grabación (misma lógica que el botón). */
  useEffect(() => {
    if (isRecording) {
      idleMotionBeforeRecordMRef.current = 0;
      idlePrevLocForAutoRecordRef.current = null;
      idleAutoRecordFiringRef.current = false;
      return;
    }
    if (!isHost || groupId === 'REPEATED' || !currentLocation) return;

    const prev = idlePrevLocForAutoRecordRef.current;
    idlePrevLocForAutoRecordRef.current = {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
    };
    if (!prev) return;

    const segmentM = getDistance(
      prev.lat,
      prev.lng,
      currentLocation.lat,
      currentLocation.lng
    );
    if (Number.isFinite(segmentM) && segmentM > 0) {
      idleMotionBeforeRecordMRef.current += segmentM;
    }

    if (
      idleMotionBeforeRecordMRef.current >= AUTO_RECORD_IDLE_METERS &&
      !idleAutoRecordFiringRef.current
    ) {
      idleAutoRecordFiringRef.current = true;
      void Promise.resolve(toggleRecordingRef.current()).finally(() => {
        idleAutoRecordFiringRef.current = false;
      });
    }
  }, [currentLocation, isRecording, isHost, groupId]);

  const toggleRidePause = async () => {
    if (!isHost || !isRecording) return;
    try {
      if (!ridePaused) {
        await updateDoc(doc(db, 'groups', groupId), {
          ridePaused: true,
          ridePauseStartedAt: Date.now(),
        });
        try {
          sessionStorage.setItem(SESSION_PAUSED_KEY, '1');
        } catch {
          /* ignore */
        }
      } else {
        const started = typeof group?.ridePauseStartedAt === 'number' ? group.ridePauseStartedAt : Date.now();
        const delta = Math.max(0, Date.now() - started);
        const prev = Number(group?.pausedTimeMs) || 0;
        await updateDoc(doc(db, 'groups', groupId), {
          ridePaused: false,
          ridePauseStartedAt: deleteField(),
          pausedTimeMs: prev + delta,
        });
        try {
          sessionStorage.removeItem(SESSION_PAUSED_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
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

  /** Caída automática: marcha en curso, ~0 km/h e inclinación ≥ 60° sostenida 3 s. */
  useEffect(() => {
    if (!rideActive || !groupId || groupId === 'REPEATED' || !user?.uid) return;
    const SAMPLE_MS = 200;
    const HOLD_MS = 3000;
    let accumMs = 0;
    let lastSample = Date.now();
    const iv = window.setInterval(() => {
      try {
        const now = Date.now();
        const dt = Math.min(SAMPLE_MS * 2, Math.max(0, now - lastSample));
        lastSample = now;
        if (alertType === 'Caída') {
          accumMs = 0;
          return;
        }
        const speedKmh = (speed ?? 0) * 3.6;
        const nearlyStopped = speedKmh < 1;
        const steepLean = Math.abs(leanAngle) >= 60;
        if (nearlyStopped && steepLean) {
          accumMs += dt;
          if (accumMs >= HOLD_MS) {
            accumMs = 0;
            setAlertType('Caída');
            setShowAlertMenu(false);
            setShowSettings(false);
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(120);
            socket.emit('trigger-alert', {
              groupId,
              uid: user.uid,
              displayName: displayNameToUse,
              type: 'Caída',
              ...(currentLocation &&
              typeof currentLocation.lat === 'number' &&
              typeof currentLocation.lng === 'number'
                ? { lat: currentLocation.lat, lng: currentLocation.lng }
                : {}),
            });
            window.setTimeout(() => setAlertType(null), 30000);
          }
        } else {
          accumMs = 0;
        }
      } catch {
        /* ignore */
      }
    }, SAMPLE_MS);
    return () => {
      window.clearInterval(iv);
    };
  }, [
    rideActive,
    groupId,
    user?.uid,
    speed,
    leanAngle,
    alertType,
    displayNameToUse,
    currentLocation?.lat,
    currentLocation?.lng,
  ]);

  const currentSpeedKmh = speed ? Math.round(speed * 3.6) : 0;
  /** Sin redondear: zoom dinámico suave según velocidad real. */
  const speedKmhForMapFollow = (speed ?? 0) * 3.6;

  // Aviso de curva: próxima curva revirada del trazado, con su velocidad recomendada (ver routeProgress.ts).
  const curveAheadNav = navState.curveAhead ?? null;
  const curveWarn =
    curveWarnEnabled && curveAheadNav
      ? {
          key: curveAheadNav.curve.startM,
          direction: curveAheadNav.curve.direction,
          distM: curveAheadNav.distM,
          recommendedKmh: curveAheadNav.curve.recommendedKmh,
          tooFast: speedKmhForMapFollow > curveAheadNav.curve.recommendedKmh + CURVE_TOO_FAST_MARGIN_KMH,
        }
      : null;
  // Próxima parada: la elegida por el grupo (si hay conexión); sin red, la última elección local.
  const nextStopAhead = voteLive
    ? nextChosenStop(groupChosenStop ? [groupChosenStop] : [], activeChosenIds, navState.alongM ?? null)
    : nextChosenStop(chosenStops, chosenStopIds, navState.alongM ?? null);
  const curveVibratedKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!curveWarn || !curveVibrateEnabled || !curveWarn.tooFast) return;
    if (curveWarn.distM > CURVE_VIBRATE_DISTANCE_M) return;
    if (curveVibratedKeyRef.current === curveWarn.key) return;
    curveVibratedKeyRef.current = curveWarn.key;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([120, 80, 120]);
  }, [curveWarn, curveVibrateEnabled]);
  const isMoving = currentSpeedKmh > 2;
  /** Mapa «rumbo arriba»: rotación CSS del contenedor Leaflet. */
  const mapHeadingRotationActive = isRecording && currentSpeedKmh > 3 && localDistance >= 0.05;
  /** Escala uniforme mínima para que el rectángulo rotado cubra el viewport (evita esquinas grises). */
  const mapRotationCoverScale = useMemo(() => {
    if (!mapHeadingRotationActive) return 1;
    const W = mapRotationShellPx.w;
    const H = mapRotationShellPx.h;
    const rad = (Math.abs(navigationHeading % 360) * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    const denomW = W * absCos + H * absSin;
    const denomH = W * absSin + H * absCos;
    if (!(denomW > 0) || !(denomH > 0)) return 1;
    const s = Math.max(W / denomW, H / denomH);
    if (!Number.isFinite(s) || s < 1) return 1;
    return Math.min(s, 4);
  }, [mapHeadingRotationActive, mapRotationShellPx.w, mapRotationShellPx.h, navigationHeading]);

  const DayWeatherIcon = useMemo(
    () => weatherWmoToLucide(mapWeather.dailyWeatherCode),
    [mapWeather.dailyWeatherCode]
  );

  // Un fallo de permiso de GPS ya no expulsa al anfitrión ni corta la ruta a todos: se muestra el aviso
  // de GPS y el resto del grupo sigue rodando.

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
          title: 'USUARIO HA PARADO',
          card: 'bg-yellow-400 border-yellow-700/60 text-zinc-900',
          badge: 'bg-yellow-900 text-yellow-50',
          sub: 'text-zinc-800',
        };
      case 'Averiado':
        return {
          title: 'USUARIO HA TENIDO UNA AVERÍA',
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

  /**
   * Compañeros que enviaron posición durante la ruta en curso. Se reinicia al empezar una ruta
   * y se guarda como `participantCount` (yo + compañeros) en rideHistory, para el reto «100 km en grupo».
   */
  const ridePeerUidsRef = useRef<Set<string>>(new Set());
  const wasRideActiveRef = useRef(false);
  useEffect(() => {
    if (rideActive && !wasRideActiveRef.current) ridePeerUidsRef.current = new Set();
    wasRideActiveRef.current = rideActive;
  }, [rideActive]);
  useEffect(() => {
    if (!rideActive) return;
    for (const l of otherLocations) {
      if (l.uid && l.offline !== true) ridePeerUidsRef.current.add(l.uid);
    }
  }, [otherLocations, rideActive]);

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
      profileFrameId?: string;
    };
    const rows: RankRow[] = [
      ...otherLocations.map((l) => ({
        ...l,
        isPremium: memberPremiumByUid[l.uid] === true,
        profileFrameId: resolvePeerFrameId(l.profileFrameId ?? memberFrameByUid[l.uid]),
      })),
      ...membersWaitingGps.map((m) => ({ ...m, profileFrameId: resolvePeerFrameId(memberFrameByUid[m.uid]) })),
      {
        uid: user?.uid || '',
        displayName: user?.displayName || 'Tú',
        score,
        photoURL: user?.photoURL,
        level: userLevel,
        isPremium: user?.isPremium === true,
        profileFrameId: selfFrameId,
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
  const headerOverlayHeight = effectiveRouteForNav ? 220 : (!isMoving ? 98 : 0);
  const C = connectionBannerHeight;
  const navHeaderPad = !isMoving ? 86 : 8;

  const firstRowTop = topBelowSafe(edgeGap);

  let belowBanners = edgeGap;
  if (!isOnline) belowBanners += C + 8;

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

  const topStackBelowSafe = edgeGap + C;
  const headerBlockForRanking = !effectiveRouteForNav ? 56 : headerOverlayHeight;
  const rankingExtra = Math.max(
    topStackBelowSafe + peerAlertsStripHeight + headerBlockForRanking + 10,
    edgeGap + C + peerAlertsStripHeight + navHeaderPad + (gpsError ? 72 : 0),
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
             className="flex items-center gap-2 sm:gap-3 hud-land:gap-1.5 mr-surface backdrop-blur-md p-2 hud-land:p-1.5 overflow-hidden min-w-0"
             animate={{ paddingRight: isMoving ? '8px' : '16px' }}
           >
            <button
              type="button"
              onClick={() => {
                setShowInviteFriends(false);
                setInviteModalContext(null);
                setShowExitConfirm(true);
              }}
              className="p-2 bg-white/[0.07] hover:bg-white/[0.13] rounded-full transition-colors text-white shrink-0"
            >
               <ArrowLeft size={18}/>
             </button>
             
             <div className="text-white overflow-hidden pr-2 min-w-0">
               <h2 className="font-display text-xl font-bold uppercase leading-tight tracking-wide break-words line-clamp-2 text-zinc-50">{group?.name || 'Cargando…'}</h2>
               <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0 flex-wrap">
                 <span>Código <strong className="font-mono font-semibold text-orange-400">{groupId}</strong></span>
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
             <div className={`bg-zinc-950/92 backdrop-blur-md border-l-4 border-sky-brand-500 rounded-2xl shadow-[var(--shadow-sheet)] flex flex-col gap-2 hud-land:gap-1 pointer-events-auto mt-2 hud-land:mt-1 max-w-sm hud-land:max-w-[17rem] ring-1 ring-white/10 transition-all duration-300 ${isCompactUI ? 'p-3 hud-land:p-2' : 'p-4'}`}>
               <div className={`flex items-center ${isCompactUI ? 'gap-3 hud-land:gap-2' : 'gap-5'}`}>
                 <div
                   className={`${isCompactUI ? 'w-12 h-12 hud-land:w-10 hud-land:h-10' : 'w-16 h-16'} rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-black/40 ring-2 ring-white/25 bg-[#1f7aa0]`}
                 >
                   {getDirectionIcon(
                     navState.maneuverType,
                     navState.maneuverModifier,
                     isCompactUI ? 34 : 42,
                     navState.roundaboutExit ?? null
                   )}
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className={`${isCompactUI ? 'text-base hud-land:text-sm' : 'text-xl'} text-white font-black leading-tight tracking-tight line-clamp-2 hud-land:line-clamp-1`}>{navState.instruction}</p>
                   {navState.instructionDetail ? (
                     <p className={`${isCompactUI ? 'text-xs hud-land:hidden' : 'text-sm'} text-blue-100/90 font-semibold leading-snug mt-1 line-clamp-2`}>
                       {navState.instructionDetail}
                     </p>
                   ) : null}
                   {navState.distanceToNext !== null && (
                     <div className="mt-1.5">
                       <div className="flex items-baseline gap-1.5">
                         <span className={`${isCompactUI ? 'text-xl hud-land:text-lg' : 'text-2xl'} text-blue-400 font-black tabular-nums`}>
                           {formatNavDistanceMeters(navState.distanceToNext)}
                         </span>
                       </div>
                       {!isCompactUI && (
                         <p className="text-[11px] text-zinc-500 font-medium mt-0.5 leading-snug">
                           {navState.isOnRoute ? 'Por el trazado hasta la maniobra' : 'Distancia en línea recta al trazado'}
                         </p>
                       )}
                     </div>
                   )}
                   {navState.isOnRoute && navState.remainingM != null && navState.etaMs != null && (
                     <p className="mt-1 hud-land:mt-0.5 text-xs text-zinc-300 font-semibold tabular-nums">
                       <span className="hud-land:hidden">
                         {formatNavDistanceMeters(navState.remainingM)} restantes · llegada {formatNavEtaClock(navState.etaMs)}
                         {navState.remainingTimeS != null ? ` (${formatNavDurationS(navState.remainingTimeS)})` : ''}
                         {navState.avgSpeedKmh != null && !navState.avgSpeedObserved ? ` · media ~${navState.avgSpeedKmh} km/h` : ''}
                       </span>
                       <span className="hidden hud-land:inline">
                         {formatNavDistanceMeters(navState.remainingM)} rest. · ETA {formatNavEtaClock(navState.etaMs)}
                       </span>
                     </p>
                   )}
                   {curveWarn && (
                     <div
                       role="status"
                       aria-live="polite"
                       className={`mt-2 hud-land:mt-1 flex max-w-full min-w-0 items-start gap-2 rounded-xl px-2.5 py-1.5 hud-land:py-1 text-xs leading-snug font-bold ring-1 ${
                         curveWarn.tooFast
                           ? 'bg-amber-500/15 text-amber-100 ring-amber-400/40'
                           : 'bg-zinc-900/80 text-zinc-200 ring-white/10'
                       }`}
                     >
                       {curveWarn.direction === 'right' ? (
                         <CornerUpRight size={14} className={curveWarn.tooFast ? 'text-amber-300 shrink-0' : 'text-sky-brand-400 shrink-0'} aria-hidden />
                       ) : (
                         <CornerUpLeft size={14} className={curveWarn.tooFast ? 'text-amber-300 shrink-0' : 'text-sky-brand-400 shrink-0'} aria-hidden />
                       )}
                       <span className="min-w-0 break-words">
                         <span className="hud-land:hidden">
                           Curva {curveWarn.direction === 'right' ? 'a la derecha' : 'a la izquierda'}
                         </span>
                         <span className="hidden hud-land:inline">
                           Curva {curveWarn.direction === 'right' ? 'dcha.' : 'izq.'}
                         </span>
                         {curveWarn.distM > 0 ? ` en ${formatNavDistanceMeters(curveWarn.distM)}` : ' ahora'}
                       </span>
                       <span className="tabular-nums text-white whitespace-nowrap shrink-0">máx. {curveWarn.recommendedKmh} km/h</span>
                     </div>
                   )}
                   {ROUTE_STOPS_ENABLED && nextStopAhead && (
                     <div className="mt-2 hud-land:mt-1 flex max-w-full min-w-0 items-start gap-2 rounded-xl px-2.5 py-1.5 hud-land:py-1 text-xs leading-snug font-bold bg-zinc-900/80 text-zinc-200 ring-1 ring-white/10">
                       <Fuel size={14} className="text-orange-400 shrink-0 mt-0.5" aria-hidden />
                       <span className="min-w-0 break-words">
                         <span className="hud-land:hidden">
                           Próxima parada: {nextStopAhead.stop.name ?? STOP_KIND_LABEL[nextStopAhead.stop.kind]} en {formatNavDistanceMeters(nextStopAhead.distM)}
                         </span>
                         <span className="hidden hud-land:inline">
                           Parada en {formatNavDistanceMeters(nextStopAhead.distM)}
                         </span>
                       </span>
                     </div>
                   )}
                 </div>
               </div>
               {ROUTE_STOPS_ENABLED && (
               <button
                 type="button"
                 onClick={openRouteStops}
                 className="w-full flex items-center justify-center gap-2 py-2 hud-land:py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold"
               >
                 <Fuel size={14} className="text-orange-400 shrink-0" />
                 <span className="hud-land:hidden">Paradas en ruta</span>
                 <span className="hidden hud-land:inline">Paradas</span>
               </button>
               )}
               <button
                 type="button"
                 onClick={() => void cancelNavigation()}
                 className="w-full flex items-center justify-center gap-2 py-2 hud-land:py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold"
               >
                 <Ban size={14} className="text-orange-400 shrink-0" />
                 {isHost ? (
                   <>
                     <span className="hud-land:hidden">Cancelar navegación (quita la ruta para todos)</span>
                     <span className="hidden hud-land:inline">Cancelar ruta</span>
                   </>
                 ) : (
                   <>
                     <span className="hud-land:hidden">Ocultar guía solo en mi pantalla</span>
                     <span className="hidden hud-land:inline">Ocultar guía</span>
                   </>
                 )}
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
           <div className="flex flex-col items-end gap-1 pointer-events-auto">
             <div
               className={`flex flex-col items-end gap-1.5 transition-all duration-300 ${
                 voiceReconnecting ? 'rounded-2xl border border-amber-500/20 bg-zinc-950/85 backdrop-blur-md px-2 py-2 shadow-lg shadow-black/25 ring-1 ring-amber-400/15' : ''
               }`}
             >
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
                 className={`mr-focus flex h-11 w-11 items-center justify-center rounded-full shadow-[var(--shadow-lift)] ring-1 ring-white/[0.09] transition-all duration-300 ease-out relative shrink-0 ${
                   voiceReconnecting
                     ? 'bg-zinc-900 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-2 ring-amber-400/45'
                     : isVoiceActive
                       ? 'bg-emerald-500 text-white shadow-emerald-900/30 hover:bg-emerald-400'
                       : micError
                         ? 'bg-red-900/80 text-red-200 ring-2 ring-red-500/50'
                         : !voiceAllowed
                           ? 'bg-zinc-800 text-amber-400 ring-2 ring-amber-500/35'
                           : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                 }`}
                 title={
                   !voiceAllowed
                     ? 'Voz Premium (o anfitrión con Premium)'
                     : voiceReconnecting
                       ? 'Reconectando chat de voz…'
                       : isVoiceActive
                         ? 'Desconectar voz'
                         : 'Conectar voz (micrófono)'
                 }
               >
                 {voiceReconnecting ? (
                   <Loader2 size={20} strokeWidth={2.25} className="animate-spin text-amber-300" aria-hidden />
                 ) : isVoiceActive ? (
                   <Mic size={20} />
                 ) : !voiceAllowed ? (
                   <Crown size={20} />
                 ) : (
                   <MicOff size={20} />
                 )}
                 {isVoiceActive && !voiceReconnecting && peersCount > 0 && (
                   <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[1rem] h-4 px-0.5 flex items-center justify-center rounded-full ring-2 ring-zinc-950">
                     {peersCount}
                   </span>
                 )}
               </button>
               {voiceReconnecting && (
                 <div className="text-right pr-0.5 pb-0.5 max-w-[10rem]">
                   <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/95">Reconectando</p>
                   <p className="text-[9px] text-zinc-500 mt-0.5 leading-snug">Restaurando enlace de voz</p>
                 </div>
               )}
             </div>
           </div>

           <button
             onClick={() => (isFollowing ? setIsFollowing(false) : recenterMapOnRider())}
             className={`mr-focus flex h-11 w-11 items-center justify-center rounded-full shadow-[var(--shadow-lift)] ring-1 ring-white/[0.09] backdrop-blur-md transition-colors ${isFollowing ? 'bg-sky-brand-500 text-white' : 'bg-zinc-950/85 text-zinc-300 hover:text-white'}`}
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
              className={`mr-focus flex h-11 w-11 items-center justify-center rounded-full shadow-[var(--shadow-lift)] ring-1 ring-white/[0.09] backdrop-blur-md transition-colors ${showAlertMenu ? 'bg-red-500 text-white' : 'bg-zinc-950/85 text-zinc-300 hover:text-white'}`}
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
               className={`mr-focus flex h-11 w-11 items-center justify-center rounded-full shadow-[var(--shadow-lift)] ring-1 ring-white/[0.09] backdrop-blur-md transition-colors ${showSettings ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-950/85 text-zinc-300 hover:text-white'}`}
               title="Menú"
             >
                <Menu size={20} />
              </button>
              
              {showSettings && (
                <div className="absolute top-0 right-14 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-2 sm:p-2.5 shadow-2xl flex flex-col gap-1 min-w-[220px] max-w-[min(90vw,300px)] landscape:min-w-[260px] landscape:max-w-[min(92vw,400px)] landscape:gap-1.5 z-[2001] animate-in fade-in slide-in-from-right-4 duration-200 max-h-[min(calc(100dvh-5rem),calc(100svh-5rem),85vh)] landscape:max-h-[min(88dvh,calc(100dvh-2.5rem))] overflow-y-auto overscroll-contain custom-scrollbar">
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
                    const next = !curveWarnEnabled;
                    setCurveWarnEnabled(next);
                    writeStoredFlag(CURVE_WARN_KEY, next);
                  }}
                  className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                  aria-pressed={curveWarnEnabled}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${curveWarnEnabled ? 'bg-sky-500/20 text-sky-brand-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    <CornerUpRight size={18} />
                  </div>
                  <span className="text-left">
                    Aviso de curvas {curveWarnEnabled ? 'ON' : 'OFF'}
                    <span className="block text-[10px] font-semibold text-zinc-500">Velocidad recomendada en curvas del trazado</span>
                  </span>
                </button>
                {curveWarnEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !curveVibrateEnabled;
                      setCurveVibrateEnabled(next);
                      writeStoredFlag(CURVE_VIBRATE_KEY, next);
                    }}
                    className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                    aria-pressed={curveVibrateEnabled}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${curveVibrateEnabled ? 'bg-sky-500/20 text-sky-brand-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      <Activity size={18} />
                    </div>
                    <span className="text-left">
                      Vibración en curva {curveVibrateEnabled ? 'ON' : 'OFF'}
                      <span className="block text-[10px] font-semibold text-zinc-500">Solo si vas por encima de la velocidad recomendada</span>
                    </span>
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

                 {needsOrientationUserGesture && leanPermissionGranted === false && (
                   <button
                     type="button"
                     onClick={() => {
                       setShowSettings(false);
                       void requestPermission({ manual: true });
                     }}
                     className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                   >
                     <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                       <Target size={18} />
                     </div>
                     Reintentar permiso de movimiento
                   </button>
                 )}

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
          <span>{gpsError}</span>
        </div>
      )}

      {needsOrientationUserGesture && leanPermissionGranted === null && (
        <div
          className="absolute z-[1001] bg-indigo-600 text-white p-3 hud-land:p-2 rounded-xl shadow-xl text-sm hud-land:text-xs flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hud-land:!left-auto hud-land:!right-[4.5rem] hud-land:max-w-[19rem]"
          style={{
            top: leanIosBannerTop,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
            right: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
          role="status"
        >
          <span className="font-medium leading-snug">
            <span className="hud-land:hidden">
              En iPhone MotoRide necesita <strong>permiso de movimiento</strong> para mostrar la inclinación. Lo pedirá <strong>una sola vez</strong>: toca el botón de abajo.
            </span>
            <span className="hidden hud-land:inline">
              Activa el <strong>permiso de movimiento</strong> para la inclinación (se pide una sola vez).
            </span>
          </span>
          <button
            type="button"
            className="shrink-0 bg-white text-indigo-700 font-bold px-4 hud-land:px-3 py-2 hud-land:py-1.5 rounded-xl"
            onClick={() => void requestPermission()}
          >
            <span className="hud-land:hidden">Permitir inclinómetro</span>
            <span className="hidden hud-land:inline">Permitir</span>
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
                      <AvatarFrame frameId={loc.profileFrameId} size={36}>
                        <div
                          className={`rounded-full p-[2px] ${getLevelRingWrapperClass(loc.level || 1, loc.isPremium === true)}`}
                        >
                          <img
                            src={loc.photoURL || 'https://via.placeholder.com/32'}
                            alt=""
                            className="w-8 h-8 rounded-full block bg-zinc-800"
                          />
                        </div>
                      </AvatarFrame>
                      <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-zinc-900">
                        {loc.level || 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white break-words flex items-center gap-1.5 min-w-0">
                        <span className="min-w-0 break-words">{loc.displayName}</span>
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
        <div className="mr-sheet backdrop-blur-2xl rounded-[1.5rem] sm:rounded-[1.75rem] p-1.5 flex items-center gap-1 sm:gap-1.5 pointer-events-auto max-w-[min(100%,calc(100vw-1rem))] min-w-0 overflow-visible landscape:scale-90 landscape:origin-bottom-left">
          
          {/* Speed + tiempo en ubicación — ancho fijo para no empujar Pausa/Finalizar fuera del viewport */}
          <div className="flex flex-col items-center justify-center w-[5rem] sm:w-[6.25rem] shrink-0 py-2 sm:py-3 px-2 sm:px-4 bg-black/25 rounded-[var(--radius-card)] ring-1 ring-white/[0.06] landscape:w-[5rem] landscape:px-2 hud-land:w-[4.25rem] hud-land:py-1.5 hud-land:px-1.5">
            {showHudWeather && (
              <div
                className="flex items-center justify-center gap-1 mb-0.5 sm:mb-1 min-h-[18px] sm:min-h-[20px] w-full hud-land:hidden"
                title="Viento (~10 m). Flecha relativa a tu rumbo (misma base que la flecha GPS): arriba = mismo sentido que llevas; km/h (Open-Meteo)."
              >
                {mapWeather.loading && mapWeather.windSpeedKmh == null ? (
                  <span
                    className="inline-block h-3 w-3 border-2 border-cyan-400/25 border-t-cyan-300/80 rounded-full animate-spin"
                    aria-hidden
                  />
                ) : mapWeather.windSpeedKmh != null && mapWeather.windBlowToDeg != null && windHudArrowRotationDeg != null ? (
                  <>
                    <span className="inline-flex items-center justify-center w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 text-cyan-300">
                      <ArrowUp
                        size={isLandscapeUi ? 13 : 15}
                        strokeWidth={2.5}
                        className="drop-shadow-sm"
                        style={{ transform: `rotate(${windHudArrowRotationDeg}deg)` }}
                        aria-hidden
                      />
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-black tabular-nums text-cyan-100/95 leading-none tracking-tight">
                      {Math.round(mapWeather.windSpeedKmh)}
                      <span className="text-[9px] font-semibold text-zinc-400 ml-0.5">km/h</span>
                    </span>
                  </>
                ) : (
                  <span className="text-[9px] text-zinc-600 tabular-nums">—</span>
                )}
              </div>
            )}
            <div
              className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1 min-h-[22px] sm:min-h-[26px] hud-land:min-h-[18px] hud-land:mb-0"
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
                <span className="flex items-center justify-center">
                  <Crown size={14} className="text-amber-500/80 shrink-0" aria-hidden />
                  <span className="sr-only">Premium</span>
                </span>
              )}
            </div>
            <span className="font-display text-4xl sm:text-6xl hud-land:text-[2.25rem] font-bold leading-none tracking-tight text-zinc-50 tabular-nums inline-block min-w-[3ch] text-center">{currentSpeedKmh}</span>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] text-sky-brand-400 mt-0.5 sm:mt-1 hud-land:mt-0">km/h</span>
          </div>

          {/* Lean Angle & Stats Section */}
          <div className="flex items-center gap-3 sm:gap-6 hud-land:gap-2 px-3 sm:px-6 hud-land:px-2 py-1 sm:py-2 min-w-0">
            {/* Lean Angle Display */}
            <div className="flex flex-col items-center shrink-0">
              <div className="flex justify-between w-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-1 mb-0.5 sm:mb-1 hud-land:mb-0 gap-2 whitespace-nowrap">
                <div className="flex flex-col items-center">
                  <span className="text-blue-400" title="Máxima inclinación a la izquierda">
                    <span className="hud-land:hidden">Izq. </span>{maxLeanLeft}°
                  </span>
                  <span className="text-zinc-500">{leftTurnsRef.current}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-red-500" title="Máxima inclinación a la derecha">
                    <span className="hud-land:hidden">Der. </span>{maxLeanRight}°
                  </span>
                  <span className="text-zinc-500">{rightTurnsRef.current}</span>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center">
                <div className="h-10 sm:h-14 hud-land:h-8 flex items-end justify-center overflow-visible">
                  <div className="scale-[0.55] sm:scale-[0.65] origin-bottom">
                    <MotorcycleIcon angle={leanAngle} />
                  </div>
                </div>
                <div className="mt-1 flex flex-col items-center">
                  <span className="font-display text-2xl sm:text-3xl hud-land:text-xl font-bold leading-none text-zinc-50 tabular-nums">
                    {Math.round(Math.abs(leanAngle))}°
                  </span>
                </div>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="w-px h-10 sm:h-12 bg-white/10 shrink-0" />

            {/* Score & Stop Recording */}
            <div className="flex flex-col gap-1 sm:gap-1.5 hud-land:gap-0.5 min-w-[80px] sm:min-w-[100px] hud-land:min-w-[4.5rem] shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-yellow-500/10 rounded-lg sm:rounded-xl border border-yellow-500/20">
                <Trophy size={12} className="text-yellow-500 sm:w-[14px] sm:h-[14px]" />
                <span className="text-xs sm:text-sm font-black text-white tabular-nums">{score}</span>
              </div>
              
              {isHost && !isRecording && (
                <button
                  type="button"
                  onClick={() => void toggleRecording()}
                  className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-lg transition-all active:scale-95 border border-white/20 bg-gradient-to-r from-orange-500 to-amber-600 hover:brightness-105 w-full"
                  title="Inicia la grabación de la ruta para el grupo (GPS, puntos y resumen)"
                >
                  <Play size={12} className="text-zinc-950 sm:w-[14px] sm:h-[14px]" fill="currentColor" />
                  <span className="text-[10px] sm:text-xs font-black text-zinc-950 uppercase tracking-tight leading-tight text-center">
                    <span className="hud-land:hidden">Iniciar grabación</span>
                    <span className="hidden hud-land:inline">Grabar</span>
                  </span>
                </button>
              )}
              {isHost && isRecording && (
                <div className="flex flex-col gap-1 w-full">
                  <button
                    type="button"
                    onClick={() => void toggleRidePause()}
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl shadow-lg transition-all active:scale-95 border ${
                      ridePaused
                        ? 'bg-emerald-600 hover:bg-emerald-500 border-white/20 shadow-emerald-600/20'
                        : 'bg-amber-600/95 hover:bg-amber-500 border-white/20 shadow-amber-600/20'
                    }`}
                    title={ridePaused ? 'Reanudar grabación de ruta' : 'Pausar (almuerzo, café…) — el grupo sigue activo'}
                  >
                    {ridePaused ? <Play size={12} className="text-white sm:w-[14px] sm:h-[14px]" /> : <Pause size={12} className="text-white sm:w-[14px] sm:h-[14px]" />}
                    <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-tight leading-tight text-center">
                      {ridePaused ? 'Reanudar' : 'Pausa'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleRecording()}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-600 hover:bg-red-700 rounded-lg sm:rounded-xl shadow-lg shadow-red-600/20 transition-all active:scale-95 border border-white/20"
                    title="Finalizar Ruta"
                  >
                    <Square fill="currentColor" size={12} className="text-white sm:w-[14px] sm:h-[14px]" />
                    <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-tight leading-tight">Finalizar</span>
                  </button>
                </div>
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
                          {(() => {
                            const sug = formatNominatimSuggestion(item);
                            return (
                              <>
                                <span className="block font-semibold text-zinc-100">{sug.title}</span>
                                {sug.subtitle && <span className="block text-[11px] text-zinc-500">{sug.subtitle}</span>}
                              </>
                            );
                          })()}
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

      <div
        ref={mapRotationShellRef}
        className="w-full min-h-0 flex-1 relative overflow-hidden bg-[#dfe0e6]"
      >
        <div
          className="w-full h-full min-h-0 transition-transform duration-500 ease-out isolate"
          style={{
            transform: mapHeadingRotationActive
              ? `scale(${mapRotationCoverScale}) rotate(${-navigationHeading}deg)`
              : 'none',
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
        <MapInvalidateHelper layoutKey={`${groupId}-${mapHeadingRotationActive ? 1 : 0}`} />
        <MapTilePrefetchBridge
          mapZoomRef={mapZoomRef}
          mapCenterRef={mapViewportCenterRef}
          onSchedulePrefetch={bumpTilePrefetch}
        />
        <TileLayer
          url={BASE_MAP_TILE_URL}
          /** keepBuffer más grande cuando la rotación está activa (mapa sigue rumbo), con interpolación según velocidad */
          keepBuffer={isRecording && speedKmhForMapFollow > 20 && mapHeadingRotationActive
            ? 700 // Alto buffer para evitar cuadrados vacíos en rotación + velocidad
            : mapHeadingRotationActive
              ? 400 // Rotación activa: buffer generoso
              : 250 // Normal: buffer estándar
          }
          updateWhenIdle={false}
          updateWhenZooming={false}
          maxZoom={20}
          maxNativeZoom={BASE_MAP_MAX_NATIVE_ZOOM}
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
              /** Radar: buffer más grande en rotación activa para evitar huecos */
              keepBuffer={isRecording && speedKmhForMapFollow > 20 && mapHeadingRotationActive
                ? 350
                : mapHeadingRotationActive
                  ? 250
                  : 150
              }
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
        {/* Radares fijos cercanos (≤ 2 km, máx. 8) con su distancia; el resto no se dibuja para no saturar el mapa. */}
        {radarsNearby.map((radar, index) => (
          <Marker
            key={`radar-${radar.lat.toFixed(5)}-${radar.lng.toFixed(5)}-${index}`}
            position={[radar.lat, radar.lng]}
            zIndexOffset={-500}
            icon={L.divIcon({
              html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                <div style="width: 30px; height: 30px; border-radius: 9999px; background: #ffffff; border: 2.5px solid #dc2626; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);">
                  <img src="/RADAR.png" alt="Radar" style="width: 17px; height: 17px; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=&quot;color:#dc2626;font-size:13px;font-weight:900;&quot;>R</span>';" />
                </div>
                <div style="background:rgba(9,9,11,0.82);color:#fff;font:700 10px/1 system-ui,sans-serif;padding:2px 5px;border-radius:6px;white-space:nowrap;">${formatNavDistanceMeters(radar.distanceM)}</div>
              </div>`,
              className: 'custom-radar-icon',
              iconSize: [60, 48],
              iconAnchor: [30, 15]
            })}
          >
            <Popup className="custom-popup">
              <div className="font-semibold text-center">Radar fijo</div>
              <div className="text-xs text-gray-500 text-center">A {formatNavDistanceMeters(radar.distanceM)} en línea recta</div>
            </Popup>
          </Marker>
        ))}

        {/* Other Users' Markers */}
        {markerLocations.map((loc) => (
          <SmoothedPeerMarker
            key={loc.uid}
            targetLat={loc.lat}
            targetLng={loc.lng}
            icon={createAvatarIcon(
              loc.photoURL,
              loc.level,
              loc.isPremium === true,
              resolvePeerFrameId(loc.profileFrameId ?? memberFrameByUid[loc.uid])
            )}
            offline={loc.offline === true}
          >
            <Popup className="custom-popup">
              <div className="font-semibold text-center">{loc.displayName}</div>
              {loc.offline === true ? (
                <div className="text-xs text-amber-600 text-center font-semibold">Sin conexión · reconectando</div>
              ) : null}
              <div className="text-xs text-gray-500 text-center">
                Nivel {loc.level || 1} • {loc.score || 0} pts
                {loc.isPremium ? <div className="mt-1 text-amber-500 font-bold">Premium</div> : null}
              </div>
            </Popup>
          </SmoothedPeerMarker>
        ))}

        {/* Current User Marker (Navigation Arrow) */}
        {mapVisualLocation && typeof mapVisualLocation.lat === 'number' && typeof mapVisualLocation.lng === 'number' && (
          <CurrentUserMarker
            position={[mapVisualLocation.lat, mapVisualLocation.lng]}
            heading={navigationHeading}
            displayNameToUse={displayNameToUse}
            userLevel={userLevel}
            score={score}
            isPremium={user?.isPremium === true}
            subscribeSmooth={subscribeSmoothMap}
          />
        )}

        <MapController
          location={mapVisualLocation}
          bearingForMapOffset={navigationHeading}
          headingRotationActive={mapHeadingRotationActive}
          isFollowing={isFollowing}
          showRanking={showRanking}
          isRecording={isRecording}
          speedKmh={speedKmhForMapFollow}
          hasActiveRoute={!!effectiveRouteForNav}
          isLandscapeUi={isLandscapeUi}
          smoothFollow
          smoothSubscribe={subscribeSmoothMap}
          recenterSignal={recenterSignal}
          followAnchorRef={followAnchorRef}
        />
        {/* Paradas sugeridas: marcadores discretos; verde si están en tu lista de paradas. */}
        {ROUTE_STOPS_ENABLED && routeStops?.map((stop) => {
          const chosen = activeChosenIds.includes(stop.id);
          return (
            <CircleMarker
              key={stop.id}
              center={[stop.lat, stop.lng]}
              radius={6}
              pathOptions={{
                color: '#0d0c0b',
                weight: 2,
                fillColor: chosen ? '#6fd3a6' : '#ffa23d',
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="font-semibold text-center">{stop.name ?? STOP_KIND_LABEL[stop.kind]}</div>
                <div className="text-xs text-gray-500 text-center">
                  {STOP_KIND_LABEL[stop.kind]} · a {Math.round(stop.offRouteM)} m de la ruta
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        <MapFollowGuard
          location={mapVisualLocation}
          isFollowing={isFollowing}
          autoRecenterEnabled={isRecording && !!effectiveRouteForNav}
          followAnchorRef={followAnchorRef}
          onUserMove={handleUserMapMove}
          onAutoRecenter={recenterMapOnRider}
          onOffCenterChange={setMapOffCenter}
        />
          </MapContainer>
        </div>
      </div>
      {ROUTE_STOPS_ENABLED && showRouteStops && (
        <RouteStopsPanel
          candidates={candidates}
          electorateSize={electorateSize}
          voteMode={voteMode}
          loading={routeStopsLoading && !candidates}
          error={routeStopsError && !candidates}
          onToggle={toggleGroupStopVote}
          onRetry={loadRouteStops}
          onClose={() => setShowRouteStops(false)}
        />
      )}
      {/* Ride Summary Modal */}
      <AnimatePresence>
        {showSummary && summaryData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[6200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="relative w-full max-w-md rounded-[2.5rem] p-[1px] my-auto bg-gradient-to-br from-orange-500/50 via-zinc-700/40 to-blue-600/30 shadow-2xl shadow-black/50"
            >
            <div className="relative bg-zinc-950 rounded-[2.45rem] overflow-hidden p-6 sm:p-8 text-center ring-1 ring-white/5">
              <button
                onClick={shareSummaryImage}
                disabled={isSharingSummary}
                className="absolute top-5 right-5 w-11 h-11 rounded-full bg-zinc-800/90 hover:bg-zinc-700 disabled:opacity-50 text-white flex items-center justify-center transition-colors z-10"
                title={isSharingSummary ? 'Generando imagen...' : 'Compartir resumen'}
              >
                <Share2 size={18} />
              </button>
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/25 ring-2 ring-orange-400/20">
                <Trophy size={32} className="text-white drop-shadow-sm" />
              </div>
              
              <h2 className="text-2xl font-black text-white mb-1 tracking-tight">¡Ruta finalizada!</h2>
              <p className="text-zinc-400 font-medium mb-6 text-sm">Resumen de tu sesión en MotoRide</p>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Distancia</p>
                  <p className="text-xl font-black text-white tabular-nums">{summaryData.distance} <span className="text-xs text-zinc-500">km</span></p>
                </div>
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Tiempo</p>
                  <p className="text-xl font-black text-white tabular-nums">
                    {Math.floor(summaryData.duration / 60000)}<span className="text-xs text-zinc-500">m</span> {Math.floor((summaryData.duration % 60000) / 1000)}<span className="text-xs text-zinc-500">s</span>
                  </p>
                </div>
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Vel. Media</p>
                  <p className="text-xl font-black text-white tabular-nums">
                    {summaryData.duration > 0 ? Math.round(summaryData.distance / (summaryData.duration / 3600000)) : 0} <span className="text-xs text-zinc-500">km/h</span>
                  </p>
                </div>
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Curvas Izq./Der.</p>
                  <p className="text-lg font-black text-white tabular-nums">{summaryData.leftTurns} / {summaryData.rightTurns}</p>
                </div>
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Puntos Base</p>
                  <p className="text-xl font-black text-white tabular-nums">+{summaryData.baseScore ?? summaryData.score}</p>
                </div>
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Total + bonus</p>
                  <p className="text-xl font-black text-orange-400 tabular-nums">+{summaryData.score}</p>
                  {summaryData.distanceBonus > 0 && (
                    <p className="text-[10px] text-emerald-400 font-bold mt-1">Bonus distancia: +{summaryData.distanceBonus}</p>
                  )}
                </div>
                <div className="bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 rounded-2xl border border-zinc-800/80 col-span-2 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Inclinación máx.</p>
                  <p className="text-2xl font-black text-white tabular-nums">Izq. {summaryData.maxLeanLeft}° / Der. {summaryData.maxLeanRight}°</p>
                </div>
              </div>

              {isHost && (
                <div className="mb-6 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-left">
                  <div className="mb-2 flex items-center gap-2">
                    <Coffee size={16} className="text-amber-500/90 shrink-0" aria-hidden />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      Gastos comida / bebida (€)
                    </p>
                  </div>
                  <p className="mb-3 text-[11px] text-zinc-500 leading-snug">
                    Opcional. No se incluye en la imagen al compartir. Reparto a escote entre {memberCountForSplit}{' '}
                    {memberCountForSplit === 1 ? 'persona' : 'personas'} del grupo.
                  </p>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Ej. 24,50"
                    value={foodExpenseInput}
                    onChange={(e) => setFoodExpenseInput(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/80"
                  />
                  {foodExpenseEurosParsed != null && foodExpenseEurosParsed > 0 && splitPerPersonEuros != null && (
                    <p className="mt-2 text-xs text-emerald-400/95 font-semibold tabular-nums">
                      Total {foodExpenseEurosParsed.toFixed(2)} € · A pagar por persona ~ {splitPerPersonEuros.toFixed(2)} €
                    </p>
                  )}
                  {foodExpenseInput.trim() !== '' && foodExpenseEurosParsed === null && (
                    <p className="mt-2 text-[11px] text-amber-400/90">Introduce un importe válido (número ≥ 0).</p>
                  )}
                </div>
              )}

              <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">
                Historial solo para rutas mayores a {MIN_KM_TO_SAVE_RIDE_HISTORY} km. Puntos y distancia total en tu perfil
                siempre.
              </p>

              <button
                type="button"
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
                        maxSpeedKmh:
                          typeof summaryData.maxSpeedKmh === 'number' && Number.isFinite(summaryData.maxSpeedKmh)
                            ? summaryData.maxSpeedKmh
                            : 0,
                      });
                      if (!ok) {
                        showMessage({
                          variant: 'error',
                          title: 'Puntos',
                          message:
                            'No se pudieron sumar los puntos al perfil. Revisa la conexión e inténtalo de nuevo.',
                        });
                        return;
                      }
                      ridePointsCommittedSessionKeyRef.current = summaryData.rideSessionKey;
                    }

                    const rideDistanceKm =
                      typeof summaryData.distance === 'number' && Number.isFinite(summaryData.distance)
                        ? summaryData.distance
                        : 0;
                    const shouldPersistHistory = rideDistanceKm > MIN_KM_TO_SAVE_RIDE_HISTORY;

                    if (shouldPersistHistory) {
                      const draft = readRideDraft();
                      const pathForHistory =
                        Array.isArray(draft?.path) && draft.path.length > 0 ? draft.path : recordedPath;
                      const sk = String(summaryData.rideSessionKey || '');
                      const parts = sk.split(':');
                      const startFromKey = parts.length >= 3 ? Number(parts[2]) : NaN;
                      const startTime =
                        Number.isFinite(startFromKey) && startFromKey > 0
                          ? startFromKey
                          : Math.max(0, Date.now() - summaryData.duration);
                      const endTime = Date.now();
                      const historyId = `${user.uid}_${groupId}_${startTime}`;
                      const routeStr =
                        typeof group?.routeGeoJSON === 'string' && group.routeGeoJSON.trim().length > 0
                          ? group.routeGeoJSON
                          : null;
                      await setDoc(
                        doc(db, 'rideHistory', historyId),
                        {
                          uid: user.uid,
                          groupId,
                          groupName: group?.name || 'Ruta',
                          startTime,
                          endTime,
                          distance: summaryData.distance,
                          maxLeanLeft: summaryData.maxLeanLeft,
                          maxLeanRight: summaryData.maxLeanRight,
                          leftTurns: summaryData.leftTurns,
                          rightTurns: summaryData.rightTurns,
                          score: summaryData.score,
                          baseScore: summaryData.baseScore ?? summaryData.score,
                          pointsEarned: summaryData.score,
                          path: pathForHistory,
                          durationMs: summaryData.duration,
                          participantCount: Math.min(100, 1 + ridePeerUidsRef.current.size),
                          ...(sk ? { rideSessionKey: sk } : {}),
                          ...(routeStr ? { routeGeoJSON: routeStr } : {}),
                          ...(foodExpenseEurosParsed != null &&
                          foodExpenseEurosParsed > 0 &&
                          splitPerPersonEuros != null
                            ? {
                                foodExpenseEuros: foodExpenseEurosParsed,
                                splitPerPersonEuros,
                                memberCountForSplit,
                              }
                            : {}),
                        },
                        { merge: true }
                      );
                      showMessage({
                        variant: 'success',
                        title: 'Historial',
                        message: 'Ruta guardada en tu historial.',
                      });
                    } else {
                      showMessage({
                        variant: 'success',
                        title: 'Sesión registrada',
                        message: `Puntos y distancia sumados en tu perfil. Rutas de ${MIN_KM_TO_SAVE_RIDE_HISTORY} km o menos no se guardan en el historial.`,
                      });
                    }

                    clearRideDraft();
                    setFoodExpenseInput('');
                    setShowSummary(false);
                    completeParticipantLeaveIfNeeded();
                  } catch (e) {
                    console.error(e);
                    showMessage({
                      variant: 'error',
                      title: 'Resumen',
                      message: 'No se pudo completar la acción. Inténtalo de nuevo.',
                    });
                  }
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 py-4 font-black text-white shadow-[0_12px_40px_-8px_rgba(234,88,12,0.45)] transition-all hover:brightness-105 active:scale-[0.99]"
              >
                Continuar
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
