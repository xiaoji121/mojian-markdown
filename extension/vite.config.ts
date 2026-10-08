import { defineConfig } from 'vite';
import { restrictedFontBuild } from '../scripts/restricted-font-build.mjs';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [restrictedFontBuild()],
  root: here('.'),
  base: './',
  build: {
    outDir: here('../dist-extension'),
    emptyOutDir: true,
    rollupOptions: {
      input: [here('popup.html'), here('reader.html')]
    }
  }
});
