import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgePrompt } from '../../scripts/agent-bridge.js';

test('只读问答提示词禁止模型谎称已经修改文档', () => {
  const prompt = bridgePrompt({
    question: '把这段删掉',
    selection: { quote: '待删除内容' }
  }, {
    fileName: 'note.md',
    content: '# 标题\n待删除内容'
  });

  assert.match(prompt, /只读问答模式/);
  assert.match(prompt, /不能修改文档/);
  assert.match(prompt, /不得声称已经修改/);
});
