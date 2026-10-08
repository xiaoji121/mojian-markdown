import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      ...process.env,
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

    await page.getByRole('button', { name: '文件菜单' }).click();
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
      body: await page.screenshot(), contentType: 'image/png'
    });

    await app.close();
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
