import { defineConfig } from 'vite';
import { restrictedFontBuild } from './scripts/restricted-font-build.mjs';

export default defineConfig({
  plugins: [restrictedFontBuild()],
  base: './',
});
