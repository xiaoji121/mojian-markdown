// Native details/summary keeps the language links available without JavaScript.
// Delegate dismissal so replacing the localized landing never leaves stale handlers.
export function focusLandingLanguageToggle(root: Document = document) {
  root.querySelector<HTMLElement>('.landing-language-toggle')?.focus({ preventScroll: true });
}

export function closeLandingLanguageMenu(root: Document = document, restoreFocus = false) {
  const menu = root.querySelector<HTMLDetailsElement>('.landing-language-menu');
  if (!menu) return;
  menu.open = false;
  if (restoreFocus) focusLandingLanguageToggle(root);
}

export function initLandingLanguageMenu(root: Document = document) {
  root.addEventListener('keydown', event => {
    const menu = root.querySelector<HTMLDetailsElement>('.landing-language-menu');
    if (event.key !== 'Escape' || !menu?.open || !menu.contains(event.target as Node)) return;
    event.preventDefault();
    closeLandingLanguageMenu(root, true);
  });
  root.addEventListener('click', event => {
    const menu = root.querySelector<HTMLDetailsElement>('.landing-language-menu');
    if (!menu?.open || menu.contains(event.target as Node)) return;
    closeLandingLanguageMenu(root, menu.contains(root.activeElement));
  });
  root.addEventListener('focusin', event => {
    const menu = root.querySelector<HTMLDetailsElement>('.landing-language-menu');
    if (menu?.open && !menu.contains(event.target as Node)) closeLandingLanguageMenu(root);
  });
}
