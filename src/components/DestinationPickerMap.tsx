import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { BASE_MAP_ATTRIBUTION, BASE_MAP_MAX_NATIVE_ZOOM, BASE_MAP_TILE_URL, LEAFLET_LIGHT_ERROR_TILE } from '../lib/leafletTiles';

export type DestinationPin = { lat: number; lon: number };

/** Chincheta en SVG (sin imágenes de Leaflet, que se rompen con Vite). touch-action none: arrastrar sin scroll. */
const PIN_ICON = L.divIcon({
  className: 'mr-dest-pin',
  iconSize: [34, 42],
  iconAnchor: [17, 40],
  html:
    '<div style="touch-action:none;width:34px;height:42px">' +
    '<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M17 1C8.2 1 1 8.2 1 17c0 11.6 14.6 23.3 15.2 23.8a2.3 2.3 0 0 0 2.6 0C18.4 40.3 33 28.6 33 17 33 8.2 25.8 1 17 1z" fill="#ffa23d" stroke="#131210" stroke-width="2"/>' +
    '<circle cx="17" cy="17" r="6" fill="#131210"/>' +
    '</svg></div>',
});

const SPAIN_CENTER: [number, number] = [40.4168, -3.7038];

/**
 * Mapa para fijar el destino de una ruta planificada. Va en su propio módulo y se carga con `lazy()`.
 * Toque o pulsación larga fija la chincheta; la chincheta se arrastra para ajustarla.
 */
export default function DestinationPickerMap({
  pin,
  onPick,
}: {
  pin: DestinationPin | null;
  onPick: (lat: number, lon: number) => void;
}) {
  return (
    <MapContainer
      center={pin ? [pin.lat, pin.lon] : SPAIN_CENTER}
      zoom={pin ? 13 : 6}
      className="w-full h-full"
      zoomControl={true}
      fadeAnimation={false}
    >
      <TileLayer
        url={BASE_MAP_TILE_URL}
        attribution={BASE_MAP_ATTRIBUTION}
        maxNativeZoom={BASE_MAP_MAX_NATIVE_ZOOM}
        keepBuffer={120}
        updateWhenIdle={false}
        detectRetina={false}
        crossOrigin
        className="motoride-base-tiles"
        errorTileUrl={LEAFLET_LIGHT_ERROR_TILE}
      />
      <PickOnMap onPick={onPick} />
      {pin ? (
        <Marker
          position={[pin.lat, pin.lon]}
          icon={PIN_ICON}
          draggable={true}
          keyboard={false}
          eventHandlers={{
            dragend: (e) => {
              const ll = e.target.getLatLng();
              onPick(ll.lat, ll.lng);
            },
          }}
        />
      ) : null}
      {!pin ? <CenterOnUserOnce /> : null}
    </MapContainer>
  );
}

function PickOnMap({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  // Tocar la propia chincheta no debe moverla: solo cuenta lo que pasa sobre el mapa.
  const onPinTarget = (ev: Event | undefined) => {
    const t = ev?.target as HTMLElement | null | undefined;
    return !!t?.closest?.('.leaflet-marker-icon');
  };
  useMapEvents({
    click(e) {
      if (onPinTarget(e.originalEvent)) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
    // Pulsación larga en Android/escritorio (el navegador lanza contextmenu al mantener pulsado).
    contextmenu(e) {
      e.originalEvent?.preventDefault?.();
      if (onPinTarget(e.originalEvent)) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Centra el mapa en la posición GPS una sola vez si aún no hay chincheta; si no hay permiso, se queda en España. */
function CenterOnUserOnce() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!active) return;
        map.setView([pos.coords.latitude, pos.coords.longitude], 11, { animate: false });
      },
      () => {
        /* sin permiso: se queda en la vista de España */
      },
      { timeout: 8000, maximumAge: 120000, enableHighAccuracy: false }
    );
    return () => {
      active = false;
    };
  }, [map]);
  return null;
}
