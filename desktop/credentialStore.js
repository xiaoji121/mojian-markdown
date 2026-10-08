// Electron 43.2 synchronous safeStorage, injected only after app readiness.
// Linux support is intentionally deferred: never select basic_text or enable
// setUsePlainTextEncryption. Status checks do not encrypt or decrypt credentials.
const MESSAGES = {
  CREDENTIAL_STORAGE_UNSUPPORTED: 'Secure credential storage is unsupported on this platform.',
  CREDENTIAL_STORAGE_UNAVAILABLE: 'Secure credential storage is unavailable.',
  CREDENTIAL_STORAGE_LOCKED: 'Secure credential storage is locked or access was denied.',
  CREDENTIAL_INVALID: 'The stored credential could not be read safely.'
};
function failure(code) { return Object.assign(new Error(MESSAGES[code]), { code }); }
function validCiphertext(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 65536
    && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
    && Buffer.from(value, 'base64').toString('base64') === value;
}
export function createSafeStorageAdapter({ safeStorage, app, platform = process.platform }) {
  let denied = false;
  function inspect(includePreviousDenial = true) {
    if (!['darwin', 'win32'].includes(platform)) return 'unsupported';
    try {
      if (!app?.isReady() || !safeStorage?.isEncryptionAvailable()) return 'unavailable';
      return denied && includePreviousDenial ? 'locked' : 'available';
    } catch { return 'unavailable'; }
  }
  function status() {
    const state = inspect();
    return { available: state === 'available', status: state };
  }
  function requireAvailable() {
    const state = inspect(false);
    if (state !== 'available') throw failure(`CREDENTIAL_STORAGE_${state.toUpperCase()}`);
  }
  function encrypt(value) {
    requireAvailable();
    if (typeof value !== 'string' || !value) throw failure('CREDENTIAL_INVALID');
    let encrypted;
    try { encrypted = safeStorage.encryptString(value); }
    catch { denied = true; throw failure('CREDENTIAL_STORAGE_LOCKED'); }
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw failure('CREDENTIAL_INVALID');
    denied = false;
    return encrypted.toString('base64');
  }
  function decrypt(value) {
    requireAvailable();
    if (!validCiphertext(value)) throw failure('CREDENTIAL_INVALID');
    let plaintext;
    try { plaintext = safeStorage.decryptString(Buffer.from(value, 'base64')); }
    catch { denied = true; throw failure('CREDENTIAL_STORAGE_LOCKED'); }
    if (typeof plaintext !== 'string' || !plaintext) throw failure('CREDENTIAL_INVALID');
    denied = false;
    return plaintext;
  }
  return { status, encrypt, decrypt };
}
