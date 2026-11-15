import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
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
    if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup. Allow popups and try again.'
    if (code === 'auth/network-request-failed') return 'Network error while contacting Google. Check your connection.'
    if (code === 'auth/unauthorized-domain') return 'This domain is not authorised for sign-in in Firebase console.'
    return code
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

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
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (error) {
      setState((prev) => ({ ...prev, error: toMessage(error) }))
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
