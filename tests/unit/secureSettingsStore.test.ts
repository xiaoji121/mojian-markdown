import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsStore, maskProviderSettings } from '../../scripts/agent-bridge-settings.js';

const FAKE_KEY = 'fake-test-credential-do-not-use-1234';
function fakeAdapter() {
  const values = new Map<string, string>();
  let sequence = 0;
  const calls = { encrypt: 0, decrypt: 0 };
  return {
    calls, state: 'available', failEncrypt: false, failDecrypt: false,
    status() { return { available: this.state === 'available', status: this.state }; },
    encrypt(value: string) {
      calls.encrypt++;
      if (this.state !== 'available') throw Object.assign(new Error('Fake storage is unavailable'), { code: `CREDENTIAL_STORAGE_${this.state.toUpperCase()}` });
      if (this.failEncrypt) throw new Error(FAKE_KEY);
      const encrypted = Buffer.from(`opaque-test-record-${++sequence}`).toString('base64');
      values.set(encrypted, value);
      return encrypted;
    },
    decrypt(value: string) {
      calls.decrypt++;
      if (this.failDecrypt || !values.has(value)) throw new Error(FAKE_KEY);
      return values.get(value);
    }
  };
}
async function fixture(run: (f: any) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'secure-settings-'));
  const adapter = fakeAdapter();
  const store = createSettingsStore(root, { credentialAdapter: adapter });
  try { await run({ root, store, adapter }); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}
function assertNoSecret(value: unknown) {
  const text = JSON.stringify(value);
  for (const secret of [FAKE_KEY, FAKE_KEY.slice(-4), 'ciphertext', 'apiKey', 'apiKeyTail']) {
    assert.ok(!text.includes(secret), `Unexpected credential material: ${secret}`);
  }
}

test('desktop stores only ciphertext in the same atomic settings record and decrypts only for use', async () => {
  await fixture(async ({ store, adapter, root }) => {
    assert.equal(adapter.calls.encrypt + adapter.calls.decrypt, 0);
    const empty = await store.status();
    assert.equal(empty.providers.gemini.credentialStatus, 'empty');
    const response = await store.updateProviders({ gemini: { apiKey: FAKE_KEY, model: 'gemini-2.5-pro' } });
    const disk = JSON.parse(await fs.readFile(store.settingsPath, 'utf8'));
    assert.equal(disk.providers.gemini.apiKey, undefined);
    assert.equal(disk.providers.gemini.credential.version, 1);
    assert.equal(disk.providers.gemini.credential.kind, 'electron-safe-storage');
    assert.equal(typeof disk.providers.gemini.credential.ciphertext, 'string');
    assert.ok(!JSON.stringify(disk).includes(FAKE_KEY));
    assertNoSecret(response);
    assertNoSecret(await store.readSettings());
    assert.equal(adapter.calls.decrypt, 1, 'save verifies only its new ciphertext');
    assert.equal(response.providers.gemini.credentialStatus, 'saved');
    assert.equal((await store.providerSettings('gemini')).apiKey, FAKE_KEY);
    assert.equal(adapter.calls.decrypt, 2);
    assert.deepEqual(await fs.readdir(root), ['settings.json']);
    if (process.platform !== 'win32') assert.equal((await fs.stat(store.settingsPath)).mode & 0o777, 0o600);
  });
});

test('omitted fields preserve encrypted key; explicit empty clears without decrypting', async () => {
  await fixture(async ({ store, adapter }) => {
    await store.updateProviders({ gemini: { apiKey: FAKE_KEY, proxy: 'http://127.0.0.1:7890' } });
    const first = JSON.parse(await fs.readFile(store.settingsPath, 'utf8')).providers.gemini.credential;
    await store.updateProviders({ gemini: { model: 'gemini-2.5-pro' } });
    const kept = JSON.parse(await fs.readFile(store.settingsPath, 'utf8')).providers.gemini;
    assert.deepEqual(kept.credential, first);
    assert.equal(kept.proxy, 'http://127.0.0.1:7890');
    adapter.state = 'locked';
    await store.updateProviders({ gemini: { apiKey: '', proxy: '' } });
    const disk = JSON.parse(await fs.readFile(store.settingsPath, 'utf8')).providers.gemini;
    assert.equal(disk.credential, undefined);
    assert.equal(disk.apiKey, undefined);
    assert.equal(disk.proxy, undefined);
    assert.equal(adapter.calls.decrypt, 1, 'clear does not decrypt the prior saved credential');
    assert.equal((await store.status()).providers.gemini.configured, false);
  });
});

test('legacy plaintext stays untouched and unavailable until explicit consent migration', async () => {
  await fixture(async ({ store, adapter }) => {
    const raw = JSON.stringify({ providers: { gemini: { apiKey: FAKE_KEY, model: 'gemini-2.5-pro' } } });
    await fs.writeFile(store.settingsPath, raw);
    const status = await store.status();
    assert.equal(status.providers.gemini.credentialStatus, 'migration-required');
    assert.equal(status.providers.gemini.configured, false);
    assertNoSecret(status);
    assertNoSecret(await store.readSettings());
    await assert.rejects(store.providerSettings('gemini'), { code: 'CREDENTIAL_MIGRATION_REQUIRED' });
    await assert.rejects(store.migrateLegacy(), { code: 'CREDENTIAL_CONSENT_REQUIRED' });
    await assert.rejects(store.migrateLegacy({ consent: false }), { code: 'CREDENTIAL_CONSENT_REQUIRED' });
    await assert.rejects(store.updateProviders({ gemini: { model: 'gemini-2.0-flash' } }), { code: 'CREDENTIAL_MIGRATION_REQUIRED' });
    assert.equal(await fs.readFile(store.settingsPath, 'utf8'), raw);
    assert.equal(adapter.calls.encrypt + adapter.calls.decrypt, 0);
    assertNoSecret(await store.migrateLegacy({ consent: true }));
    assert.equal(adapter.calls.encrypt, 1);
    assert.equal(adapter.calls.decrypt, 1, 'migration verifies only its new ciphertext');
    assert.equal((await store.providerSettings('gemini')).apiKey, FAKE_KEY);
    assert.ok(!(await fs.readFile(store.settingsPath, 'utf8')).includes(FAKE_KEY));
  });
});

test('migration encryption failure preserves original bytes and hides native error text', async () => {
  await fixture(async ({ store, adapter, root }) => {
    const raw = JSON.stringify({ providers: { gemini: { apiKey: FAKE_KEY } } });
    await fs.writeFile(store.settingsPath, raw);
    adapter.failEncrypt = true;
    await assert.rejects(store.migrateLegacy({ consent: true }), (error: any) => {
      assert.ok(!String(error).includes(FAKE_KEY));
      return error.code === 'CREDENTIAL_STORAGE_LOCKED';
    });
    assert.equal(await fs.readFile(store.settingsPath, 'utf8'), raw);
    assert.deepEqual(await fs.readdir(root), ['settings.json']);
  });
});

test('legacy clear is allowed while secure storage is unavailable and never encrypts', async () => {
  await fixture(async ({ store, adapter }) => {
    await fs.writeFile(store.settingsPath, JSON.stringify({ providers: { gemini: { apiKey: FAKE_KEY } } }));
    adapter.state = 'unavailable';
    await store.updateProviders({ gemini: { apiKey: '' } });
    assertNoSecret(await store.status());
    assert.ok(!(await fs.readFile(store.settingsPath, 'utf8')).includes(FAKE_KEY));
    assert.equal(adapter.calls.encrypt + adapter.calls.decrypt, 0);
  });
});

test('concurrent read-modify-write across store instances cannot resurrect a cleared key', async () => {
  await fixture(async ({ root, store, adapter }) => {
    await store.updateProviders({ gemini: { apiKey: FAKE_KEY } });
    const other = createSettingsStore(root, { credentialAdapter: adapter });
    await Promise.all([
      store.updateProviders({ gemini: { model: 'gemini-2.5-pro' } }),
      other.updateProviders({ gemini: { apiKey: '' } }),
      store.updateProviders({ gemini: { proxy: 'http://localhost:7890' } })
    ]);
    const final = JSON.parse(await fs.readFile(store.settingsPath, 'utf8')).providers.gemini;
    assert.equal(final.credential, undefined);
    assert.equal(final.apiKey, undefined);
    assert.equal(final.model, 'gemini-2.5-pro');
    assert.equal(final.proxy, 'http://localhost:7890');
  });
});

test('migration and clear are serialized and a later migration cannot resurrect clear', async () => {
  await fixture(async ({ store }) => {
    await fs.writeFile(store.settingsPath, JSON.stringify({ providers: { gemini: { apiKey: FAKE_KEY } } }));
    await Promise.all([
      store.migrateLegacy({ consent: true }),
      store.updateProviders({ gemini: { apiKey: '' } }),
      store.migrateLegacy({ consent: true })
    ]);
    assert.equal((await store.status()).providers.gemini.configured, false);
    assert.equal((await store.providerSettings('gemini')).apiKey, undefined);
  });
});

test('malformed, unsupported and non-object settings fail closed without replacement', async () => {
  await fixture(async ({ store }) => {
    for (const raw of ['{', 'null', '[]', '{"providers":[]}', '{"providers":{"gemini":{"apiKey":123}}}',
      '{"providers":{"gemini":{"credential":{"version":9,"kind":"electron-safe-storage","ciphertext":"YWJj"}}}}']) {
      await fs.writeFile(store.settingsPath, raw);
      await assert.rejects(store.readSettings(), { code: 'SETTINGS_INVALID' });
      await assert.rejects(store.updateProviders({ gemini: { apiKey: '' } }), { code: 'SETTINGS_INVALID' });
      assert.equal(await fs.readFile(store.settingsPath, 'utf8'), raw);
    }
  });
});

test('read I/O failures are not treated as missing files', async () => {
  await fixture(async ({ root, adapter }) => {
    const io = { ...fs, async readFile() { throw Object.assign(new Error(FAKE_KEY), { code: 'EACCES' }); } };
    const store = createSettingsStore(root, { credentialAdapter: adapter, io });
    await assert.rejects(store.updateProviders({ gemini: { apiKey: '' } }), (error: any) => {
      assert.ok(!String(error).includes(FAKE_KEY));
      return error.code === 'SETTINGS_READ_FAILED';
    });
    assert.deepEqual(await fs.readdir(root), []);
  });
});

test('failed atomic rename preserves existing ciphertext and removes temporary record', async () => {
  await fixture(async ({ root, store, adapter }) => {
    await store.updateProviders({ gemini: { apiKey: FAKE_KEY } });
    const before = await fs.readFile(store.settingsPath, 'utf8');
    const io = { ...fs, async rename() { throw new Error(FAKE_KEY); } };
    const failing = createSettingsStore(root, { credentialAdapter: adapter, io });
    await assert.rejects(failing.updateProviders({ gemini: { apiKey: '' } }), (error: any) => {
      assert.ok(!String(error).includes(FAKE_KEY));
      return error.code === 'SETTINGS_WRITE_FAILED';
    });
    assert.equal(await fs.readFile(store.settingsPath, 'utf8'), before);
    assert.deepEqual(await fs.readdir(root), ['settings.json']);
  });
});

test('unavailable/unsupported/locked adapter fails closed and failed decrypt cannot leak diagnostics', async () => {
  await fixture(async ({ store, adapter }) => {
    for (const state of ['unavailable', 'unsupported', 'locked']) {
      adapter.state = state;
      await assert.rejects(store.updateProviders({ gemini: { apiKey: FAKE_KEY } }), {
        code: `CREDENTIAL_STORAGE_${state.toUpperCase()}`
      });
    }
    adapter.state = 'available';
    await store.updateProviders({ gemini: { apiKey: FAKE_KEY } });
    adapter.failDecrypt = true;
    await assert.rejects(store.providerSettings('gemini'), (error: any) => {
      assert.ok(!String(error).includes(FAKE_KEY));
      return error.code === 'CREDENTIAL_STORAGE_LOCKED';
    });
  });
});

test('strict public status never includes key tails, unknown fields or unsafe model/proxy values', async () => {
  const masked = maskProviderSettings({ providers: { gemini: {
    apiKey: FAKE_KEY, model: FAKE_KEY, proxy: `http://user:${FAKE_KEY}@localhost:7890/?key=${FAKE_KEY}`,
    arbitrary: FAKE_KEY
  } } });
  assert.deepEqual(masked.gemini, { configured: true, model: 'gemini-2.5-flash', proxy: '' });
  assertNoSecret(masked);
  await fixture(async ({ store }) => {
    for (const patch of [{ model: FAKE_KEY }, { proxy: `http://user:${FAKE_KEY}@localhost:7890` },
      { proxy: `http://localhost:7890/?key=${FAKE_KEY}` }, { proxy: 'http://localhost:7890/#secret' }]) {
      await assert.rejects(store.updateProviders({ gemini: patch }), { code: 'SETTINGS_INVALID_PATCH' });
    }
  });
});

test('migration verifies the encrypted candidate before replacing any legacy bytes', async () => {
  await fixture(async ({ store, adapter, root }) => {
    const raw = JSON.stringify({ providers: { gemini: { apiKey: FAKE_KEY } } });
    await fs.writeFile(store.settingsPath, raw);
    adapter.decrypt = () => 'incorrect-roundtrip';
    await assert.rejects(store.migrateLegacy({ consent: true }), { code: 'CREDENTIAL_INVALID' });
    assert.equal(await fs.readFile(store.settingsPath, 'utf8'), raw);
    assert.deepEqual(await fs.readdir(root), ['settings.json']);
  });
});

test('desktop replacement removes unknown fields and legacy secret copies in non-secret fields', async () => {
  await fixture(async ({ store }) => {
    await fs.writeFile(store.settingsPath, JSON.stringify({ unknown: FAKE_KEY, providers: {
      unknown: { apiKey: FAKE_KEY }, gemini: { apiKey: FAKE_KEY, model: 'gemini-' + FAKE_KEY,
        proxy: `http://${FAKE_KEY}.example.com`, arbitrary: FAKE_KEY }
    } }));
    await store.migrateLegacy({ consent: true });
    const raw = await fs.readFile(store.settingsPath, 'utf8');
    const disk = JSON.parse(raw);
    assert.ok(!raw.includes(FAKE_KEY));
    assert.deepEqual(Object.keys(disk).sort(), ['providers', 'version']);
    assert.equal(disk.version, 1);
    assert.deepEqual(Object.keys(disk.providers), ['gemini']);
    assert.deepEqual(Object.keys(disk.providers.gemini).sort(), ['credential', 'model']);
    assert.equal(disk.providers.gemini.model, 'gemini-2.5-flash');
  });
});

test('unsupported top-level versions and oversized credentials fail closed', async () => {
  await fixture(async ({ store }) => {
    for (const version of [0, 2, null, '1']) {
      const raw = JSON.stringify({ version, providers: {} });
      await fs.writeFile(store.settingsPath, raw);
      await assert.rejects(store.readSettings(), { code: 'SETTINGS_INVALID' });
      await assert.rejects(store.updateProviders({ gemini: { apiKey: '' } }), { code: 'SETTINGS_INVALID' });
      assert.equal(await fs.readFile(store.settingsPath, 'utf8'), raw);
    }
    await fs.unlink(store.settingsPath);
    await assert.rejects(store.updateProviders({ gemini: { apiKey: 'x'.repeat(8193) } }), { code: 'SETTINGS_INVALID_PATCH' });
  });
});

test('POSIX directory flush failure reports uncertain commit without reverting the committed clear', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX directory fsync only');
  await fixture(async ({ root, store, adapter }) => {
    await store.updateProviders({ gemini: { apiKey: FAKE_KEY } });
    const io = { ...fs, async open(path: string, ...args: any[]) {
      if (path === root) return { async sync() { throw new Error(FAKE_KEY); }, async close() {} };
      return fs.open(path, ...args);
    } };
    const failing = createSettingsStore(root, { credentialAdapter: adapter, io });
    await assert.rejects(failing.updateProviders({ gemini: { apiKey: '' } }), { code: 'SETTINGS_WRITE_UNCERTAIN' });
    assert.equal((await store.status()).providers.gemini.configured, false);
    assert.deepEqual(await fs.readdir(root), ['settings.json']);
  });
});
