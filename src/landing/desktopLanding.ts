import { landingCopy } from './copy.ts';
import { renderLanding } from './render.ts';
import { landingLocales } from './route.ts';

// Desktop trusts only its root editor document. Keep marketing-language changes
// inside that document rather than widening native navigation or IPC trust.
export function syncDesktopLanding() {
  if (!window.mojianDesktop) return;
  const selected = landingLocales.find(value => window.location.hash === `#landing-${value}`);
  const locale = selected ?? (window.location.hash === '' || window.location.hash === '#' ? 'zh-CN' : null);
  if (locale) {
    const landing = document.getElementById('landing-page');
    // History may report the same route more than once. Keep its live controls
    // and focus when the locale is already rendered.
    if (landing && landing.lang !== locale) landing.outerHTML = renderLanding(locale);
    document.documentElement.dataset.landingLocale = locale;
    if (selected) document.documentElement.dataset.desktopLandingLocale = selected;
    else delete document.documentElement.dataset.desktopLandingLocale;
    document.documentElement.dataset.landingTitle = landingCopy[locale].title;
    document.documentElement.lang = locale;
    document.title = landingCopy[locale].title;
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.landing-languages a')) {
    link.href = `#landing-${link.hreflang}`;
  }
}
