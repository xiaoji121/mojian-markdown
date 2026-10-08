// Provider/proxy error bodies must not echo credentials into SSE, history or UI.
// Retain only a possible key prefix between chunks, not ordinary answer text.
export function credentialOutput(key, onDelta) {
  const secrets = typeof key === 'string' && key ? [...new Set([key, encodeURIComponent(key)])] : [];
  let pending = '';
  function text(value) {
    let clean = String(value ?? '');
    for (const secret of secrets) clean = clean.split(secret).join('[redacted]');
    return clean;
  }
  function delta(value) {
    pending = text(pending + value);
    let retain = 0;
    for (const secret of secrets) {
      for (let length = 1; length < secret.length && length <= pending.length; length++) {
        if (pending.endsWith(secret.slice(0, length))) retain = Math.max(retain, length);
      }
    }
    const emit = pending.slice(0, pending.length - retain);
    pending = pending.slice(pending.length - retain);
    if (emit) onDelta(emit);
  }
  function flush() {
    if (pending) onDelta(text(pending));
    pending = '';
  }
  return { text, delta, flush };
}
