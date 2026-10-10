import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialLocale } from '../../src/editor/localeResolve.ts';

test('saved locale wins over landing and browser', () => {
  assert.equal(resolveInitialLocale({
    savedLocale: 'en', pathLocale: 'zh-CN', landingLocale: 'zh-CN', preferLandingLocale: true, browserLanguage: 'zh-CN'
  }), 'en');
});

test('explicit landing path locale is used when nothing is saved', () => {
  assert.equal(resolveInitialLocale({
    pathLocale: 'en', landingLocale: 'zh-CN', preferLandingLocale: true, browserLanguage: 'zh-CN'
  }), 'en');
  assert.equal(resolveInitialLocale({
    pathLocale: 'ja', landingLocale: 'zh-CN', browserLanguage: 'en-US'
  }), 'ja');
});

test('root landing locale wins only after the user saw the landing', () => {
  assert.equal(resolveInitialLocale({
    pathLocale: null, landingLocale: 'zh-CN', preferLandingLocale: true, browserLanguage: 'en-US'
  }), 'zh-CN');
  assert.equal(resolveInitialLocale({
    pathLocale: null, landingLocale: 'zh-TW', preferLandingLocale: true, browserLanguage: 'en-US'
  }), 'zh-TW');
});

test('direct editor deep link follows browser language, not static root landing lang', () => {
  assert.equal(resolveInitialLocale({
    pathLocale: null, landingLocale: 'zh-CN', preferLandingLocale: false, browserLanguage: 'ja-JP'
  }), 'ja');
  assert.equal(resolveInitialLocale({
    pathLocale: null, landingLocale: 'zh-CN', browserLanguage: 'en-US'
  }), 'en');
  assert.equal(resolveInitialLocale({
    pathLocale: null, landingLocale: 'zh-CN', preferLandingLocale: false, browserLanguage: 'zh-HK'
  }), 'zh-TW');
  assert.equal(resolveInitialLocale({
    pathLocale: null, landingLocale: 'zh-CN', preferLandingLocale: false, browserLanguage: 'fr-FR'
  }), 'en');
});

test('desktop uses injected landing locale before browser language', () => {
  assert.equal(resolveInitialLocale({
    isDesktop: true, desktopLandingLocale: 'ja', browserLanguage: 'en-US'
  }), 'ja');
});
