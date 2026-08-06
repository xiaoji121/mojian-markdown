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

test('maskProviderSettings 只回配置状态与尾号，不暴露明文', () => {
  const masked = maskProviderSettings({
    providers: { gemini: { apiKey: 'AIzaSyTest123456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890' } }
  });
  assert.deepEqual(masked, {
    gemini: { configured: true, apiKeyTail: '3456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890' }
  });
  assert.ok(!JSON.stringify(masked).includes('AIzaSyTest'));

  assert.deepEqual(maskProviderSettings({}), {
    gemini: { configured: false, apiKeyTail: '', model: 'gemini-2.5-flash', proxy: '' }
  });
});
