import { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import MapView from './MapView';
import Profile from './Profile';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export default function MainApp() {
  const { user } = useAuth();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [repeatedRoute, setRepeatedRoute] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    
    if (joinCode && user && !activeGroupId && !autoJoining) {
      const performAutoJoin = async () => {
        setAutoJoining(true);
        try {
          const groupRef = doc(db, 'groups', joinCode.toUpperCase());
          const snap = await getDoc(groupRef);
          if (snap.exists()) {
            await updateDoc(groupRef, {
              members: arrayUnion(user.uid)
            });
            setActiveGroupId(joinCode.toUpperCase());
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (e) {
          console.error("Error auto-joining:", e);
          handleFirestoreError(e, OperationType.WRITE, `groups/${joinCode.toUpperCase()}`);
        } finally {
          setAutoJoining(false);
        }
      };
      performAutoJoin();
    }
  }, [user, activeGroupId, autoJoining]);

  if (autoJoining) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-zinc-400 font-medium">Uniéndote al grupo automáticamente...</p>
      </div>
    );
  }

  if (showProfile) {
    return <Profile onBack={() => setShowProfile(false)} />;
  }

  if (activeGroupId || repeatedRoute) {
    return (
      <MapView 
        groupId={activeGroupId || 'REPEATED'} 
        preloadedRoute={repeatedRoute}
        onLeave={() => {
          setActiveGroupId(null);
          setRepeatedRoute(null);
        }} 
      />
    );
  }

  return (
    <Dashboard 
      onJoinGroup={(id) => setActiveGroupId(id)} 
      onRepeatRoute={(route) => setRepeatedRoute(route)}
      onOpenProfile={() => setShowProfile(true)} 
    />
  );
}
