import { runEngine } from '../scripts/agent-bridge-engines.js';

// Only called by an explicit UI action, never startup/save/migration. Do not
// return provider bodies or OS exceptions: either can contain credential data.
export async function testAiConnection(settings, payload, engine = runEngine) {
  try {
    const incoming = payload?.gemini || {};
    const supplied = typeof incoming.apiKey === 'string' && incoming.apiKey.length > 0;
    if (supplied && incoming.apiKey.length > 8192) throw new Error('Invalid key');
    // Testing a newly typed key must not unlock/decrypt a different saved key.
    const saved = supplied ? (await settings.status()).providers.gemini
      : await settings.providerSettings('gemini');
    const gemini = {
      apiKey: typeof incoming.apiKey === 'string' && incoming.apiKey ? incoming.apiKey : saved.apiKey,
      model: typeof incoming.model === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming.model) ? incoming.model : saved.model,
      proxy: saved.proxy
    };
    // Proxy changes must be saved before testing, so one validated destination
    // policy governs stored and test requests alike.
    await engine('gemini', '连通性测试：请只回复 OK', () => {}, process.env, { gemini, timeoutMs: 15_000 });
    return { ok: true };
  } catch { return { ok: false, message: '连接失败。请检查密钥、安全存储、模型和网络设置。' }; }
}
