import { landingPages } from './scripts/landing-pages';
import { defineConfig } from 'vite';
import { restrictedFontBuild } from './scripts/restricted-font-build.mjs';

const origin = process.env.MOJIAN_SITE_ORIGIN || 'https://yuxizhai.com';
const base = process.env.MOJIAN_SITE_BASE ?? '/md-editor/';
const siteUrl = new URL(base.replace(/\/?$/, '/'), origin).href;
if (!/^https?:$/.test(new URL(siteUrl).protocol)) throw new Error('Expected an HTTP(S) site origin');

export default defineConfig({
  define: { __MOJIAN_SITE_URL__: JSON.stringify(siteUrl) },
  plugins: [restrictedFontBuild(), landingPages(siteUrl)],
  base: './',
});
