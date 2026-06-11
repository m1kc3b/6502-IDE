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
});