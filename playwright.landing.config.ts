import { defineConfig } from '@playwright/test';
import base from './playwright.config';
// Exercise emitted static HTML, relative assets and no-JS sharing, not just
// Vite's development HTML transform. Build first (normal or bridge mode).
export default defineConfig({
  ...base,
  testMatch: 'landing-locales.spec.ts',
  use: { ...base.use, baseURL: 'http://localhost:4664' },
  webServer: {
    command: 'npx vite preview --port 4664 --strictPort',
    url: 'http://localhost:4664',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
