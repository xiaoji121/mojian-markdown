// AI 提供方设置存储：API Key 等配置落在工作区根目录的 settings.json，
// 全程只在本机流转；对外接口一律走 maskProviderSettings，绝不回传明文 Key。
// 支持 Gemini 原生接口与三种 OpenAI-compatible 配置。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const PROVIDER_DEFAULTS = {
  gemini: { model: 'gemini-2.5-flash', baseURL: '' },
  kimi: { model: 'kimi-k2.5', baseURL: 'https://api.moonshot.cn/v1' },
  qwen: { model: 'qwen-plus', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  custom: { model: '', baseURL: '' }
};

export function maskProviderSettings(settings) {
  const providers = settings?.providers || {};
  const masked = {};
  for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
    const saved = providers[name] || {};
    const apiKey = typeof saved.apiKey === 'string' ? saved.apiKey : '';
    masked[name] = {
      configured: !!apiKey,
      apiKeyTail: apiKey ? apiKey.slice(-4) : '',
      model: saved.model || defaults.model,
      proxy: saved.proxy || '',
      baseURL: saved.baseURL || defaults.baseURL || ''
    };
  }
  return masked;
}

export function createSettingsStore(root) {
  const settingsPath = join(root, 'settings.json');

  async function readSettings() {
    try {
      return JSON.parse(await readFile(settingsPath, 'utf8'));
    } catch {
      return {};
    }
  }

  // patch 形如 { gemini: { apiKey?, model? } }：
  // 字段缺省 = 保持现状；apiKey 传空串 = 显式清除。
  async function updateProviders(patch) {
    const settings = await readSettings();
    settings.providers = settings.providers || {};
    for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
      const incoming = patch?.[name];
      if (!incoming) continue;
      const current = { ...(settings.providers[name] || {}) };
      if (typeof incoming.apiKey === 'string') {
        if (incoming.apiKey) current.apiKey = incoming.apiKey;
        else delete current.apiKey;
      }
      if (typeof incoming.model === 'string' && incoming.model.trim()) {
        current.model = incoming.model.trim();
      }
      if (typeof incoming.proxy === 'string') {
        const proxy = incoming.proxy.trim();
        if (proxy) current.proxy = proxy;
        else delete current.proxy;
      }
      if (typeof incoming.baseURL === 'string') {
        const baseURL = incoming.baseURL.trim();
        if (baseURL) current.baseURL = baseURL;
        else if (!defaults.baseURL) delete current.baseURL;
        else current.baseURL = defaults.baseURL;
      }
      settings.providers[name] = current;
    }
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2));
    return settings;
  }

  // 引擎调用取用的完整（含明文 Key）提供方配置。
  async function providerSettings(name) {
    const settings = await readSettings();
    const saved = settings.providers?.[name] || {};
    return { ...PROVIDER_DEFAULTS[name], ...saved };
  }

  return { settingsPath, readSettings, updateProviders, providerSettings };
}
