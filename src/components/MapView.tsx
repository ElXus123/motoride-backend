import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, Pane } from 'react-leaflet';
import L from 'leaflet';
import { doc, onSnapshot, updateDoc, collection, query, where, addDoc, getDoc, setDoc, arrayRemove } from 'firebase/firestore';
import { db, logOut, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { useLeanAngle } from '../hooks/useLeanAngle';
import { useNavigation } from '../hooks/useNavigation';
import { useNavigationHeading } from '../hooks/useNavigationHeading';
import { snapPointToRouteDetailed } from '../lib/navigationPose';
import { useRoadData } from '../hooks/useRoadData';
import { parseGPX, parseRouteData } from '../lib/gpx';
import { getDistance } from '../lib/geoUtils';
import { requestJson } from '../lib/network';
import { getActivePointsConfig } from '../lib/pointsConfig';
import { fetchRainViewerTileUrl } from '../lib/rainviewer';
import { LEAFLET_TRANSPARENT_ERROR_TILE } from '../lib/leafletTiles';
import socket from '../lib/socket';
import { useVoiceChat } from '../hooks/useVoiceChat';
import PremiumBadge from './PremiumBadge';
import { Upload, ArrowLeft, Copy, Check, Navigation, AlertTriangle, Play, Square, ArrowUp, MapPin, Trophy, Bell, AlertCircle, Wrench, Fuel, X, Maximize, Minimize, Search, Share2, Menu, Moon, Sun, Target, LogOut, Users, Mic, MicOff, ShieldAlert, Activity, Layers, Lock, LockOpen, Smartphone, RotateCw, Crown, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Tile prefetching helpers
const lon2tile = (lon: number, zoom: number) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
const lat2tile = (lat: number, zoom: number) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

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

// Custom icon creator for avatars with level
const createAvatarIcon = (url: string, level: number = 1, isPremium: boolean = false) => {
  const ring = isPremium ? '#f59e0b' : '#f97316';
  const lvlBg = isPremium ? '#d97706' : '#f97316';
  const crown = isPremium
    ? `<div style="position:absolute;top:-5px;left:-3px;width:17px;height:17px;background:linear-gradient(160deg,#fde68a,#f59e0b);border-radius:50%;border:2px solid #18181b;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;">👑</div>`
    : '';
  return L.divIcon({
    className: 'custom-avatar-icon',
    html: `<div style="position: relative; width: 44px; height: 44px;">
             ${crown}
             <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 3px solid ${ring}; background: white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
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
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
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
  <div style={{ transform: `rotate(${angle}deg)`, transformOrigin: 'bottom center', transition: 'transform 0.1s ease-out' }} className="w-24 h-24 flex items-center justify-center">
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

// Component to handle map centering and rotation
const MapController = ({ location, heading, isFollowing, showRanking, isRecording, speedKmh, hasActiveRoute }: { location: any, heading: number | null, isFollowing: boolean, showRanking: boolean, isRecording: boolean, speedKmh: number, hasActiveRoute: boolean }) => {
  const map = useMap();
  const hasAutoZoomedRef = useRef(false);
  
  useEffect(() => {
    if (isFollowing && location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      // Dynamic zoom while recording: start a bit wider so maneuvers stay visible; zoom out slightly as speed rises.
      const speedZoomSteps = Math.floor(Math.max(speedKmh, 0) / 10);
      const dynamicZoom = Math.max(15.4, 17.15 - speedZoomSteps * 0.22);
      const followZoomInitial = hasActiveRoute ? 15.35 : Math.max(map.getZoom(), 17);
      const zoom = isRecording ? dynamicZoom : (hasAutoZoomedRef.current ? map.getZoom() : followZoomInitial);
      const isLandscape = window.innerWidth > window.innerHeight;
      
      if (isLandscape) {
        // Offset center to the right so the bike is on the right side of the screen
        const offsetX = showRanking ? window.innerWidth / 3 : window.innerWidth / 4;
        const targetPoint = map.project([location.lat, location.lng], zoom).subtract([offsetX, 0]);
        const targetLatLng = map.unproject(targetPoint, zoom);
        
        map.setView(targetLatLng, zoom, { animate: true });
      } else {
        map.setView([location.lat, location.lng], zoom, { animate: true });
      }

      if (!hasAutoZoomedRef.current) {
        hasAutoZoomedRef.current = true;
      }
    }
  }, [location, isFollowing, map, showRanking, isRecording, speedKmh, hasActiveRoute]);

  return null;
};

export default function MapView({
  groupId,
  onLeave,
  preloadedRoute,
  prepareHistoryLeave,
}: {
  groupId: string;
  onLeave: () => void;
  preloadedRoute?: string | null;
  prepareHistoryLeave?: () => void;
}) {
  const LOCAL_RIDE_DRAFT_KEY = `motoride_ride_draft_${groupId}`;
  const { user } = useAuth();
  const [customName, setCustomName] = useState<string | null>(null);
  const [customPhotoURL, setCustomPhotoURL] = useState<string | null>(null);
  const [group, setGroup] = useState<any>(null);
  const [memberPremiumByUid, setMemberPremiumByUid] = useState<Record<string, boolean>>({});

  const groupMembersKey = useMemo(() => {
    if (!Array.isArray(group?.members)) return '';
    return [...group.members].filter(Boolean).sort().join('|');
  }, [group?.members]);

  useEffect(() => {
    if (!groupMembersKey) {
      setMemberPremiumByUid({});
      return;
    }
    const ids = groupMembersKey.split('|').filter(Boolean);
    const unsubs = ids.map((uid) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const v = snap.exists() && snap.data()?.isPremium === true;
          setMemberPremiumByUid((prev) => (prev[uid] === v ? prev : { ...prev, [uid]: v }));
        },
        () => {
          setMemberPremiumByUid((prev) => (uid in prev ? { ...prev, [uid]: false } : prev));
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
  const [copied, setCopied] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const lastHeadingRef = useRef<number | null>(null);
  const lastHeadingTimeRef = useRef<number>(Date.now());
  const [showTraffic, setShowTraffic] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
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
  const [pocketRingSession, setPocketRingSession] = useState(0);
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [recordedPath, setRecordedPath] = useState<{lat: number, lng: number}[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  
  // Pocket Mode State
  const [isPocketMode, setIsPocketMode] = useState(false);
  const [pocketCountdown, setPocketCountdown] = useState(30);
  const [isPocketLocked, setIsPocketLocked] = useState(false);
  const [pocketTaps, setPocketTaps] = useState(0);
  const [lastPocketTapTime, setLastPocketTapTime] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [pocketDist, setPocketDist] = useState(0);
  const [hasCalibratedInPocket, setHasCalibratedInPocket] = useState(false);
  const longPressTimerRef = useRef<any>(null);
  const tapResetTimerRef = useRef<any>(null);
  const pocketTapsRef = useRef(0);
  const hasExplicitlyLeftRef = useRef(false);
  const leaveInProgressRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Ensure score is always an integer, rounding up if necessary
  useEffect(() => {
    if (score % 1 !== 0) {
      setScore(Math.ceil(score));
    }
  }, [score]);

  useEffect(() => {
    const onRouteBack = () => {
      setShowExitConfirm((wasOpen) => (wasOpen ? false : true));
    };
    window.addEventListener('motoride:route-back', onRouteBack);
    return () => window.removeEventListener('motoride:route-back', onRouteBack);
  }, []);

  // Rain Viewer: load real tile path from API (paths are hashed; /v2/radar/0 is invalid). Refresh cada 5 min.
  useEffect(() => {
    if (!showWeather) {
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
  }, [showWeather]);

  // Pocket Mode Countdown
  useEffect(() => {
    let timer: any;
    if (isPocketMode && !isPocketLocked && pocketCountdown > 0) {
      timer = setInterval(() => {
        setPocketCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (pocketCountdown === 0 && !isPocketLocked) {
      setIsPocketLocked(true);
      // Vibrate and sound
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
    }
    return () => clearInterval(timer);
  }, [isPocketMode, isPocketLocked, pocketCountdown]);

  useEffect(() => {
    pocketTapsRef.current = pocketTaps;
  }, [pocketTaps]);

  const startPocketLongPressUnlock = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    setIsLongPressing(true);
    longPressTimerRef.current = setTimeout(() => {
      // Unlock!
      setIsPocketLocked(false);
      setIsPocketMode(false);
      setPocketCountdown(30);
      setPocketTaps(0);
      pocketTapsRef.current = 0;
      setIsLongPressing(false);
      setPocketDist(0);
      setHasCalibratedInPocket(false);
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

  const enterPocketMode = async () => {
    setPocketRingSession((s) => s + 1);
    setIsPocketMode(true);
    setPocketCountdown(30);
    setIsPocketLocked(false);
    setPocketTaps(0);
    pocketTapsRef.current = 0;
    setPocketDist(0);
    setHasCalibratedInPocket(false);
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
    setShowSettings(false);

    // Request fullscreen first (required for orientation lock on many devices)
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
        // Small delay to allow fullscreen transition
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.warn("Fullscreen failed for pocket mode", e);
      }
    }

    // Lock to portrait for pocket mode
    // @ts-ignore
    if (screen.orientation && screen.orientation.lock) {
      // @ts-ignore
      screen.orientation.lock('portrait').catch(e => {
        console.warn("Pocket mode orientation lock failed", e);
        if (e.message && e.message.includes('sandboxed')) {
          alert("⚠️ Limitación del Navegador: El bloqueo de orientación está restringido dentro de la vista previa de AI Studio.\n\nPara que el Modo Bolsillo y el Modo Horizontal funcionen correctamente, pulsa el botón de 'Abrir en pestaña nueva' (arriba a la derecha).");
        }
      });
    }
  };
  const [searchDestination, setSearchDestination] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [shared, setShared] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Connection monitoring and auto-reconnection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Force a small refresh of the group data to ensure we are synced
      if (groupId && groupId !== 'REPEATED') {
        getDoc(doc(db, 'groups', groupId)).then(snap => {
          if (snap.exists()) setGroup(snap.data());
        });
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
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
  }, [groupId, isDarkMode]);

  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const [isCompactUI, setIsCompactUI] = useState(window.innerWidth < 420 || window.innerHeight < 760);
  const [viewportTopInset, setViewportTopInset] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const alertsMenuContainerRef = useRef<HTMLDivElement>(null);
  const settingsMenuContainerRef = useRef<HTMLDivElement>(null);
  const rankingPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
      setIsCompactUI(window.innerWidth < 420 || window.innerHeight < 760);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const isRecording = group?.isRecording || false;
  
  const headingHistoryRef = useRef<{heading: number, time: number}[]>([]);
  const angleHistoryRef = useRef<number[]>([]);

  // Activate real-time location tracking
  const { speed, heading, currentLocation, courseOverGround, error: gpsError } = useLocationTracking(true, groupId, { 
    score, 
    alert: alertType ? { type: alertType, timestamp: Date.now() } : null,
    displayName: displayNameToUse,
    photoURL: photoURLToUse,
    level: userLevel,
    isHost
  });
  const { leanAngle: sensorLeanAngle, maxLeanLeft, maxLeanRight, requestPermission, resetMaxLean, calibrate, applyCalibrationStep } = useLeanAngle();
  const [estimatedLeanAngle, setEstimatedLeanAngle] = useState(0);

  // Dynamic Auto-Calibration Logic
  useEffect(() => {
    if (!currentLocation || heading === null) return;
    
    const now = Date.now();
    headingHistoryRef.current.push({ heading, time: now });
    // Keep last 4 seconds for stability check
    if (headingHistoryRef.current.length > 40) headingHistoryRef.current.shift();
    
    angleHistoryRef.current.push(sensorLeanAngle);
    if (angleHistoryRef.current.length > 40) angleHistoryRef.current.shift();

    const currentSpeedKmh = (speed || 0) * 3.6;
    
    // Conditions for dynamic calibration:
    // 1. Speed > 40 km/h (Stable riding speed)
    // 2. Heading is stable (max diff < 1.5 degrees in last 4s)
    // 3. Sensor is relatively stable (not jumping wildly - protection for imprecise devices)
    
    if (currentSpeedKmh > 40 && headingHistoryRef.current.length >= 30) {
      const headings = headingHistoryRef.current.map(h => h.heading);
      const minH = Math.min(...headings);
      const maxH = Math.max(...headings);
      let hDiff = maxH - minH;
      
      // Handle 0/360 wrap around
      if (hDiff > 180) {
        const adjustedHeadings = headings.map(h => h < 180 ? h + 360 : h);
        hDiff = Math.max(...adjustedHeadings) - Math.min(...adjustedHeadings);
      }

      if (hDiff < 1.5) {
        // Check sensor stability (variance check)
        const avgAngle = angleHistoryRef.current.reduce((a, b) => a + b, 0) / angleHistoryRef.current.length;
        const variance = angleHistoryRef.current.reduce((a, b) => a + Math.pow(b - avgAngle, 2), 0) / angleHistoryRef.current.length;
        
        // Only calibrate if readings aren't jumping wildly (variance < 5)
        // This protects against imprecise sensors or very bumpy roads
        if (variance < 5) {
           // Apply a very small correction step towards 0
           // The error is the current sensorLeanAngle (which should be 0 in a straight)
           applyCalibrationStep(sensorLeanAngle, 0.002);
        }
      }
    }
  }, [currentLocation, heading, speed, sensorLeanAngle, applyCalibrationStep]);

  const leftTurnsRef = useRef(0);
  const rightTurnsRef = useRef(0);
  const [parsedRoute, setParsedRoute] = useState<any>(null);

  // Request lean angle permission on mount
  useEffect(() => {
    requestPermission();
  }, []);

  useEffect(() => {
    if (group?.routeGeoJSON) {
      setParsedRoute(parseRouteData(group.routeGeoJSON));
    } else {
      setParsedRoute(null);
    }
  }, [group?.routeGeoJSON]);

  const navState = useNavigation(currentLocation, parsedRoute);
  const navigationHeading = useNavigationHeading(
    heading,
    speed,
    courseOverGround,
    currentLocation,
    parsedRoute,
    navState
  );
  const displayLocation = useMemo(() => {
    if (!currentLocation) return null;
    const snapCandidate = navState.routeGeometry || parsedRoute;
    if (!snapCandidate) return currentLocation;

    const snapped = snapPointToRouteDetailed(currentLocation.lat, currentLocation.lng, snapCandidate);
    if (snapped.distanceMeters <= 42) {
      return { lat: snapped.lat, lng: snapped.lng };
    }
    return currentLocation;
  }, [currentLocation, navState.routeGeometry, parsedRoute]);

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

  const selfPremium = user?.isPremium === true;
  const voiceAllowed = selfPremium || hostIsPremium;

  const { isVoiceActive, toggleVoice, peersCount, micError, clearMicError } = useVoiceChat(groupId, voiceAllowed);

  // Listen to group data
  useEffect(() => {
    if (groupId === 'REPEATED' && preloadedRoute) {
      setGroup({
        name: 'Repitiendo Ruta',
        routeGeoJSON: preloadedRoute,
        isEsporadica: true,
        startTime: Date.now()
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
  }, [groupId, preloadedRoute]);

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
      }, 60000);
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
      if (isHost) {
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
    setShowExitConfirm(false);
    hasExplicitlyLeftRef.current = true;
    await deleteGroupIfHost('leave-route');
    prepareHistoryLeave?.();
    onLeave();
    if (window.history.state && (window.history.state as { motorideRoute?: boolean }).motorideRoute) {
      window.history.back();
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
  }, [groupId, user?.uid, isHost]);

  // GPS-based lean angle estimation (fallback for when phone is in pocket/screen off)
  useEffect(() => {
    if (!isRecording || !currentLocation || speed === null || speed < 5) {
      setEstimatedLeanAngle(0);
      return;
    }

    if (lastHeadingRef.current !== null && heading !== null) {
      const now = Date.now();
      const dt = (now - lastHeadingTimeRef.current) / 1000; // seconds
      
      if (dt > 0.5) { // Update every 0.5s to avoid jitter
        let deltaHeading = heading - lastHeadingRef.current;
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
          
          // Apply direction
          if (angularVelocity < 0) thetaDeg = -thetaDeg;
          
          // Smooth the estimate
          setEstimatedLeanAngle(prev => Math.round(prev * 0.7 + thetaDeg * 0.3));
        } else {
          setEstimatedLeanAngle(prev => Math.round(prev * 0.8));
        }

        lastHeadingRef.current = heading;
        lastHeadingTimeRef.current = now;
      }
    } else if (heading !== null) {
      lastHeadingRef.current = heading;
      lastHeadingTimeRef.current = Date.now();
    }
  }, [currentLocation, heading, speed, isRecording]);

  // Pre-fetch tiles for offline/smooth loading
  useEffect(() => {
    if (!currentLocation) return;
    
    const prefetch = async () => {
      const zoomLevels = [13, 14, 15, 16]; // Multi-level cache around user
      const radiusKm = 5; // Preload ~5km around user
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.max(Math.cos((currentLocation.lat * Math.PI) / 180), 0.2));

      const tileUrls: string[] = [];
      for (const z of zoomLevels) {
        const minX = lon2tile(currentLocation.lng - lngDelta, z);
        const maxX = lon2tile(currentLocation.lng + lngDelta, z);
        const minY = lat2tile(currentLocation.lat + latDelta, z);
        const maxY = lat2tile(currentLocation.lat - latDelta, z);

        for (let x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x++) {
          for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y++) {
            tileUrls.push(
              isDarkMode
                ? `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
                : `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`
            );
          }
        }
      }

      try {
        if ('caches' in window) {
          const cache = await caches.open('map-tiles-v1');
          await Promise.all(
            tileUrls.map(async (url) => {
              const req = new Request(url, { mode: 'no-cors' });
              const cached = await cache.match(req);
              if (!cached) {
                const res = await fetch(req);
                if (res) await cache.put(req, res.clone());
              }
            })
          );
        } else {
          tileUrls.forEach((url) => {
            const img = new Image();
            img.src = url;
          });
        }
      } catch {
        // Prefetch is best-effort; ignore failures.
      }
    };

    // Prefetch every ~1km to avoid excessive traffic
    const lastPrefetchDist = (window as any)._lastPrefetchDist || 0;
    if (Math.abs(localDistance - lastPrefetchDist) > 1) {
      prefetch();
      (window as any)._lastPrefetchDist = localDistance;
    }
  }, [currentLocation, isDarkMode, localDistance]);

  // Use sensor data if available, otherwise fallback to GPS estimate
  const leanAngle = Math.abs(sensorLeanAngle) > 2 ? sensorLeanAngle : estimatedLeanAngle;

  // Curve detection & scoring
  useEffect(() => {
    if (!isRecording) return;
    const absAngle = Math.abs(leanAngle);
    if (absAngle > 20) {
      if (!inCurve) {
        setInCurve(true);
        if (leanAngle > 0) {
          rightTurnsRef.current += 1;
        } else {
          leftTurnsRef.current += 1;
        }
      }
      if (absAngle > currentCurveMax) setCurrentCurveMax(absAngle);
    } else if (absAngle < 5 && inCurve) {
      setInCurve(false);
      const currentSpeed = (speed || 0) * 3.6;
      if (currentSpeed >= 20) {
        setScore(prev => Math.ceil(prev + currentCurveMax));
      }
      setCurrentCurveMax(0);
    }
  }, [leanAngle, isRecording, inCurve, currentCurveMax, speed]);

  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isSharingSummary, setIsSharingSummary] = useState(false);

  useEffect(() => {
    if (isRecording || summaryData) return;
    const draft = readRideDraft();
    if (draft?.summaryData) {
      setSummaryData(draft.summaryData);
      setRecordedPath(Array.isArray(draft.path) ? draft.path : []);
      setShowSummary(true);
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
        alert('No se pudo generar la imagen del resumen.');
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
        alert('Tu dispositivo no permite compartir archivos directamente. Se ha descargado la imagen para que la compartas por WhatsApp o la app que quieras.');
      }
    } catch (err) {
      console.error('Error sharing summary image:', err);
      alert('No se pudo compartir el resumen.');
    } finally {
      setIsSharingSummary(false);
    }
  };

  // Handle start/stop recording for all members
  const prevRecordingRef = useRef(isRecording);
  useEffect(() => {
    const handleStopRecording = async () => {
      if (prevRecordingRef.current && !isRecording && user && group?.startTime) {
        // Stopped - Always update profile stats regardless of history save
        const rideDuration = Date.now() - group.startTime;
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
          multipliers: pointsConfig
        };

        try {
          // Update user points and level (ALWAYS)
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const currentPoints = userData.points || 0;
            const newPoints = currentPoints + finalScore;
            const { level: newLevel } = calculateLevel(newPoints);
            await updateDoc(userRef, {
              points: newPoints,
              level: newLevel,
              totalDistance: (userData.totalDistance || 0) + localDistance,
              totalLeftTurns: (userData.totalLeftTurns || 0) + leftTurnsRef.current,
              totalRightTurns: (userData.totalRightTurns || 0) + rightTurnsRef.current
            });
          } else {
            const { level: newLevel } = calculateLevel(finalScore);
            await setDoc(userRef, {
              points: finalScore,
              level: newLevel,
              totalDistance: localDistance,
              totalLeftTurns: leftTurnsRef.current,
              totalRightTurns: rightTurnsRef.current
            });
          }

          // Show summary modal
          setSummaryData(currentRideStats);
          setShowSummary(true);
          persistRideDraft({
            createdAt: Date.now(),
            summaryData: currentRideStats,
            path: recordedPath
          });

          // Reset local stats
          setRecordedPath([]);
          leftTurnsRef.current = 0;
          rightTurnsRef.current = 0;
          setLocalDistance(0);
          setScore(0);
          resetMaxLean();
        } catch (err: any) {
          console.error("Error updating profile stats:", err);
          handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        }
      }
    };

    handleStopRecording();

    if (!prevRecordingRef.current && isRecording) {
      // Started
      clearRideDraft();
      resetMaxLean();
      setLocalDistance(0);
      setScore(0);
      setRecordedPath([]);
      lastLocRef.current = currentLocation;
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording, user, group?.startTime, localDistance, maxLeanLeft, maxLeanRight, score, groupId, recordedPath, resetMaxLean, currentLocation, group?.name]);

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
          
          // Pocket Mode Auto-Calibration after 20m
          if (isPocketMode && !hasCalibratedInPocket) {
            setPocketDist(p => {
              const next = p + d;
              if (next >= 0.02) { // 20 meters
                calibrate();
                setHasCalibratedInPocket(true);
              }
              return next;
            });
          }

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
  }, [currentLocation, isRecording, isHost, autoStarted]);

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
        alert("No se pudo analizar el archivo GPX o no contiene una ruta válida.");
      }
    } catch (err) {
      console.error("Error reading file:", err);
      alert("Error al leer el archivo.");
    }
  };

  const generateRouteFromSearch = async () => {
    if (!searchDestination || !user) return;
    setIsSearching(true);
    try {
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchDestination)}&limit=1&countrycodes=es&addressdetails=1`;
      const geoData = await requestJson<any[]>(geocodeUrl, {
        timeoutMs: 10000,
        retries: 1,
        backoffMs: 600,
        headers: {
          'User-Agent': 'MoteroApp/1.0 (contact: juarp123@gmail.com)'
        }
      });
      
      let destCoords = "";
      if (geoData && geoData.length > 0) {
        destCoords = `${geoData[0].lon},${geoData[0].lat}`;
      } else if (searchDestination.includes(',')) {
        destCoords = searchDestination;
      } else {
        alert('No se ha podido encontrar el destino. Intenta ser más específico.');
        setIsSearching(false);
        return;
      }

      const start = `${currentLocation?.lng || -3.7038},${currentLocation?.lat || 40.4168}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${start};${destCoords}?overview=full&geometries=geojson`;
      
      const data = await requestJson<any>(url, { timeoutMs: 12000, retries: 1, backoffMs: 700 });
      if (data.code === 'Ok') {
        if (!data.routes?.[0]?.geometry?.coordinates?.length) {
          alert('No se pudo generar una ruta válida para ese destino.');
          return;
        }
        try {
          await updateDoc(doc(db, 'groups', groupId), {
            routeGeoJSON: JSON.stringify(data.routes[0].geometry)
          });
          setShowSearchModal(false);
          setSearchDestination('');
          setSearchSuggestions([]);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
        }
      } else {
        alert('Error al generar la ruta.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión.');
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
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchDestination)}&limit=5&countrycodes=es&addressdetails=1`;
        const geoData = await requestJson<any[]>(geocodeUrl, { timeoutMs: 9000, retries: 1, backoffMs: 500 });
        setSearchSuggestions(Array.isArray(geoData) ? geoData : []);
      } catch {
        setSearchSuggestions([]);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [showSearchModal, searchDestination]);

  const copyCode = () => {
    navigator.clipboard.writeText(groupId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareRoute = () => {
    const url = `${window.location.origin}${window.location.pathname}?join=${groupId}`;
    navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
    
    if (navigator.share) {
      navigator.share({
        title: `Únete a mi ruta: ${group?.name || 'Ruta Motera'}`,
        text: `¡Hola! Únete a mi ruta en tiempo real usando este enlace:`,
        url: url,
      }).catch((err) => {
        if (err.name !== 'AbortError' && err.message !== 'Share canceled') {
          console.error('Share failed:', err);
        }
      });
    }
  };

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

    setTimeout(() => setAlertType(null), 60000); // Clear after 1 min
  };

  const currentSpeedKmh = speed ? Math.round(speed * 3.6) : 0;
  const isMoving = currentSpeedKmh > 2;

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

    if (!so?.lock) {
      alert('Tu navegador no soporta bloquear la orientación.');
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
        alert("⚠️ El bloqueo de orientación no está disponible en esta vista previa. Abre la app en una pestaña normal del navegador.");
      } else {
        alert('No se pudo bloquear el giro. Prueba en pantalla completa o comprueba que la rotación no esté bloqueada a nivel del sistema.');
      }
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'Peligro': return <AlertTriangle size={24} className="shrink-0" />;
      case 'Accidente': return <Activity size={24} className="shrink-0" />;
      case 'Policía': return <ShieldAlert size={24} className="shrink-0" />;
      case 'Repostar': return <Fuel size={24} className="shrink-0" />;
      case 'Caída': return <Activity size={24} className="shrink-0 text-red-100 animate-pulse" />;
      default: return <AlertCircle size={24} className="shrink-0" />;
    }
  };

  const getAlertUi = (type?: string) => {
    switch (type) {
      case 'Parado':
        return {
          title: 'PARADA EN MARGEN',
          card: 'bg-zinc-600 border-zinc-200/35',
          badge: 'bg-zinc-900/60 text-zinc-100'
        };
      case 'Caída':
        return {
          title: 'CAÍDA DETECTADA',
          card: 'bg-red-600 border-red-300/40',
          badge: 'bg-red-800/70 text-red-100'
        };
      case 'Accidente':
        return {
          title: 'ACCIDENTE',
          card: 'bg-orange-600 border-orange-200/40',
          badge: 'bg-orange-900/60 text-orange-100'
        };
      case 'Peligro':
        return {
          title: 'PELIGRO EN VÍA',
          card: 'bg-amber-500 border-amber-200/40',
          badge: 'bg-amber-900/55 text-amber-100'
        };
      case 'Policía':
        return {
          title: 'CONTROL / POLICÍA',
          card: 'bg-blue-600 border-blue-200/40',
          badge: 'bg-blue-900/60 text-blue-100'
        };
      case 'Repostar':
      case 'Repostando':
        return {
          title: 'PARADA A REPOSTAR',
          card: 'bg-emerald-600 border-emerald-200/40',
          badge: 'bg-emerald-900/60 text-emerald-100'
        };
      case 'Averiado':
        return {
          title: 'MOTO AVERIADA',
          card: 'bg-fuchsia-600 border-fuchsia-200/40',
          badge: 'bg-fuchsia-900/60 text-fuchsia-100'
        };
      default:
        return {
          title: type?.toUpperCase() || 'ALERTA',
          card: 'bg-red-500 border-white/25',
          badge: 'bg-zinc-900/40 text-white'
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
    return hDiff < 2;
  };

  const handleSmartCalibration = () => {
    const currentSpeedKmh = (speed || 0) * 3.6;
    const canCalibrateStopped = currentSpeedKmh <= 8;
    const canCalibrateOnStraight = currentSpeedKmh >= 30 && isHeadingStableNow();

    if (canCalibrateStopped || canCalibrateOnStraight) {
      calibrate();
      setShowSettings(false);
      return;
    }

    alert("Para calibrar mejor: hazlo parado o en una recta estable durante unos segundos.");
  };

  const otherLocations = useMemo(
    () => locations.filter(loc => loc.uid !== user?.uid),
    [locations, user?.uid]
  );

  const markerLocations = useMemo(
    () =>
      otherLocations
        .filter((loc) => typeof loc.lat === 'number' && typeof loc.lng === 'number')
        .map((loc) => ({ ...loc, isPremium: memberPremiumByUid[loc.uid] === true })),
    [otherLocations, memberPremiumByUid]
  );

  // Find active alerts from other users
  const activeAlerts = useMemo(
    () => otherLocations.filter(loc => loc.alert && Date.now() - loc.alert.timestamp < 60000),
    [otherLocations]
  );

  const rankingLocations = useMemo(
    () =>
      [
        ...otherLocations.map((l) => ({
          ...l,
          isPremium: memberPremiumByUid[l.uid] === true
        })),
        {
          uid: user?.uid,
          displayName: user?.displayName || 'Tú',
          score: score,
          photoURL: user?.photoURL,
          level: userLevel,
          isPremium: user?.isPremium === true
        }
      ]
        .filter((row) => row.uid)
        .sort((a, b) => (b.score || 0) - (a.score || 0)),
    [otherLocations, user?.uid, user?.displayName, user?.photoURL, user?.isPremium, score, userLevel, memberPremiumByUid]
  );

  // Real participant count: unique UIDs, counting current user once.
  const uniqueOtherUsersCount = new Set(
    locations
      .filter(loc => loc.uid && loc.uid !== user?.uid)
      .map(loc => loc.uid)
  ).size;
  const participantCount = (user ? 1 : 0) + uniqueOtherUsersCount;

  // Dynamic spacing so top overlays never overlap each other.
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const topInset = (isiOS ? 28 : 16) + viewportTopInset;
  const connectionBannerHeight = !isOnline ? 58 : 0;
  const hostBannerHeight = hostLeftRoute && !isHost ? 64 : 0;
  const headerOverlayHeight = parsedRoute ? 220 : (!isMoving ? 98 : 0);
  const headerTopOffset = !isOnline ? topInset + 56 : 0;
  const gpsErrorTop = topInset + connectionBannerHeight + hostBannerHeight + (!isMoving ? 86 : 8);
  const weakTilesBannerTop = gpsErrorTop + (gpsError ? 58 : 0) + 6;
  const topStack = topInset + connectionBannerHeight + hostBannerHeight;
  // Sin navegación paso a paso: avisos lo más arriba posible (solo bajo bandas/barras). Con ruta: bajo el panel azul.
  const screenFreeForAlerts = !parsedRoute;
  const headerBlockForAlerts = screenFreeForAlerts ? 56 : headerOverlayHeight;
  const activeAlertsTop = topStack + headerBlockForAlerts + 10;
  const rankingTop = Math.max(activeAlertsTop, gpsErrorTop + (gpsError ? 72 : 0), topInset + 68);

  return (
    <div ref={containerRef} className="relative w-full min-h-dvh h-dvh flex flex-col bg-zinc-900 overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header overlay */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute left-1/2 -translate-x-1/2 z-[3000] bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-black text-sm border-2 border-white/20 backdrop-blur-md"
            style={{ top: `${topInset}px` }}
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
            style={{ top: `${topInset + connectionBannerHeight + 8}px` }}
          >
            El host ha abandonado la ruta. No se guardará progreso nuevo; se sumarán solo los puntos logrados hasta ese momento.
          </motion.div>
        )}
        {(
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute left-0 right-0 z-[1001] p-4 flex justify-between items-start pointer-events-none"
            style={{ top: `${headerTopOffset}px` }}
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
                 </div>
               </div>
             </div>
           </motion.div>
           )}

           {/* Navigation Instruction */}
           {parsedRoute && (
             <div className={`bg-zinc-950/95 backdrop-blur-md border-l-8 border-blue-500 rounded-2xl shadow-2xl flex items-center pointer-events-auto mt-2 max-w-sm ring-1 ring-white/10 transition-all duration-300 ${isCompactUI ? 'p-3 gap-3' : 'p-5 gap-5'}`}>
               <div className={`${isCompactUI ? 'w-12 h-12' : 'w-16 h-16'} bg-blue-600 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg rotate-3`}>
                 <div className="-rotate-3">
                  {getDirectionIcon(navState.maneuverType, navState.maneuverModifier)}
                 </div>
               </div>
               <div className="flex-1">
                 <p className={`${isCompactUI ? 'text-base' : 'text-xl'} text-white font-black leading-tight tracking-tight`}>{navState.instruction}</p>
                 {navState.instructionDetail ? (
                   <p className={`${isCompactUI ? 'text-xs' : 'text-sm'} text-blue-100/90 font-semibold leading-snug mt-1`}>
                     {navState.instructionDetail}
                   </p>
                 ) : null}
                 {navState.distanceToNext !== null && (
                   <div className="flex items-baseline gap-1 mt-1">
                     <span className={`${isCompactUI ? 'text-xl' : 'text-2xl'} text-blue-400 font-black`}>
                       {navState.distanceToNext >= 1000 ? (navState.distanceToNext / 1000).toFixed(1) : navState.distanceToNext}
                     </span>
                     <span className="text-blue-400/70 font-bold text-sm uppercase">
                       {navState.distanceToNext >= 1000 ? 'km' : 'm'}
                     </span>
                   </div>
                 )}
               </div>
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
                 window.alert(
                   'El chat de voz es Premium. Si el anfitrión de esta ruta tiene Premium, todo el grupo puede usarlo. Si no, puedes obtenerlo apoyando el proyecto (Ko-fi; activación manual). Menú principal → Apoyar proyecto.'
                 );
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
                   onClick={() => { setIsDarkMode(!isDarkMode); setShowSettings(false); }}
                   className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                 >
                   <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-yellow-500/20 text-yellow-500' : 'bg-blue-500/20 text-blue-500'}`}>
                     {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                   </div>
                   Modo {isDarkMode ? 'Claro' : 'Oscuro'}
                 </button>

                <button 
                  onClick={() => { setShowWeather(!showWeather); setShowSettings(false); }}
                  className="flex items-center gap-3 text-white hover:bg-zinc-800 p-3 rounded-2xl text-sm font-bold transition-colors"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${showWeather ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    <Layers size={18} />
                  </div>
                  Capa Lluvia {showWeather ? 'ON' : 'OFF'}
                </button>
                {showWeather && weatherFetchFailed && (
                  <p className="text-[11px] text-amber-400/90 px-3 -mt-2 mb-1 leading-snug">
                    No se pudo cargar el radar ahora. Revisa la conexión; se reintentará al abrir ajustes o cada 10 min.
                  </p>
                )}
                {showWeather && !weatherFetchFailed && rainRadar && !weatherTilesLoaded && (
                  <p className="text-[11px] text-zinc-500 px-3 -mt-2 mb-1 leading-snug">
                    Cargando radar de lluvia...
                  </p>
                )}
                {showWeather && !weatherFetchFailed && rainRadar && weatherTilesLoaded && weatherTileErrors === 0 && (
                  <p className="text-[11px] text-emerald-400/90 px-3 -mt-2 mb-1 leading-snug">
                    Radar activo. Si no ves colores, puede que no haya precipitación en la zona.
                  </p>
                )}
                {showWeather && !weatherFetchFailed && rainRadar && weatherTileErrors > 2 && (
                  <p className="text-[11px] text-red-400/90 px-3 -mt-2 mb-1 leading-snug">
                    Problema cargando teselas del radar ({weatherTileErrors}). Prueba a desactivar/activar la capa.
                  </p>
                )}

                <button 
                  onClick={() => {
                    setShowSettings(false);
                    handleSmartCalibration();
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
        <div className="absolute left-4 right-4 z-[1000] bg-red-500 text-white p-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2" style={{ top: `${gpsErrorTop}px` }}>
          <AlertTriangle size={18} className="shrink-0" />
          <span>Sin señal GPS, reconectando...</span>
        </div>
      )}

      {isOnline && weakMapTilesNotice && (
        <div
          className="absolute left-4 right-4 z-[1000] bg-amber-600/95 text-black p-3 rounded-xl shadow-xl text-xs sm:text-sm font-semibold flex items-start gap-3 border border-amber-400/40"
          style={{ top: `${weakTilesBannerTop}px` }}
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

      {/* Avisos de otros: abajo, encima del HUD velocidad — no tapa cabecera ni menús (z por debajo de z-[1001]). */}
      {activeAlerts.length > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[990] flex flex-col-reverse gap-2 w-full max-w-sm px-4 pointer-events-none"
          style={{
            bottom: isLandscape
              ? 'calc(10rem + env(safe-area-inset-bottom, 0px))'
              : 'calc(12.5rem + env(safe-area-inset-bottom, 0px))',
          }}
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
            const distStr = dist ? (dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`) : '';
            const alertUi = getAlertUi(loc.alert?.type);
            return (
              <div key={loc.uid} className={`${alertUi.card} text-white p-3 rounded-2xl shadow-2xl border flex items-center gap-3`}>
                <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
                  {getAlertIcon(loc.alert?.type || '')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-[11px] tracking-wide">{alertUi.title}</p>
                    {distStr && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${alertUi.badge}`}>{distStr}</span>}
                  </div>
                  <p className="font-semibold truncate">{loc.displayName || 'Motero'}</p>
                  <p className="text-xs opacity-90">Aviso en tu ruta</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-route-title"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
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
                onClick={() => void confirmLeaveRoute()}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl font-bold text-white bg-orange-600 hover:bg-orange-500 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pocket Mode Overlay */}
      <AnimatePresence>
        {isPocketMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[5000] bg-black flex flex-col items-center justify-center select-none touch-none"
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
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Modo Bolsillo</h2>
                  <p className="text-zinc-400 text-sm max-w-[200px] mx-auto">Guarda el móvil en tu bolsillo. Se bloqueará automáticamente.</p>
                </div>
                <button 
                  onClick={() => {
                    releaseOrientationLockUi();
                    setIsPocketMode(false);
                  }}
                  className="px-6 py-3 bg-zinc-800 text-white rounded-2xl font-bold text-sm"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-12">
                <motion.div
                  animate={{ 
                    scale: isLongPressing ? 1.2 : 1,
                    opacity: isLongPressing ? 1 : 0.5
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
                        transition={{ duration: 1.5, ease: "linear" }}
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
                        {[1, 2, 3].map(i => (
                          <div 
                            key={i} 
                            className={`w-3 h-3 rounded-full transition-colors duration-200 ${pocketTaps >= i ? 'bg-orange-500' : 'bg-zinc-800'}`} 
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
            className={`absolute left-4 z-[1001] bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-2xl p-4 shadow-2xl w-64 pointer-events-auto transition-all duration-500 ${
              isLandscape 
                ? 'bottom-40 flex flex-col max-h-[46vh]' 
                : ''
            }`}
            style={{ top: isLandscape ? undefined : `${rankingTop}px` }}
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
                    <div className="relative">
                      <img src={loc.photoURL || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-full border border-zinc-700" />
                      <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-zinc-900">
                        {loc.level || 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{loc.displayName}</span>
                        {loc.isPremium ? <PremiumBadge compact /> : null}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono">{loc.score || 0} pts</p>
                    </div>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Overlay */}
      <div className={`absolute left-0 right-0 z-[1000] pointer-events-none flex justify-center px-2 sm:px-4 landscape:justify-start landscape:left-4 landscape:right-auto ${isLandscape ? 'landscape:bottom-3' : 'bottom-5'}`}>
        <div className="bg-zinc-950/90 backdrop-blur-3xl rounded-[2rem] sm:rounded-[2.5rem] p-1.5 border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] flex items-center gap-0.5 sm:gap-1 pointer-events-auto max-w-full overflow-hidden landscape:scale-90 landscape:origin-bottom-left">
          
          {/* Speed Section */}
          <div className="flex flex-col items-center justify-center min-w-[80px] sm:min-w-[120px] py-2 sm:py-3 px-3 sm:px-6 bg-white/5 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 shrink-0 landscape:min-w-[80px] landscape:px-3">
            <span className="text-3xl sm:text-5xl font-black leading-none tracking-tighter text-white tabular-nums">{currentSpeedKmh}</span>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-blue-400 mt-0.5 sm:mt-1">km/h</span>
          </div>

          {/* Lean Angle & Stats Section */}
          <div className="flex items-center gap-3 sm:gap-6 px-3 sm:px-6 py-1 sm:py-2 min-w-0">
            {/* Lean Angle Display */}
            <div className="flex flex-col items-center shrink-0">
              <div className="flex justify-between w-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-1 mb-0.5 sm:mb-1">
                <div className="flex flex-col items-center">
                  <span className={maxLeanLeft > 35 ? "text-red-500" : "text-blue-400"}>Izq. {maxLeanLeft}°</span>
                  <span className="text-zinc-500">{leftTurnsRef.current}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className={maxLeanRight > 35 ? "text-red-500" : "text-orange-400"}>Der. {maxLeanRight}°</span>
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
                  <span className="text-lg sm:text-2xl font-black leading-none text-white tabular-nums">{Math.abs(leanAngle)}°</span>
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
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                      <input 
                        placeholder="¿A dónde quieres ir?" 
                        value={searchDestination}
                        onChange={(e) => setSearchDestination(e.target.value)}
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
                            setSearchDestination(item.display_name || '');
                            setSearchSuggestions([]);
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

      <div className="w-full flex-1 relative overflow-hidden bg-zinc-900">
        <div 
          className="w-full h-full transition-transform duration-500 ease-out"
          style={{
            transform: isRecording && currentSpeedKmh > 3 && localDistance >= 0.05 ? `rotate(${-navigationHeading}deg)` : 'none',
            transformOrigin: 'center center',
            willChange: isRecording && currentSpeedKmh > 5 ? 'transform' : 'auto',
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
          layoutKey={`${isRecording && currentSpeedKmh > 3 && localDistance >= 0.05 ? 1 : 0}_${isDarkMode ? 1 : 0}`}
        />
        <TileLayer 
          url={isDarkMode 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          } 
          subdomains="abcd"
          keepBuffer={280}
          updateWhenIdle={false}
          updateWhenZooming={false}
          maxZoom={20}
          maxNativeZoom={19}
          crossOrigin
          className="motoride-base-tiles"
          errorTileUrl={LEAFLET_TRANSPARENT_ERROR_TILE}
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
        {showWeather && rainRadar && (
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
        {parsedRoute && (
          <GeoJSON 
            key={group?.routeGeoJSON?.length || 'route'} // Force re-render when route changes
            data={parsedRoute} 
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

        <MapController location={displayLocation} heading={currentSpeedKmh > 2 ? navigationHeading : 0} isFollowing={isFollowing} showRanking={showRanking} isRecording={isRecording} speedKmh={currentSpeedKmh} hasActiveRoute={!!parsedRoute} />
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
                    try {
                      await addDoc(collection(db, 'rideHistory'), {
                        uid: user?.uid,
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
                        path: recordedPath
                      });
                      clearRideDraft();
                      setShowSummary(false);
                      alert("Ruta guardada en tu historial.");
                    } catch (e) {
                      console.error(e);
                      alert("Error al guardar en el historial.");
                    }
                  }}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-orange-500/20"
                >
                  Guardar en Historial
                </button>
                <button 
                  onClick={() => {
                    clearRideDraft();
                    setShowSummary(false);
                  }}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all"
                >
                  No guardar (solo estadísticas)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
