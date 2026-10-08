// First-run status is deliberately passive: no CLI execution, credential
// decryption/migration, writes, or provider requests. Login stays unverified.
import { probeCliExecutable } from './agent-bridge-process.js';

const STORAGE_STATES = ['available', 'unsupported', 'locked', 'unavailable'];
const CREDENTIAL_STATES = ['empty', 'saved', 'migration-required'];

async function geminiReadiness(settings) {
  try {
    const status = await settings.status();
    const gemini = status?.providers?.gemini;
    if (!gemini || typeof gemini.configured !== 'boolean') throw new Error('Invalid settings status');
    const credentialStatus = gemini.credentialStatus === undefined
      ? (gemini.configured ? 'saved' : 'empty')
      : CREDENTIAL_STATES.includes(gemini.credentialStatus) ? gemini.credentialStatus : 'unavailable';
    const storage = status.secureStorage === undefined ? 'plaintext'
      : STORAGE_STATES.includes(status.secureStorage?.status)
        && (status.secureStorage.status !== 'available' || status.secureStorage.available === true)
        ? status.secureStorage.status : 'unavailable';
    return { configured: gemini.configured, credentialStatus, storage, connection: 'unverified' };
  } catch {
    return { configured: false, credentialStatus: 'unavailable', storage: 'unavailable', connection: 'unverified' };
  }
}

export async function readAiReadiness({ settings, env = process.env, runtime = {} } = {}) {
  const cli = (engine) => ({
    executable: probeCliExecutable(env[`AGENT_BRIDGE_${engine.toUpperCase()}_COMMAND`] || engine, { env }, runtime),
    login: 'unverified'
  });
  return {
    bridgeAvailable: true,
    providers: { claude: cli('claude'), codex: cli('codex'), gemini: await geminiReadiness(settings) }
  };
}
