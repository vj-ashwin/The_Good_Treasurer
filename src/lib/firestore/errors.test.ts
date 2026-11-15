import { describe, expect, it } from 'vitest'
import { describeFirestoreError, firestoreErrorCode, isOfflineError } from './errors'

const withCode = (code: string) => Object.assign(new Error('raw sdk message'), { code })

describe('firestoreErrorCode', () => {
  it('reads the code of a Firebase-style error', () => {
    expect(firestoreErrorCode(withCode('permission-denied'))).toBe('permission-denied')
  })

  it('returns null for anything without a string code', () => {
    expect(firestoreErrorCode(null)).toBeNull()
    expect(firestoreErrorCode('permission-denied')).toBeNull()
    expect(firestoreErrorCode({ code: 7 })).toBeNull()
    expect(firestoreErrorCode(new Error('plain'))).toBeNull()
  })
})

describe('isOfflineError', () => {
  it('treats unavailable and offline messages as connectivity failures', () => {
    expect(isOfflineError(withCode('unavailable'))).toBe(true)
    expect(isOfflineError(new Error('Failed to get documents from server. Offline.'))).toBe(true)
  })

  it('does not treat a rejected write as offline', () => {
    expect(isOfflineError(withCode('permission-denied'))).toBe(false)
    expect(isOfflineError(null)).toBe(false)
  })
})

describe('describeFirestoreError', () => {
  it('maps the codes the app can actually hit to readable sentences', () => {
    expect(describeFirestoreError(withCode('permission-denied'))).toMatch(/permission/)
    expect(describeFirestoreError(withCode('unauthenticated'))).toMatch(/session has expired/)
    expect(describeFirestoreError(withCode('unavailable'))).toMatch(/offline/)
    expect(describeFirestoreError(withCode('not-found'))).toMatch(/no longer exists/)
    expect(describeFirestoreError(withCode('already-exists'))).toMatch(/already saved/)
    expect(describeFirestoreError(withCode('invalid-argument'))).toMatch(/not valid/)
  })

  it('never echoes the raw SDK message', () => {
    const message = describeFirestoreError(withCode('permission-denied'))
    expect(message).not.toContain('raw sdk message')
  })

  it('falls back to a generic retry sentence for unknown failures', () => {
    expect(describeFirestoreError(withCode('weird/new-code'))).toBe(
      'Something went wrong saving your changes. Please retry.',
    )
    expect(describeFirestoreError(undefined)).toMatch(/retry/i)
  })

  it('recognises an uncoded offline message', () => {
    expect(describeFirestoreError(new Error('client is offline'))).toMatch(/offline/)
  })
})
