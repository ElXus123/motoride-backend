import { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { parseRouteData } from '../lib/gpx';
import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_NATIVE_ZOOM,
  BASE_MAP_TILE_URL,
  LEAFLET_LIGHT_ERROR_TILE,
} from '../lib/leafletTiles';

/**
 * Vista previa de una ruta programada (mapa Leaflet). Va en su propio módulo y se carga con
 * `lazy()` desde Dashboard para que Leaflet no entre en el arranque de la pantalla de inicio.
 */
export default function RoutePreviewMap({ routeGeoJSON }: { routeGeoJSON: string | null | undefined }) {
  const parsed = routeGeoJSON ? parseRouteData(routeGeoJSON) : null;
  return (
    <MapContainer
      center={[40.4168, -3.7038]}
      zoom={6}
      className="w-full h-full"
      zoomControl={true}
      fadeAnimation={false}
    >
      <TileLayer
        url={BASE_MAP_TILE_URL}
        attribution={BASE_MAP_ATTRIBUTION}
        maxNativeZoom={BASE_MAP_MAX_NATIVE_ZOOM}
        keepBuffer={200}
        updateWhenIdle={false}
        updateWhenZooming
        detectRetina={false}
        crossOrigin
        className="motoride-base-tiles"
        errorTileUrl={LEAFLET_LIGHT_ERROR_TILE}
      />
      {parsed && (
        <GeoJSON data={parsed as any} style={{ color: '#f97316', weight: 5, opacity: 0.8 }} />
      )}
      {routeGeoJSON ? <PreviewBounds route={routeGeoJSON} /> : null}
    </MapContainer>
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
