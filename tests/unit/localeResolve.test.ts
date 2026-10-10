import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialLocale } from '../../src/editor/localeResolve.ts';

test('saved locale wins over landing and browser', () => {
  assert.equal(resolveInitialLocale({
    savedLocale: 'en', pathLocale: 'zh-CN', documentLang: 'zh-CN', browserLanguage: 'zh-CN'
  }), 'en');
});

test('explicit landing path locale is used when nothing is saved', () => {
  assert.equal(resolveInitialLocale({
    pathLocale: 'en', documentLang: 'zh-CN', browserLanguage: 'zh-CN'
  }), 'en');
  assert.equal(resolveInitialLocale({
    pathLocale: 'ja', documentLang: 'zh-CN', browserLanguage: 'en-US'
  }), 'ja');
});

test('historic root landing follows document lang, then zh-CN, not English browser', () => {
  assert.equal(resolveInitialLocale({
    pathLocale: null, documentLang: 'zh-CN', browserLanguage: 'en-US'
  }), 'zh-CN');
  assert.equal(resolveInitialLocale({
    pathLocale: null, documentLang: 'zh-TW', browserLanguage: 'en-US'
  }), 'zh-TW');
  assert.equal(resolveInitialLocale({
    pathLocale: null, browserLanguage: 'en-US'
  }), 'zh-CN');
});

test('desktop uses injected landing locale before browser language', () => {
  assert.equal(resolveInitialLocale({
    isDesktop: true, desktopLandingLocale: 'ja', browserLanguage: 'en-US'
  }), 'ja');
});
