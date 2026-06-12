import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir:    'dist',
    sourcemap: true,
    target:    'es2022',
  },
  server: {
    port: 3000,
    open: true,
  },
  // ── Vitest ───────────────────────────────────────────────
  test: {
    globals:     true,
    environment: 'jsdom',
    include:     ['src/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  ['src/core/**/*.ts'],
      exclude:  ['src/core/emulator-bridge.ts'],
    },
  },
} as any);
