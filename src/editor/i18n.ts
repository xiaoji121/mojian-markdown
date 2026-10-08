import { aiMessages } from './locales/ai.ts';
import { featureMessages } from './locales/features.ts';
import { shellMessages } from './locales/shell.ts';
import { viewMessages } from './locales/view.ts';

export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja';
export const LOCALES: readonly Locale[] = ['zh-CN', 'zh-TW', 'en', 'ja'];
export const messages: Record<string, [string, string, string]> = { ...shellMessages, ...viewMessages, ...featureMessages, ...aiMessages };
// Tests and non-browser consumers retain the historic source-language default.
// The editor explicitly initializes from durable preferences / browser language.
let locale: Locale = 'zh-CN';
export function isLocale(value: unknown): value is Locale { return LOCALES.includes(value as Locale); }
export function detectLocale(value: string = ''): Locale {
  const tag = value.replace(/_/g, '-').toLowerCase();
  if (/^zh(?:-|$)/.test(tag)) return /(?:hant|tw|hk|mo)/.test(tag) ? 'zh-TW' : 'zh-CN';
  if (/^ja(?:-|$)/.test(tag)) return 'ja';
  return 'en';
}
export function getLocale(): Locale { return locale; }
export function setLocale(value: unknown): Locale {
  locale = isLocale(value) ? value : 'en';
  return locale;
}
export function t(source: string, parameters: Record<string, string | number> = {}): string {
  const index = LOCALES.indexOf(locale) - 1;
  const translated = index < 0 ? source : messages[source]?.[index] || source;
  return translated.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(parameters, key) ? String(parameters[key]) : match);
}
