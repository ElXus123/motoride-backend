import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../contexts/AuthContext';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationData {
  uid: string;
  lat: number;
  lng: number;
  timestamp: number;
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
}

interface MapProps {
  locations: LocationData[];
  users: Record<string, UserProfile>;
  routeGeoJSON?: any;
}

const MapController = ({ locations }: { locations: LocationData[] }) => {
  const map = useMap();
  const { user } = useAuth();
  const [hasCentered, setHasCentered] = useState(false);

  useEffect(() => {
    if (!hasCentered && user && locations.length > 0) {
      const myLoc = locations.find(l => l.uid === user.uid);
      if (myLoc) {
        map.setView([myLoc.lat, myLoc.lng], 14);
        setHasCentered(true);
      }
    }
  }, [locations, user, map, hasCentered]);

  return null;
};

const createCustomIcon = (photoURL: string) => {
  return L.divIcon({
    className: 'custom-avatar-marker',
    html: `<div class="w-10 h-10 rounded-full border-2 border-orange-500 overflow-hidden shadow-lg bg-white flex items-center justify-center">
             ${photoURL ? `<img src="${photoURL}" class="w-full h-full object-cover" />` : `<span class="text-gray-500 text-xs">User</span>`}
           </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

export const Map: React.FC<MapProps> = ({ locations, users, routeGeoJSON }) => {
  return (
    <div className="w-full h-full relative z-0">
      <MapContainer 
        center={[40.4168, -3.7038]} 
        zoom={6} 
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {routeGeoJSON && (
          <GeoJSON 
            data={routeGeoJSON} 
            style={{
              color: '#f97316',
              weight: 5,
              opacity: 0.8
            }}
          />
        )}

        {locations.map((loc) => {
          const userProfile = users[loc.uid];
          if (!userProfile) return null;
          
          if (Date.now() - loc.timestamp > 15 * 60 * 1000) return null;

          return (
            <Marker 
              key={loc.uid} 
              position={[loc.lat, loc.lng]}
              icon={createCustomIcon(userProfile.photoURL)}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-bold">{userProfile.displayName}</p>
                  <p className="text-xs text-gray-500">
                    Actualizado: {new Date(loc.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
        
        <MapController locations={locations} />
      </MapContainer>
    </div>
  );
};
