import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsStore, maskProviderSettings } from '../../scripts/agent-bridge-settings.js';

async function withStore(run: (store: ReturnType<typeof createSettingsStore>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-settings-'));
  try {
    await run(createSettingsStore(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('设置存储：写入合并、缺省保留、空串清除 Key', async () => {
  await withStore(async (store) => {
    assert.deepEqual(await store.readSettings(), {});

    await store.updateProviders({ gemini: { apiKey: 'AIzaSyTest123456', model: 'gemini-2.5-flash' } });
    let settings = await store.readSettings();
    assert.equal(settings.providers.gemini.apiKey, 'AIzaSyTest123456');
    assert.equal(settings.providers.gemini.model, 'gemini-2.5-flash');

    // 只改模型（不带 apiKey）：已保存的 Key 不动
    await store.updateProviders({ gemini: { model: 'gemini-2.5-pro' } });
    settings = await store.readSettings();
    assert.equal(settings.providers.gemini.apiKey, 'AIzaSyTest123456');
    assert.equal(settings.providers.gemini.model, 'gemini-2.5-pro');

    // 空串显式清除 Key
    await store.updateProviders({ gemini: { apiKey: '' } });
    settings = await store.readSettings();
    assert.ok(!settings.providers.gemini.apiKey);
    assert.equal(settings.providers.gemini.model, 'gemini-2.5-pro');
  });
});

test('设置存储：代理地址可保存、可用空串清除', async () => {
  await withStore(async (store) => {
    await store.updateProviders({ gemini: { proxy: ' http://127.0.0.1:7890 ' } });
    let settings = await store.readSettings();
    assert.equal(settings.providers.gemini.proxy, 'http://127.0.0.1:7890');
    assert.equal((await store.providerSettings('gemini')).proxy, 'http://127.0.0.1:7890');

    await store.updateProviders({ gemini: { model: 'gemini-2.5-pro' } });
    settings = await store.readSettings();
    assert.equal(settings.providers.gemini.proxy, 'http://127.0.0.1:7890', '不带 proxy 字段时保持现状');

    await store.updateProviders({ gemini: { proxy: '' } });
    settings = await store.readSettings();
    assert.ok(!settings.providers.gemini.proxy);
  });
});

test('设置存储：Gemini 提交空接口地址时仍可保存其他字段', async () => {
  await withStore(async (store) => {
    await store.updateProviders({
      gemini: {
        apiKey: 'AIzaSyTest123456',
        model: 'gemini-3.1-flash-lite',
        baseURL: ''
      }
    });

    const settings = await store.readSettings();
    assert.equal(settings.providers.gemini.apiKey, 'AIzaSyTest123456');
    assert.equal(settings.providers.gemini.model, 'gemini-3.1-flash-lite');
    assert.ok(!('baseURL' in settings.providers.gemini));
  });
});

test('maskProviderSettings 只回配置状态与尾号，不暴露明文', () => {
  const masked = maskProviderSettings({
    providers: { gemini: { apiKey: 'AIzaSyTest123456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890' } }
  });
  assert.equal(masked.gemini.configured, true);
  assert.equal(masked.gemini.apiKeyTail, '3456');
  assert.equal(masked.gemini.model, 'gemini-2.5-pro');
  assert.equal(masked.kimi.model, 'kimi-k2.5');
  assert.equal(masked.qwen.model, 'qwen-plus');
  assert.equal(masked.custom.baseURL, '');
  assert.ok(!JSON.stringify(masked).includes('AIzaSyTest'));

  assert.deepEqual(Object.keys(maskProviderSettings({})), ['gemini', 'kimi', 'qwen', 'custom']);
});

test('设置存储支持 Kimi、千问和自定义兼容提供方', async () => {
  await withStore(async (store) => {
    await store.updateProviders({
      kimi: { apiKey: 'kimi-secret', model: 'kimi-k2.5' },
      qwen: { apiKey: 'qwen-secret', model: 'qwen-plus' },
      custom: { apiKey: 'custom-secret', model: 'local-model', baseURL: ' https://llm.example/v1 ' }
    });
    const custom = await store.providerSettings('custom');
    assert.equal(custom.baseURL, 'https://llm.example/v1');
    const masked = maskProviderSettings(await store.readSettings());
    assert.equal(masked.kimi.apiKeyTail, 'cret');
    assert.equal(masked.qwen.configured, true);
    assert.equal(masked.custom.baseURL, 'https://llm.example/v1');
    assert.ok(!JSON.stringify(masked).includes('secret'));
  });
});
