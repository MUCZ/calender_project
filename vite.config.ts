/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the production build works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    // A DST-observing zone makes the date math tests meaningful.
    env: { TZ: 'America/New_York' },
    include: ['src/**/*.test.ts'],
  },
});
