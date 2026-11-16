import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { firebaseConfig, isFirebaseConfigured } from './env'

/** Re-exported so existing callers keep one import for Firebase concerns. */
export { isFirebaseConfigured }

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)

/**
 * Firestore with durable, multi-tab offline persistence.
 *
 * `persistentLocalCache` keeps the last-seen documents and queued writes in
 * IndexedDB, so the organiser can add or edit an expense with no connection and
 * have it sync on reconnect. `persistentMultipleTabManager` lets several tabs
 * share that cache instead of one tab silently taking ownership.
 *
 * `initializeFirestore` may only be called once per app. A second module
 * evaluation (for example Vite's HMR replaying this file) would throw, so the
 * fallback reuses the already-started instance. Settings are therefore applied
 * at first load, which is what the app relies on.
 */
function createFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    return getFirestore(app)
  }
}

export const db: Firestore = createFirestore(app)

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
