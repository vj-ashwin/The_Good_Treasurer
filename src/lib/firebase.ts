import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/**
 * True when every required VITE_FIREBASE_* variable is present, so the UI can
 * explain the missing setup instead of throwing a cryptic Firebase error.
 */
export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.trim().length > 0,
)

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)

/**
 * Keeps the user signed in across tabs and reloads by storing the session in
 * localStorage. Runs once at module load; a rejected promise only means the
 * current environment does not support the chosen persistence, in which case
 * Firebase falls back to in-memory and the user simply signs in again next load.
 */
void setPersistence(auth, browserLocalPersistence).catch(() => {
  // Persistence unsupported in this environment — sign-in still works, it just
  // will not survive a reload. Nothing actionable for the user here.
})
