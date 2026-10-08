import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { createMockCli, mockCliEnv } from './mockCli.ts';

const mockSource = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const outputAt = args.indexOf('--output-last-message');
const record = { args, stdin: '', cwd: process.cwd(), marker: process.env.MOCK_ENGINE_MARKER, pid: process.pid };
function answer() {
  const text = JSON.stringify(record);
  if (outputAt >= 0) {
    process.stdout.write('[thinking] this is not the answer\\n');
    fs.writeFileSync(args[outputAt + 1], text);
  } else {
    process.stdout.write(text);
  }
}
function run() {
  if (process.env.MOCK_ENGINE_RECORD) fs.writeFileSync(process.env.MOCK_ENGINE_RECORD, JSON.stringify(record));
  if (process.env.MOCK_ENGINE_BEHAVIOR === 'fail') {
    process.stderr.write('模拟 CLI failure');
    process.exitCode = 17;
  } else if (process.env.MOCK_ENGINE_BEHAVIOR === 'hang') {
    if (outputAt >= 0) process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');
    else process.stdout.write('ready\\n');
    // Bound failures against the old implementation without leaving a hanging test process.
    setTimeout(answer, 900);
  } else {
    answer();
  }
}
if (outputAt >= 0 || args.includes('--allowedTools')) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { record.stdin += chunk; });
  process.stdin.on('end', run);
} else {
  run();
}
`;

export async function createEngineCli(t: TestContext, engine: 'claude' | 'codex') {
  const root = await mkdtemp(join(tmpdir(), 'mojian-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, '中文 npm & CLI 路径');
  const cwd = join(root, '中文 工程 & files');
  await mkdir(cwd);
  const name = 'mojian-test-' + engine;
  const command = await createMockCli(bin, name, mockSource);
  const env = mockCliEnv(bin);
  env[`AGENT_BRIDGE_${engine.toUpperCase()}_COMMAND`] = name;
  env.MOCK_ENGINE_MARKER = '仅来自传入 env 的值';
  const recordFile = join(root, 'process.json');
  env.MOCK_ENGINE_RECORD = recordFile;
  return {
    root, bin, command, cwd, env, recordFile,
    readRecord: async () => JSON.parse(await readFile(recordFile, 'utf8'))
  };
}
