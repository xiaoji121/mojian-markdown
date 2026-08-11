// 一次性工具审批票据：绑定 requestId、工具名与参数摘要，短时有效且只能消费一次。
import { createHash, randomUUID } from 'node:crypto';

function argsDigest({ requestId, toolName, args }) {
  return createHash('sha256')
    .update(String(requestId || ''))
    .update('\0')
    .update(String(toolName || ''))
    .update('\0')
    .update(JSON.stringify(args || {}))
    .digest('hex');
}

export function createApprovalBroker({ timeoutMs = 120_000 } = {}) {
  const pending = new Map();

  function request({ requestId, toolName, args }) {
    const approvalId = randomUUID();
    const argsHash = argsDigest({ requestId, toolName, args });
    let resolveDecision;
    const decision = new Promise((resolve) => { resolveDecision = resolve; });
    const timer = setTimeout(() => {
      if (!pending.delete(approvalId)) return;
      resolveDecision(false);
    }, timeoutMs);
    pending.set(approvalId, { argsHash, timer, resolveDecision });
    return { approvalId, argsHash, wait: () => decision };
  }

  function decide(approvalId, { approved, argsHash } = {}) {
    const ticket = pending.get(String(approvalId || ''));
    if (!ticket) return { ok: false, message: '审批已失效或已使用' };
    if (argsHash !== ticket.argsHash) return { ok: false, message: '审批参数不匹配' };
    pending.delete(approvalId);
    clearTimeout(ticket.timer);
    ticket.resolveDecision(approved === true);
    return { ok: true, approved: approved === true };
  }

  return { request, decide, pendingCount: () => pending.size };
}
