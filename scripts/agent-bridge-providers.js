// 内置 Agent 的模型提供方注册表。API Key 只闭包进 provider 实例，
// 返回给调用方的 model 对象和任何日志都不包含明文凭据。
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const PROVIDERS = ['gemini', 'kimi', 'qwen', 'custom'];

export function builtinProviderNames() {
  return [...PROVIDERS];
}

export function normalizeBuiltinProvider(value) {
  return PROVIDERS.includes(value) ? value : 'gemini';
}

export function resolveBuiltinProxy(settings = {}, env = process.env) {
  return settings.proxy
    || env.HTTPS_PROXY || env.https_proxy
    || env.HTTP_PROXY || env.http_proxy
    || env.ALL_PROXY || env.all_proxy
    || '';
}

function providerFetch(settings, env) {
  const proxy = resolveBuiltinProxy(settings, env);
  if (!proxy) return undefined;
  const dispatcher = new ProxyAgent(proxy);
  return (input, init) => undiciFetch(input, { ...init, dispatcher });
}

function required(settings, field, label) {
  const value = typeof settings?.[field] === 'string' ? settings[field].trim() : '';
  if (!value) throw new Error(`尚未配置${label}`);
  return value;
}

export function createBuiltinModel(name, settings = {}, env = process.env) {
  const providerName = normalizeBuiltinProvider(name);
  const apiKey = required(settings, 'apiKey', `${providerName} API Key`);
  const customFetch = providerFetch(settings, env);
  if (providerName === 'gemini') {
    const modelId = required(settings, 'model', `${providerName} 模型`);
    return createGoogleGenerativeAI({ apiKey, ...(customFetch ? { fetch: customFetch } : {}) })(modelId);
  }
  const baseURL = required(settings, 'baseURL', `${providerName} 接口地址`);
  const modelId = required(settings, 'model', `${providerName} 模型`);
  const provider = createOpenAICompatible({
    name: providerName, apiKey, baseURL, ...(customFetch ? { fetch: customFetch } : {})
  });
  return provider(modelId);
}
