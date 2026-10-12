import type { Plugin } from 'vite';
import { renderLanding, renderMetadata, escapeHtml } from '../src/landing/render.ts';
import { landingCopy } from '../src/landing/copy.ts';
import { SITE_URL } from '../src/landing/site.ts';
import { landingLocales, localeFromPath } from '../src/landing/route.ts';
export function localizePage(html: string, path: string, siteUrl = SITE_URL): string {
  const locale = localeFromPath(path) ?? 'zh-CN';
  const metadataPath = localeFromPath(path) ? `/md-editor/${locale}/` : '/md-editor/';
  return html.replace(/<html[^>]*>/, `<html lang="${locale}" data-landing-locale="${locale}" data-landing-title="${escapeHtml(landingCopy[locale].title)}">`)
    .replace(/<!-- landing-meta:start -->[\s\S]*?<!-- landing-meta:end -->/, `<!-- landing-meta:start -->\n${renderMetadata(locale, metadataPath, siteUrl)}\n<!-- landing-meta:end -->`)
    .replace(/<main id="landing-page"[\s\S]*?<\/main>/, renderLanding(locale, path));
}
export function landingPages(siteUrl = SITE_URL): Plugin {
  return {
    name: 'prerender-landing-locales',
    transformIndexHtml: { order: 'pre', handler(html, context) { return localizePage(html, context.originalUrl?.split('?')[0] ?? context.path, siteUrl); } },
    generateBundle: { order: 'post', handler(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') throw new Error('Missing landing entry HTML');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...landingLocales.map(locale => `${locale}/`)].map(path => `<url><loc>${escapeHtml(siteUrl + path)}</loc></url>`).join('')}</urlset>` });
      for (const locale of landingLocales) {
        // All locale pages sit one directory below the root. Keep assets portable
        // across the verified subpath deployment and the local Electron root.
        const source = localizePage(String(index.source), `/${locale}/`, siteUrl)
          .replace(/((?:src|href)=["'])\.\//g, '$1../');
        this.emitFile({ type: 'asset', fileName: `${locale}/index.html`, source });
      }
    } },
  };
}
