import { defineConfig } from 'vitest/config'

// Tests run in a plain Node environment: the money module is pure, so it must never
// need a DOM, a network, or Firebase.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
