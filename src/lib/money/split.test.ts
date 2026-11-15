import { describe, expect, it } from 'vitest'
import { splitEvenly } from './split'
import { sumPaise } from './paise'

describe('splitEvenly', () => {
  it('splits without losing a paise', () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33])
    expect(splitEvenly(100, 1)).toEqual([100])
    expect(splitEvenly(0, 4)).toEqual([0, 0, 0, 0])
  })

  it('gives the remainder to the earliest shares', () => {
    expect(splitEvenly(1, 4)).toEqual([1, 0, 0, 0])
    expect(splitEvenly(5, 2)).toEqual([3, 2])
  })

  it('keeps negative totals intact', () => {
    expect(splitEvenly(-100, 3)).toEqual([-33, -33, -34])
    expect(sumPaise(splitEvenly(-100, 3))).toBe(-100)
  })

  it('returns no shares for zero parts', () => {
    expect(splitEvenly(100, 0)).toEqual([])
  })

  it('rejects a negative part count', () => {
    expect(() => splitEvenly(100, -1)).toThrow(TypeError)
  })

  it('rejects a non-integer total', () => {
    expect(() => splitEvenly(12.5, 2)).toThrow(TypeError)
  })
})
