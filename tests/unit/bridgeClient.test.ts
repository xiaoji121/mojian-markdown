import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeUrl } from '../../src/editor/bridgeClient.ts';

test('网页环境下指向本机 4317 端口', () => {
  (globalThis as { window?: unknown }).window = {};
  try {
    assert.equal(bridgeUrl('/api/chat'), 'http://127.0.0.1:4317/api/chat');
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('桌面端（存在 mojianDesktop）使用同源相对路径', () => {
  (globalThis as { window?: unknown }).window = { mojianDesktop: {} };
  try {
    assert.equal(bridgeUrl('/api/chat'), '/api/chat');
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('无 window 环境（单测）回退到 4317 地址', () => {
  assert.equal(bridgeUrl('/health'), 'http://127.0.0.1:4317/health');
});
