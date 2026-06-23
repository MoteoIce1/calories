import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Статика (sw.js, иконки) лежит в public/ и копируется в dist/ как есть.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
});
