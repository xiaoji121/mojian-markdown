import { type Locale, isLocale } from './i18n.ts';

export function syncLocaleSettings(root: ParentNode, locale: Locale) {
  root.querySelectorAll<HTMLButtonElement>('.interface-language-option').forEach(button => {
    const selected = button.dataset.locale === locale;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

export function bindLocaleSettings(root: ParentNode, change: (locale: Locale) => void) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('.interface-language-option')];
  const select = (button: HTMLButtonElement) => {
    if (isLocale(button.dataset.locale)) change(button.dataset.locale);
  };
  const onClick = (event: Event) => select(event.currentTarget as HTMLButtonElement);
  const onKey = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus();
    select(buttons[next]);
  };
  buttons.forEach(button => { button.addEventListener('click', onClick); button.addEventListener('keydown', onKey); });
  return () => buttons.forEach(button => { button.removeEventListener('click', onClick); button.removeEventListener('keydown', onKey); });
}
