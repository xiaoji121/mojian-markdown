import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 桌面端冒烟：Electron 启动 → 内嵌 bridge 同源可达 → 外部打开本地文件 →
// 外部改动自动重载 → 编辑器输入写穿回本地文件 → 未授权路径被拒绝。
// 前置条件：npm run build:bridge（dist 由内嵌 bridge 静态托管）。

test('桌面端启动并与本地文件双向同步', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mojian-ws-'));
  const userData = await mkdtemp(join(tmpdir(), 'mojian-user-'));
  const docDir = await mkdtemp(join(tmpdir(), 'mojian-doc-'));
  const docPath = join(docDir, 'note.md');
  await writeFile(docPath, '# 桌面冒烟\n\n初始内容\n');
  // 预置授权清单，模拟「此前会话里用户已通过对话框打开过该文件」。
  await writeFile(join(userData, 'granted-paths.json'), JSON.stringify([docPath]));

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      AGENT_BRIDGE_WORKSPACE: workspace,
      MOJIAN_USER_DATA: userData,
      NO_PROXY: 'localhost,127.0.0.1'
    }
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.md-source')).toBeVisible({ timeout: 15_000 });

    // preload 注入的桌面 API 存在，且内嵌 bridge 与前端同源。
    expect(await page.evaluate(() => !!(window as any).mojianDesktop)).toBe(true);
    const health = await page.evaluate(() => fetch('/health').then((r) => r.json()));
    expect(health).toEqual({ ok: true });

    // 网页版专属 UI 在桌面端隐藏：关联文件夹入口（桌面句柄自带绝对路径）
    // 与宽屏下因此为空的 ⋯ 溢出菜单按钮。
    const hiddenStates = await page.evaluate(() => ({
      folderItem: getComputedStyle(document.querySelector('.folder-menu-item')!).display,
      headerMore: getComputedStyle(document.querySelector('.header-more')!).display
    }));
    expect(hiddenStates).toEqual({ folderItem: 'none', headerMore: 'none' });

    // 主进程推送「外部打开」事件（等价于双击 .md / 打开方式）。
    const stat = await readFile(docPath, 'utf8');
    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('desktop:open-path', payload);
    }, { path: docPath, name: 'note.md', content: stat, lastModified: Date.now() });

    const source = page.locator('.md-source');
    await expect(source).toHaveValue(/初始内容/, { timeout: 10_000 });

    // 本地 → 编辑器：外部程序修改文件后，轮询自动重载。
    await writeFile(docPath, '# 桌面冒烟\n\n外部修改的内容\n');
    await expect(source).toHaveValue(/外部修改的内容/, { timeout: 10_000 });

    // 编辑器 → 本地：输入经 autosave 写穿回本地文件。
    await source.fill('# 桌面冒烟\n\n编辑器写回的内容\n');
    await expect.poll(() => readFile(docPath, 'utf8'), { timeout: 10_000 })
      .toContain('编辑器写回的内容');

    // 未授权路径的读写会被主进程拒绝。
    const denied = await page.evaluate(() =>
      (window as any).mojianDesktop.statFile('/etc/hosts').then(() => 'allowed', () => 'denied')
    );
    expect(denied).toBe('denied');
  } finally {
    await app.close();
  }
});
