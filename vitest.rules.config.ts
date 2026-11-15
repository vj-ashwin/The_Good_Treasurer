import { defineConfig } from 'vitest/config'

// Security-rules tests talk to the Firestore emulator, so they are a separate
// suite from `npm test`: the normal suite must stay pure and offline.
//
// Run with: npm run test:rules
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.rules.test.ts'],
    // The emulator is local, but batch commits and rule evaluation are slower
    // than in-memory unit tests.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
