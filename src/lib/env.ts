/**
 * Firebase configuration, read once from the Vite environment.
 *
 * This module deliberately imports nothing from `firebase/*`. `main.tsx` uses
 * it to decide whether the app may boot at all: if the VITE_FIREBASE_* values
 * are missing, the Firebase SDK is never imported, so a misconfigured deploy
 * shows an explanation instead of a blank page caused by a throw during module
 * initialisation.
 */

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

function read(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key]
  return typeof value === 'string' ? value.trim() : ''
}

export const firebaseConfig: FirebaseConfig = {
  apiKey: read('VITE_FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: read('VITE_FIREBASE_APP_ID'),
}

/**
 * True when every required VITE_FIREBASE_* variable is present.
 *
 * Only presence is checked. Whether the values are *correct* is answered by
 * Firebase on the first network call, not by a string comparison here.
 */
export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value.length > 0,
)
