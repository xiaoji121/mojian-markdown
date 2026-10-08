import { t } from './i18n.ts';
const ownedContentControls = new WeakSet<Element>();
const contentContainers = '.md-preview, .ai-message-body, .ai-message-quote, .ai-quote, .longimg-prose, .longimg-title, .comment-reply-markdown, .translate-popover-body';
export function registerOwnedChrome(element: Element) { ownedContentControls.add(element); }
export function isTranslatableChrome(element: Element): boolean {
  return ownedContentControls.has(element) || !element.closest(contentContainers);
}
// Markers in user-authored HTML are data, never translation instructions.
export function translateChrome(root: ParentNode) {
  root.querySelectorAll('[data-i18n]').forEach(element => {
    if (isTranslatableChrome(element)) element.textContent = t(element.getAttribute('data-i18n')!);
  });
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      if (isTranslatableChrome(element)) element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)!));
    });
  }
}
