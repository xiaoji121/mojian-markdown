import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockCliEnv } from '../helpers/mockCli';
import { ensureSourceVisible } from '../e2e/fixtures';
import { exercisePolish, polishContent } from '../e2e/pcFinalPolishHelpers';
import { closeEditorWindow } from './restartScenarios';

const papers = ['snow', 'parchment', 'cream', 'green', 'ink'];
for (const theme of ['light', 'dark']) for (const soft of [false, true]) for (const paper of papers) {
  test(`native polish ${theme} ${paper} soft=${soft}`, async ({}, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'mojian-polish-'));
    const userData = join(root, 'user'), home = join(root, 'empty-home');
    await mkdir(userData); await mkdir(home);
    const locale = ['zh-CN', 'zh-TW', 'en', 'ja'][(papers.indexOf(paper) + (soft ? 1 : 0)) % 4];
    await writeFile(join(userData, 'editor-state.json'), JSON.stringify({ version: 1, state: {
      content: polishContent, fileName: '本地合成收尾.md', theme, paperLight: paper, paperDark: paper,
      softenDarkPaper: soft, locale, fontSize: 18,
      comments: [{ id: 'kept', quote: '合成文稿', note: '保留批注', type: 'idea', occ: 0, ts: 1 }]
    }}));
    const app = await electron.launch({
      args: ['.', '--disable-background-networking', '--use-mock-keychain',
        '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1;[::1]'],
      env: { ...mockCliEnv(root), HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
        ...(process.env.DISPLAY ? { DISPLAY: process.env.DISPLAY } : {}),
        ...(process.env.XAUTHORITY ? { XAUTHORITY: process.env.XAUTHORITY } : {}),
        MOJIAN_USER_DATA: userData, AGENT_BRIDGE_WORKSPACE: root, NO_PROXY: 'localhost,127.0.0.1',
        AGENT_BRIDGE_CLAUDE_COMMAND: join(root, 'missing-test-claude'),
        AGENT_BRIDGE_CODEX_COMMAND: join(root, 'missing-test-codex') }
    });
    try {
      const page = await app.firstWindow();
      await page.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
      await ensureSourceVisible(page);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
      for (const width of [900, 1100, 1440]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 1000), width);
        await exercisePolish(page);
        await expect(page.locator('.md-source')).toHaveValue(polishContent);
      }
      await page.locator('.md-preview').evaluate(e => e.scrollTop = 600);
      await expect(page.locator('.reading-toolbar')).toHaveClass(/is-scrolled-away/);
      await page.screenshot({ path: testInfo.outputPath(`electron-${theme}-${paper}-${soft}.png`), animations: 'disabled' });
    } finally {
      await closeEditorWindow(app);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });
}
