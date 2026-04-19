import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

/** Misma región que las Cloud Functions v2 del proyecto (sendRideInvite, etc.). */
export const motorideFunctions = getFunctions(app, 'europe-west1');

export const auth = getAuth(app);
// @ts-ignore - firestoreDatabaseId might be missing in some configs
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

// Test connection to Firestore (no bloqueante para no detener carga de app)
let testConnectionDone = false;
async function testConnection() {
  if (testConnectionDone) return;
  testConnectionDone = true;
  try {
    // Try to fetch a non-existent doc just to check connectivity
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    console.log("Firestore connection successful");
  } catch (error: any) {
    if (error.message?.includes('offline') || error.code === 'unavailable') {
      console.warn("Firestore temporarily unreachable, continuing with cached data");
    } else {
      console.warn("Firestore error:", error.message);
    }
  }
}
// Test connection con timeout de 3s para no bloquear carga
void setTimeout(() => testConnection(), 500);

export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error signing in with Google", error);
  }
};

export const logOut = async () => {
  try {
    const { removeWebPushForCurrentUser } = await import('./lib/fcmWeb');
    await removeWebPushForCurrentUser();
  } catch {
    /* ignore */
  }
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
