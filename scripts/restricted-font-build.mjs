// Generated Canger/JinKai files are local development inputs, not redistributable
// application assets. Keep other public files (including open fonts) unchanged.
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function isRestrictedFontPath(path) {
  return /(?:^|[/\\])(?:canger[^/\\]*|cejk[^/\\]*|tsanger[^/\\]*)(?:[/\\]|$)/i.test(path.split('?')[0]);
}

export function restrictedFontBuild() {
  let config;
  return {
    name: 'exclude-restricted-reading-fonts',
    apply: 'build',
    enforce: 'pre',
    config: () => ({ build: {
      copyPublicDir: false,
      assetsInlineLimit(filePath) {
        if (isRestrictedFontPath(filePath)) {
          throw new Error('Restricted reading fonts cannot be inlined or bundled.');
        }
        return undefined; // Preserve Vite's default for open-licensed assets.
      },
    } }),
    configResolved(resolved) { config = resolved; },
    load(id) {
      if (isRestrictedFontPath(id)) {
        throw new Error('Restricted reading fonts must use local() and cannot be bundled.');
      }
    },
    generateBundle(_options, bundle) {
      for (const [name, asset] of Object.entries(bundle)) {
        const paths = [name, ...(asset.originalFileNames ?? [])];
        if (paths.some(isRestrictedFontPath)) {
          throw new Error(`Restricted reading font cannot be bundled: ${name}`);
        }
      }
    },
    writeBundle() {
      if (!config.publicDir || !existsSync(config.publicDir)) return;
      cpSync(config.publicDir, resolve(config.root, config.build.outDir), {
        recursive: true,
        filter: (source) => !isRestrictedFontPath(source),
      });
    },
  };
}
