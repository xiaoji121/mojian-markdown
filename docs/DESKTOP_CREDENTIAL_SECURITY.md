# Desktop AI credentials

## Scope and trust boundary

The Electron app creates its credential adapter after `app.whenReady()`. Windows
uses Electron 43.2 safeStorage (DPAPI), and macOS uses its Keychain-backed API.
Linux persistent secret storage is deliberately unsupported for now; in
particular, `basic_text` is never accepted and plaintext fallback is never enabled.
A failed/locked/unavailable store does not prevent ordinary document editing.
The native API does not expose a precise lock query: `locked` means the previous
native operation failed or was denied, and an explicit action can retry.

Desktop settings operations use narrow IPC validated against the current window,
main frame and exact application origin/path. There is no renderer decrypt API.
Desktop HTTP settings endpoints are disabled. Other `/api/` requests, including
chat and translation, require a random per-process capability injected only by
the main process for the trusted app frame. Host and Origin are checked; body
mutations require JSON (bodyless DELETE remains supported). The capability is
stripped from requests outside the app origin. Random ports and `cors:false` are
not authentication by themselves. The bridge remains loopback-only/random-port.

This protects stored-file confidentiality and rejects unauthenticated loopback
API clients/hostile websites. It does **not** protect a compromised app renderer,
a compromised OS account, or malicious same-user software that can inspect app
memory or invoke the OS credential service. Windows DPAPI is not same-user app
isolation. macOS release signing/Keychain identity across upgrades is a separate
release requirement, not established by unsigned or mocked tests. A custom proxy
can observe provider traffic according to its capabilities and trust model.

## Save, migration and clear

- Opening the app or settings never contacts Google, encrypts, decrypts, migrates
  or writes a credential. Status is a strict nonsecret allowlist: configured,
  model, proxy and credential/storage states, without even a key suffix.
- Save explicitly encrypts the supplied key and verifies a decrypt round trip
  before replacing the settings record. Settings store a versioned encrypted
  envelope in the existing workspace `settings.json`; no key is put in editor
  state, localStorage, or IndexedDB.
- Old plaintext credentials are detected but neither used nor automatically
  migrated. The UI explains that clicking “同意迁移旧明文 Key” encrypts and replaces
  the file locally. Only this explicit consent action migrates. A replacement or
  clear is also an explicit user action. No plaintext `.bak` is created.
- Writes are serialized per settings path, use an exclusive same-directory
  temporary file with restrictive permissions, sync the file, and atomically
  rename. POSIX also syncs the directory. Before-rename failures preserve the
  original. After-rename directory-sync failure reports an uncertain commit;
  it never restores an old secret or silently claims success.
- Missing files initialize normally. Malformed/unsupported/unreadable files fail
  closed and are not overwritten. Keep a separate copy before manual recovery.
- An omitted key preserves the current key; an empty key explicitly clears it.
  Queued updates read the latest record; old writes/migration cannot restore a
  cleared key. Clear removes this app's saved copy, not provider-side access, an
  already running request, filesystem snapshots or forensic remnants.
- Closing settings or submitting Save clears the password field. Late operations
  cannot overwrite a newly opened form. Repeated save/test clicks are coalesced.

Only the explicit “测试连接” action contacts Google with a key (through the saved
proxy, if any). Save/startup/migration do not test credentials. Provider error and
stream output redact exact credential values; connection-test IPC returns no
provider response body. Normal chat/translation use a saved credential only when
those features are requested.

The standalone CLI/web bridge is a separate existing mode: its UI discloses local
plaintext settings. Do not expose that server to an untrusted network. This PR
does not retrofit desktop IPC authentication onto that mode.

## Verification and limits

Tests use fabricated credentials, injected crypto and loopback-only provider
mocks. Unit tests cover crypto failure, corruption, atomic-write failure,
consent, save/clear races, strict status, IPC/frame/capability rejection, and
provider-output redaction. Browser tests cover consent text and password
clearing. Windows packaged tests replace safeStorage with fake AES before any
credential operation, run UI migration, and verify encrypted persistence and
clear across restarts outside the checkout.

These tests do not validate real Keychain/DPAPI credentials, real provider access,
installer behavior, SmartScreen, signing, or signed-app upgrade identity.
