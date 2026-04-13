import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: any | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, error: null });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubDoc: () => void;

    // Safety timeout: if auth doesn't respond in 10s, it's likely a quota/connection issue
    const timeout = setTimeout(() => {
      if (loading) {
        setError('timeout');
        setLoading(false);
      }
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(timeout);
      if (currentUser) {
        // Initial set with auth data
        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          isPremium: false,
        });
        
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Motero',
            email: currentUser.email || '',
            displayNameLower: (currentUser.displayName || 'Motero').toLowerCase(),
            friends: [],
            friendRequestsIncoming: [],
            friendRequestsOutgoing: [],
          }, { merge: true });
        } catch (err: any) {
          console.error("Error saving user to Firestore:", err);
          if (err.message?.includes('quota') || err.code === 'resource-exhausted') {
            setError('quota');
          }
        }

        // Listen to Firestore for profile updates
        unsubDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUser((prev: any) => prev ? { 
              ...prev, 
              displayName: data.displayName || prev.displayName, 
              photoURL: data.photoURL || prev.photoURL,
              isPremium: data.isPremium === true,
            } : null);
          }
        }, (err) => {
          console.error("onSnapshot error:", err);
          if (err.message?.includes('quota') || err.code === 'resource-exhausted') {
            setError('quota');
          }
        });
        
        setLoading(false);
      } else {
        setUser(null);
        setLoading(false);
        if (unsubDoc) unsubDoc();
      }
    }, (err) => {
      clearTimeout(timeout);
      console.error("Auth error:", err);
      setError('auth');
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};
