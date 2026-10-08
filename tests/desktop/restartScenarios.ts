import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { openAppearance } from '../e2e/fixtures';
import { freezeRendererClock } from './freezeRendererClock.ts';
import { importedFontScenario } from './importedFontScenario';

// Share the exact regression flows between development Electron and the real
// Windows package. Each test owns a fresh profile, workspace, and credential-free
// home. No AI requests or installed CLI binaries are needed by these scenarios.
async function createSession(executablePath?: string) {
  const root = await mkdtemp(join(tmpdir(), '墨笺 restart '));
  const userData = join(root, '用户 数据');
  const home = join(root, 'empty-home');
  const emptyPath = join(root, 'empty-bin');
  await Promise.all([mkdir(userData), mkdir(home), mkdir(emptyPath)]);
  let child: ChildProcess | undefined;
  const env: Record<string, string> = {};
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
    'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  Object.assign(env, {
    HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    PATH: emptyPath, MOJIAN_USER_DATA: userData,
    AGENT_BRIDGE_WORKSPACE: executablePath ? '' : join(root, 'workspace'),
    NO_PROXY: 'localhost,127.0.0.1'
  });
  return {
    root,
    async launch() {
      const current = await electron.launch({
        ...(executablePath ? { executablePath, cwd: root } : {}),
        args: [...(executablePath ? [] : ['.']), '--lang=zh-CN'], env
      });
      child = current.process();
      if (executablePath) expect(await current.evaluate(({ app }) => app.isPackaged)).toBe(true);
      const page = await current.firstWindow();
      await expect(page.locator('.md-source')).toBeVisible({ timeout: 15_000 });
      return { app: current, page };
    },
    async dispose() {
      // Forced cleanup is only for failures; every tested restart uses real close.
      try {
        if (child && child.exitCode === null && child.signalCode === null) {
          const exited = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
          child.kill('SIGKILL');
          await exited;
        }
        await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (error) {
        // Windows antivirus/Chromium may hold a profile briefly after exit. Keep
        // the test's actual assertion failure visible rather than replacing it.
        test.info().annotations.push({ type: 'cleanup', description: String(error) });
      }
    }
  };
}

export async function closeEditorWindow(app: ElectronApplication) {
  const process = app.process();
  const exited = new Promise<void>((resolve, reject) => {
    if (process.exitCode !== null) return resolve();
    process.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Electron exited ${code}`)));
  });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow, app }) => {
    // macOS intentionally stays running after its last window closes. Quit only
    // after that close completes, preserving the production close handshake.
    if (process.platform === 'darwin') app.once('window-all-closed', () => app.quit());
    BrowserWindow.getAllWindows()[0].close();
  });
  await closed;
  await exited;
}

async function editBeforeDebounce(page: Page, content: string) {
  // Freeze renderer timers BEFORE input: the autosave debounce cannot race ahead
  // on a slow Windows runner. Input and the OS-window close still run normally.
  await freezeRendererClock(page);
  await page.locator('.md-source').evaluate((element, value) => {
    const source = element as HTMLTextAreaElement;
    source.value = value;
    source.dispatchEvent(new Event('input', { bubbles: true }));
  }, content);
}

async function openPath(page: Page, path: string) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '输入绝对路径打开…' }).click();
  await page.locator('.file-path-input').fill(path);
  await page.getByRole('button', { name: '打开该路径' }).click();
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.locator('.settings-entry').click();
  await expect(page.locator('.ai-settings-modal')).toBeVisible();
}

async function addAnnotation(page: Page) {
  const paragraph = page.locator('.md-preview p').first();
  // DOM range avoids font-dependent mouse coordinates on Windows; the actual
  // selection event, annotation toolbar and note editor still run normally.
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
  await expect(page.locator('.selection-toolbar')).toBeVisible();
  await page.getByRole('button', { name: /写想法/ }).click();
  await expect(page.locator('.comments-panel .comment-quote')).toHaveCount(1);
  const note = page.locator('.comment-note-input');
  // Wait for the application's delayed autofocus before fill() can focus the
  // note itself; otherwise that pending focus can close the next appearance menu.
  await expect(note).toBeFocused();
  await note.fill('重启后保留的想法');
}

export function registerRestartScenarios(label: string, executablePath?: string) {
  test(`${label}: imported font preserves actual glyphs and bytes across restart`, async () => {
    const session = await createSession(executablePath);
    try { await importedFontScenario(session, closeEditorWindow); }
    finally { await session.dispose(); }
  });
  test(`${label}: unnamed draft, annotations and preferences survive immediate window close`, async () => {
    const session = await createSession(executablePath);
    try {
      let { app, page } = await session.launch();
      const original = '# 未命名草稿\n\n这是一段足够长的正文，用来验证重启之后仍然保留批注和设置。\n\nRead with **bold**, *italic*, ***bold italic*** and `code()`. 日本語の文章。\n';
      await page.locator('.md-source').fill(original);
      await expect(page.locator('.md-preview h1')).toHaveText('未命名草稿');
      const fontFaces = await page.evaluate(async () => {
        const faces = await document.fonts.load('italic 700 16px "Source Serif 4"');
        await document.fonts.ready;
        return faces.map(face => face.status);
      });
      expect(fontFaces.length).toBeGreaterThan(0);
      expect(fontFaces.every(status => status === 'loaded')).toBe(true);
      await test.info().attach('packaged-reading-font.png', { body: await page.screenshot(), contentType: 'image/png' });
      await addAnnotation(page);
      const theme = await page.locator('body').getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      await openAppearance(page);
      await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
      await page.getByRole('button', { name: '放大字号' }).click();
      const fontSize = await page.locator('.font-size-value').textContent();
      await page.locator('.reading-font-select').selectOption('system-serif');
      await page.locator('.paper-dot[data-paper="green"]').click();
      await page.locator('.immersive-wide-toggle').click();
      await page.keyboard.press('Escape');
      await openSettings(page);
      await page.getByRole('radio', { name: /Gemini/ }).click();
      await page.locator('.ai-settings-modal').getByRole('button', { name: '关闭', exact: true }).click();
      const content = original + '\n窗口关闭前最后输入，不能等待自动保存。\n';
      await editBeforeDebounce(page, content);
      await closeEditorWindow(app);

      ({ app, page } = await session.launch());
      await expect(page.locator('.md-source')).toHaveValue(content);
      await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
      await openAppearance(page);
      await expect(page.locator('.font-size-value')).toHaveText(fontSize!);
      await expect(page.locator('.reading-font-select')).toHaveValue('system-serif');
      await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'system-serif');
      await expect(page.locator('body')).toHaveAttribute('data-paper', 'green');
      await expect(page.locator('.immersive-wide-toggle')).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^批注/ }).click();
      await expect(page.locator('.comments-panel .comment-quote')).toHaveCount(1);
      await expect(page.locator('.comment-note-input')).toHaveValue('重启后保留的想法');
      await openSettings(page);
      await expect(page.getByRole('radio', { name: /Gemini/ })).toHaveAttribute('aria-checked', 'true');
      await closeEditorWindow(app);
    } catch (error) {
      await test.info().attach('original failure', {
        body: String(error instanceof Error ? error.stack : error), contentType: 'text/plain'
      }).catch(() => {});
      throw error;
    } finally {
      await session.dispose();
    }
  });

  test(`${label}: failed draft save keeps the window open and allows retry`, async () => {
    const session = await createSession(executablePath);
    try {
      let { app, page } = await session.launch();
      await app.evaluate(({ ipcMain, dialog }) => {
        const state = globalThis as any;
        state.savedHandlers = ipcMain.listeners('desktop:save-editor-state');
        state.closeWarnings = [];
        ipcMain.removeAllListeners('desktop:save-editor-state');
        ipcMain.on('desktop:save-editor-state', (event) => {
          event.returnValue = { ok: false, error: '测试磁盘保存失败' };
        });
        dialog.showMessageBox = async (_window: any, options: any) => {
          state.closeWarnings.push(options);
          return { response: 0, checkboxChecked: false };
        };
      });
      const content = '# 保存失败后重试\n\n留在编辑器，内容不能丢失。\n';
      await editBeforeDebounce(page, content);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      await expect.poll(() => app.evaluate(() => (globalThis as any).closeWarnings.length)).toBe(1);
      expect(page.isClosed()).toBe(false);
      await expect(page.locator('.md-source')).toHaveValue(content);
      await expect(page.locator('.save-status')).toContainText(/失败|未保存/);
      const warning = await app.evaluate(() => (globalThis as any).closeWarnings[0]);
      expect(warning.buttons).toContain('留在编辑器');
      expect(warning.defaultId).toBe(0);
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeAllListeners('desktop:save-editor-state');
        for (const listener of (globalThis as any).savedHandlers) {
          ipcMain.on('desktop:save-editor-state', listener);
        }
      });
      await closeEditorWindow(app);
      ({ app, page } = await session.launch());
      await expect(page.locator('.md-source')).toHaveValue(content);
      await closeEditorWindow(app);
    } catch (error) {
      await test.info().attach('original failure', {
        body: String(error instanceof Error ? error.stack : error), contentType: 'text/plain'
      }).catch(() => {});
      throw error;
    } finally {
      await session.dispose();
    }
  });

  test(`${label}: linked file restores association through repeated immediate restarts`, async () => {
    const session = await createSession(executablePath);
    const path = join(session.root, '关联 中文文档.md');
    await writeFile(path, '# 关联文档\n\n初始内容\n', 'utf8');
    try {
      let { app, page } = await session.launch();
      await openPath(page, path);
      await expect(page.locator('.md-source')).toHaveValue(/初始内容/);
      for (let restart = 1; restart <= 2; restart++) {
        const content = `# 关联文档\n\n第 ${restart} 次关闭前的最后输入\n`;
        await editBeforeDebounce(page, content);
        await closeEditorWindow(app);
        expect(await readFile(path, 'utf8')).toBe(content);
        ({ app, page } = await session.launch());
        await expect(page.locator('.md-source')).toHaveValue(content);
        await expect(page.locator('.file-name')).toHaveText('关联 中文文档.md');
        await expect(page.locator('.file-name')).toHaveAttribute('title', path + '\n双击重命名');
      }
      await writeFile(path, '# 外部更新\n\n再次启动后仍然监视同一个文件\n', 'utf8');
      await expect(page.locator('.md-source')).toHaveValue(/仍然监视同一个文件/, { timeout: 10_000 });
      await closeEditorWindow(app);
    } catch (error) {
      await test.info().attach('original failure', {
        body: String(error instanceof Error ? error.stack : error), contentType: 'text/plain'
      }).catch(() => {});
      throw error;
    } finally {
      await session.dispose();
    }
  });
}
