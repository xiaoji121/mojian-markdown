import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeEditorWindow, registerRestartScenarios } from './restartScenarios';

import { createMockCli, mockCliEnv } from '../helpers/mockCli';

// This is a real Windows executable test, deliberately outside the checkout so
// missing packaged dependencies cannot resolve from development node_modules.
// Native save-dialog selection is stubbed; the real IPC and disk writes run.
const executablePath = process.env.MOJIAN_PACKAGED_EXECUTABLE;
test.skip(process.platform !== 'win32' || !executablePath,
  'Requires a packaged Windows app via MOJIAN_PACKAGED_EXECUTABLE');

test('Windows packaged app saves Chinese/space paths and survives restart', async ({}, testInfo) => {
  const root = await mkdtemp(join(tmpdir(), '墨笺 Windows smoke '));
  const userData = join(root, '用户 数据');
  const docDir = join(root, '中文 文档');
  await Promise.all([mkdir(userData), mkdir(docDir)]);
  const docPath = join(docDir, '原始 笔记.md');
  const savedPath = join(docDir, '另存为 笔记.md');
  const renamedPath = join(docDir, '重命名 笔记.md');
  await writeFile(docPath, '# Windows 测试\n\n初始内容\n', 'utf8');

  const launch = () => electron.launch({
    executablePath,
    args: [],
    cwd: root,
    env: {
      ...mockCliEnv(root),
      AGENT_BRIDGE_LARK_COMMAND: join(root, 'missing-test-lark'),
      AGENT_BRIDGE_DWS_COMMAND: join(root, 'missing-test-dws'),
      MOJIAN_USER_DATA: userData,
      // Leave AGENT_BRIDGE_WORKSPACE unset to test the packaged default under
      // userData, rather than a writable source-tree development workspace.
      AGENT_BRIDGE_WORKSPACE: '',
      NO_PROXY: 'localhost,127.0.0.1'
    }
  });

  let app = await launch();
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const page = await app.firstWindow();
    const source = page.locator('.md-source');
    await expect(source).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => fetch('/health').then((response) => response.json())))
      .toEqual({ ok: true });

    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '输入绝对路径打开…' }).click();
    await page.locator('.file-path-input').fill(docPath);
    await page.getByRole('button', { name: '打开该路径' }).click();
    await expect(source).toHaveValue(/初始内容/);
    await source.fill('# Windows 写回\n\n中文和空格路径保存成功\n');
    await expect.poll(() => readFile(docPath, 'utf8')).toContain('中文和空格路径保存成功');

    // Test Save As through the production preload and main-process handler.
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, savedPath);
    const saved = await page.evaluate(async ({ content }) =>
      (window as any).mojianDesktop.saveMarkdownFileAs('另存为 笔记.md', content),
    { content: '# 另存为\n\n真实文件写入\n' });
    expect(saved.path).toBe(savedPath);
    expect(await readFile(savedPath, 'utf8')).toContain('真实文件写入');

    await writeFile(docPath, '# 外部更新\n\nWindows 外部编辑已同步\n', 'utf8');
    await expect(source).toHaveValue(/Windows 外部编辑已同步/, { timeout: 10_000 });
    const fileName = page.locator('.file-name');
    await fileName.dblclick();
    await fileName.fill('重命名 笔记');
    await fileName.press('Enter');
    await expect(fileName).toHaveText('重命名 笔记.md');
    await expect.poll(() => readFile(renamedPath, 'utf8')).toContain('Windows 外部编辑已同步');
    await expect(readFile(docPath, 'utf8')).rejects.toThrow();
    await source.fill('# 重启前\n\n重启后仍可继续写回\n');
    await expect.poll(() => readFile(renamedPath, 'utf8')).toContain('重启后仍可继续写回');
    // Wait for the grant list to reach disk before testing a fresh process.
    await expect.poll(async () => JSON.parse(await readFile(join(userData, 'granted-paths.json'), 'utf8')))
      .toContain(renamedPath);
    await testInfo.attach('Windows packaged editor', {
      body: await page.screenshot({ path: testInfo.outputPath('windows-packaged-editor.png') }),
      contentType: 'image/png'
    });

    await closeEditorWindow(app);
    app = await launch();
    const reopened = await app.firstWindow();
    await expect(reopened.locator('.md-source')).toBeVisible({ timeout: 15_000 });
    // No new file grant on this process: verify persisted permission and content.
    const restored = await reopened.evaluate((path) => (window as any).mojianDesktop.readFile(path), renamedPath);
    expect(restored.content).toContain('重启后仍可继续写回');
    await reopened.evaluate(({ path, content }) => (window as any).mojianDesktop.writeFile(path, content), {
      path: renamedPath, content: '# 重启验证\n\n持久授权写回成功\n'
    });
    expect(await readFile(renamedPath, 'utf8')).toContain('持久授权写回成功');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

// Exercise the same state-restoration contract in the isolated Windows package.
registerRestartScenarios('Windows packaged', executablePath);

test('Windows packaged bridge calls npm Claude and Codex shims without a shell', async () => {
  const root = await mkdtemp(join(tmpdir(), '墨笺 AI CLI 空格 '));
  const userData = join(root, '用户 数据');
  await mkdir(userData);
  const claude = await createMockCli(root, 'mojian-test-claude', `
    process.stdout.write('packaged Claude: ' + process.argv.at(-1));
  `);
  const codex = await createMockCli(root, 'mojian-test-codex', `
    const fs = require('node:fs');
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => {
      const at = process.argv.indexOf('--output-last-message');
      fs.writeFileSync(process.argv[at + 1], 'packaged Codex: ' + input);
    });
  `);
  const app = await electron.launch({ executablePath, args: [], cwd: root, env: {
    ...mockCliEnv(root),
      AGENT_BRIDGE_LARK_COMMAND: join(root, 'missing-test-lark'),
      AGENT_BRIDGE_DWS_COMMAND: join(root, 'missing-test-dws'), MOJIAN_USER_DATA: userData, AGENT_BRIDGE_WORKSPACE: '',
    AGENT_BRIDGE_CLAUDE_COMMAND: claude, AGENT_BRIDGE_CODEX_COMMAND: codex,
    NO_PROXY: 'localhost,127.0.0.1'
  } });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const page = await app.firstWindow();
    await expect(page.locator('.md-source')).toBeVisible({ timeout: 15_000 });
    const question = '中文 " & echo injected | < > ^ %PATH% !VALUE!';
    for (const engine of ['claude', 'codex']) {
      const result = await page.evaluate(async ({ engine, question }) => {
        const response = await fetch('/api/chat', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engine, question, document: {
            sourceApp: 'markdown-editor', fileName: 'CLI 测试.md', content: '# mock only'
          } }) });
        return response.text();
      }, { engine, question });
      // /api/chat completes by ending the response after saving; unlike
      // /api/compose, it does not emit a separate done event.
      expect(result).toContain('event: meta');
      expect(result).not.toContain('event: error');
      expect(result).toContain(engine === 'claude' ? 'packaged Claude' : 'packaged Codex');
      // SSE JSON escapes quotes; inspect the decoded streamed answer.
      const packets = result.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => JSON.parse(line.slice(5)));
      const deltas = packets.filter(data => typeof data.text === 'string');
      expect(deltas.map(data => data.text).join('')).toContain(question);
      const meta = packets.find(data => data.documentId && data.requestId);
      expect(meta).toBeTruthy();
      const saved = await page.evaluate(id => fetch('/api/documents/' + id)
        .then(response => response.json()), meta.documentId);
      const message = saved.document.messages.find(item => item.requestId === meta.requestId);
      expect(message.answer).toContain(question);
      expect(message.answerAt).toBeTruthy();
    }
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

import { registerSecureSettingsScenario } from './secureSettingsScenario';
registerSecureSettingsScenario('Windows packaged', executablePath);

import { registerAIReadinessScenario } from './aiReadinessScenario';
registerAIReadinessScenario('Packaged Windows', executablePath);
