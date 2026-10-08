import { landingCopy } from './copy.ts';
import { renderLanding, renderMetadata } from './render.ts';
import { localeFromPath } from './route.ts';
import { closeLandingLanguageMenu, focusLandingLanguageToggle, initLandingLanguageMenu } from './languageMenu.ts';

export function syncWebLanding() {
  if (window.mojianDesktop) return;
  const locale = localeFromPath(location.pathname) ?? 'zh-CN';
  const landing = document.getElementById('landing-page');
  if (landing && landing.lang !== locale) landing.outerHTML = renderLanding(locale, location.pathname);
  document.documentElement.dataset.landingLocale = locale;
  document.documentElement.dataset.landingTitle = landingCopy[locale].title;
  const metadata = new DOMParser().parseFromString(renderMetadata(locale,
    localeFromPath(location.pathname) ? `/md-editor/${locale}/` : '/md-editor/'), 'text/html');
  document.head.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[hreflang]').forEach(node => node.remove());
  for (const node of metadata.head.children) if (node.tagName !== 'TITLE') document.head.append(node.cloneNode(true));
  if (location.hash !== '#editor') {
    document.documentElement.lang = locale;
    document.title = landingCopy[locale].title;
  }
}

export function initLandingNavigation() {
  initLandingLanguageMenu();
  let restoreLanguageFocusAfterHash = false;
  // Same-document navigation keeps the mounted editor and pending draft intact.
  // Ordinary links remain a real no-JS fallback, and modified clicks keep their
  // browser behavior. Landing language never overwrites editor preferences.
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.landing-languages a') : null;
    if (!target) return;
    closeLandingLanguageMenu();
    if (window.mojianDesktop) {
      restoreLanguageFocusAfterHash = target.hash !== location.hash;
      focusLandingLanguageToggle();
      return;
    }
    event.preventDefault();
    // Vite makes template assets relative to the HTML entry. Resolve them
    // before changing paths, including the not-yet-mounted editor favicon.
    for (const image of document.querySelectorAll<HTMLImageElement>('x-dc img[src]')) image.src = image.src;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = icon.href;
    history.pushState(null, '', target.href);
    syncWebLanding();
    window.dispatchEvent(new Event('hashchange'));
    window.scrollTo(0, 0);
    focusLandingLanguageToggle();
  });
  window.addEventListener('hashchange', () => {
    if (!restoreLanguageFocusAfterHash) return;
    // History can dispatch a synthetic hashchange before the native event.
    // Wait for both desktop renders so neither removes the focused trigger.
    requestAnimationFrame(() => {
      restoreLanguageFocusAfterHash = false;
      focusLandingLanguageToggle();
    });
  });
  window.addEventListener('popstate', () => {
    syncWebLanding();
    window.dispatchEvent(new Event('hashchange'));
  });
}
