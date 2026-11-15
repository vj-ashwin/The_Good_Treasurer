import { useEffect, useState } from 'react'
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

export interface AuthState {
  user: User | null
  loading: boolean
  busy: boolean
  error: string | null
}

function toMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code)
    if (code === 'auth/popup-closed-by-user') return 'The sign-in window was closed before finishing.'
    if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Retrying with a full-page redirect…'
    if (code === 'auth/popup-request-failed') return 'The sign-in window could not open. Retrying with a full-page redirect…'
    if (code === 'auth/cancelled-popup-request') return 'Only one sign-in window can be open at a time.'
    if (code === 'auth/network-request-failed') return 'Network error while contacting Google. Check your connection.'
    if (code === 'auth/unauthorized-domain') return 'This domain is not authorised for sign-in in Firebase console.'
    return code
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

/**
 * Popup is blocked on iOS Safari and some embedded browsers. When the popup
 * path fails with a block-type error, retry once with a full-page redirect,
 * which Firebase completes via getRedirectResult on return (handled by
 * onAuthStateChanged below, so no extra wiring is needed).
 */
const POPUP_BLOCK_CODES = new Set(['auth/popup-blocked', 'auth/popup-request-failed'])

/** Tracks the current Firebase user and exposes Google sign-in / sign-out. */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    busy: false,
    error: null,
  })

  useEffect(() => {
    // Firebase can stay uninitialised when a previous popup redirect cannot
    // resume (blocked popup, lost session). Don't strand the user on a
    // spinner forever in that case.
    const timeout = window.setTimeout(() => {
      setState((prev) => (prev.loading ? { ...prev, loading: false } : prev))
    }, 10_000)

    // onAuthStateChanged also completes a pending signInWithRedirect on page
    // load, which is how the iOS Safari fallback finishes signing in.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout)
      setState((prev) => ({ ...prev, user, loading: false }))
    })

    return () => {
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    setState((prev) => ({ ...prev, busy: true, error: null }))
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver)
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : ''
      if (POPUP_BLOCK_CODES.has(code)) {
        // Full-page redirect: the app reloads after Google finishes, and
        // onAuthStateChanged picks the user up. Keep `busy` true so the
        // button stays disabled across the reload.
        try {
          await signInWithRedirect(auth, provider, browserPopupRedirectResolver)
          return
        } catch (redirectError) {
          setState((prev) => ({ ...prev, error: toMessage(redirectError) }))
        }
      } else {
        setState((prev) => ({ ...prev, error: toMessage(error) }))
      }
    } finally {
      setState((prev) => ({ ...prev, busy: false }))
    }
  }

  const signOutUser = async () => {
    setState((prev) => ({ ...prev, error: null }))
    try {
      await signOut(auth)
    } catch (error) {
      setState((prev) => ({ ...prev, error: toMessage(error) }))
    }
  }

  return { ...state, signInWithGoogle, signOutUser }
}
