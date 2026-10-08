import { landingPages } from './scripts/landing-pages';
import { defineConfig } from 'vite';
import { restrictedFontBuild } from './scripts/restricted-font-build.mjs';

export default defineConfig({
  plugins: [restrictedFontBuild(), landingPages()],
  base: './',
});
