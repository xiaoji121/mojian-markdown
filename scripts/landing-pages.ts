import type { Plugin } from 'vite';
import { renderLanding, renderMetadata, escapeHtml } from '../src/landing/render.ts';
import { landingCopy } from '../src/landing/copy.ts';
import { landingLocales, localeFromPath } from '../src/landing/route.ts';
export function localizePage(html: string, path: string): string {
  const locale = localeFromPath(path) ?? 'zh-CN';
  const metadataPath = localeFromPath(path) ? `/md-editor/${locale}/` : '/md-editor/';
  return html.replace(/<html[^>]*>/, `<html lang="${locale}" data-landing-locale="${locale}" data-landing-title="${escapeHtml(landingCopy[locale].title)}">`)
    .replace(/<!-- landing-meta:start -->[\s\S]*?<!-- landing-meta:end -->/, `<!-- landing-meta:start -->\n${renderMetadata(locale, metadataPath)}\n<!-- landing-meta:end -->`)
    .replace(/<main id="landing-page"[\s\S]*?<\/main>/, renderLanding(locale, path));
}
export function landingPages(): Plugin {
  return {
    name: 'prerender-landing-locales',
    transformIndexHtml: { order: 'pre', handler(html, context) { return localizePage(html, context.path); } },
    generateBundle: { order: 'post', handler(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('Missing landing entry HTML');
      for (const locale of landingLocales) {
        // All locale pages sit one directory below the root. Keep assets portable
        // across the verified subpath deployment and the local Electron root.
        const source = localizePage(String(index.source), `/${locale}/`)
          .replace(/((?:src|href)=["'])\.\//g, '$1../');
        this.emitFile({ type: 'asset', fileName: `${locale}/index.html`, source });
      }
    } },
  };
}
