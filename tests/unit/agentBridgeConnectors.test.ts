import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  connectorCapabilities,
  connectorInvocation,
  normalizeTarget,
  pickUrl,
  publishDocument
} from '../../scripts/agent-bridge-connectors.js';

test('连接器能力检测区分可用、未登录与未安装', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'connector-capability-test-'));
  const lark = join(dir, 'fake-lark');
  const dws = join(dir, 'fake-dws');
  try {
    await writeFile(lark, '#!/bin/sh\necho \'{"identities":{"user":{"available":true}}}\'\n');
    await writeFile(dws, '#!/bin/sh\necho \'{"success":true,"authenticated":false,"token_valid":false}\'\n');
    await import('node:fs/promises').then(({ chmod }) => Promise.all([chmod(lark, 0o755), chmod(dws, 0o755)]));

    const capabilities = await connectorCapabilities({
      AGENT_BRIDGE_LARK_COMMAND: lark,
      AGENT_BRIDGE_DWS_COMMAND: dws,
    });

    assert.deepEqual(capabilities.feishu, { available: true, reason: '' });
    assert.equal(capabilities.dingtalk.available, false);
    assert.match(capabilities.dingtalk.reason, /未登录|登录失效/);

    const missing = await connectorCapabilities({
      AGENT_BRIDGE_LARK_COMMAND: join(dir, 'missing-lark'),
      AGENT_BRIDGE_DWS_COMMAND: join(dir, 'missing-dws'),
    });
    assert.match(missing.feishu.reason, /未安装|未找到/);
    assert.match(missing.dingtalk.reason, /未安装|未找到/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizeTarget 只认飞书与钉钉', () => {
  assert.equal(normalizeTarget('feishu'), 'feishu');
  assert.equal(normalizeTarget('dingtalk'), 'dingtalk');
  assert.throws(() => normalizeTarget('notion'), /不支持/);
});

test('飞书发布走 lark-cli markdown +create，文件名补 .md', () => {
  const invocation = connectorInvocation('feishu', { name: '技术方案', file: '/tmp/a.md', env: {} });

  assert.equal(invocation.command, 'lark-cli');
  assert.deepEqual(invocation.args.slice(0, 2), ['markdown', '+create']);
  const nameAt = invocation.args.indexOf('--name');
  assert.equal(invocation.args[nameAt + 1], '技术方案.md');
  const fileAt = invocation.args.indexOf('--file');
  assert.equal(invocation.args[fileAt + 1], '/tmp/a.md');
  assert.ok(invocation.args.includes('--format'));
});

test('钉钉发布走 dws drive upload，保留 .md 文件且不转在线文档', () => {
  const invocation = connectorInvocation('dingtalk', { name: '技术方案.md', file: '/tmp/a.md', env: {} });

  assert.equal(invocation.command, 'dws');
  assert.deepEqual(invocation.args.slice(0, 2), ['drive', 'upload']);
  const nameAt = invocation.args.indexOf('--file-name');
  assert.equal(invocation.args[nameAt + 1], '技术方案.md');
  const fileAt = invocation.args.indexOf('--file');
  assert.equal(invocation.args[fileAt + 1], '/tmp/a.md');
  assert.ok(!invocation.args.includes('--convert'), '不得转换成钉钉在线文档');
});

test('连接器命令可用环境变量覆盖（便于测试与自定义安装路径）', () => {
  const invocation = connectorInvocation('feishu', {
    name: 'a.md',
    file: '/tmp/a.md',
    env: { AGENT_BRIDGE_LARK_COMMAND: 'my-lark', AGENT_BRIDGE_LARK_ARGS: 'markdown +create --as user' }
  });

  assert.equal(invocation.command, 'my-lark');
  assert.deepEqual(invocation.args.slice(0, 4), ['markdown', '+create', '--as', 'user']);
});

test('目标文件夹作为可选参数透传', () => {
  const feishu = connectorInvocation('feishu', { name: 'a.md', file: '/f', env: {}, folder: 'fldToken' });
  const folderAt = feishu.args.indexOf('--folder-token');
  assert.equal(feishu.args[folderAt + 1], 'fldToken');

  const dingtalk = connectorInvocation('dingtalk', { name: 'a.md', file: '/f', env: {}, folder: 'nodeId' });
  const dingFolderAt = dingtalk.args.indexOf('--folder');
  assert.equal(dingtalk.args[dingFolderAt + 1], 'nodeId');
});

// CLI 的 JSON 结构可能随版本变化，故不绑定字段路径，递归找第一个链接。
test('pickUrl 递归取出结果里的第一个 http 链接', () => {
  assert.equal(
    pickUrl({ ok: true, data: { files: [{ token: 't1', url: 'https://x.feishu.cn/docx/abc' }] } }),
    'https://x.feishu.cn/docx/abc'
  );
  assert.equal(pickUrl({ data: { doc: { docUrl: 'https://alidocs.dingtalk.com/i/nodes/xyz' } } }),
    'https://alidocs.dingtalk.com/i/nodes/xyz');
  assert.equal(pickUrl({ ok: true, data: {} }), '');
});

async function withFakeCli(
  script: string,
  run: (env: Record<string, string>, dir: string) => Promise<void>
) {
  const dir = await mkdtemp(join(tmpdir(), 'connector-test-'));
  try {
    const fake = join(dir, 'fake-cli.js');
    await writeFile(fake, script);
    await run(
      {
        AGENT_BRIDGE_LARK_COMMAND: process.execPath,
        AGENT_BRIDGE_LARK_ARGS: fake,
        AGENT_BRIDGE_DWS_COMMAND: process.execPath,
        AGENT_BRIDGE_DWS_ARGS: fake
      },
      dir
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// lark-cli 拒收绝对路径（"--file must be a relative path within the current directory"），
// 所以飞书这条链路必须在暂存目录里执行、传相对路径。
test('飞书发布在暂存目录内执行，--file 传相对路径', async () => {
  await withFakeCli(`
    const fs = require('node:fs');
    const at = process.argv.indexOf('--file');
    fs.writeFileSync(process.env.PROBE_PATH, JSON.stringify({
      file: process.argv[at + 1], cwd: process.cwd(),
      readable: fs.readFileSync(process.argv[at + 1], 'utf8')
    }));
    process.stdout.write(JSON.stringify({ ok: true, data: { url: 'https://x/1' } }));
  `, async (env, dir) => {
    const probe = join(dir, 'probe.json');
    await publishDocument('feishu', { fileName: 'a.md', content: '# 正文', env: { ...env, PROBE_PATH: probe } });
    const seen = JSON.parse(await readFile(probe, 'utf8'));

    assert.equal(seen.file, './document.md', '必须是相对路径');
    assert.match(seen.cwd, /mojian-publish-/, 'CLI 应在正文落盘的暂存目录里执行');
    assert.equal(seen.readable, '# 正文', '相对路径在该 cwd 下确实读得到');
  });
});

// dws drive upload 接受绝对路径，无需切目录（保持链路简单）。
test('钉钉上传 Markdown 文件时传绝对路径并保留原文', async () => {
  await withFakeCli(`
    const fs = require('node:fs');
    const at = process.argv.indexOf('--file');
    fs.writeFileSync(process.env.PROBE_PATH, JSON.stringify({
      path: process.argv[at + 1],
      content: fs.readFileSync(process.argv[at + 1], 'utf8')
    }));
    process.stdout.write(JSON.stringify({ success: true, serverResponse: { docUrl: 'https://alidocs.dingtalk.com/i/nodes/x' } }));
  `, async (env, dir) => {
    const probe = join(dir, 'probe.txt');
    const result = await publishDocument('dingtalk', {
      fileName: 'a.md', content: '# 正文', env: { ...env, PROBE_PATH: probe }
    });

    const seen = JSON.parse(await readFile(probe, 'utf8'));
    assert.match(seen.path, /^\/.+document\.md$/);
    assert.equal(seen.content, '# 正文');
    assert.equal(result.url, 'https://alidocs.dingtalk.com/i/nodes/x', 'dws 的链接在 serverResponse.docUrl');
  });
});

test('publishDocument 把内容落盘后调用 CLI，并回传解析出的链接', async () => {
  // 假 CLI：把收到的 --file 内容回显进 JSON，验证内容真的落了盘。
  await withFakeCli(`
    const fs = require('node:fs');
    const at = process.argv.indexOf('--file');
    const body = fs.readFileSync(process.argv[at + 1], 'utf8');
    const nameAt = process.argv.indexOf('--name');
    process.stdout.write(JSON.stringify({
      ok: true,
      data: { files: [{ url: 'https://x.feishu.cn/docx/abc', name: process.argv[nameAt + 1], body }] }
    }));
  `, async (env) => {
    const result = await publishDocument('feishu', { fileName: '技术方案.md', content: '# 方案\n正文', env });

    assert.equal(result.target, 'feishu');
    assert.equal(result.url, 'https://x.feishu.cn/docx/abc');
    assert.equal(result.name, '技术方案.md');
    assert.equal(result.raw.data.files[0].body, '# 方案\n正文');
  });
});

test('publishDocument 在 CLI 报错时透出 stderr，不吞错', async () => {
  await withFakeCli(`
    process.stderr.write('permission denied by tenant policy');
    process.exit(3);
  `, async (env) => {
    await assert.rejects(
      () => publishDocument('feishu', { fileName: 'a.md', content: '#', env }),
      (error: Error) => error.message.includes('permission denied by tenant policy')
    );
  });
});

test('publishDocument 认两种失败标记：lark-cli 的 ok:false 与 dws 的 success:false', async () => {
  await withFakeCli(`
    process.stdout.write(JSON.stringify({ ok: false, error: { message: 'token expired' } }));
  `, async (env) => {
    await assert.rejects(
      () => publishDocument('feishu', { fileName: 'a.md', content: '#', env }),
      (error: Error) => error.message.includes('token expired')
    );
  });
  await withFakeCli(`
    process.stdout.write(JSON.stringify({ success: false, message: '无权限创建文档' }));
  `, async (env) => {
    await assert.rejects(
      () => publishDocument('dingtalk', { fileName: 'a.md', content: '#', env }),
      (error: Error) => error.message.includes('无权限创建文档')
    );
  });
});

test('publishDocument 找不到 CLI 时给出安装提示', async () => {
  await assert.rejects(
    () => publishDocument('feishu', {
      fileName: 'a.md', content: '#', env: { AGENT_BRIDGE_LARK_COMMAND: 'definitely-missing-lark-xyz' }
    }),
    (error: Error) => error.message.includes('lark-cli')
  );
  await assert.rejects(
    () => publishDocument('dingtalk', {
      fileName: 'a.md', content: '#', env: { AGENT_BRIDGE_DWS_COMMAND: 'definitely-missing-dws-xyz' }
    }),
    (error: Error) => error.message.includes('dws')
  );
});

test('publishDocument 解析不出链接时也不算失败，返回原始结果供排查', async () => {
  await withFakeCli(`
    process.stdout.write('[lark-cli] uploading...\\n' + JSON.stringify({ ok: true, data: { token: 'only-token' } }));
  `, async (env) => {
    const result = await publishDocument('feishu', { fileName: 'a.md', content: '#', env });

    assert.equal(result.url, '');
    assert.equal(result.raw.data.token, 'only-token', 'CLI 输出前的进度噪音应被跳过');
  });
});

test('publishDocument 落盘的临时文件用完即删', async () => {
  await withFakeCli(`
    const fs = require('node:fs');
    const at = process.argv.indexOf('--file');
    fs.writeFileSync(process.env.PROBE_PATH, process.argv[at + 1]);
    process.stdout.write(JSON.stringify({ ok: true, data: { url: 'https://x/1' } }));
  `, async (env, dir) => {
    const probe = join(dir, 'probe.txt');
    await publishDocument('feishu', {
      fileName: 'a.md', content: '#', env: { ...env, PROBE_PATH: probe }
    });
    const usedPath = await readFile(probe, 'utf8');
    await assert.rejects(() => readFile(usedPath, 'utf8'), /ENOENT/);
  });
});
