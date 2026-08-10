import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  const absolutePathDoc = join(docDir, '路径打开.md');
  // 文档引用同目录相对路径图片，验证预览能把它换成 data URL 展示。
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
  await writeFile(join(docDir, 'pic.png'), pngBytes);
  await writeFile(docPath, '# 桌面冒烟\n\n初始内容\n\n![流程图](./pic.png)\n');
  await writeFile(absolutePathDoc, '# 绝对路径打开\n\n通过文件菜单读取\n');
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

    // 新入口：用户输入绝对路径，主进程校验、授权并读取文件。
    const pathPreview = await page.evaluate((filePath) =>
      (window as any).mojianDesktop.openMarkdownPath(filePath), absolutePathDoc);
    expect(pathPreview).toMatchObject({ path: absolutePathDoc, name: '路径打开.md' });
    await page.getByRole('button', { name: '文件菜单' }).click();
    await page.getByRole('menuitem', { name: '输入绝对路径打开…' }).click();
    await page.locator('.file-path-input').fill(absolutePathDoc);
    await page.getByRole('button', { name: '打开该路径' }).click();
    await expect(page.locator('.md-source')).toHaveValue(/通过文件菜单读取/, { timeout: 10_000 });
    await expect(page.locator('.file-name')).toHaveText('路径打开.md');

    // 主进程推送「外部打开」事件（等价于双击 .md / 打开方式）。
    const stat = await readFile(docPath, 'utf8');
    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('desktop:open-path', payload);
    }, { path: docPath, name: 'note.md', content: stat, lastModified: Date.now() });

    const source = page.locator('.md-source');
    await expect(source).toHaveValue(/初始内容/, { timeout: 10_000 });

    // 相对路径图片经主进程读盘后以 data URL 展示。
    await expect(page.locator('.md-preview img')).toHaveAttribute(
      'src', /^data:image\/png;base64,/, { timeout: 10_000 }
    );

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

// 文章里的链接应交给系统浏览器打开：target=_blank 不自开 Electron 窗口，
// 普通链接不把编辑器导航走，两者都转发给 shell.openExternal。
test('文章链接交给系统浏览器打开，应用窗口不动', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mojian-ws-'));
  const userData = await mkdtemp(join(tmpdir(), 'mojian-user-'));

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

    // 主进程里替换 shell.openExternal，记录被转发的 URL。
    await app.evaluate(({ shell }) => {
      (shell as { _opened?: string[] })._opened = [];
      shell.openExternal = async (url: string) => {
        (shell as unknown as { _opened: string[] })._opened.push(url);
      };
    });

    // target=_blank 路径（AI 回答里的链接形态）：window.open 不应自开窗口。
    await page.evaluate(() => { window.open('https://example.com/blank'); });

    // 普通链接路径（正文 marked 渲染形态）：点击不应把编辑器导航走。
    await page.locator('.md-source').fill('# 链接\n\n[外部链接](https://example.com/plain)\n');
    await page.locator('.md-preview a', { hasText: '外部链接' }).click();

    // 左上角品牌入口同样交给系统浏览器，桌面应用自身保持在编辑器。
    await page.locator('.brand-title').click();

    await expect.poll(() => app.evaluate(({ shell }) =>
      (shell as unknown as { _opened: string[] })._opened
    ), { timeout: 10_000 }).toEqual([
      'https://example.com/blank',
      'https://example.com/plain',
      'https://yuxizhai.com/md-editor/'
    ]);

    // 窗口数量不变，编辑器仍在原地。
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(page.locator('.md-source')).toBeVisible();
  } finally {
    await app.close();
  }
});

// 用户实际场景：同步一直写穿，重启时工作区副本与磁盘内容完全一致——
// 恢复后不会因内容差异触发重渲染，相对路径图片必须在接上句柄后补齐展示。
test('重启恢复且内容一致时，相对路径图片仍能展示', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mojian-ws-'));
  const userData = await mkdtemp(join(tmpdir(), 'mojian-user-'));
  const docDir = await mkdtemp(join(tmpdir(), 'mojian-doc-'));
  const docPath = join(docDir, 'note.md');
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
  await writeFile(join(docDir, 'flow.png'), pngBytes);
  const content = '# 笔记\n\n![流程](./flow.png)\n';
  await writeFile(docPath, content);
  await writeFile(join(userData, 'granted-paths.json'), JSON.stringify([docPath]));
  await mkdir(join(workspace, 'documents'), { recursive: true });
  await writeFile(join(workspace, 'documents', 'doc-image.json'), JSON.stringify({
    documentId: 'doc-image',
    sourceApp: 'markdown-editor',
    title: 'note.md',
    fileName: 'note.md',
    localPath: docPath,
    content,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    annotations: [],
    messages: []
  }, null, 2));

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
    await expect(page.locator('.md-source')).toHaveValue(/流程/, { timeout: 15_000 });
    await expect(page.locator('.md-preview img')).toHaveAttribute(
      'src', /^data:image\/png;base64,/, { timeout: 10_000 }
    );
  } finally {
    await app.close();
  }
});

// 用户场景：批注随文档从工作区载入后，批注面板的复制/删除按钮应可用。
test('桌面端批注面板的复制与删除按钮可用', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mojian-ws-'));
  const userData = await mkdtemp(join(tmpdir(), 'mojian-user-'));
  const docDir = await mkdtemp(join(tmpdir(), 'mojian-doc-'));
  const docPath = join(docDir, 'note.md');
  const content = '# 批注\n\n这是一段足够长的正文，用来验证桌面端批注按钮。\n';
  await writeFile(docPath, content);
  await writeFile(join(userData, 'granted-paths.json'), JSON.stringify([docPath]));
  await mkdir(join(workspace, 'documents'), { recursive: true });
  await writeFile(join(workspace, 'documents', 'doc-comments.json'), JSON.stringify({
    documentId: 'doc-comments',
    sourceApp: 'markdown-editor',
    title: 'note.md',
    fileName: 'note.md',
    localPath: docPath,
    content,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    annotations: [
      { id: 'a1', quote: '足够长的正文', type: 'idea', note: 'hello world', occ: 0, ts: 1753600000000 }
    ],
    messages: []
  }, null, 2));

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
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await expect(page.locator('.md-source')).toHaveValue(/足够长的正文/, { timeout: 15_000 });
    await page.getByRole('button', { name: /^批注/ }).click();
    await expect(page.locator('.comments-panel')).toBeVisible();
    await expect(page.locator('.comments-panel .comment-quote')).toHaveCount(1);

    await page.getByRole('button', { name: '复制', exact: true }).click();
    await expect(page.locator('.save-status')).toHaveText(/已复制该批注/);

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.locator('.comments-panel .comment-quote')).toHaveCount(0);

    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

// 模拟「重启」：工作区已有上次会话登记的文档（旧副本 + 本地路径 + 授权），
// 应用启动后应自动恢复这篇最近阅读，并按路径重建本地同步——
// 编辑器显示磁盘最新内容而非工作区旧副本，外部修改继续自动进编辑器。
test('重启后自动恢复最近阅读并重建本地文件同步', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mojian-ws-'));
  const userData = await mkdtemp(join(tmpdir(), 'mojian-user-'));
  const docDir = await mkdtemp(join(tmpdir(), 'mojian-doc-'));
  const docPath = join(docDir, 'note.md');
  await writeFile(docPath, '# 笔记\n\n磁盘上更新过的内容\n');
  await writeFile(join(userData, 'granted-paths.json'), JSON.stringify([docPath]));
  await mkdir(join(workspace, 'documents'), { recursive: true });
  await writeFile(join(workspace, 'documents', 'doc-restart.json'), JSON.stringify({
    documentId: 'doc-restart',
    sourceApp: 'markdown-editor',
    title: 'note.md',
    fileName: 'note.md',
    localPath: docPath,
    content: '# 笔记\n\n工作区里的旧副本\n',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    annotations: [],
    messages: []
  }, null, 2));

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
    const source = page.locator('.md-source');

    // 自动恢复最近阅读，且以磁盘内容为准
    await expect(source).toHaveValue(/磁盘上更新过的内容/, { timeout: 15_000 });
    await expect(page.locator('.file-name')).toHaveText('note.md');

    // 重启后的外部修改依旧自动同步进编辑器
    await writeFile(docPath, '# 笔记\n\n重启后的外部修改\n');
    await expect(source).toHaveValue(/重启后的外部修改/, { timeout: 10_000 });
  } finally {
    await app.close();
  }
});
