import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When served from https://jasonvega1974.github.io/roadys-command-center/,
// assets need to be prefixed with the repo path. `base` handles that at build
// time; dev server stays at '/'.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/roadys-command-center/' : '/',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
