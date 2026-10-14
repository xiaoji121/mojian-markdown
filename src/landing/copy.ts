import { zhCN } from './locales/zh-CN.ts';
import { zhTW } from './locales/zh-TW.ts';
import { en } from './locales/en.ts';
import { ja } from './locales/ja.ts';

export type LandingCopy = typeof zhCN;

export const landingCopy: Record<string, LandingCopy> = { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja };
