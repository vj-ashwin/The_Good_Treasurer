import { describe, expect, it } from 'vitest'

/**
 * The money module must stay free of Firebase and React so it can be reasoned about
 * and tested in isolation. This guard checks that boundary mechanically instead of
 * leaving it to code review.
 */

const sources = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const moneyModuleSources = Object.entries(sources).filter(
  ([path]) => !path.endsWith('.test.ts'),
)

const FORBIDDEN_IMPORTS = [/from\s+['"]firebase/, /from\s+['"]react/, /import\s*\(\s*['"]react/]

describe('money module purity', () => {
  it('has money sources to check', () => {
    expect(moneyModuleSources.length).toBeGreaterThan(0)
  })

  it('never imports Firebase or React', () => {
    for (const [path, source] of moneyModuleSources) {
      for (const pattern of FORBIDDEN_IMPORTS) {
        expect(pattern.test(source), `${path} must not import Firebase or React`).toBe(false)
      }
    }
  })

  it('never reaches for the clock, randomness, or the environment', () => {
    for (const [path, source] of moneyModuleSources) {
      expect(source.includes('Date.now'), `${path} must not call Date.now()`).toBe(false)
      expect(source.includes('Math.random'), `${path} must not call Math.random()`).toBe(false)
      expect(source.includes('import.meta.env'), `${path} must not read import.meta.env`).toBe(
        false,
      )
    }
  })
})
