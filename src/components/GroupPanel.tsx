import React, { useState, useRef } from 'react';
import { doc, setDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { parseGPX } from '../lib/gpx';
import { Users, Upload, Plus, LogIn } from 'lucide-react';

interface GroupPanelProps {
  currentGroup: any;
  setCurrentGroupId: (id: string | null) => void;
}

export const GroupPanel: React.FC<GroupPanelProps> = ({ currentGroup, setCurrentGroupId }) => {
  const { user } = useAuth();
  const showMessage = useAppMessage();
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
      showMessage({ variant: 'error', title: 'Grupo', message: 'Error al crear el grupo.' });
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
        showMessage({ variant: 'error', title: 'Grupo', message: 'Grupo no encontrado. Asegúrate de usar el ID correcto.' });
      }
    } catch (error) {
      console.error("Error joining group:", error);
      showMessage({ variant: 'error', title: 'Grupo', message: 'Error al unirse al grupo.' });
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
          showMessage({ variant: 'success', title: 'Ruta', message: 'Ruta cargada correctamente.' });
        } catch (error) {
          console.error("Error uploading route:", error);
          showMessage({ variant: 'error', title: 'Ruta', message: 'Error al subir la ruta.' });
        }
      } else {
        showMessage({ variant: 'error', title: 'GPX', message: 'Error al procesar el archivo GPX.' });
      }
    };
    reader.readAsText(file);
  };

  if (currentGroup) {
    return (
      <div className="mr-sheet rounded-t-[var(--radius-sheet)] rounded-b-none border-b-0 p-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-3xl uppercase text-zinc-50">{currentGroup.name}</h2>
            <p className="font-mono text-xs text-zinc-500">ID para unirse: {currentGroup.id}</p>
          </div>
          <button 
            onClick={() => setCurrentGroupId(null)}
            className="mr-focus rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/20"
          >
            Salir
          </button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] bg-white/[0.04] px-3 py-2 text-zinc-300">
            <Users size={18} />
            <span className="font-medium">{currentGroup.members?.length || 0} moteros</span>
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="mr-focus flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-orange-500 px-4 py-2 font-bold text-mr-on-accent transition-colors hover:bg-orange-400"
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
    <div className="mr-sheet rounded-t-[var(--radius-sheet)] rounded-b-none border-b-0 p-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] sm:p-6">
      <h2 className="mb-5 text-3xl uppercase text-zinc-50">Tus grupos</h2>
      
      <div className="flex flex-col gap-4">
        {!isCreating && !isJoining ? (
          <>
            <button 
              onClick={() => setIsCreating(true)}
              className="mr-focus flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-orange-500 py-3 font-bold text-mr-on-accent transition-colors hover:bg-orange-400"
            >
              <Plus size={20} />
              Crear grupo
            </button>
            <button 
              onClick={() => setIsJoining(true)}
              className="mr-focus flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-white/[0.1] bg-white/[0.04] py-3 font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08]"
            >
              <LogIn size={20} />
              Unirse a un grupo
            </button>
          </>
        ) : isCreating ? (
          <div className="mr-enter space-y-4">
            <input 
              type="text" 
              placeholder="Nombre del grupo" 
              className="mr-focus w-full rounded-[var(--radius-control)] border border-white/[0.1] bg-zinc-950/70 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setIsCreating(false)}
                className="mr-focus flex-1 rounded-[var(--radius-control)] border border-white/[0.1] py-3 font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05]"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateGroup}
                className="mr-focus flex-1 rounded-[var(--radius-control)] bg-orange-500 py-3 font-bold text-mr-on-accent transition-colors hover:bg-orange-400"
              >
                Crear
              </button>
            </div>
          </div>
        ) : (
          <div className="mr-enter space-y-4">
            <input 
              type="text" 
              placeholder="ID del grupo" 
              className="mr-focus w-full rounded-[var(--radius-control)] border border-white/[0.1] bg-zinc-950/70 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none font-mono uppercase"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setIsJoining(false)}
                className="mr-focus flex-1 rounded-[var(--radius-control)] border border-white/[0.1] py-3 font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05]"
              >
                Cancelar
              </button>
              <button 
                onClick={handleJoinGroup}
                className="mr-focus flex-1 rounded-[var(--radius-control)] bg-orange-500 py-3 font-bold text-mr-on-accent transition-colors hover:bg-orange-400"
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
