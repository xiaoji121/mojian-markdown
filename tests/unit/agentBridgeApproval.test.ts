import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalBroker } from '../../scripts/agent-bridge-tool-policy.js';

test('审批票据绑定请求、工具与参数，且只能使用一次', async () => {
  const broker = createApprovalBroker({ timeoutMs: 1000 });
  const ticket = broker.request({
    requestId: 'request-1',
    toolName: 'replace_current_document',
    args: { expectedVersion: 'v1', content: '# 新正文' }
  });

  assert.equal(broker.decide(ticket.approvalId, {
    approved: true,
    argsHash: 'wrong-hash'
  }).ok, false, '参数摘要不匹配时不得批准');

  assert.equal(broker.decide(ticket.approvalId, {
    approved: true,
    argsHash: ticket.argsHash
  }).ok, true);
  assert.equal(await ticket.wait(), true);
  assert.equal(broker.decide(ticket.approvalId, {
    approved: true,
    argsHash: ticket.argsHash
  }).ok, false, '票据消费后不能重放');
});

test('审批超时按拒绝处理并清理票据', async () => {
  const broker = createApprovalBroker({ timeoutMs: 10 });
  const ticket = broker.request({
    requestId: 'request-timeout',
    toolName: 'replace_current_document',
    args: { content: '超时' }
  });

  assert.equal(await ticket.wait(), false);
  assert.equal(broker.pendingCount(), 0);
});
