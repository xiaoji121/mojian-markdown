import { test } from 'node:test';
import assert from 'node:assert/strict';

const FAKE_KEY = 'fake-test-key-not-a-real-credential';
async function fixture(overrides = {}) {
  const { createSafeStorageAdapter } = await import('../../desktop/credentialStore.js');
  const calls = { encrypt: 0, decrypt: 0, plaintext: 0, available: 0, backend: 0 };
  const safeStorage = {
    isEncryptionAvailable() { calls.available++; return true; },
    getSelectedStorageBackend() { calls.backend++; return 'basic_text'; },
    encryptString(value: string) { calls.encrypt++; assert.equal(value, FAKE_KEY); return Buffer.from('opaque-test-bytes'); },
    decryptString(value: Buffer) { calls.decrypt++; assert.deepEqual(value, Buffer.from('opaque-test-bytes')); return FAKE_KEY; },
    setUsePlainTextEncryption() { calls.plaintext++; }
  };
  return { calls, safeStorage, adapter: createSafeStorageAdapter({ safeStorage, app: { isReady: () => true }, platform: 'darwin', ...overrides }) };
}

test('safeStorage adapter status does not encrypt/decrypt and secrets are only used by explicit methods', async () => {
  const { adapter, calls } = await fixture();
  assert.deepEqual(adapter.status(), { available: true, status: 'available' });
  assert.equal(calls.encrypt + calls.decrypt, 0);
  const ciphertext = adapter.encrypt(FAKE_KEY);
  assert.equal(ciphertext, Buffer.from('opaque-test-bytes').toString('base64'));
  assert.equal(adapter.decrypt(ciphertext), FAKE_KEY);
  assert.equal(calls.encrypt, 1);
  assert.equal(calls.decrypt, 1);
  assert.equal(calls.plaintext, 0);
});

test('adapter refuses pre-ready, unsupported OS, and all Linux backends including basic_text', async () => {
  const early = await fixture({ app: { isReady: () => false } });
  assert.deepEqual(early.adapter.status(), { available: false, status: 'unavailable' });
  assert.throws(() => early.adapter.encrypt(FAKE_KEY), { code: 'CREDENTIAL_STORAGE_UNAVAILABLE' });
  assert.equal(early.calls.available + early.calls.encrypt + early.calls.decrypt, 0);
  for (const platform of ['linux', 'freebsd']) {
    const { adapter, calls } = await fixture({ platform });
    assert.deepEqual(adapter.status(), { available: false, status: 'unsupported' });
    assert.throws(() => adapter.encrypt(FAKE_KEY), { code: 'CREDENTIAL_STORAGE_UNSUPPORTED' });
    assert.throws(() => adapter.decrypt('YWJj'), { code: 'CREDENTIAL_STORAGE_UNSUPPORTED' });
    assert.equal(calls.encrypt + calls.decrypt + calls.plaintext + calls.available, 0);
  }
});

test('unavailable OS store and locked operations produce only fixed error codes/messages', async () => {
  const unavailable = await fixture({ safeStorage: { isEncryptionAvailable() { return false; } } });
  assert.deepEqual(unavailable.adapter.status(), { available: false, status: 'unavailable' });
  assert.throws(() => unavailable.adapter.encrypt(FAKE_KEY), { code: 'CREDENTIAL_STORAGE_UNAVAILABLE' });
  const locked = await fixture({ safeStorage: {
    isEncryptionAvailable() { return true; },
    encryptString() { throw new Error(FAKE_KEY); },
    decryptString() { throw new Error(FAKE_KEY); }
  } });
  for (const operation of [() => locked.adapter.encrypt(FAKE_KEY), () => locked.adapter.decrypt('YWJj')]) {
    assert.throws(operation, (error: any) => {
      assert.equal(error.code, 'CREDENTIAL_STORAGE_LOCKED');
      assert.ok(!String(error).includes(FAKE_KEY));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  assert.deepEqual(locked.adapter.status(), { available: false, status: 'locked' });
});

test('malformed ciphertext is rejected before reaching the native decryptor', async () => {
  const { adapter, calls } = await fixture();
  for (const value of ['', 'not base64!', 'YQ', {}, null]) {
    assert.throws(() => adapter.decrypt(value), { code: 'CREDENTIAL_INVALID' });
  }
  assert.equal(calls.decrypt, 0);
});
