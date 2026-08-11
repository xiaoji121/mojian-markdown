import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinProviderNames,
  createBuiltinModel,
  normalizeBuiltinProvider,
  resolveBuiltinProxy
} from '../../scripts/agent-bridge-providers.js';

test('内置 Agent 提供方覆盖 Gemini、Kimi、千问与自定义兼容接口', () => {
  assert.deepEqual(builtinProviderNames(), ['gemini', 'kimi', 'qwen', 'custom']);
  assert.equal(normalizeBuiltinProvider('qwen'), 'qwen');
  assert.equal(normalizeBuiltinProvider('unknown'), 'gemini');
});

test('内置提供方代理优先使用显式设置，再回落环境变量', () => {
  assert.equal(resolveBuiltinProxy({ proxy: 'http://127.0.0.1:7890' }, { HTTPS_PROXY: 'http://env:7890' }), 'http://127.0.0.1:7890');
  assert.equal(resolveBuiltinProxy({}, { HTTPS_PROXY: 'http://env:7890' }), 'http://env:7890');
  assert.equal(resolveBuiltinProxy({}, {}), '');
});

test('OpenAI 兼容提供方必须同时配置 Key、baseURL 与模型', () => {
  assert.throws(() => createBuiltinModel('custom', {}), /API Key/);
  assert.throws(() => createBuiltinModel('custom', { apiKey: 'key' }), /接口地址/);
  assert.throws(
    () => createBuiltinModel('custom', { apiKey: 'key', baseURL: 'https://example.test/v1' }),
    /模型/
  );
});

test('提供方工厂创建模型时不暴露 API Key', () => {
  const model = createBuiltinModel('kimi', {
    apiKey: 'secret-key',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.5'
  });
  assert.match(model.provider, /^kimi(?:\.|$)/);
  assert.equal(model.modelId, 'kimi-k2.5');
  assert.ok(!JSON.stringify(model).includes('secret-key'));
});
