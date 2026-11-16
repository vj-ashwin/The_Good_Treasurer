import { describe, expect, it, vi } from 'vitest'
import { backoffDelay, withRetry, DEFAULT_RETRY_POLICY } from './retry'

/** A Firebase-shaped error with just the code the retry layer reads. */
function firebaseError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

describe('backoffDelay', () => {
  it('doubles from the base delay and clamps at the maximum', () => {
    const policy = { attempts: 10, baseDelayMs: 100, maxDelayMs: 500 }
    expect([1, 2, 3, 4, 5].map((attempt) => backoffDelay(attempt, policy))).toEqual([
      100, 200, 400, 500, 500,
    ])
  })

  it('falls back to the base delay for a nonsense attempt', () => {
    expect(backoffDelay(0, DEFAULT_RETRY_POLICY)).toBe(DEFAULT_RETRY_POLICY.baseDelayMs)
    expect(backoffDelay(-3, DEFAULT_RETRY_POLICY)).toBe(DEFAULT_RETRY_POLICY.baseDelayMs)
  })
})

describe('withRetry', () => {
  it('returns the first successful result without sleeping', async () => {
    const sleep = vi.fn(async () => {})
    const operation = vi.fn(async () => 'ok')

    await expect(withRetry(operation, { sleep })).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries a transient failure and returns the eventual success', async () => {
    const sleep = vi.fn(async () => {})
    let calls = 0
    const operation = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw firebaseError('unavailable')
      return 'ok'
    })

    await expect(
      withRetry(operation, { attempts: 5, baseDelayMs: 10, maxDelayMs: 40, sleep }),
    ).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map((call) => (call as unknown[])[0])).toEqual([10, 20])
  })

  it('rethrows the last error after the attempts are used up', async () => {
    const sleep = vi.fn(async () => {})
    const operation = vi.fn(async () => {
      throw firebaseError('unavailable')
    })

    await expect(
      withRetry(operation, { attempts: 3, baseDelayMs: 1, maxDelayMs: 4, sleep }),
    ).rejects.toMatchObject({ code: 'unavailable' })
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('does not retry a permanent failure', async () => {
    const sleep = vi.fn(async () => {})
    const operation = vi.fn(async () => {
      throw firebaseError('permission-denied')
    })

    await expect(withRetry(operation, { attempts: 5, sleep })).rejects.toMatchObject({
      code: 'permission-denied',
    })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('does not retry an error with no Firebase code', async () => {
    const sleep = vi.fn(async () => {})
    const operation = vi.fn(async () => {
      throw new Error('boom')
    })

    await expect(withRetry(operation, { attempts: 5, sleep })).rejects.toThrow('boom')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('clamps the requested attempt count to at least one', async () => {
    const operation = vi.fn(async () => 'ok')
    await expect(withRetry(operation, { attempts: 0 })).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
