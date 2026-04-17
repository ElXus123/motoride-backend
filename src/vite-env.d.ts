/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Web Push / FCM: Firebase Console → Cloud Messaging → certificados Web Push. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}
