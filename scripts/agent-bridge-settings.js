// Web/CLI keeps its existing local settings contract. Desktop injects an OS
// credential adapter; public desktop reads never return plaintext or ciphertext.
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const PROVIDER_DEFAULTS = { gemini: { model: 'gemini-2.5-flash' } };
const queues = new Map();
const STORAGE_STATES = ['available', 'unsupported', 'locked', 'unavailable'];
const MESSAGES = {
  SETTINGS_INVALID: 'Settings could not be read safely. The existing file was preserved.',
  SETTINGS_READ_FAILED: 'Settings could not be read. The existing file was preserved.',
  SETTINGS_WRITE_FAILED: 'Settings could not be saved. Please try again.',
  SETTINGS_WRITE_UNCERTAIN: 'Settings were replaced but durability could not be confirmed. Please check their status.',
  SETTINGS_INVALID_PATCH: 'The settings update contains an invalid value.',
  CREDENTIAL_CONSENT_REQUIRED: 'Explicit consent is required to migrate an existing credential.',
  CREDENTIAL_MIGRATION_REQUIRED: 'The existing credential must be migrated or cleared before use.',
  CREDENTIAL_STORAGE_UNSUPPORTED: 'Secure credential storage is unsupported on this platform.',
  CREDENTIAL_STORAGE_UNAVAILABLE: 'Secure credential storage is unavailable.',
  CREDENTIAL_STORAGE_LOCKED: 'Secure credential storage is locked or access was denied.',
  CREDENTIAL_INVALID: 'The stored credential could not be read safely.'
};
function failure(code) { return Object.assign(new Error(MESSAGES[code]), { code }); }
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validModel(value) {
  return typeof value === 'string' && /^gemini-[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value);
}
function validProxy(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
      && !url.search && !url.hash && (url.pathname === '' || url.pathname === '/');
  } catch { return false; }
}
function nonSecretFields(saved, defaults) {
  const secret = typeof saved.apiKey === 'string' ? saved.apiKey : '';
  const model = validModel(saved.model) && !(secret && saved.model.includes(secret)) ? saved.model : defaults.model;
  const proxy = validProxy(saved.proxy) && !(secret && saved.proxy.includes(secret)) ? saved.proxy : '';
  return { model, proxy };
}
export function maskProviderSettings(settings) {
  const masked = {};
  for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
    const saved = settings?.providers?.[name] || {};
    masked[name] = {
      configured: typeof saved.configured === 'boolean' ? saved.configured : !!(saved.apiKey || saved.credential),
      ...nonSecretFields(saved, defaults)
    };
    if (['empty', 'saved', 'migration-required'].includes(saved.credentialStatus)) {
      masked[name].credentialStatus = saved.credentialStatus;
    }
  }
  return masked;
}
function validCiphertext(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 65536
    && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
    && Buffer.from(value, 'base64').toString('base64') === value;
}
function validateSettings(value) {
  if (!object(value) || (value.version !== undefined && value.version !== 1)
    || (value.providers !== undefined && !object(value.providers))) throw failure('SETTINGS_INVALID');
  for (const name of Object.keys(PROVIDER_DEFAULTS)) {
    const saved = value.providers?.[name];
    if (saved === undefined) continue;
    if (!object(saved)) throw failure('SETTINGS_INVALID');
    for (const key of ['apiKey', 'model', 'proxy']) {
      if (saved[key] !== undefined && typeof saved[key] !== 'string') throw failure('SETTINGS_INVALID');
    }
    if (saved.apiKey?.length > 8192) throw failure('SETTINGS_INVALID');
    if (saved.credential !== undefined) {
      const credential = saved.credential;
      if (!object(credential) || credential.version !== 1 || credential.kind !== 'electron-safe-storage'
        || !validCiphertext(credential.ciphertext) || saved.apiKey) throw failure('SETTINGS_INVALID');
    }
  }
  return value;
}
async function readRecord(path, io) {
  let raw;
  try { raw = await io.readFile(path, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw failure('SETTINGS_READ_FAILED');
  }
  try { return validateSettings(JSON.parse(raw)); }
  catch { throw failure('SETTINGS_INVALID'); }
}
function serialize(path, operation) {
  const previous = queues.get(path) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(path, current);
  current.finally(() => { if (queues.get(path) === current) queues.delete(path); }).catch(() => {});
  return current;
}
async function writeRecord(path, record, io) {
  let temporary;
  let handle;
  let committed = false;
  try {
    await io.mkdir(dirname(path), { recursive: true, mode: 0o700 });
    temporary = `${path}.${randomUUID()}.tmp`;
    handle = await io.open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(record, null, 2), 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await io.rename(temporary, path); temporary = undefined; committed = true;
    if (process.platform !== 'win32') {
      handle = await io.open(dirname(path), 'r');
      await handle.sync();
      await handle.close(); handle = undefined;
    }
  } catch { throw failure(committed ? 'SETTINGS_WRITE_UNCERTAIN' : 'SETTINGS_WRITE_FAILED'); }
  finally {
    if (handle) { try { await handle.close(); } catch {} }
    if (temporary) { try { await io.unlink(temporary); } catch {} }
  }
}
function adapterStatus(adapter) {
  try {
    const result = adapter.status();
    const status = STORAGE_STATES.includes(result?.status) && (result.status !== 'available' || result.available === true)
      ? result.status : 'unavailable';
    return { available: status === 'available', status };
  } catch { return { available: false, status: 'unavailable' }; }
}
function publicStatus(settings, adapter) {
  const providers = {};
  for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
    const saved = settings.providers?.[name] || {};
    providers[name] = {
      configured: !!saved.credential,
      ...nonSecretFields(saved, defaults),
      credentialStatus: saved.apiKey ? 'migration-required' : saved.credential ? 'saved' : 'empty'
    };
  }
  return { providers, secureStorage: adapterStatus(adapter) };
}
async function credentialOperation(adapter, operation, value) {
  const state = adapterStatus(adapter);
  // A previous native denial may be retried by a new explicit user operation.
  if (!state.available && state.status !== 'locked') {
    throw failure(`CREDENTIAL_STORAGE_${state.status.toUpperCase()}`);
  }
  try { return await adapter[operation](value); }
  catch (error) {
    const code = ['CREDENTIAL_STORAGE_UNSUPPORTED', 'CREDENTIAL_STORAGE_UNAVAILABLE',
      'CREDENTIAL_STORAGE_LOCKED', 'CREDENTIAL_INVALID'].includes(error?.code)
      ? error.code : 'CREDENTIAL_STORAGE_LOCKED';
    throw failure(code);
  }
}
async function encryptCredential(adapter, value) {
  const ciphertext = await credentialOperation(adapter, 'encrypt', value);
  if (!validCiphertext(ciphertext)) throw failure('CREDENTIAL_INVALID');
  if (await credentialOperation(adapter, 'decrypt', ciphertext) !== value) throw failure('CREDENTIAL_INVALID');
  return { version: 1, kind: 'electron-safe-storage', ciphertext };
}
function validatePatch(patch) {
  if (!object(patch)) throw failure('SETTINGS_INVALID_PATCH');
  for (const name of Object.keys(PROVIDER_DEFAULTS)) {
    const incoming = patch[name];
    if (incoming === undefined) continue;
    if (!object(incoming)) throw failure('SETTINGS_INVALID_PATCH');
    if (Object.hasOwn(incoming, 'apiKey') && (typeof incoming.apiKey !== 'string'
      || incoming.apiKey.length > 8192)) throw failure('SETTINGS_INVALID_PATCH');
    if (Object.hasOwn(incoming, 'model') && (typeof incoming.model !== 'string'
      || (incoming.model.trim() && !validModel(incoming.model.trim())))) throw failure('SETTINGS_INVALID_PATCH');
    if (Object.hasOwn(incoming, 'proxy') && (typeof incoming.proxy !== 'string'
      || !validProxy(incoming.proxy.trim()))) throw failure('SETTINGS_INVALID_PATCH');
  }
}
function desktopRecord(settings) {
  const record = { version: 1, providers: {} };
  for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
    const saved = settings.providers?.[name];
    if (!saved) continue;
    const fields = nonSecretFields(saved, defaults);
    const provider = { model: fields.model };
    if (fields.proxy) provider.proxy = fields.proxy;
    // Plaintext exists only in this private candidate until explicit migration or
    // replacement/clear. applyPatch refuses to persist a pending legacy value.
    if (saved.apiKey) provider.apiKey = saved.apiKey;
    if (saved.credential) provider.credential = {
      version: 1, kind: 'electron-safe-storage', ciphertext: saved.credential.ciphertext
    };
    record.providers[name] = provider;
  }
  return record;
}
async function applyPatch(settings, patch, adapter) {
  validatePatch(patch);
  if (adapter) settings = desktopRecord(settings);
  settings.providers ||= {};
  for (const name of Object.keys(PROVIDER_DEFAULTS)) {
    const incoming = patch[name];
    if (!incoming) continue;
    const current = { ...(settings.providers[name] || {}) };
    if (Object.hasOwn(incoming, 'apiKey')) {
      delete current.apiKey;
      delete current.credential;
      if (incoming.apiKey) {
        if (adapter) current.credential = await encryptCredential(adapter, incoming.apiKey);
        else current.apiKey = incoming.apiKey;
      }
    }
    if (incoming.model?.trim()) current.model = incoming.model.trim();
    if (typeof incoming.proxy === 'string') {
      if (incoming.proxy.trim()) current.proxy = incoming.proxy.trim();
      else delete current.proxy;
    }
    if (adapter && incoming.apiKey) {
      const fields = nonSecretFields({ ...current, apiKey: incoming.apiKey }, PROVIDER_DEFAULTS[name]);
      current.model = fields.model;
      if (fields.proxy) current.proxy = fields.proxy;
      else delete current.proxy;
    }
    settings.providers[name] = current;
  }
  if (adapter && Object.keys(PROVIDER_DEFAULTS).some((name) => settings.providers[name]?.apiKey)) {
    throw failure('CREDENTIAL_MIGRATION_REQUIRED');
  }
  return settings;
}
export function createSettingsStore(root, { credentialAdapter, io = fs } = {}) {
  const settingsPath = resolve(join(root, 'settings.json'));
  const expose = (record) => credentialAdapter ? publicStatus(record, credentialAdapter) : record;
  const read = () => readRecord(settingsPath, io);
  async function readSettings() { return serialize(settingsPath, async () => expose(await read())); }
  async function status() {
    return serialize(settingsPath, async () => {
      const record = await read();
      return credentialAdapter ? publicStatus(record, credentialAdapter) : { providers: maskProviderSettings(record) };
    });
  }
  async function updateProviders(patch) {
    return serialize(settingsPath, async () => {
      const record = await applyPatch(await read(), patch, credentialAdapter);
      await writeRecord(settingsPath, record, io);
      return expose(record);
    });
  }
  async function migrateLegacy(options) {
    if (options?.consent !== true) throw failure('CREDENTIAL_CONSENT_REQUIRED');
    if (!credentialAdapter) throw failure('CREDENTIAL_STORAGE_UNAVAILABLE');
    return serialize(settingsPath, async () => {
      const record = desktopRecord(await read());
      let changed = false;
      for (const name of Object.keys(PROVIDER_DEFAULTS)) {
        const saved = record.providers?.[name];
        if (!saved?.apiKey) continue;
        saved.credential = await encryptCredential(credentialAdapter, saved.apiKey);
        delete saved.apiKey;
        changed = true;
      }
      if (changed) await writeRecord(settingsPath, record, io);
      return expose(record);
    });
  }
  async function providerSettings(name) {
    return serialize(settingsPath, async () => {
      if (!Object.hasOwn(PROVIDER_DEFAULTS, name)) throw failure('SETTINGS_INVALID_PATCH');
      const saved = (await read()).providers?.[name] || {};
      const result = nonSecretFields(saved, PROVIDER_DEFAULTS[name]);
      if (credentialAdapter && saved.apiKey) throw failure('CREDENTIAL_MIGRATION_REQUIRED');
      if (saved.credential) {
        if (!credentialAdapter) throw failure('CREDENTIAL_STORAGE_UNAVAILABLE');
        const key = await credentialOperation(credentialAdapter, 'decrypt', saved.credential.ciphertext);
        if (typeof key !== 'string' || !key) throw failure('CREDENTIAL_INVALID');
        result.apiKey = key;
      } else if (!credentialAdapter && saved.apiKey) result.apiKey = saved.apiKey;
      return result;
    });
  }
  return { settingsPath, readSettings, status, updateProviders, migrateLegacy, providerSettings };
}
