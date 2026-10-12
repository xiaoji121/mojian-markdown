// Build-time override; legacy web and desktop builds retain their public homepage.
declare const __MOJIAN_SITE_URL__: string | undefined;
export const SITE_URL = typeof __MOJIAN_SITE_URL__ === 'string'
  ? __MOJIAN_SITE_URL__ : 'https://yuxizhai.com/md-editor/';
