import React, { useState, useRef } from 'react';
import { doc, setDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { parseGPX } from '../lib/gpx';
import { Users, Upload, Plus, LogIn } from 'lucide-react';

interface GroupPanelProps {
  currentGroup: any;
  setCurrentGroupId: (id: string | null) => void;
}

export const GroupPanel: React.FC<GroupPanelProps> = ({ currentGroup, setCurrentGroupId }) => {
  const { user } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    
    const groupId = Math.random().toString(36).substring(2, 9);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
      await setDoc(doc(db, 'groups', groupId), {
        name: newGroupName,
        code,
        createdBy: user.uid,
        members: [user.uid],
        routeGeoJSON: null
      });
      setCurrentGroupId(groupId);
      setNewGroupName('');
      setIsCreating(false);
    } catch (error) {
      console.error("Error creating group:", error);
      alert("Error al crear el grupo");
    }
  };

  const handleJoinGroup = async () => {
    if (!user || !joinCode.trim()) return;
    
    try {
      const groupRef = doc(db, 'groups', joinCode);
      const groupSnap = await getDoc(groupRef);
      
      if (groupSnap.exists()) {
        await updateDoc(groupRef, {
          members: arrayUnion(user.uid)
        });
        setCurrentGroupId(joinCode);
        setJoinCode('');
        setIsJoining(false);
      } else {
        alert("Grupo no encontrado. Asegúrate de usar el ID correcto.");
      }
    } catch (error) {
      console.error("Error joining group:", error);
      alert("Error al unirse al grupo");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentGroup || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const gpxString = event.target?.result as string;
      const geojson = parseGPX(gpxString);
      
      if (geojson) {
        try {
          await updateDoc(doc(db, 'groups', currentGroup.id), {
            routeGeoJSON: JSON.stringify(geojson)
          });
          alert("Ruta cargada exitosamente");
        } catch (error) {
          console.error("Error uploading route:", error);
          alert("Error al subir la ruta");
        }
      } else {
        alert("Error al procesar el archivo GPX");
      }
    };
    reader.readAsText(file);
  };

  if (currentGroup) {
    return (
      <div className="bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-6 pb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{currentGroup.name}</h2>
            <p className="text-sm text-gray-500 font-mono">ID para unirse: {currentGroup.id}</p>
          </div>
          <button 
            onClick={() => setCurrentGroupId(null)}
            className="text-sm text-orange-600 font-medium px-3 py-1 bg-orange-50 rounded-full"
          >
            Salir
          </button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2 text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
            <Users size={18} />
            <span className="font-medium">{currentGroup.members?.length || 0} moteros</span>
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors flex-1 justify-center"
          >
            <Upload size={18} />
            <span>Subir GPX</span>
          </button>
          <input 
            type="file" 
            accept=".gpx" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-6 pb-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tus Rutas</h2>
      
      <div className="flex flex-col gap-4">
        {!isCreating && !isJoining ? (
          <>
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center justify-center gap-2 w-full bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
            >
              <Plus size={20} />
              Crear nuevo grupo
            </button>
            <button 
              onClick={() => setIsJoining(true)}
              className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-800 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              <LogIn size={20} />
              Unirse a un grupo
            </button>
          </>
        ) : isCreating ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <input 
              type="text" 
              placeholder="Nombre del grupo" 
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setIsCreating(false)}
                className="flex-1 py-3 rounded-xl font-medium text-gray-600 bg-gray-100"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateGroup}
                className="flex-1 py-3 rounded-xl font-medium text-white bg-orange-500"
              >
                Crear
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <input 
              type="text" 
              placeholder="ID del grupo" 
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono uppercase"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setIsJoining(false)}
                className="flex-1 py-3 rounded-xl font-medium text-gray-600 bg-gray-100"
              >
                Cancelar
              </button>
              <button 
                onClick={handleJoinGroup}
                className="flex-1 py-3 rounded-xl font-medium text-white bg-orange-500"
              >
                Unirse
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
