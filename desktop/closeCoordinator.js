import { randomUUID } from 'node:crypto';

// No Electron dependencies: close/failure/timeout behavior is tested in isolation.
export function createCloseCoordinator({ prepare, waitForWrites, close, confirmLoss, onCancel = () => {},
  schedule = setTimeout, cancel = clearTimeout, timeoutMs = 15000 }) {
  let pending = null;
  let disposed = false;
  function finish(id) {
    if (disposed || pending?.id !== id) return;
    cancel(pending.timer);
    pending = null;
    close();
  }
  async function fail(id) {
    if (disposed || pending?.id !== id || pending.prompting) return;
    pending.prompting = true;
    cancel(pending.timer);
    let leave = false;
    try { leave = await confirmLoss(); } catch {}
    if (disposed || pending?.id !== id) return;
    if (leave) finish(id);
    else {
      pending = null;
      onCancel(id);
    }
  }
  function request() {
    if (disposed || pending) return;
    const id = randomUUID();
    pending = { id, timer: null, prompting: false, completing: false };
    pending.timer = schedule(() => { void fail(id); }, timeoutMs);
    try { prepare(id); } catch { void fail(id); }
  }
  async function complete(id, success) {
    if (disposed || pending?.id !== id || pending.prompting || pending.completing) return;
    pending.completing = true;
    if (success !== true) return fail(id);
    try {
      await waitForWrites();
      if (pending?.id === id && !pending.prompting) finish(id);
    } catch { await fail(id); }
  }
  function dispose() {
    disposed = true;
    if (pending) cancel(pending.timer);
    pending = null;
  }
  return { request, complete, dispose };
}
