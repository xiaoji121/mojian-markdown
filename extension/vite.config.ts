import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
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
